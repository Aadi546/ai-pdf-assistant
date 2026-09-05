import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { QueueModule } from "../queue/queue.module";
import { RetrievalModule } from "../retrieval/retrieval.module";
import { StorageModule } from "../storage/storage.module";
import { DocumentOwnerGuard } from "./document-owner.guard";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";

@Module({
  imports: [StorageModule, QueueModule, RetrievalModule, AiModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentOwnerGuard],
})
export class DocumentsModule {}
