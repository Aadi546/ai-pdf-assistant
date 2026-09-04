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
export interface VectorStore {
  upsert(entries: ChunkEmbedding[]): Promise<void>;
  /** Nearest neighbors by cosine similarity, scoped to one document. */
  search(documentId: string, queryEmbedding: number[], topK: number): Promise<SemanticSearchResult[]>;
}

export const VECTOR_STORE = Symbol("VECTOR_STORE");
