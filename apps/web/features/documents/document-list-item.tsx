"use client";

import { DocumentSummary } from "@ai-pdf/types";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { getReadingProgress } from "@/lib/reading-progress";

const STATUS_LABEL: Record<string, string> = {
  UPLOADING: "Uploading…",
  PROCESSING: "Processing…",
  EMBEDDING: "Indexing…",
  READY: "Ready",
  FAILED: "Failed",
};

const STATUS_DOT: Record<string, string> = {
  UPLOADING: "bg-neutral-400",
  PROCESSING: "bg-amber-500",
  EMBEDDING: "bg-amber-500",
  READY: "bg-green-500",
  FAILED: "bg-red-500",
};

export function DocumentListItem({ doc, onDelete, isDeleting }: { doc: DocumentSummary; onDelete: () => void; isDeleting: boolean }) {
  const { data: progress } = useQuery({
    queryKey: ["reading-progress", doc.id],
    queryFn: () => getReadingProgress(doc.id),
  });

  return (
    <li className="group flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3.5 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900">
      <Link href={`/documents/${doc.id}`} className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-medium group-hover:underline">{doc.title}</span>
        <span className="flex items-center gap-1.5 text-xs text-neutral-500">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[doc.status] ?? "bg-neutral-400"}`} />
          {STATUS_LABEL[doc.status] ?? doc.status}
          {progress?.currentPage != null && (
            <>
              <span className="text-neutral-300 dark:text-neutral-700">·</span>
              {progress.progressPercent != null ? `${progress.progressPercent}% · ` : ""}
              Page {progress.currentPage}
            </>
          )}
        </span>
      </Link>
      <button
        onClick={onDelete}
        disabled={isDeleting}
        className="shrink-0 rounded-full px-2 py-1 text-xs text-neutral-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 disabled:opacity-50 group-hover:opacity-100 dark:hover:bg-red-950"
      >
        Delete
      </button>
    </li>
  );
}
