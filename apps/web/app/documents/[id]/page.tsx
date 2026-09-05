"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Skeleton } from "@/components/skeleton";
import { ChatPanel } from "@/features/chat/chat-panel";
import { useRequireAuth } from "@/features/auth/use-require-auth";
import { PdfReader } from "@/features/pdf-reader/pdf-reader";
import { getDocument, getDocumentFileUrl } from "@/lib/documents";
import { useReadingContextStore } from "@/stores/reading-context-store";
import { ThemeToggle } from "@/features/theme/theme-toggle";

type MobilePanel = "pdf" | "chat";

export default function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const { isReady } = useRequireAuth();
  const requestJumpToPage = useReadingContextStore((s) => s.requestJumpToPage);
  // Below `md` there's no room for the PDF and chat side by side (the fixed
  // max-w-sm chat panel alone claims the full width of a phone screen) — so
  // below that breakpoint only one panel shows at a time, switched with this
  // toggle. At `md` and up both render together as before; the toggle itself
  // is hidden there (see the `md:hidden` on its wrapper below).
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("pdf");

  const { data: doc } = useQuery({
    queryKey: ["document", id],
    queryFn: () => getDocument(id),
    enabled: isReady,
  });

  const {
    data: fileData,
    error: fileError,
    isLoading: isFileLoading,
    refetch: refetchFile,
    isRefetching: isFileRefetching,
  } = useQuery({
    queryKey: ["document-file", id],
    queryFn: () => getDocumentFileUrl(id),
    enabled: isReady,
  });

  if (!isReady) {
    return (
      <main className="flex h-screen flex-col">
        <div className="flex items-center gap-4 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <Skeleton className="h-[600px] w-[460px] max-w-full" />
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-neutral-200 bg-white/80 px-4 py-3 backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-950/80">
        <Link href="/library" className="text-sm text-neutral-500 hover:underline">
          ← Library
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{doc?.title ?? "…"}</h1>
        <ThemeToggle />
      </header>
      <div className="flex gap-1 border-b border-neutral-200 px-2 py-1.5 md:hidden dark:border-neutral-800">
        <button
          onClick={() => setMobilePanel("pdf")}
          aria-pressed={mobilePanel === "pdf"}
          className={`flex-1 rounded-full py-1.5 text-xs font-medium transition-colors ${
            mobilePanel === "pdf"
              ? "bg-blue-600 text-white"
              : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          }`}
        >
          Document
        </button>
        <button
          onClick={() => setMobilePanel("chat")}
          aria-pressed={mobilePanel === "chat"}
          className={`flex-1 rounded-full py-1.5 text-xs font-medium transition-colors ${
            mobilePanel === "chat"
              ? "bg-blue-600 text-white"
              : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          }`}
        >
          AI Study Partner
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className={`min-w-0 flex-1 ${mobilePanel === "chat" ? "hidden md:block" : ""}`}>
          {isFileLoading && (
            <div className="flex flex-col items-center gap-4 p-6" role="status" aria-label="Loading document">
              <Skeleton className="h-[600px] w-[460px] max-w-full" />
            </div>
          )}
          {fileError && (
            <div className="flex flex-col items-start gap-2 p-4">
              <p className="text-sm text-red-500">Couldn&apos;t load this document.</p>
              <button
                onClick={() => refetchFile()}
                disabled={isFileRefetching}
                className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                {isFileRefetching ? "Retrying…" : "Retry"}
              </button>
            </div>
          )}
          {fileData && <PdfReader documentId={id} fileUrl={fileData.url} />}
        </div>
        <div className={`w-full shrink-0 md:max-w-sm ${mobilePanel === "pdf" ? "hidden md:block" : ""}`}>
          <ChatPanel
            documentId={id}
            onJumpToPage={(page) => {
              setMobilePanel("pdf");
              requestJumpToPage(page);
            }}
          />
        </div>
      </div>
    </main>
  );
}
