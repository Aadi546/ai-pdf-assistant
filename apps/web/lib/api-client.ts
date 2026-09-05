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

/**
 * A `fetch()` that never reached the server at all — offline, DNS failure,
 * CORS, the API down — as distinct from `ApiError`, which means the server
 * responded but with a non-2xx status. Callers that want to offer a "Retry"
 * affordance specifically for "couldn't reach the server" (as opposed to
 * "the server rejected this") can check for this type.
 */
export class NetworkError extends Error {
  constructor() {
    super("Couldn't reach the server — check your connection and try again.");
  }
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // Can't reach the server at all — don't clear the session over a blip;
    // the caller's own request will surface the network failure instead.
    return null;
  }
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

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      credentials: "include",
    });
  } catch (err) {
    // A deliberate abort (stop-generation) isn't a network failure — let it
    // propagate as-is so callers can tell "stopped by the user" apart from
    // "couldn't reach the server".
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new NetworkError();
  }

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
