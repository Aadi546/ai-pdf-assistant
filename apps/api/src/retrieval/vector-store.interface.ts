export interface ChunkEmbedding {
  chunkId: string;
  embedding: number[];
}

export interface SemanticSearchResult {
  chunkId: string;
  pageNumber: number;
  section: string | null;
  text: string;
  /** Cosine similarity, 1 = identical direction, 0 = unrelated, -1 = opposite. */
  score: number;
}

/**
 * Everything downstream (RetrievalService, eventually the chat prompt
 * builder in Phase 9) depends on this interface, never on pgvector/SQL
 * directly — per the architecture doc, swapping in Qdrant/Pinecone later
 * is a new class implementing this, not a rewrite of every caller.
 */
export interface UnembeddedChunk {
  chunkId: string;
  text: string;
}

export interface EmbeddingProgress {
  embedded: number;
  total: number;
}

export interface VectorStore {
  upsert(entries: ChunkEmbedding[]): Promise<void>;
  /** Nearest neighbors by cosine similarity, scoped to one document. */
  search(documentId: string, queryEmbedding: number[], topK: number): Promise<SemanticSearchResult[]>;
  /**
   * Chunks still needing an embedding, oldest-page-first — this is what
   * makes the embedding worker resumable: "what's left" is a query against
   * the `embedding IS NULL` column, not bookkeeping the worker has to keep
   * itself. `embedding` is a Prisma `Unsupported` column so this can't be a
   * normal Prisma findMany — see PgVectorStoreService.
   */
  listUnembeddedChunks(documentId: string, limit: number): Promise<UnembeddedChunk[]>;
  /** For progress reporting (`GET /documents/:id/status`) — derived live, never stored. */
  countEmbedded(documentId: string): Promise<EmbeddingProgress>;
}

export const VECTOR_STORE = Symbol("VECTOR_STORE");
