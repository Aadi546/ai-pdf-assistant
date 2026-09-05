import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { EMBEDDING_QUEUE, EmbeddingJobData, INGESTION_QUEUE, IngestionJobData } from "./queue.constants";

/**
 * Every enqueue of an extract/embed job goes through here rather than
 * callers reaching for `@InjectQueue` directly — this is the one place
 * attempts/backoff/jobId policy lives, so every trigger (upload, a key
 * arriving, chat's defensive check, a manual retry) stays consistent.
 *
 * Lives in QueueModule, not IngestionModule, specifically to avoid a module
 * cycle: AiModule/ChatModule/DocumentsModule all need to enqueue, and
 * IngestionModule already depends on some of their neighbours — QueueModule
 * depends on nothing app-specific, so everyone can import it safely.
 */
@Injectable()
export class IngestionScheduler {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(INGESTION_QUEUE) private readonly ingestionQueue: Queue<IngestionJobData>,
    @InjectQueue(EMBEDDING_QUEUE) private readonly embeddingQueue: Queue<EmbeddingJobData>,
  ) {}

  enqueueExtract(documentId: string): Promise<unknown> {
    return this.ingestionQueue.add(
      "extract",
      { documentId },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: true,
        removeOnFail: { age: 86_400, count: 50 },
        jobId: `extract:${documentId}`,
      },
    );
  }

  /**
   * Deterministic jobId means the four trigger points (extraction finishing,
   * a key arriving, chat's defensive check, a manual retry) can all call
   * this without producing duplicate concurrent jobs — BullMQ dedupes on
   * jobId while a job with that id is waiting/active.
   */
  enqueueEmbed(documentId: string): Promise<unknown> {
    return this.embeddingQueue.add(
      "embed",
      { documentId },
      {
        attempts: 5,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: { age: 86_400, count: 50 },
        jobId: `embed:${documentId}`,
      },
    );
  }

  /** Called after a user's key validates — unblocks every document of theirs parked on EMBEDDING with no key. */
  async enqueueEmbedForUserDocuments(userId: string): Promise<void> {
    const documents = await this.prisma.document.findMany({
      where: { userId, status: "EMBEDDING" },
      select: { id: true },
    });
    await Promise.all(documents.map((d) => this.enqueueEmbed(d.id)));
  }
}
