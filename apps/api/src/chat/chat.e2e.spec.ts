import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../app.module";
import { AiKeyService } from "../ai/ai-key.service";
import { AI_PROVIDER, AIProvider, GenerateParams } from "../ai/ai-provider.interface";
import { EMBEDDER, Embedder } from "../embeddings/embedder.interface";
import { PrismaService } from "../prisma/prisma.service";

jest.setTimeout(20_000);

/** Builds a real, parseable one-page PDF so the real ingestion pipeline produces real chunks. */
function buildTestPdf(text: string): Buffer {
  const escaped = text.replace(/[()\\]/g, "\\$&");
  const stream = `BT /F1 24 Tf 50 700 Td (${escaped}) Tj ET`;
  const objs: Record<number, string> = {
    1: "<< /Type /Catalog /Pages 2 0 R >>",
    2: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    4: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    5: `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  };
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let n = 1; n <= 5; n++) {
    offsets[n] = pdf.length;
    pdf += `${n} 0 obj\n${objs[n]}\nendobj\n`;
  }
  const xrefStart = pdf.length;
  pdf += "xref\n0 6\n0000000000 65535 f \n";
  for (let n = 1; n <= 5; n++) pdf += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  pdf += "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xrefStart + "\n%%EOF";
  return Buffer.from(pdf, "latin1");
}

async function waitForStatus(
  app: INestApplication,
  token: string,
  documentId: string,
  target: string[],
  timeoutMs = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await request(app.getHttpServer())
      .get(`/documents/${documentId}/status`)
      .set("Authorization", `Bearer ${token}`);
    if (target.includes(res.body.status)) return res.body.status;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for status in [${target}], last saw ${res.body.status}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** Parses a raw `event: x\ndata: {...}\n\n` SSE body into typed events. */
function parseSse(body: string): { type: string; [key: string]: unknown }[] {
  return body
    .split("\n\n")
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
      return JSON.parse(dataLine!.slice("data: ".length));
    });
}

const fakeAiProvider: jest.Mocked<AIProvider> = {
  generate: jest.fn(),
  stream: jest.fn(),
};
const fakeEmbedder: jest.Mocked<Embedder> = {
  dimensions: 768,
  embed: jest.fn(),
  embedBatch: jest.fn(),
};

async function* fakeTokenStream(_apiKey: string, _params: GenerateParams): AsyncIterable<string> {
  yield "Consistent hashing ";
  yield "reduces key movement ";
  yield "[Page 1].";
}

describe("Chat (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let aiKeyService: AiKeyService;
  const email = `chat-${Date.now()}@example.com`;
  const password = "correct-horse-battery-staple";
  let token: string;
  let userId: string;
  let documentId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AI_PROVIDER)
      .useValue(fakeAiProvider)
      .overrideProvider(EMBEDDER)
      .useValue(fakeEmbedder)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    aiKeyService = app.get(AiKeyService);

    const res = await request(app.getHttpServer()).post("/auth/register").send({ email, password });
    token = res.body.accessToken;
    userId = res.body.user.id;

    fakeEmbedder.embed.mockResolvedValue(new Array(768).fill(0.01));
    fakeEmbedder.embedBatch.mockImplementation(async (_key, texts) => texts.map(() => new Array(768).fill(0.01)));
  });

  afterAll(async () => {
    await aiKeyService.clearKey(userId);
    await prisma.document.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it("rejects chat when no Gemini key is configured", async () => {
    const upload = await request(app.getHttpServer())
      .post("/documents")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", buildTestPdf("Consistent hashing minimizes key redistribution."), {
        filename: "no-key-test.pdf",
        contentType: "application/pdf",
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/documents/${upload.body.id}/chat`)
      .set("Authorization", `Bearer ${token}`)
      .send({ question: "Why?", currentPage: 1 })
      .expect(400);
  });

  it(
    "embeds a document in the background (no chat request needed) and then streams a response with citations",
    async () => {
      await aiKeyService.setKey(userId, "fake-key-for-testing");
      fakeAiProvider.stream.mockImplementation(fakeTokenStream);

      const upload = await request(app.getHttpServer())
        .post("/documents")
        .set("Authorization", `Bearer ${token}`)
        .attach("file", buildTestPdf("Consistent hashing minimizes key redistribution."), {
          filename: "chat-test.pdf",
          contentType: "application/pdf",
        })
        .expect(201);
      documentId = upload.body.id;

      // Embedding now happens entirely in the background — the embed job
      // is enqueued automatically once extraction finishes (a key is
      // already on file), so this document should reach READY on its own,
      // with no chat request involved at all.
      const finalStatus = await waitForStatus(app, token, documentId, ["READY", "FAILED"]);
      expect(finalStatus).toBe("READY");
      expect(fakeEmbedder.embedBatch).toHaveBeenCalled();

      const res = await request(app.getHttpServer())
        .post(`/documents/${documentId}/chat`)
        .set("Authorization", `Bearer ${token}`)
        .send({ question: "Why do we need virtual nodes?", currentPage: 1 })
        .expect(200);

      const events = parseSse(res.text);
      // No leading "status" event anymore — the chat path no longer does any
      // embedding work of its own, so the first event is the first token.
      expect(events[0]).toMatchObject({ type: "token" });
      expect(events.filter((e) => e.type === "token").map((e) => e.text).join("")).toBe(
        "Consistent hashing reduces key movement [Page 1].",
      );
      expect(events.at(-1)).toEqual({ type: "done", citedPages: [1] });

      const conversation = await request(app.getHttpServer())
        .get(`/documents/${documentId}/conversation`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(conversation.body.messages).toHaveLength(2);
      expect(conversation.body.messages[0]).toMatchObject({ role: "USER", content: "Why do we need virtual nodes?" });
      expect(conversation.body.messages[1]).toMatchObject({
        role: "ASSISTANT",
        content: "Consistent hashing reduces key movement [Page 1].",
        citedPages: [1],
      });
    },
    20_000,
  );

  it("parks a document at EMBEDDING with no key, then embeds it automatically the moment a key is saved — no chat request involved", async () => {
    await aiKeyService.clearKey(userId);

    const upload = await request(app.getHttpServer())
      .post("/documents")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", buildTestPdf("Sharding splits a dataset across nodes."), {
        filename: "byok-crux-test.pdf",
        contentType: "application/pdf",
      })
      .expect(201);
    const noKeyDocId = upload.body.id;

    const parked = await waitForStatus(app, token, noKeyDocId, ["EMBEDDING", "FAILED"]);
    expect(parked).toBe("EMBEDDING");
    const parkedStatus = await request(app.getHttpServer())
      .get(`/documents/${noKeyDocId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(parkedStatus.body.needsApiKey).toBe(true);
    expect(parkedStatus.body.progress.embedded).toBe(0);

    // Saving a key is the ONLY thing that happens next — no chat request,
    // no manual re-enqueue. AiConfigService.setKey is what should unblock it.
    await request(app.getHttpServer())
      .post("/ai/config")
      .set("Authorization", `Bearer ${token}`)
      .send({ apiKey: "fake-key-for-testing" })
      .expect(201);

    const finalStatus = await waitForStatus(app, token, noKeyDocId, ["READY", "FAILED"]);
    expect(finalStatus).toBe("READY");
  });

  it("reuses the same conversation across messages and clears it on DELETE", async () => {
    fakeAiProvider.stream.mockImplementation(fakeTokenStream);

    await request(app.getHttpServer())
      .post(`/documents/${documentId}/chat`)
      .set("Authorization", `Bearer ${token}`)
      .send({ question: "And why does that matter?", currentPage: 1 })
      .expect(200);

    const before = await request(app.getHttpServer())
      .get(`/documents/${documentId}/conversation`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(before.body.messages).toHaveLength(4); // 2 from the previous test + 2 new

    await request(app.getHttpServer())
      .delete(`/documents/${documentId}/conversation`)
      .set("Authorization", `Bearer ${token}`)
      .expect(204);

    const after = await request(app.getHttpServer())
      .get(`/documents/${documentId}/conversation`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(after.body.messages).toHaveLength(0);
  });

  it("rejects chat for a document owned by someone else", async () => {
    const otherEmail = `chat-other-${Date.now()}@example.com`;
    const other = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ email: otherEmail, password });

    await request(app.getHttpServer())
      .post(`/documents/${documentId}/chat`)
      .set("Authorization", `Bearer ${other.body.accessToken}`)
      .send({ question: "Anything?", currentPage: 1 })
      .expect(404);

    await prisma.user.deleteMany({ where: { email: otherEmail } });
  });
});
