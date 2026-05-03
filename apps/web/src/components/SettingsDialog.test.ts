import { describe, expect, it } from 'vitest';
import { KNOWN_PROVIDERS } from '../state/config';
import type { ApiProtocol, AppConfig } from '../types';

function switchApiProtocol(config: AppConfig, protocol: ApiProtocol): AppConfig {
  const currentProvider = config.apiProviderBaseUrl
    ? KNOWN_PROVIDERS.find((p) => p.baseUrl === config.apiProviderBaseUrl)
    : undefined;
  const stillOnSelectedProvider = Boolean(currentProvider && config.baseUrl === currentProvider.baseUrl);
  const provider = KNOWN_PROVIDERS.find((p) => p.protocol === protocol);
  return {
    ...config,
    mode: 'api',
    apiProtocol: protocol,
    ...(stillOnSelectedProvider && provider
      ? { baseUrl: provider.baseUrl, model: provider.model, apiProviderBaseUrl: provider.baseUrl }
      : { apiProviderBaseUrl: null }),
  };
}

const baseConfig: AppConfig = {
  mode: 'api',
  apiKey: 'sk-test',
  apiProtocol: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  agentId: null,
  skillId: null,
  designSystemId: null,
};

describe('SettingsDialog API protocol switching', () => {
  it('preserves custom baseUrl and model when switching protocol tabs', () => {
    const config: AppConfig = {
      ...baseConfig,
      baseUrl: 'https://my-proxy.example.com',
      model: 'my-model',
    };

    expect(switchApiProtocol(config, 'openai')).toMatchObject({
      mode: 'api',
      apiProtocol: 'openai',
      baseUrl: 'https://my-proxy.example.com',
      model: 'my-model',
    });
  });

  it('auto-fills the new protocol default when switching from a selected known provider', () => {
    expect(switchApiProtocol(baseConfig, 'openai')).toMatchObject({
      mode: 'api',
      apiProtocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
    });
  });

  it('preserves user-customized known-looking baseUrl when provider tracking was cleared', () => {
    const config: AppConfig = {
      ...baseConfig,
      apiProviderBaseUrl: null,
      baseUrl: 'https://api.openai.com/v1',
      model: 'custom-openai-model',
    };

    expect(switchApiProtocol(config, 'anthropic')).toMatchObject({
      mode: 'api',
      apiProtocol: 'anthropic',
      baseUrl: 'https://api.openai.com/v1',
      model: 'custom-openai-model',
      apiProviderBaseUrl: null,
    });
  });
});
