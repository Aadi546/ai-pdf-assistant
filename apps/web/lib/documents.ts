import { DocumentSummary } from "@ai-pdf/types";
import { apiFetch, apiJson } from "./api-client";

export function listDocuments() {
  return apiJson<DocumentSummary[]>("/documents");
}

export function getDocument(id: string) {
  return apiJson<DocumentSummary>(`/documents/${id}`);
}

export async function uploadDocument(file: File): Promise<DocumentSummary> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await apiFetch("/documents", { method: "POST", body: formData });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message ?? "Upload failed");
  }
  return res.json();
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await apiFetch(`/documents/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete document");
}

export function getDocumentFileUrl(id: string) {
  return apiJson<{ url: string }>(`/documents/${id}/file`);
}
