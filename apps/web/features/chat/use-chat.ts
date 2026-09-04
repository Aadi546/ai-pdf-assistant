"use client";

import { ChatMessage } from "@ai-pdf/types";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { clearConversation, getConversation, streamChat } from "@/lib/chat";
import { useReadingContextStore } from "@/stores/reading-context-store";
import { sanitizeForSpeech } from "./sanitize-for-speech";

// Split off a complete sentence (ending in . ! ? or a blank line) as soon as
// one appears, leaving any trailing partial sentence in the buffer for next
// time — this is what lets auto-read start speaking the first sentence
// almost immediately instead of waiting for the whole streamed answer.
const SENTENCE_BOUNDARY = /[^.!?\n]*[.!?]+(?:\s+|$)|[^.!?\n]+\n+/;

interface UseChatOptions {
  /** Called once per complete sentence as the assistant's answer streams in — used to drive auto-read. */
  onSentence?: (assistantMessageId: string, sentence: string) => void;
}

export function useChat(documentId: string, options: UseChatOptions = {}) {
  // Fetched once and then treated as the seed for local state — the
  // conversation this hook manages afterward becomes the single source of
  // truth for the rest of the session, so there's no risk of a message
  // appearing twice from a stale refetch racing a still-streaming answer.
  const { data: history, isLoading: isHistoryLoading } = useQuery({
    queryKey: ["conversation", documentId],
    queryFn: () => getConversation(documentId),
    staleTime: Infinity,
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onSentenceRef = useRef(options.onSentence);
  onSentenceRef.current = options.onSentence;

  const currentPage = useReadingContextStore((s) => s.currentPage);
  const selectedText = useReadingContextStore((s) => s.selectedText);
  const setSelectedText = useReadingContextStore((s) => s.setSelectedText);

  useEffect(() => {
    if (history && !seeded) {
      setMessages(history.messages);
      setSeeded(true);
    }
  }, [history, seeded]);

  async function ask(question: string) {
    if (!question.trim() || isStreaming) return;

    setError(null);
    setStatusMessage(null);
    setIsStreaming(true);

    const selectionForThisMessage = selectedText ?? undefined;
    setSelectedText(null); // consumed — don't let it silently attach to a later, unrelated question

    const userMessage: ChatMessage = {
      id: `local-user-${Date.now()}`,
      role: "USER",
      content: question,
      citedPages: [],
      createdAt: new Date().toISOString(),
    };
    const assistantMessageId = `local-assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantMessageId, role: "ASSISTANT", content: "", citedPages: [], createdAt: new Date().toISOString() },
    ]);

    const appendToAssistant = (text: string) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMessageId ? { ...m, content: m.content + text } : m)),
      );
    };
    const setAssistantCitations = (citedPages: number[]) => {
      setMessages((prev) => prev.map((m) => (m.id === assistantMessageId ? { ...m, citedPages } : m)));
    };
    // A request that fails before any tokens arrive (no key configured, a
    // network error, a mid-stream error event) would otherwise leave a
    // permanently-empty "…" bubble behind — drop it instead.
    const removeAssistantPlaceholderIfEmpty = () => {
      setMessages((prev) => prev.filter((m) => !(m.id === assistantMessageId && m.content === "")));
    };

    let sentenceBuffer = "";
    const flushSentences = (finalFlush: boolean) => {
      if (!onSentenceRef.current) return;
      for (;;) {
        const match = sentenceBuffer.match(SENTENCE_BOUNDARY);
        if (!match || match.index !== 0) break;
        const sentence = match[0];
        sentenceBuffer = sentenceBuffer.slice(sentence.length);
        const spoken = sanitizeForSpeech(sentence);
        if (spoken) onSentenceRef.current(assistantMessageId, spoken);
      }
      if (finalFlush && sentenceBuffer.trim()) {
        const spoken = sanitizeForSpeech(sentenceBuffer);
        if (spoken) onSentenceRef.current(assistantMessageId, spoken);
        sentenceBuffer = "";
      }
    };

    try {
      await streamChat(documentId, { question, currentPage, selectedText: selectionForThisMessage }, (event) => {
        if (event.type === "status") {
          setStatusMessage(event.message);
        } else if (event.type === "token") {
          setStatusMessage(null);
          appendToAssistant(event.text);
          sentenceBuffer += event.text;
          flushSentences(false);
        } else if (event.type === "done") {
          setAssistantCitations(event.citedPages);
          flushSentences(true);
        } else if (event.type === "error") {
          setError(event.message);
          removeAssistantPlaceholderIfEmpty();
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      removeAssistantPlaceholderIfEmpty();
    } finally {
      setIsStreaming(false);
      setStatusMessage(null);
    }
  }

  async function clear() {
    await clearConversation(documentId);
    setMessages([]);
  }

  return { messages, ask, clear, isStreaming, statusMessage, error, isHistoryLoading };
}
