export const DocumentStatus = {
  UPLOADING: "UPLOADING",
  PROCESSING: "PROCESSING",
  EMBEDDING: "EMBEDDING",
  READY: "READY",
  FAILED: "FAILED",
} as const;

export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];

export interface DocumentSummary {
  id: string;
  title: string;
  status: DocumentStatus;
  pageCount: number | null;
  createdAt: string;
}
