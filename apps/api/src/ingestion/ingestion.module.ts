import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { INGESTION_QUEUE } from "../queue/queue.constants";
import { IngestionProcessor } from "./ingestion.processor";
import { PdfExtractionService } from "./pdf-extraction.service";

@Module({
  imports: [BullModule.registerQueue({ name: INGESTION_QUEUE }), StorageModule],
  providers: [IngestionProcessor, PdfExtractionService],
})
export class IngestionModule {}
