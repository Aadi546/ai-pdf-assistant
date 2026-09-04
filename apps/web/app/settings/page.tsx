"use client";

import Link from "next/link";
import { AiConfigForm } from "@/features/ai-config/ai-config-form";
import { useRequireAuth } from "@/features/auth/use-require-auth";
import { ThemeToggle } from "@/features/theme/theme-toggle";

export default function SettingsPage() {
  const { isReady } = useRequireAuth();

  if (!isReady) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-neutral-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-8">
      <div className="flex w-full max-w-md items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/library" className="text-sm text-neutral-500 hover:underline">
            ← Library
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        </div>
        <ThemeToggle />
      </div>
      <div className="card w-full max-w-md px-6 py-6">
        <AiConfigForm />
      </div>
    </main>
  );
}
