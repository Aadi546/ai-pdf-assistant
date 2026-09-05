import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PrismaModule } from "../prisma/prisma.module";
import { EMBEDDING_QUEUE, INGESTION_QUEUE } from "./queue.constants";
import { IngestionScheduler } from "./ingestion-scheduler.service";

/**
 * Root BullMQ connection, registered once here and imported by any module
 * that produces or consumes a queue (DocumentsModule/AiModule/ChatModule
 * enqueue via IngestionScheduler; IngestionModule processes). Everything
 * runs in the single `apps/api` process for V1 — see docs/architecture.md
 * §8 stage 2 for when the worker becomes its own deployed process (a config
 * change at that point, not a rewrite, since each processor is already a
 * separate class from its producer).
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: parseRedisUrl(config.getOrThrow<string>("REDIS_URL")),
      }),
    }),
    BullModule.registerQueue({ name: INGESTION_QUEUE }, { name: EMBEDDING_QUEUE }),
    PrismaModule,
  ],
  providers: [IngestionScheduler],
  exports: [BullModule, IngestionScheduler],
})
export class QueueModule {}

function parseRedisUrl(redisUrl: string) {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    db: url.pathname && url.pathname !== "/" ? Number(url.pathname.slice(1)) : undefined,
  };
}
