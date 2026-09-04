import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Liveness: "is the process up and answering HTTP requests" — no dependency checks, must stay fast and never 503. */
  @Get()
  check() {
    return { status: "ok", timestamp: new Date().toISOString() };
  }

  /**
   * Readiness: "can this instance actually serve real requests right now."
   * Separate from liveness deliberately — a orchestrator restarting the
   * process for a failed liveness check wouldn't fix a downed database,
   * but SHOULD stop routing traffic here via a failed readiness check
   * (the standard Kubernetes liveness/readiness split).
   */
  @Get("ready")
  async ready(@Res({ passthrough: true }) res: Response) {
    const [postgres, redis] = await Promise.all([this.checkPostgres(), this.checkRedis()]);
    const allHealthy = postgres && redis;

    res.status(allHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: allHealthy ? "ok" : "degraded",
      dependencies: { postgres: postgres ? "ok" : "down", redis: redis ? "ok" : "down" },
    };
  }

  private async checkPostgres(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      return (await this.redis.client.ping()) === "PONG";
    } catch {
      return false;
    }
  }
}
