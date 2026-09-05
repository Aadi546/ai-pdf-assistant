"use client";

import { pdfjs } from "react-pdf";
import { useState } from "react";

interface SearchBoxProps {
  fileUrl: string;
  numPages: number;
  onJumpToPage: (page: number) => void;
}

/**
 * Basic in-PDF search: scans every page's extracted text via pdf.js and
 * returns which pages contain the term. Deliberately page-level, not
 * position-level highlighting — the spec calls for "basic search-in-PDF"
 * for this phase; per-occurrence highlighting is a nice-to-have, not core.
 */
export function SearchBox({ fileUrl, numPages, onJumpToPage }: SearchBoxProps) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<number[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    const term = query.trim().toLowerCase();
    if (!term) {
      setMatches(null);
      return;
    }

    setIsSearching(true);
    try {
      const pdf = await pdfjs.getDocument(fileUrl).promise;
      const found: number[] = [];
      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .toLowerCase();
        if (text.includes(term)) found.push(i);
      }
      setMatches(found);
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <form onSubmit={runSearch} className="flex flex-wrap items-center gap-2 text-sm">
      <label htmlFor="pdf-search-input" className="sr-only">
        Search in PDF
      </label>
      <input
        id="pdf-search-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search in PDF…"
        className="w-40 rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button
        type="submit"
        disabled={isSearching}
        className="rounded border border-neutral-300 px-2 py-1 disabled:opacity-50 dark:border-neutral-700"
      >
        {isSearching ? "Searching…" : "Search"}
      </button>
      {matches &&
        (matches.length === 0 ? (
          <span className="text-neutral-500">No matches</span>
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-neutral-500">
              {matches.length} page{matches.length > 1 ? "s" : ""}:
            </span>
            {matches.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onJumpToPage(p)}
                aria-label={`Jump to page ${p}`}
                className="rounded border border-neutral-300 px-1.5 py-0.5 dark:border-neutral-700"
              >
                {p}
              </button>
            ))}
          </div>
        ))}
    </form>
  );
}
