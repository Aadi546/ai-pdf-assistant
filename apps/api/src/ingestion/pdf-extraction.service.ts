import { pathToFileURL } from "node:url";
import { Injectable } from "@nestjs/common";

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  /** Heuristic largest-font-on-page guess — see docs/decisions/0004 (chapter/section detection ADR). */
  section: string | null;
}

export interface PdfJsTextItem {
  str: string;
  transform: number[];
}

interface PdfJsDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>;
}

interface PdfJsModule {
  getDocument(params: {
    data: Uint8Array;
    verbosity: number;
    standardFontDataUrl: string;
    cMapUrl: string;
    cMapPacked: boolean;
  }): { promise: Promise<PdfJsDocumentProxy> };
}

// pdf.js's own verbosity enum (0 = errors only) — avoids pulling in the
// whole module just for this one constant.
const PDFJS_VERBOSITY_ERRORS = 0;

// Without these, pdf.js falls back to fetching standard-font/CMap data over
// the network for any PDF using non-embedded fonts or non-Latin encodings —
// in one observed case a ~90s stall waiting on that fetch to time out.
// pdfjs-dist ships both directories locally; pointing at them here means
// this never touches the network, matching what text extraction actually
// needs (glyph mapping, not font rendering).
const PDFJS_ASSET_ROOT = pathToFileURL(require.resolve("pdfjs-dist/package.json")).href.replace(/package\.json$/, "");
const STANDARD_FONT_DATA_URL = `${PDFJS_ASSET_ROOT}standard_fonts/`;
const CMAP_URL = `${PDFJS_ASSET_ROOT}cmaps/`;

/**
 * pdfjs-dist v4 ships ESM-only. tsc downlevels a normal `import()` to
 * `require()` when compiling to CommonJS (verified empirically — see
 * docs/decisions/0005), and `require()` can't load an ESM-only package.
 * Routing the specifier through `eval` hides it from tsc's rewrite so
 * Node's own dynamic `import()` runs instead — the standard workaround for
 * this exact ESM-in-CJS situation. Loaded once and cached; this stays the
 * one place in the module that needs the trick.
 */
let pdfjsModulePromise: Promise<PdfJsModule> | null = null;
function loadPdfjs(): Promise<PdfJsModule> {
  pdfjsModulePromise ??= (0, eval)('import("pdfjs-dist/legacy/build/pdf.mjs")') as Promise<PdfJsModule>;
  return pdfjsModulePromise;
}

@Injectable()
export class PdfExtractionService {
  /** Extracts text page-by-page (never a single flattened blob) and applies the section heuristic per page. */
  async extractPages(buffer: Buffer): Promise<ExtractedPage[]> {
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      verbosity: PDFJS_VERBOSITY_ERRORS,
      standardFontDataUrl: STANDARD_FONT_DATA_URL,
      cMapUrl: CMAP_URL,
      cMapPacked: true,
    }).promise;

    const pages: ExtractedPage[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const { text, section } = summarizePage(textContent.items as PdfJsTextItem[]);
      pages.push({ pageNumber, text, section });
    }

    if (pages.length === 0) {
      throw new Error("PDF contains no extractable pages");
    }

    return pages;
  }
}

export function summarizePage(items: PdfJsTextItem[]): { text: string; section: string | null } {
  const runs = items
    .filter((item) => typeof item.str === "string" && item.str.length > 0)
    // Font size isn't stored directly on a pdf.js text item — this is the
    // standard approximation (magnitude of the transform matrix's vertical
    // component), good enough to compare "bigger than this page's usual
    // text," not to recover an exact point size.
    .map((item) => ({ str: item.str, size: Math.hypot(item.transform[2] ?? 0, item.transform[3] ?? 0) }));

  const text = runs
    .map((r) => r.str)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (runs.length === 0) {
    return { text, section: null };
  }

  const sizes = runs
    .map((r) => r.size)
    .filter((s) => s > 0)
    .sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] ?? 0;

  const HEADING_SIZE_RATIO = 1.3;
  const HEADING_MAX_LENGTH = 80;
  let section: string | null = null;
  for (const run of runs) {
    const trimmed = run.str.trim();
    if (trimmed.length > 0 && trimmed.length <= HEADING_MAX_LENGTH && median > 0 && run.size >= median * HEADING_SIZE_RATIO) {
      section = trimmed;
      break;
    }
  }

  return { text, section };
}
