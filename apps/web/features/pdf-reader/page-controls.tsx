"use client";

import { useEffect, useRef, useState } from "react";

interface PageControlsProps {
  pageNumber: number;
  numPages: number | null;
  onPageChange: (page: number) => void;
  scale: number;
  onScaleChange: (scale: number) => void;
  minScale: number;
  maxScale: number;
}

const ZOOM_STEP = 0.1;

export function PageControls({
  pageNumber,
  numPages,
  onPageChange,
  scale,
  onScaleChange,
  minScale,
  maxScale,
}: PageControlsProps) {
  // Local text so the user can freely clear/retype the page number without
  // each keystroke being clamped back to a valid page mid-edit. Only synced
  // from the prop while the input isn't focused, so an external page change
  // (Prev/Next, search jump) still updates the box.
  const [pageInput, setPageInput] = useState(String(pageNumber));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setPageInput(String(pageNumber));
    }
  }, [pageNumber]);

  const commitPageInput = () => {
    const parsed = Number(pageInput);
    if (Number.isFinite(parsed)) {
      onPageChange(parsed);
    } else {
      setPageInput(String(pageNumber));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button
        onClick={() => onPageChange(pageNumber - 1)}
        disabled={pageNumber <= 1}
        aria-label="Previous page"
        className="rounded border border-neutral-300 px-2 py-1 disabled:opacity-40 dark:border-neutral-700"
      >
        Prev
      </button>
      <div className="flex items-center gap-1">
        <label htmlFor="page-number-input" className="sr-only">
          Page number
        </label>
        <input
          id="page-number-input"
          ref={inputRef}
          type="number"
          value={pageInput}
          min={1}
          max={numPages ?? 1}
          onChange={(e) => setPageInput(e.target.value)}
          onBlur={commitPageInput}
          onKeyDown={(e) => e.key === "Enter" && commitPageInput()}
          className="w-14 rounded border border-neutral-300 px-1 py-1 text-center dark:border-neutral-700 dark:bg-neutral-900"
        />
        <span className="text-neutral-500">/ {numPages ?? "…"}</span>
      </div>
      <button
        onClick={() => onPageChange(pageNumber + 1)}
        disabled={!numPages || pageNumber >= numPages}
        aria-label="Next page"
        className="rounded border border-neutral-300 px-2 py-1 disabled:opacity-40 dark:border-neutral-700"
      >
        Next
      </button>
      <div className="mx-1 h-4 w-px bg-neutral-300 dark:bg-neutral-700" />
      <button
        onClick={() => onScaleChange(Math.max(minScale, +(scale - ZOOM_STEP).toFixed(2)))}
        disabled={scale <= minScale}
        className="rounded border border-neutral-300 px-2 py-1 disabled:opacity-40 dark:border-neutral-700"
        aria-label="Zoom out"
      >
        −
      </button>
      <span className="w-12 text-center text-neutral-500">{Math.round(scale * 100)}%</span>
      <button
        onClick={() => onScaleChange(Math.min(maxScale, +(scale + ZOOM_STEP).toFixed(2)))}
        disabled={scale >= maxScale}
        className="rounded border border-neutral-300 px-2 py-1 disabled:opacity-40 dark:border-neutral-700"
        aria-label="Zoom in"
      >
        +
      </button>
    </div>
  );
}
