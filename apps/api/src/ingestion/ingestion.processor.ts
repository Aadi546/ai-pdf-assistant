import { Inject, Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { chunkPageText } from "@ai-pdf/shared";
import { PrismaService } from "../prisma/prisma.service";
import { OBJECT_STORAGE, ObjectStorage } from "../storage/object-storage.interface";
import { INGESTION_QUEUE, IngestionJobData } from "../queue/queue.constants";
import { PdfExtractionService } from "./pdf-extraction.service";

/**
 * Runs in the same `apps/api` process for V1 (see queue.module.ts) — this
 * class is what becomes its own deployed worker process at Stage 2 of the
 * scaling plan, unchanged.
 */
@Processor(INGESTION_QUEUE)
export class IngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly extraction: PdfExtractionService,
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

    try {
      const buffer = await this.storage.download(document.storageKey);
      const pages = await this.extraction.extractPages(buffer);

      const chunkRows = pages.flatMap((page) =>
        chunkPageText(page.text).map((chunk) => ({
          documentId,
          pageNumber: page.pageNumber,
          section: page.section,
          chunkIndex: chunk.chunkIndex,
          text: chunk.text,
        })),
      );

      // Idempotent: replaces this document's chunks rather than appending,
      // so re-running the job (a manual retry, a future reprocess feature)
      // can never duplicate rows.
      await this.prisma.$transaction([
        this.prisma.documentChunk.deleteMany({ where: { documentId } }),
        this.prisma.documentChunk.createMany({ data: chunkRows }),
        this.prisma.document.update({
          where: { id: documentId },
          // EMBEDDING, not READY: chunking is done, but nothing generates
          // embeddings yet — that's Phase 7. Same pattern as PROCESSING
          // sitting unresolved between Phase 3 and this one.
          data: { pageCount: pages.length, status: "EMBEDDING", failureReason: null },
        }),
      ]);

      this.logger.log(`Ingested document ${documentId}: ${pages.length} pages, ${chunkRows.length} chunks`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown extraction error";
      this.logger.error(`Ingestion failed for document ${documentId}: ${message}`);
      // updateMany, not update: the document may have been deleted while
      // this job was running (a real race, not just theoretical — e.g. the
      // user deletes the doc mid-processing). update() would throw "record
      // not found" and mask the real error above; updateMany() just quietly
      // matches zero rows.
      await this.prisma.document.updateMany({
        where: { id: documentId },
        data: { status: "FAILED", failureReason: message.slice(0, 500) },
      });
    }
  }
}
