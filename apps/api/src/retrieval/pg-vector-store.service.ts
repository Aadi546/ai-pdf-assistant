import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  ChunkEmbedding,
  EmbeddingProgress,
  SemanticSearchResult,
  UnembeddedChunk,
  VectorStore,
} from "./vector-store.interface";

interface RawSearchRow {
  id: string;
  pageNumber: number;
  section: string | null;
  text: string;
  score: number;
}

interface RawUnembeddedRow {
  id: string;
  text: string;
}

interface RawCountRow {
  embedded: bigint;
  total: bigint;
}

/**
 * pgvector-backed VectorStore (ADR 0001: chosen over Redis Vector Search).
 * DocumentChunk.embedding is a Prisma `Unsupported("vector(768)")` column —
 * excluded from the generated client entirely, so every read/write here
 * goes through raw SQL. Cosine distance via pgvector's `<=>` operator,
 * backed by the HNSW index from the add_chunk_embedding migration.
 */
@Injectable()
export class PgVectorStoreService implements VectorStore {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(entries: ChunkEmbedding[]): Promise<void> {
    if (entries.length === 0) return;

    // Deliberately NOT one $transaction wrapping every entry: this is the
    // embedding worker's resumption point (see EmbeddingProcessor) — each
    // row's UPDATE is already atomic on its own, and committing them
    // independently means a crash mid-batch keeps whatever finished instead
    // of losing the whole batch to an all-or-nothing rollback.
    for (const entry of entries) {
      await this.prisma.$executeRaw`
        UPDATE "DocumentChunk"
        SET embedding = ${toVectorLiteral(entry.embedding)}::vector
        WHERE id = ${entry.chunkId}
      `;
    }
  }

  async search(documentId: string, queryEmbedding: number[], topK: number): Promise<SemanticSearchResult[]> {
    const vector = toVectorLiteral(queryEmbedding);
    const rows = await this.prisma.$queryRaw<RawSearchRow[]>`
      SELECT id, "pageNumber", section, text, 1 - (embedding <=> ${vector}::vector) AS score
      FROM "DocumentChunk"
      WHERE "documentId" = ${documentId} AND embedding IS NOT NULL
      ORDER BY embedding <=> ${vector}::vector
      LIMIT ${topK}
    `;

    return rows.map((row) => ({
      chunkId: row.id,
      pageNumber: row.pageNumber,
      section: row.section,
      text: row.text,
      score: row.score,
    }));
  }

  async listUnembeddedChunks(documentId: string, limit: number): Promise<UnembeddedChunk[]> {
    const rows = await this.prisma.$queryRaw<RawUnembeddedRow[]>`
      SELECT id, text
      FROM "DocumentChunk"
      WHERE "documentId" = ${documentId} AND embedding IS NULL
      ORDER BY "pageNumber" ASC, "chunkIndex" ASC
      LIMIT ${limit}
    `;
    return rows.map((row) => ({ chunkId: row.id, text: row.text }));
  }

  async countEmbedded(documentId: string): Promise<EmbeddingProgress> {
    const [row] = await this.prisma.$queryRaw<RawCountRow[]>`
      SELECT
        COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS embedded,
        COUNT(*) AS total
      FROM "DocumentChunk"
      WHERE "documentId" = ${documentId}
    `;
    return { embedded: Number(row?.embedded ?? 0n), total: Number(row?.total ?? 0n) };
  }
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
