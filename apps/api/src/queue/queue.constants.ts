export const INGESTION_QUEUE = "ingestion";
export const EMBEDDING_QUEUE = "embedding";

export interface IngestionJobData {
  documentId: string;
}

export interface EmbeddingJobData {
  documentId: string;
}
