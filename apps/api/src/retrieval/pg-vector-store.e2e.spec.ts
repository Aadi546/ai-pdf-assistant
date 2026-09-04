import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";
import { VECTOR_STORE, VectorStore } from "./vector-store.interface";

const DIMENSIONS = 768;

/** A mostly-zero unit vector with a 1 at `index` — trivially orthogonal to any other basis vector. */
function basisVector(index: number): number[] {
  const v = new Array(DIMENSIONS).fill(0);
  v[index] = 1;
  return v;
}

/** `a` tilted partway toward `b`, still much closer to `a` than to `b`. */
function tiltedTowards(a: number[], b: number[], amount: number): number[] {
  return a.map((v, i) => v + amount * (b[i] ?? 0));
}

describe("PgVectorStoreService (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let store: VectorStore;
  const email = `vectorstore-${Date.now()}@example.com`;
  let userId: string;
  let documentId: string;
  let otherDocumentId: string;
  let chunkA: string; // aligned with basisVector(0)
  let chunkB: string; // aligned with basisVector(1), orthogonal to A
  let chunkC: string; // A tilted slightly toward B — should rank between A and B
  let otherDocChunk: string; // same embedding as A, but on a different document

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    store = app.get(VECTOR_STORE);

    const user = await prisma.user.create({
      data: { email, passwordHash: "unused-in-this-test" },
    });
    userId = user.id;

    const doc = await prisma.document.create({
      data: {
        id: randomUUID(),
        userId,
        title: "vector test doc",
        originalFilename: "test.pdf",
        storageKey: "unused",
        mimeType: "application/pdf",
        sizeBytes: 1,
        status: "EMBEDDING",
      },
    });
    documentId = doc.id;

    const otherDoc = await prisma.document.create({
      data: {
        id: randomUUID(),
        userId,
        title: "other doc",
        originalFilename: "other.pdf",
        storageKey: "unused",
        mimeType: "application/pdf",
        sizeBytes: 1,
        status: "EMBEDDING",
      },
    });
    otherDocumentId = otherDoc.id;

    const [a, b, c, other] = await prisma.$transaction([
      prisma.documentChunk.create({
        data: { documentId, pageNumber: 1, chunkIndex: 0, text: "Chunk A: consistent hashing basics" },
      }),
      prisma.documentChunk.create({
        data: { documentId, pageNumber: 2, chunkIndex: 0, text: "Chunk B: totally unrelated topic" },
      }),
      prisma.documentChunk.create({
        data: { documentId, pageNumber: 3, chunkIndex: 0, text: "Chunk C: related but not identical to A" },
      }),
      prisma.documentChunk.create({
        data: { documentId: otherDocumentId, pageNumber: 1, chunkIndex: 0, text: "Same vector, different document" },
      }),
    ]);
    chunkA = a.id;
    chunkB = b.id;
    chunkC = c.id;
    otherDocChunk = other.id;

    await store.upsert([
      { chunkId: chunkA, embedding: basisVector(0) },
      { chunkId: chunkB, embedding: basisVector(1) },
      { chunkId: chunkC, embedding: tiltedTowards(basisVector(0), basisVector(1), 0.3) },
      { chunkId: otherDocChunk, embedding: basisVector(0) },
    ]);
  });

  afterAll(async () => {
    await prisma.document.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it("ranks by cosine similarity: exact match first, tilted-towards second, orthogonal last", async () => {
    const results = await store.search(documentId, basisVector(0), 10);

    expect(results.map((r) => r.chunkId)).toEqual([chunkA, chunkC, chunkB]);
    expect(results[0]!.score).toBeCloseTo(1, 5);
    expect(results[1]!.score).toBeGreaterThan(results[2]!.score);
    expect(results[2]!.score).toBeCloseTo(0, 5); // orthogonal
  });

  it("respects topK", async () => {
    const results = await store.search(documentId, basisVector(0), 1);
    expect(results).toHaveLength(1);
    expect(results[0]!.chunkId).toBe(chunkA);
  });

  it("never returns chunks from a different document, even with an identical embedding", async () => {
    const results = await store.search(documentId, basisVector(0), 10);
    expect(results.map((r) => r.chunkId)).not.toContain(otherDocChunk);
  });

  it("returns full chunk metadata alongside the score", async () => {
    const [top] = await store.search(documentId, basisVector(0), 1);
    expect(top).toMatchObject({ pageNumber: 1, text: "Chunk A: consistent hashing basics" });
  });
});
