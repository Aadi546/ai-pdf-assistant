import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../app.module";
import { RedisService } from "../redis/redis.service";
import { AiKeyService } from "./ai-key.service";

describe("AiKeyService (e2e)", () => {
  let app: INestApplication;
  let service: AiKeyService;
  let redis: RedisService;
  const userId = `test-user-${Date.now()}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    service = app.get(AiKeyService);
    redis = app.get(RedisService);
  });

  afterAll(async () => {
    await service.clearKey(userId);
    await app.close();
  });

  it("has no key by default", async () => {
    expect(await service.hasKey(userId)).toBe(false);
    expect(await service.getKey(userId)).toBeNull();
  });

  it("stores and retrieves a key, with a TTL set", async () => {
    await service.setKey(userId, "test-api-key-value");

    expect(await service.hasKey(userId)).toBe(true);
    expect(await service.getKey(userId)).toBe("test-api-key-value");

    const ttl = await redis.client.ttl(`ai_key:${userId}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(24 * 60 * 60);
  });

  it("clears a key", async () => {
    await service.setKey(userId, "another-key");
    await service.clearKey(userId);

    expect(await service.hasKey(userId)).toBe(false);
  });

  it("scopes keys per user", async () => {
    const otherUserId = `${userId}-other`;
    await service.setKey(userId, "user-a-key");

    expect(await service.hasKey(otherUserId)).toBe(false);
    await service.clearKey(otherUserId);
  });
});
