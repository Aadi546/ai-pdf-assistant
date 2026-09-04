import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequestUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentDocument } from "../documents/current-document.decorator";
import { DocumentOwnerGuard } from "../documents/document-owner.guard";
import { Document as PrismaDocument } from "@prisma/client";
import { UpdateReadingContextDto } from "./dto/update-reading-context.dto";
import { ReadingContextService } from "./reading-context.service";

@ApiTags("reading-context")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, DocumentOwnerGuard)
@Controller("documents/:id/reading-context")
export class ReadingContextController {
  constructor(private readonly readingContextService: ReadingContextService) {}

  @Post()
  update(
    @CurrentUser() user: RequestUser,
    @CurrentDocument() document: PrismaDocument,
    @Body() dto: UpdateReadingContextDto,
  ) {
    return this.readingContextService.update(user.userId, document.id, document.pageCount, dto);
  }

  @Get()
  async get(@CurrentUser() user: RequestUser, @CurrentDocument() document: PrismaDocument) {
    return (await this.readingContextService.get(user.userId, document.id)) ?? { documentId: document.id };
  }
}
