"use client";

import { RefObject, useEffect } from "react";
import { useReadingContextStore } from "@/stores/reading-context-store";

const MAX_SELECTION_LENGTH = 2000; // matches the backend's selectedText validation cap

/**
 * Captures text the user highlights inside the PDF's text layer and stores
 * it for the chat feature to pick up on the next message — see the store's
 * own comment for why this isn't synced to the backend on its own.
 */
export function useCaptureSelection(containerRef: RefObject<HTMLElement | null>) {
  const setSelectedText = useReadingContextStore((s) => s.setSelectedText);

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? "";

      if (!text) {
        setSelectedText(null);
        return;
      }

      // Only care about selections made inside the reader, not elsewhere on the page.
      const anchorNode = selection?.anchorNode;
      if (!anchorNode || !containerRef.current?.contains(anchorNode)) return;

      setSelectedText(text.slice(0, MAX_SELECTION_LENGTH));
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [containerRef, setSelectedText]);
}
