import { Injectable } from "@nestjs/common";
import { ReadingProgressService } from "../reading-progress/reading-progress.service";
import { RedisService } from "../redis/redis.service";
import { UpdateReadingContextDto } from "./dto/update-reading-context.dto";
import { READING_CONTEXT_TTL_SECONDS, ReadingContext, readingContextKey } from "./reading-context.types";

/**
 * Ephemeral "what is this user looking at right now" state — deliberately
 * Redis, not Postgres (see docs/architecture.md §6/§13): this changes on
 * every debounced page turn, expires on its own after 30min of inactivity,
 * and has no value as permanent history. ReadingProgress (Phase 11,
 * Postgres) is the separate, durable "where did they leave off" record —
 * updated here, alongside the Redis write, since both fire on the exact
 * same trigger (a meaningful page change) and there's no reason to make
 * the frontend send two requests for one event.
 */
@Injectable()
export class ReadingContextService {
  constructor(
    private readonly redis: RedisService,
    private readonly readingProgressService: ReadingProgressService,
  ) {}

  async update(
    userId: string,
    documentId: string,
    pageCount: number | null,
    dto: UpdateReadingContextDto,
  ): Promise<ReadingContext> {
    const key = readingContextKey(userId, documentId);
    const existing = await this.get(userId, documentId);

    const context: ReadingContext = {
      documentId,
      currentPage: dto.currentPage,
      previousPage: existing?.currentPage ?? null,
      selectedText: dto.selectedText ?? null,
      updatedAt: new Date().toISOString(),
    };

    await Promise.all([
      this.redis.set(key, JSON.stringify(context), READING_CONTEXT_TTL_SECONDS),
      this.readingProgressService.upsert(userId, documentId, dto.currentPage, pageCount),
    ]);

    return context;
  }

  async get(userId: string, documentId: string): Promise<ReadingContext | null> {
    const raw = await this.redis.get(readingContextKey(userId, documentId));
    return raw ? (JSON.parse(raw) as ReadingContext) : null;
  }
}
