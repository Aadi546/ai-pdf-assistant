export type MessageRole = "USER" | "ASSISTANT";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  citedPages: number[];
  createdAt: string;
}

/** Discriminated union of the SSE event payloads POST /documents/:id/chat streams. */
export type ChatStreamEvent =
  | { type: "status"; message: string }
  | { type: "token"; text: string }
  | { type: "done"; citedPages: number[] }
  | { type: "error"; message: string };
