import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ChunkEmbedding, SemanticSearchResult, VectorStore } from "./vector-store.interface";

interface RawSearchRow {
  id: string;
  pageNumber: number;
  section: string | null;
  text: string;
  score: number;
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

    await this.prisma.$transaction(
      entries.map(
        (entry) =>
          this.prisma.$executeRaw`
            UPDATE "DocumentChunk"
            SET embedding = ${toVectorLiteral(entry.embedding)}::vector
            WHERE id = ${entry.chunkId}
          `,
      ),
    );
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
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
