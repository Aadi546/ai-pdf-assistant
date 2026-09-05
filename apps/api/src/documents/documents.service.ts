import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { Document, DocumentChunk } from "@prisma/client";
import { AiConfigService } from "../ai/ai-config.service";
import { PrismaService } from "../prisma/prisma.service";
import { OBJECT_STORAGE, ObjectStorage } from "../storage/object-storage.interface";
import { IngestionScheduler } from "../queue/ingestion-scheduler.service";
import { EmbeddingProgress, VECTOR_STORE, VectorStore } from "../retrieval/vector-store.interface";
import { ListDocumentsQueryDto } from "./dto/list-documents.dto";

interface UploadedPdf {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface DocumentStatusInfo {
  status: Document["status"];
  failureReason: string | null;
  progress: EmbeddingProgress;
  needsApiKey: boolean;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(VECTOR_STORE) private readonly vectorStore: VectorStore,
    private readonly scheduler: IngestionScheduler,
    private readonly aiConfigService: AiConfigService,
  ) {}

  async upload(userId: string, file: UploadedPdf): Promise<Document> {
    const id = randomUUID();
    const storageKey = `documents/${userId}/${id}.pdf`;

    await this.storage.upload(storageKey, file.buffer, file.mimetype);

    // Status is PROCESSING as soon as the file is durably stored, matching
    // the API contract in docs/architecture.md (§5/§7); the queued job below
    // is what actually moves it forward (extraction+chunking → EMBEDDING;
    // EmbeddingProcessor → READY). Extraction gets retries now (see
    // IngestionScheduler.enqueueExtract) — a transient storage/network blip
    // no longer permanently bricks an upload — but a genuinely corrupt PDF
    // still fails immediately via UnrecoverableError in IngestionProcessor.
    const document = await this.prisma.document.create({
      data: {
        id,
        userId,
        title: stripExtension(file.originalname),
        originalFilename: file.originalname,
        storageKey,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        status: "PROCESSING",
      },
    });

    await this.scheduler.enqueueExtract(document.id);

    return document;
  }

  async list(userId: string, query: ListDocumentsQueryDto): Promise<Document[]> {
    return this.prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: query.take,
      ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
    });
  }

  /**
   * Progress/needsApiKey are derived live from the vector store and Redis
   * rather than stored columns — they can't drift, and a key can arrive at
   * any instant so a stored "waiting for key" state would be wrong the
   * moment it was written. Only queried for documents that have chunks to
   * count at all (EMBEDDING/READY/FAILED-after-chunking); UPLOADING/
   * PROCESSING always have zero.
   */
  async getStatus(document: Document): Promise<DocumentStatusInfo> {
    const needsCount = document.status === "EMBEDDING" || document.status === "READY";
    const progress = needsCount ? await this.vectorStore.countEmbedded(document.id) : { embedded: 0, total: 0 };
    const needsApiKey =
      document.status === "EMBEDDING" ? !(await this.aiConfigService.hasKey(document.userId)) : false;

    return { status: document.status, failureReason: document.failureReason, progress, needsApiKey };
  }

  /**
   * Re-enqueues whichever stage actually failed — never re-runs extraction
   * for an embedding failure, since that would discard every embedding
   * already computed (DocumentChunk ids are regenerated on re-extraction).
   * A document with chunks failed during embedding; one without failed
   * during extraction.
   */
  async retry(document: Document): Promise<void> {
    if (document.status !== "FAILED") {
      throw new BadRequestException("Only a failed document can be retried.");
    }

    const chunkCount = await this.prisma.documentChunk.count({ where: { documentId: document.id } });
    if (chunkCount > 0) {
      await this.prisma.document.update({
        where: { id: document.id },
        data: { status: "EMBEDDING", failureReason: null },
      });
      await this.scheduler.enqueueEmbed(document.id);
    } else {
      await this.prisma.document.update({
        where: { id: document.id },
        data: { status: "PROCESSING", failureReason: null },
      });
      await this.scheduler.enqueueExtract(document.id);
    }
  }

  getDownloadUrl(document: Document, expiresInSeconds?: number): Promise<string> {
    return this.storage.getSignedDownloadUrl(document.storageKey, expiresInSeconds);
  }

  listChunks(documentId: string): Promise<DocumentChunk[]> {
    return this.prisma.documentChunk.findMany({
      where: { documentId },
      orderBy: [{ pageNumber: "asc" }, { chunkIndex: "asc" }],
    });
  }

  async delete(document: Document): Promise<void> {
    await this.storage.delete(document.storageKey);
    await this.prisma.document.delete({ where: { id: document.id } });
  }
}

function stripExtension(filename: string): string {
  return filename.replace(/\.pdf$/i, "");
}
