import { describe, expect, it } from 'vitest';

import { byokPreflightBlockReason } from '../../src/components/byok/preflight';

const anthropicPreset = {
  apiProtocol: 'anthropic' as const,
  apiProviderBaseUrl: null,
  apiKey: 'sk-ant-test',
  baseUrl: 'https://api.anthropic.com',
};

describe('byokPreflightBlockReason default-model sentinel', () => {
  it('blocks the `default` sentinel on a built-in provider preset', () => {
    expect(byokPreflightBlockReason({ ...anthropicPreset, model: 'default' })).toBe(
      'model_default',
    );
  });

  it('accepts a literal `default` model on a custom base URL', () => {
    expect(
      byokPreflightBlockReason({
        ...anthropicPreset,
        apiProtocol: 'openai',
        baseUrl: 'https://llm.internal.example/v1',
        model: 'default',
      }),
    ).toBeNull();
  });

  it('accepts a literal `default` model on a listed custom gateway preset', () => {
    // OpenRouter ships as a KNOWN_PROVIDERS preset but is not the protocol's
    // built-in endpoint, so gateways that route behind a `default` alias
    // must not be blocked just because the URL is recognized.
    expect(
      byokPreflightBlockReason({
        ...anthropicPreset,
        apiProtocol: 'openai',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'default',
      }),
    ).toBeNull();
  });

  it.each([
    ['anthropic', 'https://api.anthropic.com/api', 'sk-ant-test'],
    ['openai', 'https://api.openai.com/v1beta', 'sk-openai-test'],
    ['google', 'https://generativelanguage.googleapis.com/v1', 'AIza-test'],
    ['ollama', 'https://ollama.com/v1beta', 'test-key'],
    ['senseaudio', 'https://api.senseaudio.cn/api', 'test-key'],
    ['aihubmix', 'https://aihubmix.com', 'test-key'],
  ] as const)(
    'accepts a literal `default` model on the %s same-origin custom endpoint',
    (apiProtocol, baseUrl, apiKey) => {
      expect(
        byokPreflightBlockReason({
          ...anthropicPreset,
          apiProtocol,
          apiKey,
          baseUrl,
          model: 'default',
        }),
      ).toBeNull();
    },
  );

  it('still blocks a missing model on a custom base URL', () => {
    expect(
      byokPreflightBlockReason({
        ...anthropicPreset,
        apiProtocol: 'openai',
        baseUrl: 'https://llm.internal.example/v1',
        model: '',
      }),
    ).toBe('model_required');
  });
});
