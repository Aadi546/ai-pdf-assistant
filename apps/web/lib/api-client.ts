import { useAuthStore } from "@/stores/auth-store";
import { API_BASE_URL } from "./env";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    useAuthStore.getState().clearAuth();
    return null;
  }
  const data = await res.json();
  useAuthStore.getState().setAccessToken(data.accessToken);
  return data.accessToken as string;
}

/**
 * fetch() wrapper used by every API call: attaches the in-memory access
 * token, sends the refresh cookie along (credentials: include), and — on a
 * single 401 — attempts one silent refresh-and-retry before giving up. This
 * is the one place that logic lives, per spec §49's "don't scatter this
 * across the codebase" principle applied to API calls.
 */
export async function apiFetch(path: string, options: RequestInit = {}, isRetry = false): Promise<Response> {
  const accessToken = useAuthStore.getState().accessToken;
  const headers = new Headers(options.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  // Only default to JSON for plain string bodies — a FormData body (file
  // uploads) needs the browser to set its own multipart boundary, so never
  // set Content-Type ourselves in that case.
  if (typeof options.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (res.status === 401 && !isRetry) {
    if (!refreshInFlight) {
      refreshInFlight = refreshAccessToken().finally(() => {
        refreshInFlight = null;
      });
    }
    const newToken = await refreshInFlight;
    if (newToken) {
      return apiFetch(path, options, true);
    }
  }

  return res;
}

export async function apiJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await apiFetch(path, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? "Request failed");
  }
  return res.json();
}
