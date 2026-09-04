import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { EMBEDDER, Embedder } from "../embeddings/embedder.interface";
import { AiKeyService } from "./ai-key.service";

@Injectable()
export class AiConfigService {
  constructor(
    private readonly aiKeyService: AiKeyService,
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
  }

  hasKey(userId: string): Promise<boolean> {
    return this.aiKeyService.hasKey(userId);
  }

  clearKey(userId: string): Promise<void> {
    return this.aiKeyService.clearKey(userId);
  }
}
