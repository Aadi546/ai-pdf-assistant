import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * Thin wrapper around PrismaClient so it participates in Nest's DI/lifecycle
 * (connects on module init, disconnects cleanly on shutdown) instead of every
 * module constructing its own client.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log("Connected to Postgres");
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
