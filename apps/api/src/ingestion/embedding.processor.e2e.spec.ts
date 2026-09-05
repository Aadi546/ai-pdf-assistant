import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Job } from "bullmq";
import { AppModule } from "../app.module";
import { AiKeyService } from "../ai/ai-key.service";
import { EMBEDDER, Embedder } from "../embeddings/embedder.interface";
import { PrismaService } from "../prisma/prisma.service";
import { VECTOR_STORE, VectorStore } from "../retrieval/vector-store.interface";
import { EmbeddingJobData } from "../queue/queue.constants";
import { EmbeddingProcessor } from "./embedding.processor";

jest.setTimeout(20_000);

const fakeEmbedder: jest.Mocked<Embedder> = {
  dimensions: 768,
  embed: jest.fn(),
  embedBatch: jest.fn(),
};

/** Minimal fake satisfying the subset of BullMQ's Job API EmbeddingProcessor actually reads. */
function fakeJob(documentId: string, attemptsMade = 0, attempts = 5): Job<EmbeddingJobData> {
  return {
    data: { documentId },
    attemptsMade,
    opts: { attempts },
    updateProgress: jest.fn(),
  } as unknown as Job<EmbeddingJobData>;
}

describe("EmbeddingProcessor (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let aiKeyService: AiKeyService;
  let vectorStore: VectorStore;
  let processor: EmbeddingProcessor;
  const email = `embedproc-${Date.now()}@example.com`;
  let userId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMBEDDER)
      .useValue(fakeEmbedder)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    aiKeyService = app.get(AiKeyService);
    vectorStore = app.get(VECTOR_STORE);
    processor = app.get(EmbeddingProcessor);

    const user = await prisma.user.create({ data: { email, passwordHash: "unused-in-this-test" } });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.document.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  afterEach(async () => {
    await aiKeyService.clearKey(userId);
    jest.clearAllMocks();
  });

  async function createDocumentWithChunks(chunkCount: number) {
    const documentId = randomUUID();
    await prisma.document.create({
      data: {
        id: documentId,
        userId,
        title: "resumption test doc",
        originalFilename: "test.pdf",
        storageKey: "unused",
        mimeType: "application/pdf",
        sizeBytes: 1,
        status: "EMBEDDING",
      },
    });
    await prisma.documentChunk.createMany({
      data: Array.from({ length: chunkCount }, (_, i) => ({
        documentId,
        pageNumber: i + 1,
        chunkIndex: 0,
        text: `chunk ${i}`,
      })),
    });
    return documentId;
  }

  it("parks at EMBEDDING with no key, and does not touch the embedder at all", async () => {
    const documentId = await createDocumentWithChunks(3);

    await processor.process(fakeJob(documentId));

    expect(fakeEmbedder.embedBatch).not.toHaveBeenCalled();
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(doc.status).toBe("EMBEDDING");
    const progress = await vectorStore.countEmbedded(documentId);
    expect(progress.embedded).toBe(0);
  });

  it("resumes from where it left off: a failure after the first batch does not re-embed already-embedded chunks", async () => {
    await aiKeyService.setKey(userId, "fake-key-for-testing");
    // Two persistence iterations' worth (PERSIST_BATCH_SIZE=50) so the first
    // batch fully commits before the second batch's failure.
    const documentId = await createDocumentWithChunks(60);

    fakeEmbedder.embedBatch
      .mockImplementationOnce(async (_key, texts) => texts.map(() => new Array(768).fill(0.01)))
      .mockRejectedValueOnce(new Error("simulated transient failure"));

    await expect(processor.process(fakeJob(documentId, 0))).rejects.toThrow("simulated transient failure");

    const afterFailure = await vectorStore.countEmbedded(documentId);
    expect(afterFailure.embedded).toBe(50); // first iteration's batch committed before the second threw
    expect(afterFailure.total).toBe(60);
    expect(fakeEmbedder.embedBatch).toHaveBeenCalledTimes(2);

    // Simulate BullMQ's retry: a fresh process() call for the same job.
    fakeEmbedder.embedBatch.mockImplementation(async (_key, texts) => texts.map(() => new Array(768).fill(0.01)));
    await processor.process(fakeJob(documentId, 1));

    // Only the remaining 10 unembedded chunks were sent to the embedder on
    // the resumed run — not all 60 again.
    expect(fakeEmbedder.embedBatch).toHaveBeenLastCalledWith("fake-key-for-testing", expect.arrayContaining([expect.any(String)]));
    const lastCallTexts = fakeEmbedder.embedBatch.mock.calls.at(-1)?.[1] as string[];
    expect(lastCallTexts).toHaveLength(10);

    const doc = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(doc.status).toBe("READY");
    const finalProgress = await vectorStore.countEmbedded(documentId);
    expect(finalProgress).toEqual({ embedded: 60, total: 60 });
  });

  it("only marks FAILED on the final attempt, leaving status at EMBEDDING for earlier ones", async () => {
    await aiKeyService.setKey(userId, "fake-key-for-testing");
    const documentId = await createDocumentWithChunks(3);
    fakeEmbedder.embedBatch.mockRejectedValue(new Error("boom"));

    await expect(processor.process(fakeJob(documentId, 0, 3))).rejects.toThrow("boom");
    let doc = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(doc.status).toBe("EMBEDDING");

    await expect(processor.process(fakeJob(documentId, 2, 3))).rejects.toThrow("boom");
    doc = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(doc.status).toBe("FAILED");
    expect(doc.failureReason).toContain("boom");
  });
});
