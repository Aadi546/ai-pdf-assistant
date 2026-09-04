import { Test } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { HealthController } from "./health.controller";

function fakeResponse() {
  return { status: jest.fn().mockReturnThis() } as unknown as import("express").Response;
}

describe("HealthController", () => {
  let controller: HealthController;
  let prisma: { $queryRaw: jest.Mock };
  let redis: { client: { ping: jest.Mock } };

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue([{ "?column?": 1 }]) };
    redis = { client: { ping: jest.fn().mockResolvedValue("PONG") } };

    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  it("reports ok status for liveness with no dependency checks", () => {
    expect(controller.check()).toMatchObject({ status: "ok" });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(redis.client.ping).not.toHaveBeenCalled();
  });

  it("reports ready when both dependencies respond", async () => {
    const res = fakeResponse();
    const body = await controller.ready(res);
    expect(body).toEqual({ status: "ok", dependencies: { postgres: "ok", redis: "ok" } });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("reports degraded with a 503 when a dependency is down", async () => {
    redis.client.ping.mockRejectedValue(new Error("connection refused"));

    const res = fakeResponse();
    const body = await controller.ready(res);
    expect(body).toEqual({ status: "degraded", dependencies: { postgres: "ok", redis: "down" } });
    expect(res.status).toHaveBeenCalledWith(503);
  });
});
