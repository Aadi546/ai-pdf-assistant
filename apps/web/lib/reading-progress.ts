import { apiJson } from "./api-client";

export interface ReadingProgress {
  currentPage: number | null;
  progressPercent: number | null;
  lastReadAt: string | null;
}

export function getReadingProgress(documentId: string) {
  return apiJson<ReadingProgress>(`/documents/${documentId}/reading-progress`);
}
