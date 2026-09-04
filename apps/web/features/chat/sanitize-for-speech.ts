const CITATION_PATTERN = /\[Page \d+\]/g;

/**
 * Strips markdown syntax and citation markers before handing text to
 * SpeechSynthesis — otherwise it reads the literal symbols aloud
 * ("asterisk asterisk bold asterisk asterisk"), which nobody wants. This is
 * the one place that logic lives; both the incremental auto-read path
 * (use-chat.ts) and the manual per-message replay button (message-bubble)
 * route through it so they can't drift apart.
 */
export function sanitizeForSpeech(text: string): string {
  return (
    text
      .replace(CITATION_PATTERN, "")
      // Bold/italic: **text**, __text__, *text*, _text_ → text
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(\*|_)(.*?)\1/g, "$2")
      // Inline code and code fences → just the content
      .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ""))
      .replace(/`([^`]+)`/g, "$1")
      // Markdown links [text](url) → text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Heading markers, blockquote markers, bullet/numbered list markers at line start
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^>\s?/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+[.)]\s+/gm, "")
      // Stray formatting leftovers
      .replace(/[*_#`]/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}
