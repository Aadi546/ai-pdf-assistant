# ADR 0004: Section/heading detection is a font-size heuristic, not guaranteed

## Status
Accepted (called out in the original architecture review, formalized here now that Phase 6 implements it)

## Context
PDFs carry no semantic structure — no "this is a heading" markup, just
positioned glyphs. The product wants chunks tagged with a section/chapter
so citations and chat context can say more than just a page number.

## Decision
During extraction (`PdfExtractionService`), each page's text runs are
compared by approximate font size (`Math.hypot` of the text-transform
matrix's vertical component — pdf.js doesn't expose a direct point size).
A short run (≤80 chars) whose size is ≥1.3× the page's median text size is
treated as that page's section heading. No separate "chapter" field exists
— at this detection quality, chapter vs. section isn't reliably
distinguishable, so one heuristic field covers both rather than adding a
second field neither phase can populate with confidence.

## Consequences
- Section names will sometimes be wrong, missing, or just an artifact of
  unusual formatting (a large pull-quote, a page number rendered in a big
  font, etc.). This is expected, not a bug to chase.
- `pageNumber` is the one property every downstream feature (citations,
  reading context, chat) can rely on unconditionally — nothing should
  require `section` to be present or correct.
- If citation/retrieval quality later demands real structure, the fix is a
  better model-based heading classifier or relying on a PDF's actual
  bookmarks/outline (when present) — not tuning this heuristic's threshold
  further.
