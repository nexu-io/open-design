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

    expect(ollamaCloudProvider?.models).toBeDefined();
    for (const model of recentCloudModels) {
      expect(SUGGESTED_MODELS_BY_PROTOCOL.ollama).toContain(model);
      expect(ollamaCloudProvider?.models).toContain(model);
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
      model: 'qwen/qwen3.5-flash',
      apiKeyConsoleLink: {
        host: 'atlascloud.ai',
        url: 'https://atlascloud.ai/?utm_source=open_design&utm_medium=provider_preset&utm_campaign=atlascloud_byok',
      },
    });
    expect(atlasCloudProvider?.models).toContain('qwen/qwen3.5-flash');
    expect(atlasCloudProvider?.models).toContain('deepseek-ai/deepseek-v4-flash');
  });

  it('adds Z.AI Global without replacing the China Zhipu preset', () => {
    const zaiGlobalProvider = KNOWN_PROVIDERS.find(
      (provider) => provider.baseUrl === 'https://api.z.ai/api/paas/v4',
    );
    const zhipuProvider = KNOWN_PROVIDERS.find(
      (provider) => provider.baseUrl === 'https://open.bigmodel.cn/api/paas/v4',
    );

    expect(zaiGlobalProvider).toMatchObject({
      label: 'Z.AI Global',
      protocol: 'openai',
      model: 'glm-5.1',
    });
    expect(zaiGlobalProvider?.models).toContain('glm-5');
    expect(zaiGlobalProvider?.models).toContain('glm-4.7-flash');

    expect(zhipuProvider).toMatchObject({
      label: 'Zhipu',
      protocol: 'openai',
      model: 'glm-4.6',
      models: ['glm-4.6', 'glm-4-plus', 'glm-4-air'],
    });
  });
});
