import { Injectable } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";

const KEY_TTL_SECONDS = 24 * 60 * 60; // 24h — "session-scoped" per docs/architecture.md, refreshed on every use (getKey uses GETEX)

function redisKey(userId: string): string {
  return `ai_key:${userId}`;
}

/**
 * BYOK Gemini key storage. Deliberately Redis, not Postgres (ADR: session-
 * scoped, not persisted — see docs/architecture.md's BYOK section): never
 * written to disk, and expires on its own after 24h. Not auto-cleared on
 * /auth/logout — that endpoint intentionally doesn't require a still-valid
 * access token (so an expired session can still log out), and requiring
 * one just to clear this key would be a worse tradeoff than the bounded
 * 24h exposure window. A user who wants it gone immediately can call
 * `DELETE /ai/config` directly. Never log the key — every method here
 * takes/returns it, but nothing in this file (or its callers) should ever
 * pass it to a logger.
 */
@Injectable()
export class AiKeyService {
  constructor(private readonly redis: RedisService) {}

  async setKey(userId: string, apiKey: string): Promise<void> {
    await this.redis.set(redisKey(userId), apiKey, KEY_TTL_SECONDS);
  }

  getKey(userId: string): Promise<string | null> {
    return this.redis.getAndRefresh(redisKey(userId), KEY_TTL_SECONDS);
  }

  async hasKey(userId: string): Promise<boolean> {
    return (await this.getKey(userId)) !== null;
  }

  clearKey(userId: string): Promise<void> {
    return this.redis.del(redisKey(userId));
  }
}
