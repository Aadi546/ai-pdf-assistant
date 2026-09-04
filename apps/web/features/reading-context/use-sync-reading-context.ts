"use client";

import { useEffect } from "react";
import { updateReadingContext } from "@/lib/reading-context";
import { useReadingContextStore } from "@/stores/reading-context-store";

const DEBOUNCE_MS = 800;

/**
 * The client half of the hybrid reading-context design (docs/architecture.md
 * §6): local state updates instantly so the UI never waits on a network
 * round-trip, but the backend only hears about a page change after it's
 * been debounced and confirmed to actually be a change — clicking through
 * pages 4→5→6→7 rapidly sends exactly one request (page 7), not four.
 */
export function useSyncReadingContext(documentId: string, currentPage: number, enabled = true) {
  const setPage = useReadingContextStore((s) => s.setPage);
  const markSynced = useReadingContextStore((s) => s.markSynced);
  const lastSyncedPage = useReadingContextStore((s) => s.lastSyncedPage);

  useEffect(() => {
    setPage(documentId, currentPage);
  }, [documentId, currentPage, setPage]);

  useEffect(() => {
    // `enabled` exists so the caller can hold off the very first sync until
    // it's read any pre-existing ReadingProgress — otherwise this fires on
    // mount (page 1) before that read resolves and silently overwrites
    // "page 127 from last time" before the "Continue from page 127?" prompt
    // ever gets a chance to show it.
    if (!enabled || currentPage === lastSyncedPage) return;

    const timer = setTimeout(() => {
      updateReadingContext(documentId, currentPage)
        .then(() => markSynced(currentPage))
        .catch(() => {
          // Best-effort: a missed sync just means Phase 9's AI context
          // falls back to the last page that *did* sync successfully.
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [documentId, currentPage, lastSyncedPage, markSynced, enabled]);
}
