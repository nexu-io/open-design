import { describe, expect, it } from 'vitest';
import {
  FAST_MODEL_BY_PROTOCOL,
  SUGGESTED_MODELS_BY_PROTOCOL,
} from '../../src/state/apiProtocols';
import { KNOWN_PROVIDERS } from '../../src/state/config';

describe('apiProtocols table consistency', () => {
  it('FAST_MODEL_BY_PROTOCOL.google is one of the live suggested models', () => {
    expect(SUGGESTED_MODELS_BY_PROTOCOL.google).toContain(FAST_MODEL_BY_PROTOCOL.google);
  });

  it('keeps the Ollama Cloud picker current with recent cloud models', () => {
    const recentCloudModels = [
      'glm-5.2',
      'kimi-k2.7-code',
    ];
    const ollamaCloudProvider = KNOWN_PROVIDERS.find(
      (provider) => provider.protocol === 'ollama' && provider.baseUrl === 'https://ollama.com',
    );

    expect(ollamaCloudProvider?.preferredModels).toBeDefined();
    for (const model of recentCloudModels) {
      expect(SUGGESTED_MODELS_BY_PROTOCOL.ollama).toContain(model);
      expect(ollamaCloudProvider?.preferredModels).toContain(model);
    }
  });

  it('keeps the Atlas Cloud preset wired to OpenAI-compatible chat models', () => {
    const atlasCloudProvider = KNOWN_PROVIDERS.find(
      (provider) =>
        provider.protocol === 'openai' &&
        provider.baseUrl === 'https://api.atlascloud.ai/v1',
    );

    expect(atlasCloudProvider).toMatchObject({
      label: 'Atlas Cloud',
      apiKeyConsoleLink: {
        host: 'atlascloud.ai',
        url: 'https://atlascloud.ai/?utm_source=open_design&utm_medium=provider_preset&utm_campaign=atlascloud_byok',
      },
    });
    expect(atlasCloudProvider?.preferredModels).toContain('qwen/qwen3.5-flash');
    expect(atlasCloudProvider?.preferredModels).toContain('deepseek-ai/deepseek-v4-flash');
  });

  it('keeps the Ofox preset wired to OpenAI-compatible chat models', () => {
    const ofoxProvider = KNOWN_PROVIDERS.find(
      (provider) =>
        provider.protocol === 'openai' && provider.baseUrl === 'https://api.ofox.ai/v1',
    );

    expect(ofoxProvider).toMatchObject({
      label: 'Ofox',
      apiKeyConsoleLink: {
        host: 'ofox.ai',
        url: 'https://ofox.ai/?utm_source=open_design&utm_medium=provider_preset&utm_campaign=ofox_byok',
      },
    });
    expect(ofoxProvider?.preferredModels).toContain('google/gemini-3.7-flash');
    expect(ofoxProvider?.preferredModels).toContain('deepseek/deepseek-v4-flash-0731');
  });
});
