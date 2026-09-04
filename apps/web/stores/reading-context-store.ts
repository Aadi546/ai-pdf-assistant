import { create } from "zustand";

interface ReadingContextState {
  documentId: string | null;
  currentPage: number;
  lastSyncedPage: number | null;
  selectedText: string | null;
  /** Set by a citation click in chat, consumed by the reader — see comment below. */
  jumpToPageRequest: number | null;
  setPage: (documentId: string, page: number) => void;
  markSynced: (page: number) => void;
  setSelectedText: (text: string | null) => void;
  requestJumpToPage: (page: number) => void;
  clearJumpRequest: () => void;
}

/**
 * Local mirror of "what page is the user on right now" and "what did they
 * just highlight." The PDF reader writes page changes here on every change
 * (cheap, instant); a separate debounced hook (use-sync-reading-context.ts)
 * watches it and decides when a change is meaningful enough to tell the
 * backend about — see docs/architecture.md §6. lastSyncedPage exists purely
 * so that hook can tell "did we already send this page" without keeping its
 * own ref in sync across remounts.
 *
 * selectedText is deliberately NOT synced to the backend proactively (per
 * the architecture doc's design) — it only rides along on the *next* chat
 * message, read directly by the chat feature from this store. That's why
 * this field sat unused from Phase 5 until Phase 9's chat actually needed
 * it.
 *
 * jumpToPageRequest bridges two sibling components (chat panel → PDF
 * reader) that don't otherwise share state: clicking a "[Page N]" citation
 * in chat can't call the reader's internal page-setter directly, so it
 * writes a request here instead and the reader's own effect picks it up
 * and clears it.
 */
export const useReadingContextStore = create<ReadingContextState>((set) => ({
  documentId: null,
  currentPage: 1,
  lastSyncedPage: null,
  selectedText: null,
  jumpToPageRequest: null,
  setPage: (documentId, page) => set({ documentId, currentPage: page }),
  markSynced: (page) => set({ lastSyncedPage: page }),
  setSelectedText: (text) => set({ selectedText: text }),
  requestJumpToPage: (page) => set({ jumpToPageRequest: page }),
  clearJumpRequest: () => set({ jumpToPageRequest: null }),
}));
