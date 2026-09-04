import { apiJson } from "./api-client";

export interface ReadingContext {
  documentId: string;
  currentPage?: number;
  previousPage?: number | null;
  selectedText?: string | null;
  updatedAt?: string;
}

export function updateReadingContext(documentId: string, currentPage: number, selectedText?: string) {
  return apiJson<ReadingContext>(`/documents/${documentId}/reading-context`, {
    method: "POST",
    body: JSON.stringify({ currentPage, selectedText }),
  });
}
