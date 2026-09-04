import { Document } from "@prisma/client";
import { DocumentSummary } from "@ai-pdf/types";

/** Never leak storageKey (an internal object-storage path) to clients. */
export function toDocumentSummary(document: Document): DocumentSummary {
  return {
    id: document.id,
    title: document.title,
    status: document.status,
    pageCount: document.pageCount,
    createdAt: document.createdAt.toISOString(),
  };
}
