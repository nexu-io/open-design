import { useCallback, useEffect, useRef, useState } from 'react';
import { getOpenDesignHost } from '@open-design/host';
import {
  isElectronRuntime,
  isLocalTranscriptionSupported,
  startMicRecording,
  transcribeLocally,
  whisperLanguageForLocale,
  type MicRecording,
} from './local-transcriber';

/**
 * Voice dictation for the composers. Three engines, in order of preference:
 *  - `native`: Apple's Speech framework, run by the desktop app's `od-speech`
 *    helper (macOS). True streaming, on-device when the language supports it.
 *  - `browser`: the Web Speech API (`SpeechRecognition`), live as you speak.
 *  - `local`: record the mic and transcribe with Whisper running in a worker
 *    (see `local-transcriber.ts`). Used in the Electron desktop app, where the
 *    Web Speech API has no recognition backend, as the cross-platform fallback
 *    when native recognition is unavailable, and when the browser engine fails
 *    with a network / service error.
 *
 * Spoken words are handed to `onText` together with the text that was already
 * in the composer when dictation started, so dictating never clobbers a draft.
 *
 * Nothing is sent: dictation only edits the draft, the user still presses send.
 */

// The DOM lib does not ship Web Speech typings, so declare the small surface
// this hook uses.
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export function getSpeechRecognitionCtor(
  scope: unknown = typeof window === 'undefined' ? undefined : window,
): SpeechRecognitionCtor | null {
  if (!scope || typeof scope !== 'object') return null;
  const w = scope as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Join already-typed text and a dictated chunk with a single separating space. */
export function mergeDictation(base: string, spoken: string): string {
  const chunk = spoken.trim();
  if (!chunk) return base;
  if (!base.trim()) return chunk;
  return /\s$/.test(base) ? `${base}${chunk}` : `${base} ${chunk}`;
}

/** Root-mean-square level of `samples` from index `from` to the end. */
export function rms(samples: Float32Array, from = 0): number {
  const n = samples.length - from;
  if (n <= 0) return 0;
  let sum = 0;
  for (let i = from; i < samples.length; i += 1) sum += samples[i]! * samples[i]!;
  return Math.sqrt(sum / n);
}

// Below this level a stretch of audio is treated as silence (typical speech is
// 0.02–0.1, a quiet room well under 0.005).
const SILENCE_RMS = 0.008;

/**
 * Cut leading and trailing silence (keeping a short pad). Whisper invents text
 * ("Thanks for watching", stray numbers) when fed long silence, so only the
 * spoken part is sent. Returns an empty array when there is no speech at all.
 */
export function trimSilence(samples: Float32Array, windowSize = 1600, pad = 3200): Float32Array {
  let first = -1;
  let last = -1;
  for (let start = 0; start < samples.length; start += windowSize) {
    const end = Math.min(start + windowSize, samples.length);
    let sum = 0;
    for (let i = start; i < end; i += 1) sum += samples[i]! * samples[i]!;
    if (Math.sqrt(sum / (end - start)) >= SILENCE_RMS) {
      if (first < 0) first = start;
      last = end;
    }
  }
  if (first < 0) return new Float32Array(0);
  return samples.slice(Math.max(0, first - pad), Math.min(samples.length, last + pad));
}

export type DictationEngine = 'native' | 'browser' | 'local';

/** Errors that mean the user has not (yet) granted a privacy permission. */
export function isVoicePermissionError(code: string | null): boolean {
  return code === 'speech-denied' || code === 'mic-denied' || code === 'not-allowed';
}

/** Native failures that are about the engine itself, so another engine may help. */
const NATIVE_FALLBACK_ERRORS = new Set([
  'locale-unsupported',
  'recognizer-unavailable',
  'audio-engine-failed',
  'helper-failed',
  'recognition-failed',
]);

/** Which engine to use right now; null when dictation is impossible here. */
export function chooseDictationEngine(forceLocal = false, nativeAvailable = false): DictationEngine | null {
  if (nativeAvailable) return 'native';
  const local = isLocalTranscriptionSupported();
  const browser = getSpeechRecognitionCtor() !== null;
  if (local && (forceLocal || isElectronRuntime() || !browser)) return 'local';
  if (browser) return 'browser';
  return null;
}

export interface VoiceDictationOptions {
  /** BCP-47 language tag, e.g. `de` or `zh-CN`. */
  lang: string;
  /** Reads the composer's current text at the moment dictation starts. */
  getBaseText: () => string;
  /** Receives the full new draft (base text + everything dictated so far). */
  onText: (text: string) => void;
}

export interface VoiceDictation {
  supported: boolean;
  listening: boolean;
  /** Local engine only: audio is recorded and being turned into text. */
  transcribing: boolean;
  /** Last failure, e.g. `not-allowed` (mic denied) or `network`; null otherwise. */
  error: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

export function useVoiceDictation({ lang, getBaseText, onText }: VoiceDictationOptions): VoiceDictation {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forceLocal, setForceLocal] = useState(false);
  // null until the desktop host answers; false when there is no native recognizer.
  const [nativeAvailable, setNativeAvailable] = useState<boolean | null>(null);
  const nativeRef = useRef<{ unsubscribe: () => void } | null>(null);
  const fallbackRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recordingRef = useRef<MicRecording | null>(null);
  const baseRef = useRef('');
  const unmountedRef = useRef(false);
  const liveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveBusyRef = useRef(false);
  const liveSeqRef = useRef(0);
  const liveLenRef = useRef(0);
  const onTextRef = useRef(onText);
  const getBaseTextRef = useRef(getBaseText);
  onTextRef.current = onText;
  getBaseTextRef.current = getBaseText;
  const engine = chooseDictationEngine(forceLocal, nativeAvailable === true);
  const supported = engine !== null;

  useEffect(() => {
    let cancelled = false;
    const speech = getOpenDesignHost()?.speech;
    if (!speech) {
      setNativeAvailable(false);
      return undefined;
    }
    speech
      .isAvailable()
      .then((available) => {
        if (!cancelled) setNativeAvailable(available === true);
      })
      .catch(() => {
        if (!cancelled) setNativeAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const clearLiveTimer = useCallback(() => {
    if (liveTimerRef.current) clearInterval(liveTimerRef.current);
    liveTimerRef.current = null;
    // Results of in-flight interim jobs must not overwrite the final text.
    liveSeqRef.current += 1;
  }, []);

  const startLocal = useCallback(async () => {
    if (recordingRef.current) return;
    baseRef.current = getBaseTextRef.current();
    setError(null);
    try {
      const recording = await startMicRecording();
      recordingRef.current = recording;
      liveLenRef.current = 0;
      liveBusyRef.current = false;
      // Live feel: every ~1.2 s re-transcribe what has been said so far (fast on
      // WebGPU) and show it as it grows. The final pass on stop is authoritative.
      liveTimerRef.current = setInterval(() => {
        if (liveBusyRef.current || recordingRef.current !== recording) return;
        const audio = recording.snapshot();
        // Skip stray noise, very long takes (the final pass handles those) and
        // moments where hardly anything new was said.
        if (audio.length < 16000 || audio.length > 16000 * 28) return;
        if (audio.length - liveLenRef.current < 8000) return;
        // Nothing but silence since the last pass: do not burn cycles on it.
        if (rms(audio, liveLenRef.current) < SILENCE_RMS) return;
        liveLenRef.current = audio.length;
        const speech = trimSilence(audio);
        if (speech.length < 8000) return;
        liveBusyRef.current = true;
        const seq = liveSeqRef.current;
        transcribeLocally(speech, whisperLanguageForLocale(lang))
          .then((text) => {
            if (
              !unmountedRef.current &&
              seq === liveSeqRef.current &&
              recordingRef.current === recording
            ) {
              onTextRef.current(mergeDictation(baseRef.current, text));
            }
          })
          .catch(() => undefined)
          .finally(() => {
            liveBusyRef.current = false;
          });
      }, 1200);
      setListening(true);
    } catch (e) {
      recordingRef.current = null;
      setError(e instanceof Error && e.name === 'NotAllowedError' ? 'not-allowed' : 'mic-unavailable');
    }
  }, [lang]);

  const stopLocal = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    recordingRef.current = null;
    clearLiveTimer();
    setListening(false);
    setTranscribing(true);
    try {
      const audio = trimSilence(await recording.stop());
      // Under half a second of speech is a stray click, not dictation.
      if (audio.length > 8000) {
        const text = await transcribeLocally(audio, whisperLanguageForLocale(lang));
        if (!unmountedRef.current) onTextRef.current(mergeDictation(baseRef.current, text));
      }
    } catch {
      if (!unmountedRef.current) setError('transcription-failed');
    } finally {
      if (!unmountedRef.current) setTranscribing(false);
    }
  }, [clearLiveTimer, lang]);

  const endNative = useCallback(() => {
    nativeRef.current?.unsubscribe();
    nativeRef.current = null;
    setListening(false);
    setTranscribing(false);
  }, []);

  const startNative = useCallback(async () => {
    const speech = getOpenDesignHost()?.speech;
    if (!speech || nativeRef.current) return;
    baseRef.current = getBaseTextRef.current();
    setError(null);
    const unsubscribe = speech.subscribe((event) => {
      if (unmountedRef.current) return;
      switch (event.type) {
        case 'partial':
        case 'final':
          onTextRef.current(mergeDictation(baseRef.current, event.text));
          break;
        case 'error':
          if (NATIVE_FALLBACK_ERRORS.has(event.code) && isLocalTranscriptionSupported()) {
            // Engine-level failure (e.g. no Apple recognizer for this language):
            // continue with local Whisper instead of giving up. The helper exits
            // right after, and `ended` below starts the fallback.
            fallbackRef.current = true;
            setNativeAvailable(false);
          } else {
            setError(event.code);
          }
          break;
        case 'ended':
          endNative();
          if (fallbackRef.current) {
            fallbackRef.current = false;
            void startLocal();
          }
          break;
        default:
          break;
      }
    });
    nativeRef.current = { unsubscribe };
    const result = await speech.start({ locale: lang });
    if (!result.ok) {
      endNative();
      setError('start-failed');
      return;
    }
    setListening(true);
  }, [endNative, lang, startLocal]);

  const stopNative = useCallback(() => {
    if (!nativeRef.current) return;
    // The final text and `ended` follow; keep the busy state until then.
    setListening(false);
    setTranscribing(true);
    void getOpenDesignHost()?.speech?.stop();
  }, []);

  const startBrowser = useCallback(() => {
    if (recognitionRef.current) return;
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError('unsupported');
      return;
    }
    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    const base = getBaseTextRef.current();
    recognition.onresult = (event) => {
      let spoken = '';
      for (let i = 0; i < event.results.length; i += 1) {
        spoken += event.results[i]![0].transcript;
      }
      onTextRef.current(mergeDictation(base, spoken));
    };
    recognition.onerror = (event) => {
      // `no-speech` / `aborted` are routine (silence, manual stop), not failures.
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      // No recognition backend here (e.g. Electron): switch to local Whisper.
      if (
        (event.error === 'network' || event.error === 'service-not-allowed') &&
        isLocalTranscriptionSupported()
      ) {
        setForceLocal(true);
        void startLocal();
        return;
      }
      setError(event.error);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening((current) => (recordingRef.current ? current : false));
    };
    recognitionRef.current = recognition;
    setError(null);
    try {
      recognition.start();
      setListening(true);
    } catch {
      recognitionRef.current = null;
      setError('start-failed');
    }
  }, [lang, startLocal]);

  const start = useCallback(() => {
    if (transcribing) return;
    const chosen = chooseDictationEngine(forceLocal, nativeAvailable === true);
    if (chosen === 'native') void startNative();
    else if (chosen === 'local') void startLocal();
    else startBrowser();
  }, [forceLocal, nativeAvailable, startBrowser, startLocal, startNative, transcribing]);

  const stop = useCallback(() => {
    if (nativeRef.current) stopNative();
    else if (recordingRef.current) void stopLocal();
    else recognitionRef.current?.stop();
  }, [stopLocal, stopNative]);

  const toggle = useCallback(() => {
    if (transcribing) return;
    if (nativeRef.current || recognitionRef.current || recordingRef.current) stop();
    else start();
  }, [start, stop, transcribing]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      if (liveTimerRef.current) clearInterval(liveTimerRef.current);
      if (nativeRef.current) {
        nativeRef.current.unsubscribe();
        nativeRef.current = null;
        void getOpenDesignHost()?.speech?.stop();
      }
      recordingRef.current?.cancel();
      recordingRef.current = null;
    };
  }, []);

  return { supported, listening, transcribing, error, start, stop, toggle };
}
