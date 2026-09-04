import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";

const minimalPdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\n%%EOF",
);

describe("Reading progress (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `rp-${Date.now()}@example.com`;
  const password = "correct-horse-battery-staple";
  let token: string;
  let documentId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const res = await request(app.getHttpServer()).post("/auth/register").send({ email, password });
    token = res.body.accessToken;

    const upload = await request(app.getHttpServer())
      .post("/documents")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", minimalPdf, { filename: "notes.pdf", contentType: "application/pdf" });
    documentId = upload.body.id;
  });

  afterAll(async () => {
    await prisma.document.deleteMany({ where: { userId: (await prisma.user.findUniqueOrThrow({ where: { email } })).id } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("returns null fields before any page has been recorded", async () => {
    const res = await request(app.getHttpServer())
      .get(`/documents/${documentId}/reading-progress`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual({ currentPage: null, progressPercent: null, lastReadAt: null });
  });

  it("is recorded as a side effect of a reading-context update, with a null percent until pageCount is known", async () => {
    await request(app.getHttpServer())
      .post(`/documents/${documentId}/reading-context`)
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPage: 7 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/documents/${documentId}/reading-progress`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body).toMatchObject({ currentPage: 7, progressPercent: null });
    expect(res.body.lastReadAt).toEqual(expect.any(String));
  });

  it("updates in place on the next page change rather than creating a second row", async () => {
    await request(app.getHttpServer())
      .post(`/documents/${documentId}/reading-context`)
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPage: 12 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/documents/${documentId}/reading-progress`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.currentPage).toBe(12);

    const rows = await prisma.readingProgress.findMany({ where: { documentId } });
    expect(rows).toHaveLength(1);
  });

  it("computes a percent once pageCount is set", async () => {
    await prisma.document.update({ where: { id: documentId }, data: { pageCount: 20 } });

    await request(app.getHttpServer())
      .post(`/documents/${documentId}/reading-context`)
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPage: 10 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/documents/${documentId}/reading-progress`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.progressPercent).toBe(50);
  });

  it("is isolated per user — a different user gets 404 on this document", async () => {
    const otherEmail = `rp-other-${Date.now()}@example.com`;
    const other = await request(app.getHttpServer()).post("/auth/register").send({ email: otherEmail, password });

    await request(app.getHttpServer())
      .get(`/documents/${documentId}/reading-progress`)
      .set("Authorization", `Bearer ${other.body.accessToken}`)
      .expect(404);

    await prisma.user.deleteMany({ where: { email: otherEmail } });
  });
});
