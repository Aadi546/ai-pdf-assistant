import { Inject, Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job, UnrecoverableError } from "bullmq";
import { chunkPageText } from "@ai-pdf/shared";
import { PrismaService } from "../prisma/prisma.service";
import { OBJECT_STORAGE, ObjectStorage } from "../storage/object-storage.interface";
import { IngestionScheduler } from "../queue/ingestion-scheduler.service";
import { INGESTION_QUEUE, IngestionJobData } from "../queue/queue.constants";
import { PdfExtractionService } from "./pdf-extraction.service";

/**
 * Runs in the same `apps/api` process for V1 (see queue.module.ts) — this
 * class is what becomes its own deployed worker process at Stage 2 of the
 * scaling plan, unchanged.
 */
@Processor(INGESTION_QUEUE, { concurrency: 1 })
export class IngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly extraction: PdfExtractionService,
    private readonly scheduler: IngestionScheduler,
  ) {
    super();
  }

  async process(job: Job<IngestionJobData>): Promise<void> {
    const { documentId } = job.data;
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document) {
      // Deleted between upload and processing — nothing to do.
      this.logger.warn(`Document ${documentId} no longer exists, skipping`);
      return;
    }

    // Download and extraction are handled separately: a storage/network
    // blip downloading the PDF is worth retrying (attempts: 3, see
    // IngestionScheduler.enqueueExtract), but a PDF that fails to parse
    // will fail identically every time — UnrecoverableError stops BullMQ
    // from burning retries on it.
    let buffer;
    try {
      buffer = await this.storage.download(document.storageKey);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown storage error";
      const isFinalAttempt = job.attemptsMade >= (job.opts.attempts ?? 1) - 1;
      if (isFinalAttempt) {
        this.logger.error(`Download failed for document ${documentId} on final attempt: ${message}`);
        await this.prisma.document.updateMany({
          where: { id: documentId },
          data: { status: "FAILED", failureReason: message.slice(0, 500) },
        });
      }
      throw err;
    }

    let pages;
    try {
      pages = await this.extraction.extractPages(buffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown extraction error";
      this.logger.error(`Extraction failed for document ${documentId}: ${message}`);
      await this.prisma.document.updateMany({
        where: { id: documentId },
        data: { status: "FAILED", failureReason: message.slice(0, 500) },
      });
      throw new UnrecoverableError(message);
    }

    const chunkRows = pages.flatMap((page) =>
      chunkPageText(page.text).map((chunk) => ({
        documentId,
        pageNumber: page.pageNumber,
        section: page.section,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
      })),
    );

    // Idempotent: replaces this document's chunks rather than appending, so
    // re-running extraction never duplicates rows. Note this discards any
    // embeddings already computed for the old chunk rows (their ids are
    // regenerated) — safe here because extraction retries only happen
    // before embedding has ever started (a download/parse failure), never
    // as the retry path for an embedding failure. That's EmbeddingProcessor's
    // job, which resumes from where it left off instead of starting over.
    await this.prisma.$transaction([
      this.prisma.documentChunk.deleteMany({ where: { documentId } }),
      this.prisma.documentChunk.createMany({ data: chunkRows }),
      this.prisma.document.update({
        where: { id: documentId },
        // EMBEDDING now means "chunked, embedding in flight or awaiting a
        // Gemini key" — EmbeddingProcessor (enqueued below) is what
        // actually generates embeddings and flips this to READY.
        data: { pageCount: pages.length, status: "EMBEDDING", failureReason: null },
      }),
    ]);

    this.logger.log(`Ingested document ${documentId}: ${pages.length} pages, ${chunkRows.length} chunks`);
    await this.scheduler.enqueueEmbed(documentId);
  }
}
