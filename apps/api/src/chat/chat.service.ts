import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { ChatStreamEvent } from "@ai-pdf/types";
import { Document } from "@prisma/client";
import { AiKeyService } from "../ai/ai-key.service";
import { AI_PROVIDER, AIProvider } from "../ai/ai-provider.interface";
import { EMBEDDER, Embedder } from "../embeddings/embedder.interface";
import { PrismaService } from "../prisma/prisma.service";
import { IngestionScheduler } from "../queue/ingestion-scheduler.service";
import { VECTOR_STORE, VectorStore } from "../retrieval/vector-store.interface";
import { extractCitedPages } from "./citation-parser";
import { ChatMessageDto } from "./dto/chat-message.dto";
import { buildPrompt } from "./prompt-builder";

const RECENT_MESSAGE_LIMIT = 6;
const SEMANTIC_TOP_K = 5;
const CURRENT_PAGE_WINDOW = 1;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiKeyService: AiKeyService,
    private readonly scheduler: IngestionScheduler,
    @Inject(AI_PROVIDER) private readonly aiProvider: AIProvider,
    @Inject(EMBEDDER) private readonly embedder: Embedder,
    @Inject(VECTOR_STORE) private readonly vectorStore: VectorStore,
  ) {}

  /**
   * Preflight checks that should come back as an ordinary 400 JSON response,
   * not an SSE error event — the controller calls this before it commits to
   * `text/event-stream` response headers, since the HTTP status can't change
   * once that commitment is made.
   *
   * Embedding no longer happens here (see EmbeddingProcessor) — this only
   * enqueues defensively, in case the container was spun down when the key
   * was set or the extraction→embed handoff was otherwise missed. Dedup'd
   * by IngestionScheduler's deterministic jobId, so this can't pile up jobs.
   */
  async assertCanChat(userId: string, document: Document): Promise<{ apiKey: string }> {
    const apiKey = await this.aiKeyService.getKey(userId);
    if (!apiKey) {
      throw new BadRequestException("Add your Gemini API key in Settings before chatting.");
    }
    if (document.status === "FAILED") {
      throw new BadRequestException(`This document failed to process: ${document.failureReason}`);
    }
    if (document.status === "UPLOADING" || document.status === "PROCESSING") {
      throw new BadRequestException("This document is still processing — try again in a moment.");
    }
    if (document.status === "EMBEDDING") {
      await this.scheduler.enqueueEmbed(document.id);
      const { embedded, total } = await this.vectorStore.countEmbedded(document.id);
      const percent = total > 0 ? Math.round((embedded / total) * 100) : 0;
      throw new BadRequestException(
        total > 0
          ? `Still indexing this document (${percent}% done) — try again in a moment.`
          : "Still indexing this document — try again in a moment.",
      );
    }
    return { apiKey };
  }

  async *chat(userId: string, document: Document, apiKey: string, dto: ChatMessageDto): AsyncGenerator<ChatStreamEvent> {
    const conversation = await this.findOrCreateConversation(userId, document.id);

    const recentMessages = await this.prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: RECENT_MESSAGE_LIMIT,
    });
    recentMessages.reverse();

    const currentPageChunks = await this.prisma.documentChunk.findMany({
      where: {
        documentId: document.id,
        pageNumber: { gte: dto.currentPage - CURRENT_PAGE_WINDOW, lte: dto.currentPage + CURRENT_PAGE_WINDOW },
      },
      orderBy: [{ pageNumber: "asc" }, { chunkIndex: "asc" }],
    });

    const questionEmbedding = await this.embedder.embed(apiKey, dto.question);
    const semanticResults = await this.vectorStore.search(document.id, questionEmbedding, SEMANTIC_TOP_K);
    const currentPageChunkIds = new Set(currentPageChunks.map((c) => c.id));
    const semanticChunks = semanticResults.filter((r) => !currentPageChunkIds.has(r.chunkId));

    const { systemInstruction, prompt } = buildPrompt({
      documentTitle: document.title,
      currentPage: dto.currentPage,
      selectedText: dto.selectedText,
      currentPageChunks: currentPageChunks.map((c) => ({ pageNumber: c.pageNumber, text: c.text })),
      semanticChunks: semanticChunks.map((c) => ({ pageNumber: c.pageNumber, text: c.text })),
      recentMessages: recentMessages.map((m) => ({ role: m.role, content: m.content })),
      question: dto.question,
    });

    await this.prisma.message.create({
      data: { conversationId: conversation.id, role: "USER", content: dto.question },
    });

    let fullResponse = "";
    try {
      for await (const token of this.aiProvider.stream(apiKey, { prompt, systemInstruction })) {
        fullResponse += token;
        yield { type: "token", text: token };
      }
    } catch (err) {
      // The user's question is already saved even though the answer failed
      // — they shouldn't lose what they typed, and retrying just adds a new
      // assistant turn rather than re-asking.
      yield { type: "error", message: err instanceof Error ? err.message : "The AI provider request failed." };
      return;
    }

    const citedPages = extractCitedPages(fullResponse);
    await this.prisma.message.create({
      data: { conversationId: conversation.id, role: "ASSISTANT", content: fullResponse, citedPages },
    });

    yield { type: "done", citedPages };
  }

  async getConversation(userId: string, documentId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { userId_documentId: { userId, documentId } },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    return conversation?.messages ?? [];
  }

  async clearConversation(userId: string, documentId: string): Promise<void> {
    await this.prisma.conversation.deleteMany({ where: { userId, documentId } });
  }

  private findOrCreateConversation(userId: string, documentId: string) {
    return this.prisma.conversation.upsert({
      where: { userId_documentId: { userId, documentId } },
      create: { userId, documentId },
      update: {},
    });
  }
}
