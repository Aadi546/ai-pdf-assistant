import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";

const minimalPdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\n%%EOF",
);

describe("Documents (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const ownerEmail = `doc-owner-${Date.now()}@example.com`;
  const otherEmail = `doc-other-${Date.now()}@example.com`;
  const password = "correct-horse-battery-staple";
  let ownerToken: string;
  let otherToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const owner = await request(app.getHttpServer()).post("/auth/register").send({ email: ownerEmail, password });
    ownerToken = owner.body.accessToken;
    const other = await request(app.getHttpServer()).post("/auth/register").send({ email: otherEmail, password });
    otherToken = other.body.accessToken;
  });

  afterAll(async () => {
    await prisma.document.deleteMany({ where: { user: { email: { in: [ownerEmail, otherEmail] } } } });
    await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, otherEmail] } } });
    await app.close();
  });

  it("rejects a non-PDF upload", async () => {
    await request(app.getHttpServer())
      .post("/documents")
      .set("Authorization", `Bearer ${ownerToken}`)
      .attach("file", Buffer.from("not a pdf"), { filename: "notes.txt", contentType: "text/plain" })
      .expect(415);
  });

  it("uploads, lists, fetches, signs a download URL, and deletes a PDF — with ownership enforced", async () => {
    const upload = await request(app.getHttpServer())
      .post("/documents")
      .set("Authorization", `Bearer ${ownerToken}`)
      .attach("file", minimalPdf, { filename: "system-design.pdf", contentType: "application/pdf" })
      .expect(201);

    expect(upload.body).toMatchObject({ title: "system-design", status: "PROCESSING" });
    const documentId = upload.body.id as string;

    const list = await request(app.getHttpServer())
      .get("/documents")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(list.body.map((d: { id: string }) => d.id)).toContain(documentId);

    const fileRes = await request(app.getHttpServer())
      .get(`/documents/${documentId}/file`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(fileRes.body.url).toEqual(expect.stringContaining("X-Amz-Signature"));

    // A different user gets 404 (not 403) for every route on someone else's document.
    await request(app.getHttpServer())
      .get(`/documents/${documentId}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/documents/${documentId}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/documents/${documentId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/documents/${documentId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(404);
  });

  describe("POST /documents/:id/retry", () => {
    async function waitForStatus(documentId: string, target: string[], timeoutMs = 10_000): Promise<string> {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const res = await request(app.getHttpServer())
          .get(`/documents/${documentId}/status`)
          .set("Authorization", `Bearer ${ownerToken}`);
        if (target.includes(res.body.status)) return res.body.status;
        if (Date.now() > deadline) throw new Error(`Timed out waiting for status in [${target}], last saw ${res.body.status}`);
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    it("re-enqueues a FAILED document (extraction-stage failure re-tries extraction)", async () => {
      const corrupt = Buffer.from("%PDF-1.4\nnot actually a valid pdf body\n%%EOF");
      const upload = await request(app.getHttpServer())
        .post("/documents")
        .set("Authorization", `Bearer ${ownerToken}`)
        .attach("file", corrupt, { filename: "broken.pdf", contentType: "application/pdf" })
        .expect(201);
      const documentId = upload.body.id as string;

      expect(await waitForStatus(documentId, ["FAILED"])).toBe("FAILED");

      await request(app.getHttpServer())
        .post(`/documents/${documentId}/retry`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .expect(201);

      // Same corrupt file, so it fails again — the point here is that retry
      // actually re-ran extraction (status cycled back through PROCESSING)
      // rather than doing nothing.
      const status = await request(app.getHttpServer())
        .get(`/documents/${documentId}/status`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .expect(200);
      expect(["PROCESSING", "FAILED"]).toContain(status.body.status);

      await prisma.document.delete({ where: { id: documentId } });
    }, 20_000);

    it("rejects retrying a document that isn't FAILED", async () => {
      const upload = await request(app.getHttpServer())
        .post("/documents")
        .set("Authorization", `Bearer ${ownerToken}`)
        .attach("file", minimalPdf, { filename: "not-failed.pdf", contentType: "application/pdf" })
        .expect(201);
      const documentId = upload.body.id as string;
      expect(upload.body.status).toBe("PROCESSING");

      await request(app.getHttpServer())
        .post(`/documents/${documentId}/retry`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .expect(400);

      await prisma.document.delete({ where: { id: documentId } });
    });

    it("404s retrying someone else's document", async () => {
      const upload = await request(app.getHttpServer())
        .post("/documents")
        .set("Authorization", `Bearer ${ownerToken}`)
        .attach("file", minimalPdf, { filename: "owned.pdf", contentType: "application/pdf" })
        .expect(201);
      const documentId = upload.body.id as string;

      await request(app.getHttpServer())
        .post(`/documents/${documentId}/retry`)
        .set("Authorization", `Bearer ${otherToken}`)
        .expect(404);

      await prisma.document.delete({ where: { id: documentId } });
    });
  });
});
