import { ConfigService } from "@nestjs/config";
import { GeminiProvider } from "./gemini-provider.service";

const mockEmbedContent = jest.fn();
const mockGenerateContent = jest.fn();

// Defined inside the factory, not hoisted above it, since jest.mock() itself
// is hoisted to the top of the file by babel — a `class` declared outside
// would be accessed before its own initialization.
jest.mock("@google/genai", () => {
  class FakeApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return {
    ApiError: FakeApiError,
    GoogleGenAI: jest.fn().mockImplementation(() => ({
      models: {
        embedContent: (...args: unknown[]) => mockEmbedContent(...args),
        generateContent: (...args: unknown[]) => mockGenerateContent(...args),
      },
    })),
  };
});

const { ApiError: FakeApiError } = jest.requireMock<{ ApiError: new (message: string, status: number) => Error }>(
  "@google/genai",
);

/** Pacing is a no-op in these tests (EMBED_MIN_INTERVAL_MS=0) — they're testing retry/backoff, not pacing. */
const noPacingConfig = { get: (key: string) => (key === "EMBED_MIN_INTERVAL_MS" ? "0" : undefined) } as ConfigService;

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
    provider = new GeminiProvider(noPacingConfig);
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

  it("retries a structured ApiError({status: 429}) even without a RESOURCE_EXHAUSTED message", async () => {
    mockEmbedContent
      .mockRejectedValueOnce(new FakeApiError("Too many requests", 429))
      .mockResolvedValueOnce({ embeddings: [{ values: [1, 0, 0] }] });

    const resultPromise = provider.embedBatch("fake-key", ["hello"]);
    await jest.advanceTimersByTimeAsync(DEFAULT_BACKOFF_MS_FOR_TEST);
    const result = await resultPromise;

    expect(result).toEqual([[1, 0, 0]]);
    expect(mockEmbedContent).toHaveBeenCalledTimes(2);
  });

  it("does not misclassify an unrelated error whose message happens to mention 429", async () => {
    // A structured ApiError with a non-429 status (e.g. a 404 for a
    // deprecated model) must never be retried just because its text
    // contains the digits "429" somewhere incidentally.
    mockEmbedContent.mockRejectedValue(new FakeApiError("model page 429 of the docs is deprecated", 404));

    await expect(provider.embedBatch("fake-key", ["hello"])).rejects.toThrow(/deprecated/);
    expect(mockEmbedContent).toHaveBeenCalledTimes(1);
  });

  it("honors a higher maxRetries for the bulk embedding path", async () => {
    mockEmbedContent.mockRejectedValue(rateLimitError(0));

    const resultPromise = provider.embedBatch("fake-key", ["hello"]);
    const assertion = expect(resultPromise).rejects.toThrow(/rate limit is still being hit/i);
    await jest.advanceTimersByTimeAsync(120_000);
    await assertion;
    // Default embedMaxRetries is 5 (6 total attempts) vs. the interactive default of 3.
    expect(mockEmbedContent).toHaveBeenCalledTimes(6);
  });
});

const DEFAULT_BACKOFF_MS_FOR_TEST = 3000;
