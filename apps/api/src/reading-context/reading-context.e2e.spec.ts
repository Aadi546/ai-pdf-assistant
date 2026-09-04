import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

const minimalPdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\n%%EOF",
);

describe("Reading context (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  const ownerEmail = `rc-owner-${Date.now()}@example.com`;
  const otherEmail = `rc-other-${Date.now()}@example.com`;
  const password = "correct-horse-battery-staple";
  let ownerToken: string;
  let otherToken: string;
  let documentId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);

    const owner = await request(app.getHttpServer()).post("/auth/register").send({ email: ownerEmail, password });
    ownerToken = owner.body.accessToken;
    const other = await request(app.getHttpServer()).post("/auth/register").send({ email: otherEmail, password });
    otherToken = other.body.accessToken;

    const upload = await request(app.getHttpServer())
      .post("/documents")
      .set("Authorization", `Bearer ${ownerToken}`)
      .attach("file", minimalPdf, { filename: "notes.pdf", contentType: "application/pdf" });
    documentId = upload.body.id;
  });

  afterAll(async () => {
    await prisma.document.deleteMany({ where: { user: { email: { in: [ownerEmail, otherEmail] } } } });
    await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, otherEmail] } } });
    await app.close();
  });

  it("returns an empty context before any update", async () => {
    const res = await request(app.getHttpServer())
      .get(`/documents/${documentId}/reading-context`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body).toEqual({ documentId });
  });

  it("stores currentPage/previousPage across successive updates, TTL'd in Redis", async () => {
    const first = await request(app.getHttpServer())
      .post(`/documents/${documentId}/reading-context`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ currentPage: 5 })
      .expect(201);
    expect(first.body).toMatchObject({ documentId, currentPage: 5, previousPage: null });

    const second = await request(app.getHttpServer())
      .post(`/documents/${documentId}/reading-context`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ currentPage: 6, selectedText: "consistent hashing" })
      .expect(201);
    expect(second.body).toMatchObject({ documentId, currentPage: 6, previousPage: 5, selectedText: "consistent hashing" });

    const fetched = await request(app.getHttpServer())
      .get(`/documents/${documentId}/reading-context`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(fetched.body).toMatchObject({ currentPage: 6, previousPage: 5 });

    const ttl = await redis.client.ttl(`reading_context:${(await prisma.document.findUniqueOrThrow({ where: { id: documentId } })).userId}:${documentId}`);
    expect(ttl).toBeGreaterThan(0);
  });

  it("rejects an invalid page number", async () => {
    await request(app.getHttpServer())
      .post(`/documents/${documentId}/reading-context`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ currentPage: 0 })
      .expect(400);
  });

  it("is isolated per document owner — a different user gets 404", async () => {
    await request(app.getHttpServer())
      .post(`/documents/${documentId}/reading-context`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ currentPage: 1 })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/documents/${documentId}/reading-context`)
      .set("Authorization", `Bearer ${otherToken}`)
      .expect(404);
  });
});
