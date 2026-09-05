import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { EMBEDDER, Embedder } from "../embeddings/embedder.interface";
import { IngestionScheduler } from "../queue/ingestion-scheduler.service";
import { AiKeyService } from "./ai-key.service";

@Injectable()
export class AiConfigService {
  private readonly logger = new Logger(AiConfigService.name);

  constructor(
    private readonly aiKeyService: AiKeyService,
    private readonly scheduler: IngestionScheduler,
    @Inject(EMBEDDER) private readonly embedder: Embedder,
  ) {}

  /**
   * Validates the key against the real Gemini API before storing it — a
   * key that's malformed or revoked should fail loudly here, not silently
   * on the user's first chat message. Uses the cheapest possible real call
   * (a one-word embed) rather than a generation call.
   */
  async setKey(userId: string, apiKey: string): Promise<void> {
    try {
      await this.embedder.embed(apiKey, "test");
    } catch {
      // Never surface the SDK's raw error — it can include request
      // metadata, and users don't need it to fix a bad key.
      throw new BadRequestException(
        "That doesn't look like a valid Gemini API key. Get one from https://aistudio.google.com/apikey and try again.",
      );
    }

    await this.aiKeyService.setKey(userId, apiKey);

    // Unblocks any of this user's documents parked at EMBEDDING with no key
    // (see EmbeddingProcessor). Log-and-continue on failure: a scheduling
    // hiccup here must not turn "your key was saved" into a 500 — the
    // chat-preflight enqueue in ChatService is the fallback trigger.
    try {
      await this.scheduler.enqueueEmbedForUserDocuments(userId);
    } catch (err) {
      this.logger.error(
        `Failed to re-enqueue embedding for user ${userId} after key save: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  hasKey(userId: string): Promise<boolean> {
    return this.aiKeyService.hasKey(userId);
  }

  clearKey(userId: string): Promise<void> {
    return this.aiKeyService.clearKey(userId);
  }
}
