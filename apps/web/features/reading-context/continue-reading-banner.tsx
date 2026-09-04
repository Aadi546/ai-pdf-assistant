"use client";

import { useState } from "react";

/**
 * "Continue from page N?" — pure display, no fetching of its own. The
 * caller (PdfReader) reads ReadingProgress once, up front, and gates the
 * first reading-context sync on that read finishing — see
 * use-sync-reading-context.ts's `enabled` param for why that ordering
 * matters (the sync would otherwise silently overwrite the very value this
 * banner needs to show).
 */
export function ContinueReadingBanner({
  savedPage,
  currentPage,
  onResume,
}: {
  savedPage: number | null;
  currentPage: number;
  onResume: (page: number) => void;
}) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !savedPage || savedPage <= 1 || savedPage === currentPage) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm dark:border-blue-900 dark:bg-blue-950">
      <span>Continue from page {savedPage}?</span>
      <div className="flex gap-2">
        <button
          onClick={() => {
            onResume(savedPage);
            setDismissed(true);
          }}
          className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
        >
          Resume
        </button>
        <button onClick={() => setDismissed(true)} className="text-xs text-neutral-500 hover:underline">
          Dismiss
        </button>
      </div>
    </div>
  );
}
