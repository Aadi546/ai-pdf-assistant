import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { Document } from "@prisma/client";
import { CurrentUser, RequestUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentDocument } from "./current-document.decorator";
import { DocumentOwnerGuard } from "./document-owner.guard";
import { toDocumentSummary } from "./document.mapper";
import { ListDocumentsQueryDto } from "./dto/list-documents.dto";
import { documentUploadOptions } from "./multer.config";
import { DocumentsService } from "./documents.service";

@ApiTags("documents")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("documents")
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @UseInterceptors(FileInterceptor("file", documentUploadOptions))
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: { type: "object", properties: { file: { type: "string", format: "binary" } } } })
  async upload(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: RequestUser) {
    if (!file) {
      throw new BadRequestException("A PDF file is required");
    }
    const document = await this.documentsService.upload(user.userId, file);
    return toDocumentSummary(document);
  }

  @Get()
  async list(@CurrentUser() user: RequestUser, @Query() query: ListDocumentsQueryDto) {
    const documents = await this.documentsService.list(user.userId, query);
    return documents.map(toDocumentSummary);
  }

  @Get(":id")
  @UseGuards(DocumentOwnerGuard)
  get(@CurrentDocument() document: Document) {
    return toDocumentSummary(document);
  }

  @Get(":id/status")
  @UseGuards(DocumentOwnerGuard)
  status(@CurrentDocument() document: Document) {
    return this.documentsService.getStatus(document);
  }

  @Post(":id/retry")
  @UseGuards(DocumentOwnerGuard)
  async retry(@CurrentDocument() document: Document) {
    await this.documentsService.retry(document);
    return { status: "retrying" };
  }

  @Get(":id/chunks")
  @UseGuards(DocumentOwnerGuard)
  async chunks(@CurrentDocument() document: Document) {
    const chunks = await this.documentsService.listChunks(document.id);
    return chunks.map((c) => ({
      pageNumber: c.pageNumber,
      section: c.section,
      chunkIndex: c.chunkIndex,
      text: c.text,
    }));
  }

  @Get(":id/file")
  @UseGuards(DocumentOwnerGuard)
  async file(@CurrentDocument() document: Document) {
    // Longer than the default 5-minute signed URL: this endpoint feeds the
    // PDF reader directly, and pdf.js issues its own range requests against
    // the URL as the user pages through a document — a reading session
    // easily outlasts 5 minutes, so give it an hour instead.
    const url = await this.documentsService.getDownloadUrl(document, 3600);
    return { url };
  }

  @Delete(":id")
  @UseGuards(DocumentOwnerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentDocument() document: Document) {
    await this.documentsService.delete(document);
  }
}
