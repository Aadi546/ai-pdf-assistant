import { AuthUser, useAuthStore } from "@/stores/auth-store";
import { apiJson } from "./api-client";
import { API_BASE_URL } from "./env";

interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}

export function register(email: string, password: string, name?: string) {
  return apiJson<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name: name || undefined }),
  });
}

export function login(email: string, password: string) {
  return apiJson<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function logout() {
  await apiJson("/auth/logout", { method: "POST" });
  useAuthStore.getState().clearAuth();
}

/**
 * Runs once on app load: the access token only ever lives in memory, so a
 * full page reload loses it. This silently exchanges the httpOnly refresh
 * cookie (if any) for a new access token + the current user, so a
 * previously logged-in user doesn't get bounced to the login page just for
 * refreshing the tab.
 */
export async function hydrateSession() {
  try {
    const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!refreshRes.ok) return;
    const { accessToken } = await refreshRes.json();
    useAuthStore.getState().setAccessToken(accessToken);

    const user = await apiJson<import("@/stores/auth-store").AuthUser>("/users/me");
    useAuthStore.getState().setAuth(user, accessToken);
  } catch {
    // No valid session — stay logged out, this is the normal first-visit case.
  } finally {
    useAuthStore.getState().setHydrated();
  }
}
