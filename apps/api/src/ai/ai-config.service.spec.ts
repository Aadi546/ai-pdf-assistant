import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { EMBEDDER, Embedder } from "../embeddings/embedder.interface";
import { IngestionScheduler } from "../queue/ingestion-scheduler.service";
import { AiConfigService } from "./ai-config.service";
import { AiKeyService } from "./ai-key.service";

describe("AiConfigService", () => {
  let service: AiConfigService;
  let aiKeyService: jest.Mocked<AiKeyService>;
  let embedder: jest.Mocked<Embedder>;
  let scheduler: jest.Mocked<IngestionScheduler>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AiConfigService,
        {
          provide: AiKeyService,
          useValue: { setKey: jest.fn(), hasKey: jest.fn(), clearKey: jest.fn(), getKey: jest.fn() },
        },
        { provide: EMBEDDER, useValue: { embed: jest.fn(), embedBatch: jest.fn(), dimensions: 768 } },
        {
          provide: IngestionScheduler,
          useValue: { enqueueExtract: jest.fn(), enqueueEmbed: jest.fn(), enqueueEmbedForUserDocuments: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(AiConfigService);
    aiKeyService = module.get(AiKeyService);
    embedder = module.get(EMBEDDER);
    scheduler = module.get(IngestionScheduler);
  });

  it("validates the key against the real embedder before storing it, then unblocks any parked documents", async () => {
    embedder.embed.mockResolvedValue([0.1, 0.2]);

    await service.setKey("user-1", "good-key");

    expect(embedder.embed).toHaveBeenCalledWith("good-key", "test");
    expect(aiKeyService.setKey).toHaveBeenCalledWith("user-1", "good-key");
    expect(scheduler.enqueueEmbedForUserDocuments).toHaveBeenCalledWith("user-1");
  });

  it("rejects with a clean error and never stores a key that fails validation", async () => {
    embedder.embed.mockRejectedValue(new Error("API key not valid. Please pass a valid API key."));

    await expect(service.setKey("user-1", "bad-key")).rejects.toThrow(BadRequestException);
    expect(aiKeyService.setKey).not.toHaveBeenCalled();
    expect(scheduler.enqueueEmbedForUserDocuments).not.toHaveBeenCalled();
  });

  it("still saves the key even if re-enqueuing parked documents fails", async () => {
    embedder.embed.mockResolvedValue([0.1, 0.2]);
    scheduler.enqueueEmbedForUserDocuments.mockRejectedValue(new Error("redis blip"));

    await expect(service.setKey("user-1", "good-key")).resolves.toBeUndefined();
    expect(aiKeyService.setKey).toHaveBeenCalledWith("user-1", "good-key");
  });

  it("delegates hasKey/clearKey to AiKeyService", async () => {
    aiKeyService.hasKey.mockResolvedValue(true);
    await expect(service.hasKey("user-1")).resolves.toBe(true);

    await service.clearKey("user-1");
    expect(aiKeyService.clearKey).toHaveBeenCalledWith("user-1");
  });
});
