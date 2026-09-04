/**
 * Contract for turning text into a vector. Implemented by GeminiProvider
 * (Phase 8). `apiKey` is an explicit parameter, not resolved internally via
 * request-scoped DI, because embedding happens from the BullMQ ingestion
 * worker — outside any HTTP request context — as well as from request
 * handlers; there is no ambient "current request" to read a key off of.
 */
export interface Embedder {
  readonly dimensions: number;
  embed(apiKey: string, text: string): Promise<number[]>;
  embedBatch(apiKey: string, texts: string[]): Promise<number[][]>;
}

export const EMBEDDER = Symbol("EMBEDDER");
