import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ReadingProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(userId: string, documentId: string, currentPage: number, pageCount: number | null) {
    const progressPercent = pageCount ? Math.min(100, Math.round((currentPage / pageCount) * 100)) : null;

    return this.prisma.readingProgress.upsert({
      where: { userId_documentId: { userId, documentId } },
      create: { userId, documentId, currentPage, progressPercent },
      update: { currentPage, progressPercent },
    });
  }

  get(userId: string, documentId: string) {
    return this.prisma.readingProgress.findUnique({
      where: { userId_documentId: { userId, documentId } },
    });
  }
}
