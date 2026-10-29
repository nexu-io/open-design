import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { streamMessageOpenAI } from '../../src/providers/openai-compatible';
import { streamMessageAnthropicProxy } from '../../src/providers/anthropic-compatible';
import { SUGGESTED_MODELS_BY_PROTOCOL } from '../../src/state/apiProtocols';
import { DEFAULT_CONFIG, KNOWN_PROVIDERS, defaultKnownProviderModel, loadConfig, saveConfig } from '../../src/state/config';
import { mergeProviderModelOptions } from '../../src/components/providerModelsCache';
import { resolveByokModelPreference } from '../../src/components/byok/validation';

const current = ['MiniMax-M3.1-Flash', 'MiniMax-M3'];
const options = (ids: string[]) => ids.map((id) => ({ id, label: id }));

beforeEach(() => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  } });
});

afterEach(() => vi.unstubAllGlobals());

describe('MiniMax ordinary text choices', () => {
  it('exposes only current MiniMax models in built-in protocol and provider suggestions', () => {
    const lists = [...KNOWN_PROVIDERS.map((p) => p.preferredModels), ...Object.values(SUGGESTED_MODELS_BY_PROTOCOL)];
    for (const list of lists) {
      expect(list.filter((id) => /minimax/i.test(id)).every((id) => /^minimax-m3(?:\.1-flash)?$/i.test(id))).toBe(true);
    }
  });

  it.each(KNOWN_PROVIDERS.filter((p) => p.label.startsWith('MiniMax')))('serializes current and saved IDs for $label', async (provider) => {
    for (const model of [...current, 'MiniMax-M2.7', 'custom-model']) {
      const fetchMock = vi.fn(async () => new Response('event: end\ndata: {}\n\n'));
      vi.stubGlobal('fetch', fetchMock);
      const onError = vi.fn();
      const onDone = vi.fn();
      const stream = provider.protocol === 'anthropic' ? streamMessageAnthropicProxy : streamMessageOpenAI;
      await stream({ ...DEFAULT_CONFIG, apiKey: 'test-key', baseUrl: provider.baseUrl, model, maxTokens: 4096 },
        'Be concise.', [{ id: 'test', role: 'user', content: 'Hello' }],
        new AbortController().signal, { onDelta: vi.fn(), onDone, onError });
      expect(onError).not.toHaveBeenCalled();
      expect(onDone).toHaveBeenCalled();
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(`/api/proxy/${provider.protocol}/stream`);
      expect(JSON.parse(String(init.body))).toMatchObject({
        apiKey: 'test-key', baseUrl: provider.baseUrl, model, maxTokens: 4096,
        systemPrompt: 'Be concise.', messages: [{ role: 'user', content: 'Hello' }],
      });
    }
  });
  it('defaults all four direct endpoints to Flash, followed only by M3', () => {
    const providers = KNOWN_PROVIDERS.filter((p) => p.label.startsWith('MiniMax'));
    expect(providers).toHaveLength(4);
    for (const provider of providers) {
      expect(provider.preferredModels).toEqual(current);
      expect(defaultKnownProviderModel(provider)).toBe(current[0]);
      expect(provider.retiredModels).toBeUndefined();
    }
  });

  it('does not restore older text models from provider discovery', () => {
    expect(mergeProviderModelOptions(options([
      'MiniMax-M2.7', 'MiniMax-M3', 'MiniMax-M2.5-highspeed',
      'MiniMax-M3.1-Flash', 'MiniMax-Text-01',
    ]), current).map((m) => m.id)).toEqual(current);
  });

  it('filters gateway history while retaining metadata and unrelated/media models', () => {
    const flash = { id: 'minimax/minimax-m3.1-flash:free', label: 'Flash', enabled: false };
    const merged = mergeProviderModelOptions([
      ...options(['gpt-5', 'minimax/minimax-m2.7', 'minimax/minimax-m3']),
      flash, ...options(['image-01', 'speech-2.8-hd', 'MiniMax-Hailuo-2.3']),
    ], []);
    expect(merged.map((m) => m.id)).toEqual([
      'gpt-5', flash.id, 'minimax/minimax-m3', 'image-01', 'speech-2.8-hd', 'MiniMax-Hailuo-2.3',
    ]);
    expect(merged.find((m) => m.id === flash.id)).toEqual(flash);
  });

  it('never selects an older account model implicitly, but preserves explicit selections', () => {
    const accountModels = options(['MiniMax-M2.7']);
    expect(resolveByokModelPreference({ currentModel: '', accountModels, providerPreferredModels: current }).model).toBe('');
    for (const currentModel of ['MiniMax-M2.7', 'custom-model']) {
      expect(resolveByokModelPreference({ currentModel, accountModels, providerPreferredModels: current })).toEqual({ model: currentModel, source: 'explicit' });
    }
  });

  it.each(['MiniMax-M2.7', 'MiniMax-Text-01', 'custom-model'])('round-trips saved model %s without migration', (model) => {
    const config = { ...DEFAULT_CONFIG, apiProtocol: 'openai' as const, baseUrl: 'https://api.minimax.io/v1', model,
      apiProtocolConfigs: { openai: { baseUrl: 'https://api.minimax.io/v1', model, apiKey: '' } },
    };
    saveConfig(config);
    const restored = loadConfig();
    expect(restored.model).toBe(model);
    expect(restored.apiProtocolConfigs.openai?.model).toBe(model);
  });
});
