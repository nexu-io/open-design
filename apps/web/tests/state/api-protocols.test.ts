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

  it('keeps retired Ollama Cloud models out of picker suggestions', () => {
    // Verified against the live catalog (GET https://ollama.com/api/tags)
    // on 2026-08-04: none of these ids are currently served by Ollama Cloud,
    // so the picker must not offer them. The first three were the original
    // confirmed retirements from issue #5788; the rest are the remaining
    // hand-curated ids that had drifted out of the served catalog.
    const retiredCloudModels = [
      'cogito-2.1:671b',
      'deepseek-v3.1:671b',
      'deepseek-v3.2',
      'devstral-2:123b',
      'devstral-small-2:24b',
      'gemini-3-flash-preview',
      'gemma3:4b',
      'gemma3:12b',
      'gemma3:27b',
      'glm-4.6',
      'glm-4.7',
      'glm-5',
      'kimi-k2:1t',
      'kimi-k2-thinking',
      'kimi-k2.5',
      'minimax-m2',
      'minimax-m2.1',
      'minimax-m2.5',
      'ministral-3:3b',
      'ministral-3:8b',
      'ministral-3:14b',
      'qwen3-coder:480b',
      'qwen3-coder-next',
      'qwen3-next:80b',
      'qwen3-vl:235b',
      'qwen3-vl:235b-instruct',
      'rnj-1:8b',
    ];
    const ollamaCloudProvider = KNOWN_PROVIDERS.find(
      (provider) => provider.protocol === 'ollama' && provider.baseUrl === 'https://ollama.com',
    );

    expect(ollamaCloudProvider?.preferredModels).toBeDefined();
    for (const model of retiredCloudModels) {
      expect(SUGGESTED_MODELS_BY_PROTOCOL.ollama).not.toContain(model);
      expect(ollamaCloudProvider?.preferredModels).not.toContain(model);
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
});
