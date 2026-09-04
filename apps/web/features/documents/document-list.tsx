"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteDocument, listDocuments } from "@/lib/documents";
import { DocumentListItem } from "./document-list-item";

export function DocumentList() {
  const queryClient = useQueryClient();
  const { data: documents, isLoading, error } = useQuery({ queryKey: ["documents"], queryFn: listDocuments });

  const deleteMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
  });

  if (isLoading) return <p className="text-sm text-neutral-500">Loading your library…</p>;
  if (error) return <p className="text-sm text-red-500">Couldn&apos;t load your documents.</p>;
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
