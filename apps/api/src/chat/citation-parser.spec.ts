import { extractCitedPages } from "./citation-parser";

describe("extractCitedPages", () => {
  it("extracts page numbers from citation markers", () => {
    expect(extractCitedPages("Consistent hashing helps here [Page 42].")).toEqual([42]);
  });

  it("dedupes and preserves first-seen order", () => {
    const text = "See [Page 5] and also [Page 3], which builds on [Page 5] again.";
    expect(extractCitedPages(text)).toEqual([5, 3]);
  });

  it("returns an empty array when there are no citations", () => {
    expect(extractCitedPages("No citations here.")).toEqual([]);
  });

  it("ignores malformed citation-like text", () => {
    expect(extractCitedPages("See [Page] and [Page abc] and (Page 5).")).toEqual([]);
  });
});
