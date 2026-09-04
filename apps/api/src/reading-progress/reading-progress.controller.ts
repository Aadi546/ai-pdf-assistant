import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Document as PrismaDocument } from "@prisma/client";
import { CurrentUser, RequestUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentDocument } from "../documents/current-document.decorator";
import { DocumentOwnerGuard } from "../documents/document-owner.guard";
import { ReadingProgressService } from "./reading-progress.service";

@ApiTags("reading-progress")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, DocumentOwnerGuard)
@Controller("documents/:id/reading-progress")
export class ReadingProgressController {
  constructor(private readonly readingProgressService: ReadingProgressService) {}

  @Get()
  async get(@CurrentUser() user: RequestUser, @CurrentDocument() document: PrismaDocument) {
    const progress = await this.readingProgressService.get(user.userId, document.id);
    // Always an object (never a bare `null`) — Nest sends a `null` return
    // value as an empty response body, not the JSON literal `null`, which
    // breaks a naive `res.json()` on the client. Same fallback shape the
    // reading-context GET endpoint already uses for the same reason.
    return {
      currentPage: progress?.currentPage ?? null,
      progressPercent: progress?.progressPercent ?? null,
      lastReadAt: progress?.lastReadAt.toISOString() ?? null,
    };
  }
}
