"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/skeleton";
import { deleteDocument, isDocumentInProgress, listDocuments } from "@/lib/documents";
import { DocumentListItem } from "./document-list-item";

// Nothing polled document status before this — a document sat at
// "Processing…" until the user manually reloaded. Polling only while
// something is actually in flight (and stopping the moment everything's
// terminal) also has a side benefit on Render's free tier: it keeps the
// container awake for exactly as long as there's indexing work to do,
// instead of letting a 15-minute idle spin-down kill a job mid-embed.
const POLL_INTERVAL_MS = 3000;

export function DocumentList() {
  const queryClient = useQueryClient();
  const { data: documents, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["documents"],
    queryFn: listDocuments,
    refetchInterval: (query) => (query.state.data?.some((d) => isDocumentInProgress(d.status)) ? POLL_INTERVAL_MS : false),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
  });

  if (isLoading) {
    return (
      <ul className="flex w-full flex-col gap-2" aria-label="Loading your library">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex flex-col gap-2 rounded-xl border border-neutral-200 px-4 py-3.5 dark:border-neutral-800">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </li>
        ))}
      </ul>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-red-500">Couldn&apos;t load your documents.</p>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {isRefetching ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
  }
  if (!documents?.length) {
    return <p className="text-sm text-neutral-500">No documents yet — upload a PDF to get started.</p>;
  }

  return (
    <ul className="flex w-full flex-col gap-2">
      {documents.map((doc) => (
        <DocumentListItem
          key={doc.id}
          doc={doc}
          onDelete={() => deleteMutation.mutate(doc.id)}
          isDeleting={deleteMutation.isPending}
        />
      ))}
    </ul>
  );
}
