import { describe, expect, it } from 'vitest';

import {
  BYOK_OPENCODE_API_KEY_ENV,
  BYOK_OPENCODE_PROVIDER_ID,
  buildOpenCodeByokProviderConfig,
  opencodeByokModelId,
} from '../../src/runtimes/byok-opencode.js';

describe('byok-opencode runtime config', () => {
  it('prefixes raw BYOK models with the run-scoped OpenCode provider id', () => {
    expect(opencodeByokModelId('gpt-4o-mini')).toBe('open-design-byok/gpt-4o-mini');
    expect(opencodeByokModelId('open-design-byok/gpt-4o-mini')).toBe('open-design-byok/gpt-4o-mini');
    expect(opencodeByokModelId('default')).toBeNull();
  });

  it('builds OpenAI-compatible provider config without embedding the secret in JSON', () => {
    const out = buildOpenCodeByokProviderConfig(
      {
        protocol: 'senseaudio',
        apiKey: 'sk-secret',
        baseUrl: 'https://api.senseaudio.cn',
      },
      'deepseek-v4-flash',
    );

    expect(out?.modelId).toBe('open-design-byok/deepseek-v4-flash');
    expect(out?.env).toEqual({ [BYOK_OPENCODE_API_KEY_ENV]: 'sk-secret' });
    expect(JSON.stringify(out?.config)).not.toContain('sk-secret');
    expect(out?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/openai-compatible',
          options: {
            baseURL: 'https://api.senseaudio.cn',
            apiKey: `{env:${BYOK_OPENCODE_API_KEY_ENV}}`,
          },
          models: {
            'deepseek-v4-flash': {
              name: 'deepseek-v4-flash',
              limit: {
                context: 128_000,
                output: 16_384,
              },
            },
          },
        },
      },
    });
  });

  it('maps native OpenAI BYOK to the OpenAI provider package', () => {
    const out = buildOpenCodeByokProviderConfig(
      { protocol: 'openai', apiKey: 'sk-openai', baseUrl: 'https://api.openai.com/v1' },
      'gpt-5.5',
    );

    expect(out?.modelId).toBe('open-design-byok/gpt-5.5');
    expect(out?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/openai',
          options: {
            baseURL: 'https://api.openai.com/v1',
            apiKey: `{env:${BYOK_OPENCODE_API_KEY_ENV}}`,
          },
          models: {
            'gpt-5.5': {
              name: 'gpt-5.5',
            },
          },
        },
      },
    });
  });

  it('routes OpenAI-protocol BYOK with a non-OpenAI base URL to the OpenAI-compatible provider package', () => {
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'openai', apiKey: 'sk-deepseek', baseUrl: 'https://api.deepseek.com' },
      'deepseek-v4-pro',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/openai-compatible',
          options: {
            baseURL: 'https://api.deepseek.com',
            apiKey: `{env:${BYOK_OPENCODE_API_KEY_ENV}}`,
          },
        },
      },
    });
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'openai', apiKey: 'sk-openai', baseUrl: 'https://api.openai.com' },
      'deepseek-v4-pro',
    )?.config).toMatchObject({
      provider: { [BYOK_OPENCODE_PROVIDER_ID]: { npm: '@ai-sdk/openai' } },
    });
  });

  it('normalizes origin-only native provider base URLs for OpenCode provider packages', () => {
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'anthropic', apiKey: 'sk-ant', baseUrl: 'https://api.anthropic.com' },
      'claude-sonnet-4-5',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/anthropic',
          options: { baseURL: 'https://api.anthropic.com/v1' },
        },
      },
    });
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'google', apiKey: 'AIza', baseUrl: 'https://generativelanguage.googleapis.com/' },
      'gemini-3.5-flash',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/google',
          options: { baseURL: 'https://generativelanguage.googleapis.com/v1beta' },
        },
      },
    });
  });

  it('maps other native BYOK protocols to provider packages', () => {
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'anthropic', apiKey: 'sk-ant', baseUrl: 'https://api.anthropic.com' },
      'claude-sonnet-4-5',
    )?.config).toMatchObject({
      provider: { [BYOK_OPENCODE_PROVIDER_ID]: { npm: '@ai-sdk/anthropic' } },
    });
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'google', apiKey: 'AIza', baseUrl: 'https://generativelanguage.googleapis.com' },
      'gemini-2.5-flash',
    )?.config).toMatchObject({
      provider: { [BYOK_OPENCODE_PROVIDER_ID]: { npm: '@ai-sdk/google' } },
    });
  });

  it('preserves Azure deployment-based URL mode for classic Azure OpenAI resources', () => {
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'azure', apiKey: 'azure-key', baseUrl: 'https://example.openai.azure.com', apiVersion: '2024-10-21' },
      'gpt-4o',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/azure',
          options: {
            baseURL: 'https://example.openai.azure.com',
            apiKey: `{env:${BYOK_OPENCODE_API_KEY_ENV}}`,
            apiVersion: '2024-10-21',
            useDeploymentBasedUrls: true,
          },
          models: {
            'gpt-4o': {
              name: 'gpt-4o',
            },
          },
        },
      },
    });
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'azure', apiKey: 'azure-key', baseUrl: 'https://example.openai.azure.com' },
      'deployment-one',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          options: {
            apiVersion: '2024-10-21',
            useDeploymentBasedUrls: true,
          },
        },
      },
    });
  });

  it('rejects Azure providers without a base URL', () => {
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'azure', apiKey: 'azure-key', baseUrl: '' },
      'gpt-4o',
    )).toBeNull();
  });

  it('keeps Azure OpenAI-compatible v1 paths in model-based URL mode', () => {
    expect(buildOpenCodeByokProviderConfig(
      {
        protocol: 'azure',
        apiKey: 'azure-key',
        baseUrl: 'https://resource.services.ai.azure.com/api/projects/project/openai/v1',
        apiVersion: '',
      },
      'prod',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/azure',
          options: {
            baseURL: 'https://resource.services.ai.azure.com/api/projects/project/openai/v1',
            apiKey: `{env:${BYOK_OPENCODE_API_KEY_ENV}}`,
          },
        },
      },
    });
    const provider = (buildOpenCodeByokProviderConfig(
      {
        protocol: 'azure',
        apiKey: 'azure-key',
        baseUrl: 'https://resource.services.ai.azure.com/api/projects/project/openai/v1',
        apiVersion: '',
      },
      'prod',
    )?.config.provider as Record<string, { options?: Record<string, unknown> }> | undefined)
      ?.[BYOK_OPENCODE_PROVIDER_ID];
    expect(provider?.options).not.toHaveProperty('useDeploymentBasedUrls');
    expect(provider?.options).not.toHaveProperty('apiVersion');
  });

  it('maps Ollama Cloud to OpenCode documented OpenAI-compatible v1 config', () => {
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'ollama', apiKey: 'ollama-key', baseUrl: 'https://ollama.com' },
      'gpt-oss:20b',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/openai-compatible',
          options: {
            baseURL: 'https://ollama.com/v1',
            apiKey: `{env:${BYOK_OPENCODE_API_KEY_ENV}}`,
          },
          models: {
            'gpt-oss:20b': {
              name: 'gpt-oss:20b',
            },
          },
        },
      },
    });
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'ollama', apiKey: 'ollama-key', baseUrl: 'https://ollama.example.com/api' },
      'llama3.1',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          options: {
            baseURL: 'https://ollama.example.com/v1',
          },
        },
      },
    });
  });

  it('allows keyless local Ollama and normalizes it to the OpenAI-compatible v1 endpoint', () => {
    const out = buildOpenCodeByokProviderConfig(
      { protocol: 'ollama', apiKey: '', baseUrl: 'http://localhost:11434' },
      'llama3.2',
    );

    expect(out?.modelId).toBe('open-design-byok/llama3.2');
    expect(out?.env).toEqual({});
    expect(out?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/openai-compatible',
          options: {
            baseURL: 'http://localhost:11434/v1',
          },
        },
      },
    });
    const provider = (out?.config.provider as Record<string, { options?: Record<string, unknown> }> | undefined)
      ?.[BYOK_OPENCODE_PROVIDER_ID];
    expect(provider?.options).not.toHaveProperty('apiKey');
  });

  it('still requires an API key for non-local Ollama providers', () => {
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'ollama', apiKey: '', baseUrl: 'https://ollama.com' },
      'gpt-oss:20b',
    )).toBeNull();
  });

  it('allows explicit keyless OpenAI-compatible presets such as vLLM', () => {
    const out = buildOpenCodeByokProviderConfig(
      {
        protocol: 'openai',
        apiKey: '',
        baseUrl: 'http://127.0.0.1:8000/v1',
        requiresApiKey: false,
      },
      'model',
    );

    expect(out?.modelId).toBe('open-design-byok/model');
    expect(out?.env).toEqual({});
    expect(out?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/openai-compatible',
          options: {
            baseURL: 'http://127.0.0.1:8000/v1',
          },
        },
      },
    });
    const provider = (out?.config.provider as Record<string, { options?: Record<string, unknown> }> | undefined)
      ?.[BYOK_OPENCODE_PROVIDER_ID];
    expect(provider?.options).not.toHaveProperty('apiKey');
  });
});
