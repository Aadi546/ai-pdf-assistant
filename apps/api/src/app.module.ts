import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AiModule } from "./ai/ai.module";
import { AuthModule } from "./auth/auth.module";
import { ChatModule } from "./chat/chat.module";
import { DocumentsModule } from "./documents/documents.module";
import { HealthModule } from "./health/health.module";
import { IngestionModule } from "./ingestion/ingestion.module";
import { PrismaModule } from "./prisma/prisma.module";
import { QueueModule } from "./queue/queue.module";
import { ReadingContextModule } from "./reading-context/reading-context.module";
import { ReadingProgressModule } from "./reading-progress/reading-progress.module";
import { RedisModule } from "./redis/redis.module";
import { RetrievalModule } from "./retrieval/retrieval.module";
import { UsersModule } from "./users/users.module";
import { validateEnv } from "./common/config/env.validation";
import { RequestIdMiddleware } from "./common/middleware/request-id.middleware";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    RedisModule,
    QueueModule,
    HealthModule,
    UsersModule,
    AuthModule,
    DocumentsModule,
    ReadingProgressModule,
    ReadingContextModule,
    RetrievalModule,
    AiModule,
    ChatModule,
    IngestionModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Middleware runs before guards/interceptors — see the class's own
    // comment for why the request ID needs to exist that early.
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
