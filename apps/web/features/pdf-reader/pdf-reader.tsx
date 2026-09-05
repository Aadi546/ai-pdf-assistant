"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Skeleton } from "@/components/skeleton";
import { ContinueReadingBanner } from "@/features/reading-context/continue-reading-banner";
import { useCaptureSelection } from "@/features/reading-context/use-capture-selection";
import { useSyncReadingContext } from "@/features/reading-context/use-sync-reading-context";
import { getReadingProgress } from "@/lib/reading-progress";
import { useReadingContextStore } from "@/stores/reading-context-store";
import { PageControls } from "./page-controls";
import { SearchBox } from "./search-box";

// react-pdf ships pdf.js's worker as a separate script; this `new URL(...)`
// form is what lets webpack/Next bundle the asset and resolve it correctly
// instead of us hand-hosting a copy. Must stay pinned to the exact
// pdfjs-dist version react-pdf depends on internally (see apps/web
// package.json) — a mismatched worker/API version fails at runtime.
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
// How many pages on either side of the current one stay mounted. Continuous
// scroll needs neighbors rendered before they're reached, but mounting all
// of a several-hundred-page book at once would be slow/memory-heavy — this
// is a lightweight windowed-render compromise, not full list virtualization.
const RENDER_WINDOW_RADIUS = 2;

export function PdfReader({ documentId, fileUrl }: { documentId: string; fileUrl: string }) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const lastSyncedPage = useReadingContextStore((s) => s.lastSyncedPage);
  const setSelectedText = useReadingContextStore((s) => s.setSelectedText);
  const jumpToPageRequest = useReadingContextStore((s) => s.jumpToPageRequest);
  const clearJumpRequest = useReadingContextStore((s) => s.clearJumpRequest);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const pageElementRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Read once, up front, and frozen for the rest of this component's life
  // (staleTime: Infinity — no background refetch). Two reasons this needs
  // to be a snapshot, not a live value: (1) the mount-time page-1 sync must
  // wait for this read before it can fire, or it silently overwrites "page
  // 127 from last time" before the "Continue from page 127?" banner ever
  // gets to show it (see use-sync-reading-context.ts's `enabled` param);
  // (2) even after that ordering fix, React Query's default refetch-on-
  // remount would re-fetch this same query, now see the page the sync just
  // wrote, and silently swap the banner's target to the user's own current
  // page — the exact bug the ordering fix was trying to prevent, just via a
  // different path. A frozen snapshot closes both.
  const { data: savedProgress, isLoading: isProgressLoading } = useQuery({
    queryKey: ["reading-progress", documentId],
    queryFn: () => getReadingProgress(documentId),
    staleTime: Infinity,
  });

  useSyncReadingContext(documentId, pageNumber, !isProgressLoading);
  useCaptureSelection(pageContainerRef);

  // A page change makes the old selection stale — nothing on the new page
  // is still highlighted, so don't let it keep riding along on chat messages.
  useEffect(() => {
    setSelectedText(null);
  }, [pageNumber, setSelectedText]);

  // react-pdf re-fetches whenever the `file` prop is a new object, even if
  // the URL string is identical — memoize so re-renders (zoom, page change)
  // don't retrigger a full document reload.
  const file = useMemo(() => ({ url: fileUrl }), [fileUrl]);

  const windowPages = useMemo(() => {
    if (!numPages) return [];
    const start = Math.max(1, pageNumber - RENDER_WINDOW_RADIUS);
    const end = Math.min(numPages, pageNumber + RENDER_WINDOW_RADIUS);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [pageNumber, numPages]);

  const goToPage = (page: number) => {
    if (!numPages) return;
    const clamped = Math.min(Math.max(page, 1), numPages);
    setPageNumber(clamped);
    // The target page may not be mounted yet (outside the current render
    // window) — give React a tick to mount it before scrolling to it.
    setTimeout(() => {
      pageElementRefs.current.get(clamped)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  // Continuous-scroll page tracking: whichever mounted page occupies the
  // most of the viewport becomes "current," which drives everything else
  // (reading-context sync, the page-number box, the render window itself).
  useEffect(() => {
    const root = pageContainerRef.current;
    if (!root || windowPages.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const mostVisible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!mostVisible) return;
        const page = Number((mostVisible.target as HTMLElement).dataset.page);
        if (page && page !== pageNumber) setPageNumber(page);
      },
      { root, threshold: [0.25, 0.5, 0.75] },
    );

    for (const page of windowPages) {
      const el = pageElementRefs.current.get(page);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowPages]);

  // A citation click in the chat panel (a sibling component) can't call
  // goToPage directly — it writes a request to the shared store instead.
  useEffect(() => {
    if (jumpToPageRequest != null) {
      goToPage(jumpToPageRequest);
      clearJumpRequest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpToPageRequest, clearJumpRequest]);

  // Keyboard shortcuts for page nav/zoom — previously mouse/touch-only.
  // Skipped whenever focus is in a text input (the page-number box, the
  // search box, the chat composer) so typing "-" or an arrow key there isn't
  // hijacked into a page turn or a zoom change.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;

      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
          e.preventDefault();
          goToPage(pageNumber + 1);
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
          e.preventDefault();
          goToPage(pageNumber - 1);
          break;
        case "+":
        case "=":
          e.preventDefault();
          setScale((s) => Math.min(MAX_SCALE, +(s + 0.1).toFixed(2)));
          break;
        case "-":
          e.preventDefault();
          setScale((s) => Math.max(MIN_SCALE, +(s - 0.1).toFixed(2)));
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber, numPages]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
        <PageControls
          pageNumber={pageNumber}
          numPages={numPages}
          onPageChange={goToPage}
          scale={scale}
          onScaleChange={setScale}
          minScale={MIN_SCALE}
          maxScale={MAX_SCALE}
        />
        <div className="flex items-center gap-4">
          <span className="text-xs text-neutral-400" data-testid="reading-context-status">
            {lastSyncedPage === pageNumber ? `Context synced: page ${lastSyncedPage}` : "Syncing…"}
          </span>
          {numPages && <SearchBox fileUrl={fileUrl} numPages={numPages} onJumpToPage={goToPage} />}
        </div>
      </div>
      {numPages && (
        <ContinueReadingBanner
          savedPage={savedProgress?.currentPage ?? null}
          currentPage={pageNumber}
          onResume={goToPage}
        />
      )}
      <div
        ref={pageContainerRef}
        className="flex-1 overflow-auto bg-neutral-100 py-6 dark:bg-neutral-900"
      >
        {loadError ? (
          <p className="p-6 text-sm text-red-500">Couldn&apos;t load this PDF: {loadError}</p>
        ) : (
          <Document
            key={fileUrl}
            file={file}
            onLoadSuccess={({ numPages: total }) => setNumPages(total)}
            onLoadError={(err) => setLoadError(err.message)}
            loading={
              <div className="flex flex-col items-center gap-4 p-6" role="status" aria-label="Loading PDF">
                <Skeleton className="h-[600px] w-[460px] max-w-full" />
              </div>
            }
          >
            <div className="flex flex-col items-center gap-4">
              {windowPages.map((page) => (
                <div
                  key={page}
                  data-page={page}
                  ref={(el) => {
                    if (el) pageElementRefs.current.set(page, el);
                    else pageElementRefs.current.delete(page);
                  }}
                >
                  <Page pageNumber={page} scale={scale} renderAnnotationLayer renderTextLayer className="shadow-md" />
                </div>
              ))}
            </div>
          </Document>
        )}
      </div>
    </div>
  );
}
