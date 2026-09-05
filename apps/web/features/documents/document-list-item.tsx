"use client";

import { DocumentSummary } from "@ai-pdf/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { getDocumentStatus, isDocumentInProgress, retryDocument } from "@/lib/documents";
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
  const queryClient = useQueryClient();
  const { data: progress } = useQuery({
    queryKey: ["reading-progress", doc.id],
    queryFn: () => getReadingProgress(doc.id),
  });

  // Only the detail status endpoint knows embedded-chunk progress and
  // whether a Gemini key is what's actually being waited on — a small
  // per-item fetch, scoped to just the documents still in flight or that
  // failed (where there's something new to say beyond the plain status word).
  const inProgress = isDocumentInProgress(doc.status);
  const { data: detail } = useQuery({
    queryKey: ["document-status", doc.id],
    queryFn: () => getDocumentStatus(doc.id),
    enabled: inProgress || doc.status === "FAILED",
    refetchInterval: inProgress ? 3000 : false,
  });

  const retryMutation = useMutation({
    mutationFn: () => retryDocument(doc.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["document-status", doc.id] });
    },
  });

  const statusText =
    doc.status === "EMBEDDING" && detail?.progress.total
      ? `${STATUS_LABEL.EMBEDDING} ${Math.round((detail.progress.embedded / detail.progress.total) * 100)}%`
      : (STATUS_LABEL[doc.status] ?? doc.status);

  return (
    <li className="group flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3.5 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900">
      <Link href={`/documents/${doc.id}`} className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-medium group-hover:underline">{doc.title}</span>
        <span className="flex items-center gap-1.5 text-xs text-neutral-500">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[doc.status] ?? "bg-neutral-400"}`} />
          {statusText}
          {progress?.currentPage != null && (
            <>
              <span className="text-neutral-300 dark:text-neutral-700">·</span>
              {progress.progressPercent != null ? `${progress.progressPercent}% · ` : ""}
              Page {progress.currentPage}
            </>
          )}
        </span>
        {doc.status === "EMBEDDING" && detail?.needsApiKey && (
          <Link href="/settings" className="text-xs text-amber-600 underline hover:text-amber-700 dark:text-amber-400">
            Add your Gemini key to finish indexing
          </Link>
        )}
        {doc.status === "FAILED" && detail?.failureReason && (
          <span className="truncate text-xs text-red-500">{detail.failureReason}</span>
        )}
      </Link>
      <div className="flex shrink-0 items-center gap-1">
        {doc.status === "FAILED" && (
          <button
            onClick={(e) => {
              e.preventDefault();
              retryMutation.mutate();
            }}
            disabled={retryMutation.isPending}
            className="rounded-full px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-50 dark:text-blue-400 dark:hover:bg-blue-950"
          >
            {retryMutation.isPending ? "Retrying…" : "Retry"}
          </button>
        )}
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="rounded-full px-2 py-1 text-xs text-neutral-400 opacity-100 transition-opacity hover:bg-red-50 hover:text-red-500 disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100 dark:hover:bg-red-950"
        >
          Delete
        </button>
      </div>
    </li>
  );
}
