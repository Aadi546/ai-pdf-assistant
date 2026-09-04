export interface GenerateParams {
  prompt: string;
  systemInstruction?: string;
}

/**
 * Text generation contract — Gemini now, OpenAI/Anthropic/local later
 * without touching the chat pipeline that consumes this (Phase 9). Same
 * explicit-`apiKey` reasoning as Embedder: no ambient "current session" to
 * pull a key from outside an HTTP request.
 */
export interface AIProvider {
  generate(apiKey: string, params: GenerateParams): Promise<string>;
  stream(apiKey: string, params: GenerateParams): AsyncIterable<string>;
}

export const AI_PROVIDER = Symbol("AI_PROVIDER");
