-- AlterTable
ALTER TABLE "DocumentChunk" ADD COLUMN     "embedding" vector(768);

-- Approximate nearest-neighbor index for cosine similarity search.
-- HNSW over ivfflat: no training/list-count tuning needed and better
-- recall at this scale, at the cost of slower inserts — acceptable since
-- chunk embeddings are written once per document, not on a hot path.
CREATE INDEX "DocumentChunk_embedding_hnsw_idx" ON "DocumentChunk" USING hnsw (embedding vector_cosine_ops);
