import { Body, Controller, Delete, Get, HttpCode, HttpException, HttpStatus, Post, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { Document } from "@prisma/client";
import { CurrentUser, RequestUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentDocument } from "../documents/current-document.decorator";
import { DocumentOwnerGuard } from "../documents/document-owner.guard";
import { ChatService } from "./chat.service";
import { ChatMessageDto } from "./dto/chat-message.dto";

@ApiTags("chat")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, DocumentOwnerGuard)
@Controller("documents/:id")
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post("chat")
  async chat(
    @CurrentUser() user: RequestUser,
    @CurrentDocument() document: Document,
    @Body() dto: ChatMessageDto,
    @Res() res: Response,
  ): Promise<void> {
    // Preflight checks (no API key, document not ready) must come back as a
    // normal JSON error — using @Res() directly opts this route out of
    // Nest's automatic exception handling, so we do it by hand, and only
    // *before* committing to text/event-stream headers (the HTTP status
    // can't change once streaming starts).
    let apiKey: string;
    try {
      apiKey = (await this.chatService.assertCanChat(user.userId, document)).apiKey;
    } catch (err) {
      if (err instanceof HttpException) {
        res.status(err.getStatus()).json(err.getResponse());
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: "Something went wrong." });
      }
      return;
    }

    // Nest defaults POST routes to 201 even with a raw @Res() handler (only
    // the automatic reply is skipped, not this) — set it back explicitly.
    res.status(HttpStatus.OK);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
      for await (const event of this.chatService.chat(user.userId, document, apiKey, dto)) {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      res.write(`event: error\ndata: ${JSON.stringify({ type: "error", message })}\n\n`);
    } finally {
      res.end();
    }
  }

  @Get("conversation")
  async getConversation(@CurrentUser() user: RequestUser, @CurrentDocument() document: Document) {
    const messages = await this.chatService.getConversation(user.userId, document.id);
    return {
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        citedPages: m.citedPages,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  @Delete("conversation")
  @HttpCode(HttpStatus.NO_CONTENT)
  async clearConversation(@CurrentUser() user: RequestUser, @CurrentDocument() document: Document) {
    await this.chatService.clearConversation(user.userId, document.id);
  }
}
