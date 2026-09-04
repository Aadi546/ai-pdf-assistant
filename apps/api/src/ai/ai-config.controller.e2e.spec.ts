import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../app.module";
import { EMBEDDER, Embedder } from "../embeddings/embedder.interface";
import { PrismaService } from "../prisma/prisma.service";
import { AiKeyService } from "./ai-key.service";

/**
 * Exercises the full HTTP stack (guard, DTO validation, controller,
 * service) with a fake Embedder standing in for a real Gemini call — no
 * network dependency, no real API key needed, still proves the DI wiring
 * (AI_PROVIDER/EMBEDDER both resolving to the same GeminiProvider) is
 * intact by overriding at the same token the real app binds.
 */
describe("AiConfigController (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let aiKeyService: AiKeyService;
  const fakeEmbedder: jest.Mocked<Embedder> = {
    dimensions: 768,
    embed: jest.fn(),
    embedBatch: jest.fn(),
  };
  const email = `ai-config-${Date.now()}@example.com`;
  const password = "correct-horse-battery-staple";
  let token: string;
  let userId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await aiKeyService.clearKey(userId);
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("reports not configured before any key is set", async () => {
    const res = await request(app.getHttpServer())
      .get("/ai/config/status")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual({ configured: false });
  });

  it("rejects a key that fails validation, and never stores it", async () => {
    fakeEmbedder.embed.mockRejectedValue(new Error("API key not valid"));

    await request(app.getHttpServer())
      .post("/ai/config")
      .set("Authorization", `Bearer ${token}`)
      .send({ apiKey: "obviously-fake-key" })
      .expect(400);

    const status = await request(app.getHttpServer())
      .get("/ai/config/status")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(status.body).toEqual({ configured: false });
  });

  it("accepts and stores a key that passes validation, and never echoes it back", async () => {
    fakeEmbedder.embed.mockResolvedValue([0.1, 0.2, 0.3]);

    const setRes = await request(app.getHttpServer())
      .post("/ai/config")
      .set("Authorization", `Bearer ${token}`)
      .send({ apiKey: "a-valid-looking-key" })
      .expect(201);
    expect(setRes.body).toEqual({ configured: true });
    expect(JSON.stringify(setRes.body)).not.toContain("a-valid-looking-key");

    const status = await request(app.getHttpServer())
      .get("/ai/config/status")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(status.body).toEqual({ configured: true });
  });

  it("clears the key on DELETE", async () => {
    fakeEmbedder.embed.mockResolvedValue([0.1]);
    await request(app.getHttpServer())
      .post("/ai/config")
      .set("Authorization", `Bearer ${token}`)
      .send({ apiKey: "a-key-to-delete" })
      .expect(201);

    await request(app.getHttpServer()).delete("/ai/config").set("Authorization", `Bearer ${token}`).expect(204);

    const status = await request(app.getHttpServer())
      .get("/ai/config/status")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(status.body).toEqual({ configured: false });
  });

  it("requires authentication", async () => {
    await request(app.getHttpServer()).get("/ai/config/status").expect(401);
    await request(app.getHttpServer()).post("/ai/config").send({ apiKey: "whatever-key-value" }).expect(401);
  });
});
