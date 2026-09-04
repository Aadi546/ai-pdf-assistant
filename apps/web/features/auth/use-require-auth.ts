"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Redirects to /login once session hydration has finished and there's still
 * no user. Waiting on `isHydrated` matters: without it, a logged-in user
 * reloading the page would flash through "logged out" (store starts empty)
 * before hydrateSession() finishes restoring them.
 */
export function useRequireAuth() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  useEffect(() => {
    if (isHydrated && !user) {
      router.push("/login");
    }
  }, [isHydrated, user, router]);

  return { user, isReady: isHydrated && !!user };
}
