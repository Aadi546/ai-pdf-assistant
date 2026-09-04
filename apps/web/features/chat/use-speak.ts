"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { findVoiceByURI, loadVoices, pickDefaultVoice } from "./voices";

const VOICE_PREFERENCE_KEY = "ai-pdf:voice-uri";

/**
 * Reads text aloud via the browser's built-in SpeechSynthesis — no server
 * round-trip, no new dependency. Two ways to use it:
 * - `speak(id, text)`: interrupt-and-replay — used for the manual "read
 *   this message aloud" button on a past message.
 * - `enqueueForMessage(id, text)`: appends to the browser's speech queue
 *   without interrupting what's already playing — used for auto-read,
 *   where each streamed sentence is queued as it arrives so playback
 *   starts on the first sentence instead of waiting for the whole answer.
 *
 * Voice selection: auto-picks the best-scoring installed voice (see
 * voices.ts — biased toward en-IN + male-sounding names) unless the user
 * has explicitly picked one via `setVoice`, which is remembered per-browser.
 */
export function useSpeak() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string | null>(null);
  const activeMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    loadVoices().then((loaded) => {
      setVoices(loaded);
      const saved = localStorage.getItem(VOICE_PREFERENCE_KEY);
      if (saved && findVoiceByURI(loaded, saved)) {
        setSelectedVoiceURI(saved);
      } else {
        setSelectedVoiceURI(pickDefaultVoice(loaded)?.voiceURI ?? null);
      }
    });
  }, []);

  const setVoice = useCallback((voiceURI: string) => {
    setSelectedVoiceURI(voiceURI);
    localStorage.setItem(VOICE_PREFERENCE_KEY, voiceURI);
  }, []);

  const activeVoice = selectedVoiceURI ? findVoiceByURI(voices, selectedVoiceURI) : null;

  const applyVoice = useCallback(
    (utterance: SpeechSynthesisUtterance) => {
      if (activeVoice) {
        utterance.voice = activeVoice;
        utterance.lang = activeVoice.lang;
      }
    },
    [activeVoice],
  );

  const speak = useCallback(
    (id: string, text: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;

      window.speechSynthesis.cancel();
      activeMessageIdRef.current = null;
      if (speakingId === id) {
        setSpeakingId(null);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      applyVoice(utterance);
      utterance.onend = () => setSpeakingId(null);
      utterance.onerror = () => setSpeakingId(null);
      setSpeakingId(id);
      window.speechSynthesis.speak(utterance);
    },
    [speakingId, applyVoice],
  );

  /** Queues one sentence for a still-streaming message without cutting off whatever's already playing. */
  const enqueueForMessage = useCallback(
    (id: string, sentence: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis || !sentence.trim()) return;

      if (activeMessageIdRef.current !== id) {
        // A new message started auto-reading — that should take over, same
        // as clicking a different message's speaker button would.
        window.speechSynthesis.cancel();
        activeMessageIdRef.current = id;
      }

      const utterance = new SpeechSynthesisUtterance(sentence);
      applyVoice(utterance);
      utterance.onstart = () => setSpeakingId(id);
      utterance.onend = () => {
        // Only clear if nothing else got queued behind this one.
        if (window.speechSynthesis.pending === false && window.speechSynthesis.speaking === false) {
          setSpeakingId((current) => (current === id ? null : current));
        }
      };
      window.speechSynthesis.speak(utterance);
    },
    [applyVoice],
  );

  const stop = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    activeMessageIdRef.current = null;
    setSpeakingId(null);
  }, []);

  return { speak, enqueueForMessage, stop, speakingId, voices, selectedVoiceURI, setVoice };
}
