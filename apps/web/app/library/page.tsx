"use client";

import Link from "next/link";
import { DocumentList } from "@/features/documents/document-list";
import { UploadButton } from "@/features/documents/upload-button";
import { useRequireAuth } from "@/features/auth/use-require-auth";
import { ThemeToggle } from "@/features/theme/theme-toggle";
import { logout } from "@/lib/auth";

export default function LibraryPage() {
  const { user, isReady } = useRequireAuth();

  if (!isReady) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-neutral-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-6 py-10">
        <div className="flex w-full items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              <span className="brand-mark">{user?.name || user?.email}</span>&apos;s library
            </h1>
            <p className="text-sm text-neutral-500">Your PDFs, with an AI study partner beside every one.</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/settings" className="text-sm text-neutral-500 hover:text-neutral-700 hover:underline dark:hover:text-neutral-300">
              Settings
            </Link>
            <button
              onClick={() => logout()}
              className="text-sm text-neutral-500 hover:text-neutral-700 hover:underline dark:hover:text-neutral-300"
            >
              Log out
            </button>
            <ThemeToggle />
          </div>
        </div>
        <UploadButton />
        <DocumentList />
      </div>
    </main>
  );
}
