import { GeminiProvider } from "./gemini-provider.service";

const mockEmbedContent = jest.fn();
const mockGenerateContent = jest.fn();

jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      embedContent: (...args: unknown[]) => mockEmbedContent(...args),
      generateContent: (...args: unknown[]) => mockGenerateContent(...args),
    },
  })),
}));

function rateLimitError(retryDelaySeconds: number) {
  return new Error(
    JSON.stringify({
      error: {
        code: 429,
        status: "RESOURCE_EXHAUSTED",
        message: `You exceeded your current quota. Please retry in ${retryDelaySeconds}s.`,
        details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: `${retryDelaySeconds}s` }],
      },
    }),
  );
}

describe("GeminiProvider rate-limit handling", () => {
  let provider: GeminiProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    provider = new GeminiProvider();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("retries a 429 honoring the server's retryDelay hint, then succeeds", async () => {
    mockEmbedContent
      .mockRejectedValueOnce(rateLimitError(2))
      .mockResolvedValueOnce({ embeddings: [{ values: [1, 0, 0] }] });

    const resultPromise = provider.embedBatch("fake-key", ["hello"]);
    await jest.advanceTimersByTimeAsync(2000);
    const result = await resultPromise;

    expect(result).toEqual([[1, 0, 0]]);
    expect(mockEmbedContent).toHaveBeenCalledTimes(2);
  });

  it("gives up after exhausting retries with a short, human message instead of the raw API error", async () => {
    mockEmbedContent.mockRejectedValue(rateLimitError(1));

    const resultPromise = provider.embedBatch("fake-key", ["hello"]);
    // catch synchronously-attached rejection before advancing timers, so an
    // unhandled-rejection warning doesn't fire while fake timers run
    const assertion = expect(resultPromise).rejects.toThrow(/rate limit is still being hit/i);
    await jest.advanceTimersByTimeAsync(60_000);
    await assertion;
  });

  it("never retries a non-rate-limit error", async () => {
    mockEmbedContent.mockRejectedValue(new Error("API key not valid"));

    await expect(provider.embedBatch("bad-key", ["hello"])).rejects.toThrow("API key not valid");
    expect(mockEmbedContent).toHaveBeenCalledTimes(1);
  });

  it("passes each text as its own Content object, not an aggregated array of strings", async () => {
    mockEmbedContent.mockResolvedValue({ embeddings: [{ values: [1] }, { values: [0] }] });

    await provider.embedBatch("fake-key", ["a", "b"]);

    expect(mockEmbedContent).toHaveBeenCalledWith(
      expect.objectContaining({ contents: [{ parts: [{ text: "a" }] }, { parts: [{ text: "b" }] }] }),
    );
  });
});
