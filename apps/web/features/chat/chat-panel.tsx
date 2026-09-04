"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getAiConfigStatus } from "@/lib/ai-config";
import { useReadingContextStore } from "@/stores/reading-context-store";
import { MessageBubble } from "./message-bubble";
import { useChat } from "./use-chat";
import { useSpeak } from "./use-speak";
import { useVoiceInput } from "./use-voice-input";

export function ChatPanel({ documentId, onJumpToPage }: { documentId: string; onJumpToPage: (page: number) => void }) {
  // On by default per explicit request — a voice assistant should just
  // talk back without a manual step every time. Remembered per-browser so
  // toggling it off sticks across reloads.
  const [autoRead, setAutoRead] = useState(true);
  useEffect(() => {
    const saved = localStorage.getItem("ai-pdf:auto-read");
    if (saved !== null) setAutoRead(saved === "true");
  }, []);
  useEffect(() => {
    localStorage.setItem("ai-pdf:auto-read", String(autoRead));
  }, [autoRead]);

  const { speak, enqueueForMessage, stop: stopSpeaking, speakingId, voices, selectedVoiceURI, setVoice } = useSpeak();

  const { messages, ask, clear, isStreaming, statusMessage, error, isHistoryLoading } = useChat(documentId, {
    // Speaks each sentence the instant it finishes streaming, not after the
    // whole answer — that's what makes this feel responsive instead of
    // laggy (previously: silence until the entire response finished, then
    // one long utterance).
    onSentence: autoRead ? enqueueForMessage : undefined,
  });
  const { data: aiConfig } = useQuery({ queryKey: ["ai-config-status"], queryFn: getAiConfigStatus });
  const selectedText = useReadingContextStore((s) => s.selectedText);
  const setSelectedText = useReadingContextStore((s) => s.setSelectedText);

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Speaking a question sends it the moment you stop talking — no separate
  // "review, then hit send" step, matching how a voice assistant is
  // expected to feel. Typing still goes through the normal input+Send flow.
  const { isListening, isSupported: isVoiceSupported, interimText, start: startListening, stop: stopListening } =
    useVoiceInput((finalText) => ask(finalText));

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, statusMessage]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const question = input.trim();
    if (!question) return;
    setInput("");
    ask(question);
  };

  return (
    <div className="flex h-full flex-col border-l border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <h2 className="text-sm font-semibold tracking-tight">AI Study Partner</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (autoRead) stopSpeaking();
              setAutoRead((v) => !v);
            }}
            title={autoRead ? "Auto-read replies: on" : "Auto-read replies: off"}
            className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors ${
              autoRead
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                : "text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M9 3.5 5 7H2v6h3l4 3.5v-13Z" />
              <path d="M13.5 6a5 5 0 0 1 0 8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
            Auto-read
          </button>
          {voices.length > 0 && (
            <select
              value={selectedVoiceURI ?? ""}
              onChange={(e) => setVoice(e.target.value)}
              title="Voice"
              className="max-w-[110px] rounded-full border border-neutral-200 bg-transparent px-2 py-1 text-xs text-neutral-500 dark:border-neutral-700"
            >
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
          <button onClick={clear} className="text-xs text-neutral-500 hover:text-neutral-700 hover:underline dark:hover:text-neutral-300">
            New conversation
          </button>
        </div>
      </div>

      {aiConfig && !aiConfig.configured && (
        <div className="border-b border-yellow-200 bg-yellow-50 px-4 py-2 text-xs text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
          Add your Gemini API key in{" "}
          <Link href="/settings" className="underline">
            Settings
          </Link>{" "}
          to start chatting.
        </div>
      )}

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {isHistoryLoading ? (
          <p className="text-sm text-neutral-500">Loading conversation…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Ask about what you&apos;re reading — I can see your current page and anything you highlight. Try the
            mic to just talk.
          </p>
        ) : (
          messages.map((m) => (
            <MessageBubble key={m.id} message={m} onJumpToPage={onJumpToPage} onSpeak={speak} speakingId={speakingId} />
          ))
        )}
        {statusMessage && <p className="text-xs italic text-neutral-500">{statusMessage}</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      {selectedText && (
        <div className="flex items-start justify-between gap-2 border-t border-neutral-200 bg-neutral-50 px-4 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-900">
          <p className="line-clamp-2 text-neutral-600 dark:text-neutral-400">
            Asking about: &ldquo;{selectedText}&rdquo;
          </p>
          <button onClick={() => setSelectedText(null)} className="shrink-0 text-neutral-400 hover:text-neutral-600">
            ✕
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-neutral-200 p-3 dark:border-neutral-800">
        {isVoiceSupported && (
          <button
            type="button"
            onClick={() => (isListening ? stopListening() : startListening())}
            title={isListening ? "Stop listening" : "Ask by voice"}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
              isListening
                ? "animate-pulse bg-red-500 text-white"
                : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300 dark:hover:bg-indigo-900"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M10 12.5a3 3 0 0 0 3-3v-4a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3Z" />
              <path d="M5.5 9a.75.75 0 0 0-1.5 0 6 6 0 0 0 5.25 5.955V16.5h-2a.75.75 0 0 0 0 1.5h5.5a.75.75 0 0 0 0-1.5h-2v-1.545A6 6 0 0 0 16 9a.75.75 0 0 0-1.5 0 4.5 4.5 0 0 1-9 0Z" />
            </svg>
          </button>
        )}
        <input
          value={isListening && interimText ? interimText : input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isListening ? "Listening…" : "Ask anything…"}
          disabled={isStreaming || isListening}
          className="input-field flex-1 rounded-full disabled:opacity-50"
        />
        <button type="submit" disabled={isStreaming || !input.trim()} className="btn-primary shrink-0">
          {isStreaming ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
