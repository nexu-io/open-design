import { describe, expect, it } from 'vitest';

import {
  isCustomByokBaseUrl,
  type ByokChatProtocol,
} from '../src/api/chat.js';

describe('isCustomByokBaseUrl', () => {
  it.each([
    ['anthropic', 'https://api.anthropic.com'],
    ['anthropic', 'https://api.anthropic.com/v1'],
    ['openai', 'https://api.openai.com'],
    ['openai', 'https://api.openai.com/v1'],
    ['google', 'https://generativelanguage.googleapis.com'],
    ['google', 'https://generativelanguage.googleapis.com/v1beta'],
    ['ollama', 'https://ollama.com'],
    ['ollama', 'https://ollama.com/v1'],
    ['ollama', 'https://ollama.com/api'],
    ['senseaudio', 'https://api.senseaudio.cn'],
    ['aihubmix', 'https://aihubmix.com/v1'],
  ] satisfies Array<[ByokChatProtocol, string]>)(
    'treats the %s runtime alias %s as built in',
    (protocol, baseUrl) => {
      expect(isCustomByokBaseUrl(protocol, baseUrl)).toBe(false);
      expect(isCustomByokBaseUrl(protocol, `${baseUrl}/`)).toBe(false);
    },
  );

  it.each([
    ['anthropic', 'https://api.anthropic.com/api'],
    ['openai', 'https://api.openai.com/v1beta'],
    ['google', 'https://generativelanguage.googleapis.com/v1'],
    ['ollama', 'https://ollama.com/v1beta'],
    ['senseaudio', 'https://api.senseaudio.cn/api'],
    ['aihubmix', 'https://aihubmix.com'],
  ] satisfies Array<[ByokChatProtocol, string]>)(
    'preserves the %s same-origin custom endpoint %s',
    (protocol, baseUrl) => {
      expect(isCustomByokBaseUrl(protocol, baseUrl)).toBe(true);
    },
  );

  it('keeps deeper paths and different origins custom', () => {
    expect(isCustomByokBaseUrl('anthropic', 'https://api.anthropic.com/api/v1')).toBe(true);
    expect(isCustomByokBaseUrl('ollama', 'https://ollama.com/api/v1')).toBe(true);
    expect(isCustomByokBaseUrl('openai', 'https://gateway.internal/v1')).toBe(true);
  });

  it('treats every explicit Azure endpoint as custom and empty values as unset', () => {
    expect(isCustomByokBaseUrl('azure', 'https://resource.openai.azure.com/openai/v1')).toBe(true);
    expect(isCustomByokBaseUrl('azure', '')).toBe(false);
    expect(isCustomByokBaseUrl('openai', null)).toBe(false);
  });

  it('fails malformed explicit endpoints closed as custom', () => {
    expect(isCustomByokBaseUrl('openai', 'not a URL')).toBe(true);
  });
});
