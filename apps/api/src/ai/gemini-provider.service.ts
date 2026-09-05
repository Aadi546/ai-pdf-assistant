import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiError, GoogleGenAI } from "@google/genai";
import { Embedder } from "../embeddings/embedder.interface";
import { AIProvider, GenerateParams } from "./ai-provider.interface";

const GENERATION_MODEL = "gemini-3.6-flash";
const EMBEDDING_MODEL = "gemini-embedding-2";
const EMBEDDING_DIMENSIONS = 768; // must match the pgvector column — see Phase 7 migration

/**
 * Single class implementing both AIProvider and Embedder — one Gemini API
 * key covers both generation and embeddings, so there's one client to
 * construct, not two. A fresh `GoogleGenAI` instance is built per call
 * (cheap — just a config wrapper, no handshake) rather than cached per key,
 * so a BYOK key never lingers in a long-lived map somewhere.
 */
@Injectable()
export class GeminiProvider implements AIProvider, Embedder {
  readonly dimensions = EMBEDDING_DIMENSIONS;

  // Tunable without a redeploy — Gemini's free-tier limits change, and this
  // is the one place they matter. Only embedBatch (the bulk ingestion path)
  // is paced/retried this hard; embed()'s single interactive call and
  // generate()/stream() keep the lower interactive defaults below, since a
  // chat request waiting behind ingestion-grade backoff would be a
  // regression, not a fix.
  private readonly embedMinIntervalMs: number;
  private readonly embedMaxRetries: number;

  constructor(config: ConfigService) {
    this.embedMinIntervalMs = Number(config.get<string>("EMBED_MIN_INTERVAL_MS") ?? 700);
    this.embedMaxRetries = Number(config.get<string>("EMBED_MAX_RETRIES") ?? 5);
  }

  async generate(apiKey: string, params: GenerateParams): Promise<string> {
    const ai = new GoogleGenAI({ apiKey });
    const response = await withRateLimitRetry(() =>
      ai.models.generateContent({
        model: GENERATION_MODEL,
        contents: params.prompt,
        config: params.systemInstruction ? { systemInstruction: params.systemInstruction } : undefined,
      }),
    );
    return response.text ?? "";
  }

  async *stream(apiKey: string, params: GenerateParams): AsyncIterable<string> {
    const ai = new GoogleGenAI({ apiKey });
    // Retrying is only safe before the first token — once tokens have
    // started reaching the caller (and the client), silently restarting
    // the whole generation would duplicate output. A 429 on a stream
    // request itself (rejected before any tokens flow) is the case this
    // covers; a mid-stream failure still surfaces as a normal error.
    const response = await withRateLimitRetry(() =>
      ai.models.generateContentStream({
        model: GENERATION_MODEL,
        contents: params.prompt,
        config: params.systemInstruction ? { systemInstruction: params.systemInstruction } : undefined,
      }),
    );
    for await (const chunk of response) {
      if (chunk.text) yield chunk.text;
    }
  }

  async embed(apiKey: string, text: string): Promise<number[]> {
    // Interactive path (chat embeds the user's question on every message,
    // and ai-config validates a new key with this too) — no pacing, the
    // default interactive retry budget only.
    const ai = new GoogleGenAI({ apiKey });
    const response = await withRateLimitRetry(() => embedOne(ai, text, this.dimensions));
    return response;
  }

  async embedBatch(apiKey: string, texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const ai = new GoogleGenAI({ apiKey });
    const vectors: number[][] = [];
    const keyId = hashKey(apiKey);

    // Two things being worked around here, both verified against Google's
    // current docs rather than assumed:
    // 1. Passing plain strings in `contents` makes the API aggregate them
    //    into a single combined embedding, not one per string — each input
    //    must be wrapped as its own Content object to get separate vectors.
    // 2. The request has an 8,192-token budget shared across every text in
    //    it. Our chunks are capped at ~500 tokens (packages/shared chunking
    //    constants), so batches of EMBED_BATCH_SIZE stay comfortably under
    //    that even accounting for the word/token estimate being approximate.
    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBED_BATCH_SIZE);

      // Real-world hazard, not hypothetical: Gemini's free tier caps
      // embed_content at a low request count (observed: 100/window) — a
      // several-hundred-chunk document can burn through that fast if fired
      // as quickly as possible. Pacing keeps this batch under the limit
      // instead of hitting it and paying the (much larger) backoff below.
      // Keyed per API key, never globally — quota is per key, and this is
      // BYOK, so one user indexing a large document must not throttle
      // another user's request.
      await waitForPacingSlot(keyId, this.embedMinIntervalMs);

