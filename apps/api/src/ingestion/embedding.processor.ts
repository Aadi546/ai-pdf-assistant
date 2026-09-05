import { Inject, Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job, UnrecoverableError } from "bullmq";
import { AiKeyService } from "../ai/ai-key.service";
import { EMBEDDER, Embedder } from "../embeddings/embedder.interface";
import { PrismaService } from "../prisma/prisma.service";
import { VECTOR_STORE, VectorStore } from "../retrieval/vector-store.interface";
import { EMBEDDING_QUEUE, EmbeddingJobData } from "../queue/queue.constants";

// Chunks fetched per persistence iteration — five Gemini requests per
// iteration at the provider's own EMBED_BATCH_SIZE of 10. Small enough that
// a crash mid-iteration only loses a few seconds of work, not the whole job.
const PERSIST_BATCH_SIZE = 50;

/**
 * Runs in the same `apps/api` process for V1, same as IngestionProcessor —
 * see queue.module.ts and docs/architecture.md §8 stage 2 for when this
 * becomes its own deployed worker process (unchanged when it does).
 *
 * The BYOK constraint this exists to solve: the user's Gemini key lives in
 * Redis with a 24h TTL and only exists once they've entered it in Settings
 * (see ai-key.service.ts). This worker fires asynchronously — at upload
 * time, at a later chat attempt, or after the key finally arrives — so it
 * cannot assume a key is available. A missing key is therefore a *park*,
 * not a failure: the job returns normally, the document stays EMBEDDING,
 * and AiConfigService re-enqueues once the key validates (see
 * ai-config.service.ts). Re-reading the key once per persistence iteration
 * (rather than once per job) means a key that expires or gets cleared
 * mid-job parks the job with whatever progress already committed, and a key
 * entered mid-job is picked up on the very next iteration.
 *
 * Resumability is what makes `maxStalledCount: 3` safe below: a Render free-
 * tier spin-down mid-job re-runs from wherever `listUnembeddedChunks` left
 * off, not from zero — see PgVectorStoreService.upsert's per-row commits.
 */
@Processor(EMBEDDING_QUEUE, { concurrency: 1, lockDuration: 60_000, maxStalledCount: 3 })
export class EmbeddingProcessor extends WorkerHost {
  private readonly logger = new Logger(EmbeddingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiKeyService: AiKeyService,
    @Inject(EMBEDDER) private readonly embedder: Embedder,
    @Inject(VECTOR_STORE) private readonly vectorStore: VectorStore,
  ) {
    super();
  }

  async process(job: Job<EmbeddingJobData>): Promise<void> {
    const { documentId } = job.data;
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document) {
      // Deleted between enqueue and processing — nothing to do.
      this.logger.warn(`Document ${documentId} no longer exists, skipping embed job`);
      return;
    }
    if (document.status === "READY") {
      // A duplicate/late-firing trigger (e.g. chat's defensive enqueue
      // racing the key-arrival enqueue) — idempotent no-op, not an error.
      return;
    }

    try {
      for (;;) {
        const apiKey = await this.aiKeyService.getKey(document.userId);
        if (!apiKey) {
          this.logger.log(`Document ${documentId} has no Gemini key yet — parking at EMBEDDING`);
          return;
        }

        const batch = await this.vectorStore.listUnembeddedChunks(documentId, PERSIST_BATCH_SIZE);
        if (batch.length === 0) break;

        const vectors = await this.embedder.embedBatch(
          apiKey,
          batch.map((c) => c.text),
        );
        // Commit here — this is the resumption point. If the process dies
        // now, the next attempt picks up wherever this left off.
        await this.vectorStore.upsert(batch.map((c, i) => ({ chunkId: c.chunkId, embedding: vectors[i] ?? [] })));

        const { embedded, total } = await this.vectorStore.countEmbedded(documentId);
        await job.updateProgress(total > 0 ? Math.round((embedded / total) * 100) : 0);
      }

      await this.prisma.document.updateMany({
        where: { id: documentId },
        data: { status: "READY", failureReason: null },
      });
      this.logger.log(`Embedding complete for document ${documentId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown embedding error";

      if (isInvalidKeyError(err)) {
        await this.prisma.document.updateMany({
          where: { id: documentId },
          data: {
            status: "FAILED",
            failureReason: "Your Gemini API key was rejected — update it in Settings and retry indexing.",
          },
        });
        // Stops BullMQ from burning further retries on a key that will
        // never become valid on its own.
        throw new UnrecoverableError(message);
      }

      // Only mark FAILED on the final attempt — earlier attempts leave
      // status at EMBEDDING so the UI doesn't flash a failure BullMQ is
      // about to silently recover from on the next retry.
      const isFinalAttempt = job.attemptsMade >= (job.opts.attempts ?? 1) - 1;
      if (isFinalAttempt) {
        await this.prisma.document.updateMany({
          where: { id: documentId },
          data: { status: "FAILED", failureReason: message.slice(0, 500) },
        });
      } else {
        await this.prisma.document.updateMany({
          where: { id: documentId },
          data: { failureReason: message.slice(0, 500) },
        });
      }
      this.logger.error(`Embedding failed for document ${documentId} (attempt ${job.attemptsMade + 1}): ${message}`);
      throw err;
    }
  }
}

function isInvalidKeyError(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err);
  return (
    text.includes("API_KEY_INVALID") ||
    text.includes("API key not valid") ||
    text.includes("PERMISSION_DENIED") ||
    text.includes('"code":400') ||
    text.includes('"code":403')
  );
}
