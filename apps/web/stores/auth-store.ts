import { create } from "zustand";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isHydrated: boolean;
  setAuth: (user: AuthUser, accessToken: string) => void;
  setAccessToken: (accessToken: string | null) => void;
  clearAuth: () => void;
  setHydrated: () => void;
}

/**
 * The access token deliberately lives only in memory (this store), never
 * localStorage — an XSS payload that can read localStorage can read a
 * long-lived token, but a page-reload-scoped in-memory token limits the
 * blast radius. The refresh token is an httpOnly cookie the JS layer never
 * touches at all. On reload, `hydrateSession()` (lib/auth.ts) silently
 * calls /auth/refresh using that cookie to get a fresh access token back.
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isHydrated: false,
  setAuth: (user, accessToken) => set({ user, accessToken }),
  setAccessToken: (accessToken) => set({ accessToken }),
  clearAuth: () => set({ user: null, accessToken: null }),
  setHydrated: () => set({ isHydrated: true }),
}));