      const response = await withRateLimitRetry(
        () =>
          ai.models.embedContent({
            model: EMBEDDING_MODEL,
            contents: batch.map((text) => ({ parts: [{ text }] })),
            config: { outputDimensionality: this.dimensions },
          }),
        { maxRetries: this.embedMaxRetries },
      );
      for (const embedding of response.embeddings ?? []) {
        vectors.push(normalizeL2(embedding.values ?? []));
      }
    }

    return vectors;
  }
}

async function embedOne(ai: GoogleGenAI, text: string, dimensions: number): Promise<number[]> {
  const response = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: [{ parts: [{ text }] }],
    config: { outputDimensionality: dimensions },
  });
  const [embedding] = response.embeddings ?? [];
  return normalizeL2(embedding?.values ?? []);
}

const EMBED_BATCH_SIZE = 10;
const DEFAULT_MAX_RATE_LIMIT_RETRIES = 3;
const DEFAULT_BACKOFF_MS = 3000;
const MAX_BACKOFF_MS = 65_000; // Gemini's own retryDelay hints have run up to ~60s in practice

// gemini-embedding-2 auto-normalizes truncated (< 3072-dim) output per
// Google's docs, but normalizing here too is cheap, idempotent on an
// already-unit vector, and protects cosine search if the model is ever
// swapped for one that doesn't auto-normalize.
function normalizeL2(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return vector;
  return vector.map((v) => v / magnitude);
}

// Never key the pacer on the raw API key — only a hash ever touches this
// map, matching the "never log the key" discipline elsewhere in the AI
// module. Stale entries are pruned lazily so a long-running process doesn't
// accumulate one entry per BYOK key ever seen.
const PACING_STALE_AFTER_MS = 10 * 60 * 1000;
const lastRequestAtByKey = new Map<string, number>();

function hashKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
}

async function waitForPacingSlot(keyId: string, minIntervalMs: number): Promise<void> {
  const now = Date.now();
  for (const [id, at] of lastRequestAtByKey) {
    if (now - at > PACING_STALE_AFTER_MS) lastRequestAtByKey.delete(id);
  }

  const last = lastRequestAtByKey.get(keyId);
  if (last !== undefined) {
    const wait = minIntervalMs - (now - last);
    if (wait > 0) await sleep(wait);
  }
  lastRequestAtByKey.set(keyId, Date.now());
}

/**
 * The SDK doesn't retry rate limits itself, and its error surfaces the raw
 * API error body as the message — great for logs, unreadable for a user
 * (Google's 429 responses are large nested JSON). This retries on a 429/
 * RESOURCE_EXHAUSTED, preferring the server's own `retryDelay` hint over a
 * guess, and on final failure throws a short, human message instead of
 * whatever the SDK produced.
 */
async function withRateLimitRetry<T>(fn: () => Promise<T>, options?: { maxRetries?: number }): Promise<T> {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RATE_LIMIT_RETRIES;
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRateLimitError(err)) throw err;
      if (attempt === maxRetries) {
        throw new Error(
          "Gemini's rate limit is still being hit after retrying — wait a minute and try again, or check your plan's quota at https://ai.google.dev/gemini-api/docs/rate-limits.",
        );
      }
      const delayMs = Math.min(extractRetryDelayMs(err) ?? DEFAULT_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

// Checks the SDK's structured status first — @google/genai throws an
// ApiError carrying a numeric `status` — and only falls back to string
// matching on the message for anything that isn't one (a plain network
// error, say). The old version matched on the raw message alone, which is
// how an unrelated 404 (deprecated model name) or a false-positive string
// match could be misclassified; a structured check doesn't have that problem.
function isRateLimitError(err: unknown): boolean {
  if (err instanceof ApiError && typeof err.status === "number") {
    return err.status === 429;
  }
  const text = err instanceof Error ? err.message : String(err);
  return text.includes("RESOURCE_EXHAUSTED") || text.includes('"code":429');
}

function extractRetryDelayMs(err: unknown): number | null {
  const text = err instanceof Error ? err.message : String(err);
  const match = text.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/);
  if (!match?.[1]) return null;
  return Math.ceil(parseFloat(match[1]) * 1000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
