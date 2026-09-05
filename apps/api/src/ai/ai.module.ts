import { Module } from "@nestjs/common";
import { EMBEDDER } from "../embeddings/embedder.interface";
import { QueueModule } from "../queue/queue.module";
import { AiConfigController } from "./ai-config.controller";
import { AiConfigService } from "./ai-config.service";
import { AiKeyService } from "./ai-key.service";
import { AI_PROVIDER } from "./ai-provider.interface";
import { GeminiProvider } from "./gemini-provider.service";

@Module({
  imports: [QueueModule],
  controllers: [AiConfigController],
  providers: [
    GeminiProvider,
    // Same singleton instance under both tokens — one Gemini client class
    // genuinely implements both contracts, see gemini-provider.service.ts.
    { provide: AI_PROVIDER, useExisting: GeminiProvider },
    { provide: EMBEDDER, useExisting: GeminiProvider },
    AiKeyService,
    AiConfigService,
  ],
  exports: [AI_PROVIDER, EMBEDDER, AiKeyService, AiConfigService],
})
export class AiModule {}
