# ADR 0006: Point pdf.js at its local standard-fonts/CMap data, never the network

## Status
Accepted

## Context
The first real PDF extraction in a test run occasionally took ~90-120
seconds instead of the usual <1s (`ingestion.e2e.spec.ts` went from ~5s to
97s total in one run). Console output showed pdf.js logging
`fetchStandardFontData: failed to fetch file "LiberationSans-Regular.ttf"`
— by default, pdf.js falls back to fetching standard-font and CMap data
(needed for non-embedded fonts and non-Latin encodings) from a URL, and
with no `standardFontDataUrl`/`cMapUrl` configured it appears to still
attempt something network-shaped before giving up, which is slow in this
sandboxed environment.

## Decision
Pass `standardFontDataUrl` and `cMapUrl` to `getDocument()`, pointing at
the `standard_fonts/` and `cmaps/` directories pdfjs-dist ships locally in
its own package (resolved via `pathToFileURL(require.resolve(...))`, so it
works regardless of install location). pdf.js's Node runtime reads
`file://` URLs straight off disk — no network involved.

## Consequences
- Ingestion no longer has a network dependency at all (was already true
  for everything else in the pipeline — this closes the one accidental
  exception).
- Confirmed via the same integration test: back to ~5s total for the suite,
  down from ~97-119s, with the fix in place.
