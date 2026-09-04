import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../app.module";

describe("RequestIdMiddleware (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("assigns a fresh X-Request-Id when the client doesn't send one", async () => {
    const res = await request(app.getHttpServer()).get("/health").expect(200);
    expect(res.headers["x-request-id"]).toEqual(expect.any(String));
    expect((res.headers["x-request-id"] as string).length).toBeGreaterThan(0);
  });

  it("echoes back a client-supplied X-Request-Id instead of generating a new one", async () => {
    const res = await request(app.getHttpServer())
      .get("/health")
      .set("X-Request-Id", "test-fixed-id-123")
      .expect(200);
    expect(res.headers["x-request-id"]).toBe("test-fixed-id-123");
  });

  it("also assigns an id on a route that never reaches a handler (e.g. an unauthenticated 401)", async () => {
    const res = await request(app.getHttpServer()).get("/users/me").expect(401);
    expect(res.headers["x-request-id"]).toEqual(expect.any(String));
  });
});
