import { PdfJsTextItem, summarizePage } from "./pdf-extraction.service";

function textItem(str: string, fontSize: number): PdfJsTextItem {
  // Unrotated-text transform matrix [scaleX, 0, 0, scaleY, x, y] — scaleY is
  // what summarizePage's Math.hypot(transform[2], transform[3]) reads as size.
  return { str, transform: [fontSize, 0, 0, fontSize, 0, 0] };
}

describe("summarizePage", () => {
  it("joins text runs into one page string", () => {
    const { text } = summarizePage([textItem("Hello", 12), textItem("world", 12)]);
    expect(text).toBe("Hello world");
  });

  it("returns no section when every run is the same size", () => {
    const { section } = summarizePage([
      textItem("Page one talks about consistent hashing.", 12),
      textItem("It reduces key redistribution.", 12),
    ]);
    expect(section).toBeNull();
  });

  it("detects a short, distinctly-larger run as the section heading", () => {
    const { section, text } = summarizePage([
      textItem("Consistent Hashing", 36),
      textItem("This chapter explains how consistent hashing works.", 12),
      textItem("It reduces the number of keys that must move.", 12),
      textItem("Virtual nodes smooth the distribution further.", 12),
    ]);
    expect(section).toBe("Consistent Hashing");
    expect(text).toContain("This chapter explains");
  });

  it("ignores a large run that reads more like a long sentence than a heading", () => {
    const longRun = "This is a full sentence rendered in a large font that is way too long to plausibly be a heading";
    const { section } = summarizePage([
      textItem(longRun, 36),
      textItem("Normal body text.", 12),
      textItem("More normal body text.", 12),
    ]);
    expect(section).toBeNull();
  });

  it("handles an empty page", () => {
    expect(summarizePage([])).toEqual({ text: "", section: null });
  });
});
