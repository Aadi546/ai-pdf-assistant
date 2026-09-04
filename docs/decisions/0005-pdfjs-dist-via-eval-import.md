# ADR 0005: Load pdfjs-dist (ESM-only) from CommonJS via an eval'd dynamic import

## Status
Accepted

## Context
Phase 6 needs server-side PDF text extraction. The first approach used
`pdf-parse`, a CommonJS wrapper that bundles a very old pdfjs-dist
(v1.10.100) internally. In testing it turned out unreliable in a
long-running process: after processing one malformed PDF, subsequent
parses of a previously-working file failed too ("bad XRef entry" on a file
that had parsed fine moments earlier) — symptomatic of shared/global state
in that old pdfjs version not being reentrancy-safe.

The obvious fix — use `pdfjs-dist` directly, the same actively-maintained
v4.8.69 already proven reliable in the browser reader (Phase 4) — has one
complication: pdfjs-dist v4 ships **ESM-only** (`"main": "build/pdf.mjs"`,
no CJS build). `apps/api` compiles to CommonJS (required by Nest's
decorator/metadata setup). A normal `import()` in TypeScript compiled to
CommonJS gets downleveled to `Promise.resolve().then(() => require(...))`
— verified empirically by compiling a one-line test file — and `require()`
cannot load an ESM-only module (`ERR_REQUIRE_ESM`).

## Decision
Load pdfjs-dist through `(0, eval)('import("pdfjs-dist/legacy/build/pdf.mjs")')`
in `pdf-extraction.service.ts`, cached after first load. Routing the
specifier through `eval` hides it from tsc's static rewrite, so Node's own
native dynamic `import()` runs instead, which *can* load ESM.

## Consequences
- This is the single place in the codebase that needs the trick — isolated
  behind `PdfExtractionService`, not spread across callers.
- It's a widely-used, documented workaround for exactly this ESM-in-CJS
  situation, not a novel hack, but it is inherently a little fragile
  (depends on tsc continuing to downlevel dynamic import this way). If a
  future TypeScript/Node change makes this unnecessary, the fix is to
  delete `loadPdfjs()`'s eval wrapper and use plain `import()` directly.
- Alternative rejected: switching `apps/api` to native ESM output. That's a
  much larger, riskier change (Nest's CommonJS-oriented tooling, ts-jest,
  decorator metadata) to solve one dependency's module format.
- Jest specifically needs `NODE_OPTIONS=--experimental-vm-modules` (wired
  into the `test` script via `cross-env`) — Jest's default Node VM sandbox
  doesn't support a real dynamic `import()` without it. The actual running
  app (`nest start`/`node dist/main.js`) doesn't need this flag; it's a
  Jest-test-environment-only requirement, verified by confirming the same
  code worked directly against the dev server before this flag was added.
