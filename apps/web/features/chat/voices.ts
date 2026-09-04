"use client";

// Common Microsoft/Google Indian-English voice names, by gender. Voice
// names aren't standardized across browsers/OSes, so this is a best-effort
// heuristic, not a guarantee — the manual picker in the UI is the fallback
// for whenever it guesses wrong on a given machine.
const MALE_NAME_HINTS = ["ravi", "prabhat", "puneet", "hemant", "male"];
const FEMALE_NAME_HINTS = ["heera", "kalpana", "lekha", "neerja", "female"];

/**
 * `speechSynthesis.getVoices()` is notoriously async on first load in most
 * browsers — it can return an empty array until the `voiceschanged` event
 * fires once the OS/browser finishes enumerating installed voices. This
 * waits for that instead of racing it.
 */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve([]);
      return;
    }
    const existing = window.speechSynthesis.getVoices();
    if (existing.length > 0) {
      resolve(existing);
      return;
    }
    window.speechSynthesis.onvoiceschanged = () => {
      resolve(window.speechSynthesis.getVoices());
    };
    // Some browsers never fire voiceschanged if voices were already ready
    // by the time we checked — fall back after a short wait either way.
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 500);
  });
}

function score(voice: SpeechSynthesisVoice): number {
  const lang = voice.lang.toLowerCase();
  const name = voice.name.toLowerCase();
  let s = 0;
  if (lang === "en-in") s += 10;
  else if (lang.startsWith("en-in")) s += 8;
  else if (lang.startsWith("en")) s += 1;
  if (MALE_NAME_HINTS.some((hint) => name.includes(hint))) s += 5;
  if (FEMALE_NAME_HINTS.some((hint) => name.includes(hint))) s -= 3;
  if (voice.localService) s += 1; // local voices are usually lower-latency than network ones
  return s;
}

/** Best-guess default: highest-scoring voice by the en-IN + male-name heuristic above. */
export function pickDefaultVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  return [...voices].sort((a, b) => score(b) - score(a))[0] ?? null;
}

export function findVoiceByURI(voices: SpeechSynthesisVoice[], voiceURI: string): SpeechSynthesisVoice | null {
  return voices.find((v) => v.voiceURI === voiceURI) ?? null;
}
