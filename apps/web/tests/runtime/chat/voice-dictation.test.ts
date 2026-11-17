import { describe, expect, it } from 'vitest';
import { getSpeechRecognitionCtor, mergeDictation } from '../../../src/runtime/chat/voice-dictation';

describe('mergeDictation', () => {
  it('uses the spoken text when the draft is empty', () => {
    expect(mergeDictation('', '  hello world ')).toBe('hello world');
  });
  it('appends after existing text with one space', () => {
    expect(mergeDictation('make it blue', 'and bigger')).toBe('make it blue and bigger');
  });
  it('does not double the separator after trailing whitespace or newline', () => {
    expect(mergeDictation('line one\n', 'line two')).toBe('line one\nline two');
  });
  it('keeps the draft untouched when nothing was spoken yet', () => {
    expect(mergeDictation('draft', '   ')).toBe('draft');
  });
});

describe('getSpeechRecognitionCtor', () => {
  it('returns null when the API is missing', () => {
    expect(getSpeechRecognitionCtor({})).toBeNull();
  });
  it('prefers the standard name, falls back to webkit', () => {
    class A {}
    class B {}
    expect(getSpeechRecognitionCtor({ SpeechRecognition: A, webkitSpeechRecognition: B })).toBe(A);
    expect(getSpeechRecognitionCtor({ webkitSpeechRecognition: B })).toBe(B);
  });
});

import { chooseDictationEngine } from '../../../src/runtime/chat/voice-dictation';
import { whisperLanguageForLocale } from '../../../src/runtime/chat/local-transcriber';

describe('whisperLanguageForLocale', () => {
  it('maps UI locales to whisper language codes', () => {
    expect(whisperLanguageForLocale('de')).toBe('de');
    expect(whisperLanguageForLocale('zh-TW')).toBe('zh');
    expect(whisperLanguageForLocale('pt-BR')).toBe('pt');
  });
});

describe('chooseDictationEngine', () => {
  it('returns null when neither engine exists (node/jsdom without media APIs)', () => {
    expect(chooseDictationEngine()).toBeNull();
  });
});

import { rms, trimSilence } from '../../../src/runtime/chat/voice-dictation';

describe('silence handling', () => {
  const tone = (n: number, amp: number) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin(i / 5));
  it('measures rms from an offset', () => {
    const a = new Float32Array(16000);
    a.set(tone(8000, 0.5), 8000);
    expect(rms(a, 0)).toBeGreaterThan(0.1);
    expect(rms(a, 0)).toBeLessThan(rms(a, 8000));
  });
  it('trims leading and trailing silence but keeps the speech', () => {
    const audio = new Float32Array(48000);
    audio.set(tone(8000, 0.3), 16000);
    const out = trimSilence(audio);
    expect(out.length).toBeLessThan(audio.length / 2);
    expect(out.length).toBeGreaterThanOrEqual(8000);
  });
  it('returns nothing for pure silence', () => {
    expect(trimSilence(new Float32Array(32000)).length).toBe(0);
  });
});

import { isVoicePermissionError } from '../../../src/runtime/chat/voice-dictation';

describe('native engine', () => {
  it('is preferred whenever the desktop host offers it', () => {
    expect(chooseDictationEngine(false, true)).toBe('native');
    expect(chooseDictationEngine(true, true)).toBe('native');
  });
  it('classifies permission errors', () => {
    for (const code of ['speech-denied', 'mic-denied', 'not-allowed']) expect(isVoicePermissionError(code)).toBe(true);
    for (const code of ['network', 'helper-failed', null]) expect(isVoicePermissionError(code)).toBe(false);
  });
});
