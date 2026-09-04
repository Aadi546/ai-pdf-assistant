import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { INGESTION_QUEUE } from "../queue/queue.constants";
import { StorageModule } from "../storage/storage.module";
import { DocumentOwnerGuard } from "./document-owner.guard";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";

@Module({
  imports: [StorageModule, BullModule.registerQueue({ name: INGESTION_QUEUE })],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentOwnerGuard],
})
export class DocumentsModule {}
