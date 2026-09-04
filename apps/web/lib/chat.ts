import { ChatMessage, ChatStreamEvent } from "@ai-pdf/types";
import { apiFetch, apiJson } from "./api-client";

export function getConversation(documentId: string) {
  return apiJson<{ messages: ChatMessage[] }>(`/documents/${documentId}/conversation`);
}

export async function clearConversation(documentId: string): Promise<void> {
  const res = await apiFetch(`/documents/${documentId}/conversation`, { method: "DELETE" });
  if (!res.ok) throw new Error("Couldn't clear the conversation");
}

export interface ChatPayload {
  question: string;
  currentPage: number;
  selectedText?: string;
}

/**
 * Reads the backend's `text/event-stream` response by hand — a POST body
 * rules out the browser's native EventSource (GET-only), so this parses
 * the same `event: x\ndata: {...}\n\n` framing manually off a fetch
 * ReadableStream, same pattern most production streaming-chat UIs use.
 */
export async function streamChat(documentId: string, payload: ChatPayload, onEvent: (event: ChatStreamEvent) => void) {
  const res = await apiFetch(`/documents/${documentId}/chat`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message ?? "Chat request failed");
  }
  if (!res.body) throw new Error("This browser doesn't support streaming responses");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const dataLine = block.split("\n").find((line) => line.startsWith("data: "));
      if (dataLine) {
        try {
          onEvent(JSON.parse(dataLine.slice("data: ".length)) as ChatStreamEvent);
        } catch {
          // Malformed frame — skip rather than break the whole stream.
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
}
