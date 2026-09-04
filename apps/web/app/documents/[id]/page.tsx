"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChatPanel } from "@/features/chat/chat-panel";
import { useRequireAuth } from "@/features/auth/use-require-auth";
import { PdfReader } from "@/features/pdf-reader/pdf-reader";
import { getDocument, getDocumentFileUrl } from "@/lib/documents";
import { useReadingContextStore } from "@/stores/reading-context-store";
import { ThemeToggle } from "@/features/theme/theme-toggle";

export default function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const { isReady } = useRequireAuth();
  const requestJumpToPage = useReadingContextStore((s) => s.requestJumpToPage);

  const { data: doc } = useQuery({
    queryKey: ["document", id],
    queryFn: () => getDocument(id),
    enabled: isReady,
  });

  const {
    data: fileData,
    error: fileError,
    isLoading: isFileLoading,
  } = useQuery({
    queryKey: ["document-file", id],
    queryFn: () => getDocumentFileUrl(id),
    enabled: isReady,
  });

  if (!isReady) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-neutral-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-neutral-200 bg-white/80 px-4 py-3 backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-950/80">
        <Link href="/library" className="text-sm text-neutral-500 hover:underline">
          ← Library
        </Link>
        <h1 className="truncate text-sm font-medium">{doc?.title ?? "…"}</h1>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          {isFileLoading && <p className="p-4 text-sm text-neutral-500">Loading PDF…</p>}
          {fileError && <p className="p-4 text-sm text-red-500">Couldn&apos;t load this document.</p>}
          {fileData && <PdfReader documentId={id} fileUrl={fileData.url} />}
        </div>
        <div className="w-full max-w-sm shrink-0">
          <ChatPanel documentId={id} onJumpToPage={requestJumpToPage} />
        </div>
      </div>
    </main>
  );
}
