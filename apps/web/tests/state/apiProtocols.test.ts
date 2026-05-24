import { describe, expect, it } from 'vitest';
import {
  API_KEY_PLACEHOLDERS,
  API_PROTOCOL_LABELS,
  API_PROTOCOL_TABS,
  DEFAULT_BASE_URL_BY_PROTOCOL,
  FAST_MODEL_BY_PROTOCOL,
  SUGGESTED_MODELS_BY_PROTOCOL,
} from '../../src/state/apiProtocols';
import type { ApiProtocol } from '../../src/types';

describe('apiProtocols metadata completeness', () => {
  const allProtocols: ApiProtocol[] = [
    'anthropic',
    'openai',
    'azure',
    'google',
    'ollama',
    'senseaudio',
    'kimi',
  ];

  it('every protocol has a suggested-models entry', () => {
    for (const protocol of allProtocols) {
      expect(SUGGESTED_MODELS_BY_PROTOCOL[protocol]).toBeDefined();
      expect(Array.isArray(SUGGESTED_MODELS_BY_PROTOCOL[protocol])).toBe(true);
    }
  });

  it('every protocol has a fast-model entry', () => {
    for (const protocol of allProtocols) {
      expect(FAST_MODEL_BY_PROTOCOL[protocol]).toBeDefined();
      expect(typeof FAST_MODEL_BY_PROTOCOL[protocol]).toBe('string');
    }
  });

  it('every protocol has a tab entry', () => {
    const tabIds = API_PROTOCOL_TABS.map((t) => t.id);
    for (const protocol of allProtocols) {
      expect(tabIds).toContain(protocol);
    }
  });

  it('every protocol has a label entry', () => {
    for (const protocol of allProtocols) {
      expect(API_PROTOCOL_LABELS[protocol]).toBeDefined();
      expect(typeof API_PROTOCOL_LABELS[protocol]).toBe('string');
    }
  });

  it('every protocol has an API key placeholder entry', () => {
    for (const protocol of allProtocols) {
      expect(API_KEY_PLACEHOLDERS[protocol]).toBeDefined();
      expect(typeof API_KEY_PLACEHOLDERS[protocol]).toBe('string');
    }
  });

  it('every protocol has a default base URL entry', () => {
    for (const protocol of allProtocols) {
      expect(DEFAULT_BASE_URL_BY_PROTOCOL[protocol]).toBeDefined();
      expect(typeof DEFAULT_BASE_URL_BY_PROTOCOL[protocol]).toBe('string');
    }
  });
});

describe('kimi-specific metadata', () => {
  it('lists expected kimi models', () => {
    expect(SUGGESTED_MODELS_BY_PROTOCOL.kimi).toEqual([
      'moonshot-v1-8k',
      'moonshot-v1-32k',
      'moonshot-v1-128k',
      'kimi-latest',
      'kimi-k2-turbo-preview',
    ]);
  });

  it('uses moonshot-v1-8k as the fast model', () => {
    expect(FAST_MODEL_BY_PROTOCOL.kimi).toBe('moonshot-v1-8k');
  });

  it('has the correct tab label', () => {
    const tab = API_PROTOCOL_TABS.find((t) => t.id === 'kimi');
    expect(tab).toBeDefined();
    expect(tab!.title).toBe('Kimi Code');
  });

  it('has the correct human label', () => {
    expect(API_PROTOCOL_LABELS.kimi).toBe('Kimi Code API');
  });

  it('has a kimi-shaped placeholder', () => {
    expect(API_KEY_PLACEHOLDERS.kimi).toBe('sk-kimi-...');
  });

  it('defaults to the global moonshot.ai endpoint', () => {
    expect(DEFAULT_BASE_URL_BY_PROTOCOL.kimi).toBe('https://api.moonshot.ai');
  });
});
