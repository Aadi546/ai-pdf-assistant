"use client";

import { ChatMessage } from "@ai-pdf/types";
import { sanitizeForSpeech } from "./sanitize-for-speech";

const CITATION_PATTERN = /(\[Page \d+\])/g;

interface MessageBubbleProps {
  message: ChatMessage;
  onJumpToPage: (page: number) => void;
  onSpeak: (id: string, text: string) => void;
  speakingId: string | null;
}

export function MessageBubble({ message, onJumpToPage, onSpeak, speakingId }: MessageBubbleProps) {
  const isUser = message.role === "USER";
  const parts = message.content.split(CITATION_PATTERN);
  const isSpeaking = speakingId === message.id;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`flex max-w-[85%] items-end gap-1.5 ${isUser ? "flex-row-reverse" : ""}`}>
        <div
          className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
            isUser
              ? "rounded-br-sm bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
              : "rounded-bl-sm bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
          }`}
        >
          {message.content === "" ? (
            <span className="text-neutral-400">…</span>
          ) : (
            parts.map((part, i) => {
              const match = part.match(/^\[Page (\d+)\]$/);
              if (!match) return <span key={i}>{part}</span>;
              const page = Number(match[1]);
              return (
                <button
                  key={i}
                  onClick={() => onJumpToPage(page)}
                  className="mx-0.5 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 hover:underline dark:bg-blue-900 dark:text-blue-300"
                >
                  Page {page}
                </button>
              );
            })
          )}
        </div>
        {!isUser && message.content !== "" && (
          <button
            onClick={() => onSpeak(message.id, sanitizeForSpeech(message.content))}
            title={isSpeaking ? "Stop reading aloud" : "Read aloud"}
            className={`shrink-0 rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 ${
              isSpeaking ? "text-blue-600 dark:text-blue-400" : ""
            }`}
          >
            {isSpeaking ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <rect x="5" y="5" width="10" height="10" rx="1.5" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <path d="M9 3.5 5 7H2v6h3l4 3.5v-13Z" fill="currentColor" stroke="none" />
                <path d="M13.5 6a5 5 0 0 1 0 8" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
