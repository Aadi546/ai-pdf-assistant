"use client";

import Link from "next/link";

/**
 * Scoped to the reader route specifically — this is the highest-crash-risk
 * page in the app (PDF parsing/rendering, streaming chat) and a crash here
 * shouldn't lose the user's place entirely; the library link stays reachable.
 */
export default function DocumentError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-medium text-red-400">Something went wrong</p>
      <h1 className="text-xl font-semibold">Couldn&apos;t display this document</h1>
      <p className="max-w-sm text-sm text-neutral-500">
        This can happen with an unusually large or malformed PDF. Try again, or go back to your library.
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
