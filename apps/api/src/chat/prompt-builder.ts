export interface PromptChunk {
  pageNumber: number;
  text: string;
}

export interface PromptMessage {
  role: "USER" | "ASSISTANT";
  content: string;
}

export interface BuildPromptParams {
  documentTitle: string;
  currentPage: number;
  selectedText?: string;
  /** Chunks from the current page (± 1) — always included, per docs/architecture.md §50 priority order. */
  currentPageChunks: PromptChunk[];
  /** Top-K semantic matches, already deduped against currentPageChunks by the caller. */
  semanticChunks: PromptChunk[];
  recentMessages: PromptMessage[];
  question: string;
}

const SYSTEM_INSTRUCTION = `You are an AI study partner reading a PDF alongside a student — not a generic chatbot. You are aware of exactly what page they're on and what the document says there.

Rules:
- Answer ONLY from the DOCUMENT CONTEXT below. Do not use outside/general knowledge, even if you know the answer.
- If the document doesn't cover what's being asked, say plainly that the document doesn't cover it — do NOT answer from general knowledge instead. Stay on topic to this document.
- Cite a page with a "[Page N]" marker whenever a fact comes from the document, using ONLY page numbers that actually appear in the DOCUMENT CONTEXT below. Never invent a citation.
- Explain concepts in your own words — don't just copy sentences out of the document.
- If you're genuinely unsure, say so rather than guessing confidently.`;

/**
 * Single place prompts get assembled (per docs/architecture.md §49 — no ad
 * hoc string-building scattered through the codebase). Pure function: easy
 * to unit test without a database or a real AI provider.
 */
export function buildPrompt(params: BuildPromptParams): { systemInstruction: string; prompt: string } {
  const sections: string[] = [];

  if (params.selectedText) {
    sections.push(
      `SELECTED TEXT (the user highlighted this — it's the most important context for their question):\n"${params.selectedText}"`,
    );
  }

  sections.push(`The user is currently viewing page ${params.currentPage} of "${params.documentTitle}".`);

  const contextChunks = [...params.currentPageChunks, ...params.semanticChunks];
  if (contextChunks.length > 0) {
    const contextText = contextChunks.map((c) => `[Page ${c.pageNumber}] ${c.text}`).join("\n\n");
    sections.push(`DOCUMENT CONTEXT:\n${contextText}`);
  }

  if (params.recentMessages.length > 0) {
    const history = params.recentMessages
      .map((m) => `${m.role === "USER" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");
    sections.push(`RECENT CONVERSATION:\n${history}`);
  }

  sections.push(`QUESTION: ${params.question}`);

  return { systemInstruction: SYSTEM_INSTRUCTION, prompt: sections.join("\n\n") };
}
