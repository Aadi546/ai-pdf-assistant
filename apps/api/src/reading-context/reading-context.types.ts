export interface ReadingContext {
  documentId: string;
  currentPage: number;
  previousPage: number | null;
  selectedText: string | null;
  updatedAt: string;
}

export const READING_CONTEXT_TTL_SECONDS = 30 * 60; // 30 min — ephemeral session state, not persisted history

export function readingContextKey(userId: string, documentId: string): string {
  return `reading_context:${userId}:${documentId}`;
}
