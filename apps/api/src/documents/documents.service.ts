import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { Document, DocumentChunk } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OBJECT_STORAGE, ObjectStorage } from "../storage/object-storage.interface";
import { INGESTION_QUEUE, IngestionJobData } from "../queue/queue.constants";
import { ListDocumentsQueryDto } from "./dto/list-documents.dto";

interface UploadedPdf {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @InjectQueue(INGESTION_QUEUE) private readonly ingestionQueue: Queue<IngestionJobData>,
  ) {}

  async upload(userId: string, file: UploadedPdf): Promise<Document> {
    const id = randomUUID();
    const storageKey = `documents/${userId}/${id}.pdf`;

    await this.storage.upload(storageKey, file.buffer, file.mimetype);

    // Status is PROCESSING as soon as the file is durably stored, matching
    // the API contract in docs/architecture.md (§5/§7); the queued job below
    // is what actually moves it forward (Phase 6: extraction+chunking →
    // EMBEDDING; Phase 7: embeddings → READY). No automatic retry (see
    // ingestion.processor.ts) — a permanently-corrupt PDF failing 3 times
    // wastes cycles for no benefit, and Postgres/storage being transiently
    // down is rare enough at this scale not to warrant the extra
    // complexity of classifying transient vs. permanent failures in V1.
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

    await this.ingestionQueue.add(
      "extract",
      { documentId: document.id },
      { attempts: 1, removeOnComplete: true, removeOnFail: 50 },
    );

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
