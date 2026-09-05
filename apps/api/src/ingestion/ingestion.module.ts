import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { RetrievalModule } from "../retrieval/retrieval.module";
import { StorageModule } from "../storage/storage.module";
import { QueueModule } from "../queue/queue.module";
import { EMBEDDING_QUEUE, INGESTION_QUEUE } from "../queue/queue.constants";
import { EmbeddingProcessor } from "./embedding.processor";
import { IngestionProcessor } from "./ingestion.processor";
import { PdfExtractionService } from "./pdf-extraction.service";

@Module({
  imports: [
    BullModule.registerQueue({ name: INGESTION_QUEUE }, { name: EMBEDDING_QUEUE }),
    StorageModule,
    AiModule,
    RetrievalModule,
    QueueModule,
  ],
  providers: [IngestionProcessor, EmbeddingProcessor, PdfExtractionService],
})
export class IngestionModule {}
