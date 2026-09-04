/**
 * Shared constants for the ingestion pipeline (apps/api) and any
 * frontend code that needs to reason about chunk sizing (e.g. progress
 * estimates). Kept here so the two apps can't silently drift apart.
 */
export const CHUNKING = {
  MAX_TOKENS_PER_CHUNK: 500,
  CHUNK_OVERLAP_TOKENS: 100,
  MAX_UPLOAD_SIZE_BYTES: 50 * 1024 * 1024,
} as const;

// Rough English-text heuristic (not a real tokenizer — pulling in tiktoken
// for chunk-sizing alone isn't worth the dependency at V1 scale; the
// embedding API call in a later phase is what actually enforces hard
// token limits). ~1.3 tokens per word is a commonly-cited approximation
// for GPT-family tokenizers on English prose.
const TOKENS_PER_WORD_ESTIMATE = 1.3;

export interface TextChunk {
  chunkIndex: number;
  text: string;
}

/**
 * Splits one page's text into one or more chunks, never spanning pages
 * (the caller passes page-scoped text; a page under the size limit becomes
 * exactly one chunk). Long pages get an overlapping sliding window so a
 * concept split across the boundary still appears whole in at least one
 * chunk.
 */
export function chunkPageText(text: string): TextChunk[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const wordsPerChunk = Math.max(1, Math.round(CHUNKING.MAX_TOKENS_PER_CHUNK / TOKENS_PER_WORD_ESTIMATE));
  const overlapWords = Math.round(CHUNKING.CHUNK_OVERLAP_TOKENS / TOKENS_PER_WORD_ESTIMATE);

  if (words.length <= wordsPerChunk) {
    return [{ chunkIndex: 0, text: words.join(" ") }];
  }

  const step = Math.max(1, wordsPerChunk - overlapWords);
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;
  for (let start = 0; start < words.length; start += step) {
    const slice = words.slice(start, start + wordsPerChunk);
    chunks.push({ chunkIndex: chunkIndex++, text: slice.join(" ") });
    if (start + wordsPerChunk >= words.length) break;
  }
  return chunks;
}
