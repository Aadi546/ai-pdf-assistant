/** Pulls "[Page N]" markers out of the assistant's own response text, in first-seen order, deduped. */
export function extractCitedPages(text: string): number[] {
  const pages: number[] = [];
  const seen = new Set<number>();
  for (const match of text.matchAll(/\[Page (\d+)\]/g)) {
    const page = Number(match[1]);
    if (Number.isFinite(page) && !seen.has(page)) {
      seen.add(page);
      pages.push(page);
    }
  }
  return pages;
}
