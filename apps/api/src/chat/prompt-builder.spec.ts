import { buildPrompt } from "./prompt-builder";

describe("buildPrompt", () => {
  const base = {
    documentTitle: "System Design Notes",
    currentPage: 43,
    currentPageChunks: [{ pageNumber: 43, text: "Consistent hashing distributes keys across a ring." }],
    semanticChunks: [],
    recentMessages: [],
    question: "Why do we need virtual nodes?",
  };

  it("always includes the current page and the question", () => {
    const { prompt } = buildPrompt(base);
    expect(prompt).toContain("page 43");
    expect(prompt).toContain("QUESTION: Why do we need virtual nodes?");
    expect(prompt).toContain("[Page 43] Consistent hashing distributes keys across a ring.");
  });

  it("puts selected text first when present", () => {
    const { prompt } = buildPrompt({ ...base, selectedText: "Virtual nodes smooth distribution." });
    const selectedIdx = prompt.indexOf("SELECTED TEXT");
    const contextIdx = prompt.indexOf("DOCUMENT CONTEXT");
    expect(selectedIdx).toBeGreaterThanOrEqual(0);
    expect(selectedIdx).toBeLessThan(contextIdx);
  });

  it("omits the DOCUMENT CONTEXT section entirely when there are no chunks", () => {
    const { prompt } = buildPrompt({ ...base, currentPageChunks: [], semanticChunks: [] });
    expect(prompt).not.toContain("DOCUMENT CONTEXT");
  });

  it("includes recent conversation history in order", () => {
    const { prompt } = buildPrompt({
      ...base,
      recentMessages: [
        { role: "USER", content: "What is sharding?" },
        { role: "ASSISTANT", content: "Splitting data across databases." },
      ],
    });
    const userIdx = prompt.indexOf("User: What is sharding?");
    const assistantIdx = prompt.indexOf("Assistant: Splitting data across databases.");
    expect(userIdx).toBeGreaterThanOrEqual(0);
    expect(assistantIdx).toBeGreaterThan(userIdx);
  });

  it("instructs the model not to fabricate citations", () => {
    const { systemInstruction } = buildPrompt(base);
    expect(systemInstruction).toMatch(/never invent a citation/i);
  });
});
