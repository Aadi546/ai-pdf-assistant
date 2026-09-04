import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { EMBEDDER, Embedder } from "../embeddings/embedder.interface";
import { AiConfigService } from "./ai-config.service";
import { AiKeyService } from "./ai-key.service";

describe("AiConfigService", () => {
  let service: AiConfigService;
  let aiKeyService: jest.Mocked<AiKeyService>;
  let embedder: jest.Mocked<Embedder>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AiConfigService,
        {
          provide: AiKeyService,
          useValue: { setKey: jest.fn(), hasKey: jest.fn(), clearKey: jest.fn(), getKey: jest.fn() },
        },
        { provide: EMBEDDER, useValue: { embed: jest.fn(), embedBatch: jest.fn(), dimensions: 768 } },
      ],
    }).compile();

    service = module.get(AiConfigService);
    aiKeyService = module.get(AiKeyService);
    embedder = module.get(EMBEDDER);
  });

  it("validates the key against the real embedder before storing it", async () => {
    embedder.embed.mockResolvedValue([0.1, 0.2]);

    await service.setKey("user-1", "good-key");

    expect(embedder.embed).toHaveBeenCalledWith("good-key", "test");
    expect(aiKeyService.setKey).toHaveBeenCalledWith("user-1", "good-key");
  });

  it("rejects with a clean error and never stores a key that fails validation", async () => {
    embedder.embed.mockRejectedValue(new Error("API key not valid. Please pass a valid API key."));

    await expect(service.setKey("user-1", "bad-key")).rejects.toThrow(BadRequestException);
    expect(aiKeyService.setKey).not.toHaveBeenCalled();
  });

  it("delegates hasKey/clearKey to AiKeyService", async () => {
    aiKeyService.hasKey.mockResolvedValue(true);
    await expect(service.hasKey("user-1")).resolves.toBe(true);

    await service.clearKey("user-1");
    expect(aiKeyService.clearKey).toHaveBeenCalledWith("user-1");
  });
});
