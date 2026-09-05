"use client";

import Link from "next/link";

/**
 * Root error boundary — catches a render-time exception anywhere under this
 * layout that isn't caught by a more specific error.tsx (e.g.
 * documents/[id]/error.tsx). Without this, a crash fell through to Next's
 * unstyled default error screen.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-medium text-red-400">Something went wrong</p>
      <h1 className="text-xl font-semibold">This page hit an error</h1>
      <p className="max-w-sm text-sm text-neutral-500">
        Try again, or head back to your library if it keeps happening.
      </p>
      <div className="mt-2 flex gap-2">
        <button onClick={reset} className="btn-primary">
          Try again
        </button>
        <Link
          href="/library"
          className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Go to library
        </Link>
      </div>
    </main>
  );
}
