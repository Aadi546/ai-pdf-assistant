import { apiFetch, apiJson } from "./api-client";

export function getAiConfigStatus() {
  return apiJson<{ configured: boolean }>("/ai/config/status");
}

export async function setAiConfig(apiKey: string): Promise<{ configured: boolean }> {
  const res = await apiFetch("/ai/config", { method: "POST", body: JSON.stringify({ apiKey }) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message ?? "Couldn't save that key");
  }
  return res.json();
}

export async function clearAiConfig(): Promise<void> {
  const res = await apiFetch("/ai/config", { method: "DELETE" });
  if (!res.ok) throw new Error("Couldn't remove the key");
}
