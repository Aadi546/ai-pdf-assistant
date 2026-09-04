import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { DocumentOwnerGuard } from "../documents/document-owner.guard";
import { RetrievalModule } from "../retrieval/retrieval.module";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";

@Module({
  imports: [AiModule, RetrievalModule],
  controllers: [ChatController],
  providers: [ChatService, DocumentOwnerGuard],
})
export class ChatModule {}
