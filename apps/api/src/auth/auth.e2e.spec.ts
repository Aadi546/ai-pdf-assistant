import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Integration test: boots the real Nest app (with the real Postgres from
 * docker-compose) and drives the auth endpoints exactly as an HTTP client
 * would, per spec §34 ("integration tests" for backend flows).
 */
describe("Auth flow (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `test-${Date.now()}@example.com`;
  const password = "correct-horse-battery-staple";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("registers, rejects a duplicate email, and never returns passwordHash", async () => {
    const res = await request(app.getHttpServer()).post("/auth/register").send({ email, password }).expect(201);

    expect(res.body.user.email).toBe(email);
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.accessToken).toEqual(expect.any(String));

    await request(app.getHttpServer()).post("/auth/register").send({ email, password }).expect(409);
  });

  it("logs in, rejects a wrong password, and protects /users/me", async () => {
    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password: "wrong-password" })
      .expect(401);

    const login = await request(app.getHttpServer()).post("/auth/login").send({ email, password }).expect(200);
    const accessToken = login.body.accessToken as string;

    await request(app.getHttpServer()).get("/users/me").expect(401);

    const me = await request(app.getHttpServer())
      .get("/users/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body.email).toBe(email);
  });

  it("issues a new access token from the refresh cookie", async () => {
    const login = await request(app.getHttpServer()).post("/auth/login").send({ email, password }).expect(200);
    const refreshCookie = login.headers["set-cookie"]?.[0];
    if (!refreshCookie) throw new Error("Expected login response to set a refresh cookie");

    const refreshed = await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", refreshCookie)
      .expect(200);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));

    await request(app.getHttpServer()).post("/auth/refresh").expect(401);
  });
});
