import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";

/** Builds a real, parseable multi-page PDF (no external fixture files needed). */
function buildTestPdf(pageTexts: string[]): Buffer {
  const escape = (s: string) => s.replace(/[()\\]/g, "\\$&");
  const objs: string[] = [];
  const pagesNum = 2;
  const fontNum = 3;
  let next = 4;
  const contentNums: number[] = [];
  const pageNums: number[] = [];
  for (let i = 0; i < pageTexts.length; i++) {
    contentNums.push(next++);
    pageNums.push(next++);
  }

  objs[1] = `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`;
  objs[pagesNum] = `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageTexts.length} >>`;
  objs[fontNum] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  for (let i = 0; i < pageTexts.length; i++) {
    const stream = `BT /F1 24 Tf 50 700 Td (${escape(pageTexts[i]!)}) Tj ET`;
    objs[contentNums[i]!] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    objs[pageNums[i]!] =
      `<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontNum} 0 R >> >> /Contents ${contentNums[i]} 0 R >>`;
  }

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let n = 1; n < next; n++) {
    offsets[n] = pdf.length;
    pdf += `${n} 0 obj\n${objs[n]}\nendobj\n`;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${next}\n0000000000 65535 f \n`;
  for (let n = 1; n < next; n++) pdf += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${next} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}

async function waitForStatus(
  app: INestApplication,
  token: string,
  documentId: string,
  target: string[],
  timeoutMs = 10_000,
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

jest.setTimeout(20_000);

describe("Ingestion pipeline (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `ingest-${Date.now()}@example.com`;
  const password = "correct-horse-battery-staple";
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const res = await request(app.getHttpServer()).post("/auth/register").send({ email, password });
    token = res.body.accessToken;
  });

  afterAll(async () => {
    await prisma.document.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("extracts, chunks, and sets pageCount for a valid multi-page PDF", async () => {
    const pdf = buildTestPdf(["First page about hashing.", "Second page about sharding.", "Third page about caching."]);

    const upload = await request(app.getHttpServer())
      .post("/documents")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", pdf, { filename: "notes.pdf", contentType: "application/pdf" })
      .expect(201);
    const documentId = upload.body.id as string;
    expect(upload.body.status).toBe("PROCESSING");

    const finalStatus = await waitForStatus(app, token, documentId, ["EMBEDDING", "FAILED"]);
    expect(finalStatus).toBe("EMBEDDING");

    const doc = await request(app.getHttpServer())
      .get(`/documents/${documentId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(doc.body.pageCount).toBe(3);

    const chunks = await request(app.getHttpServer())
      .get(`/documents/${documentId}/chunks`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(chunks.body).toHaveLength(3);
    expect(chunks.body.map((c: { pageNumber: number }) => c.pageNumber)).toEqual([1, 2, 3]);
    expect(chunks.body[1].text).toContain("sharding");

    // This test's user never entered a Gemini key — the embedding job
    // (enqueued automatically once extraction finishes) should have found
    // no key and parked here rather than failing or hanging at PROCESSING.
    // See EmbeddingProcessor: a missing key is a park, not an error.
    const status = await request(app.getHttpServer())
      .get(`/documents/${documentId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(status.body).toMatchObject({ status: "EMBEDDING", needsApiKey: true });
    expect(status.body.progress.embedded).toBe(0);
  });

  it("marks a corrupt PDF as FAILED with a reason instead of hanging at PROCESSING", async () => {
    const corrupt = Buffer.from("%PDF-1.4\nnot actually a valid pdf body\n%%EOF");

    const upload = await request(app.getHttpServer())
      .post("/documents")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", corrupt, { filename: "broken.pdf", contentType: "application/pdf" })
      .expect(201);
    const documentId = upload.body.id as string;

    const finalStatus = await waitForStatus(app, token, documentId, ["EMBEDDING", "FAILED"]);
    expect(finalStatus).toBe("FAILED");

    const status = await request(app.getHttpServer())
      .get(`/documents/${documentId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(status.body.failureReason).toEqual(expect.any(String));
  });
});
