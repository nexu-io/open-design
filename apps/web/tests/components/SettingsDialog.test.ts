import { describe, expect, it } from 'vitest';
import {
  isValidApiBaseUrl,
  switchApiProtocolConfig,
  updateCurrentApiProtocolConfig,
} from '../../src/components/SettingsDialog';
import type { AppConfig } from '../../src/types';

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
  it('stores the current custom protocol config before loading another protocol', () => {
    const config: AppConfig = {
      ...baseConfig,
      apiKey: 'anthropic-key',
      apiProviderBaseUrl: null,
      baseUrl: 'https://my-proxy.example.com',
      model: 'my-model',
    };

    const next = switchApiProtocolConfig(config, 'openai');

    expect(next).toMatchObject({
      mode: 'api',
      apiProtocol: 'openai',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
    });
    expect(next.apiProtocolConfigs?.anthropic).toMatchObject({
      apiKey: 'anthropic-key',
      baseUrl: 'https://my-proxy.example.com',
      model: 'my-model',
      apiProviderBaseUrl: null,
    });
  });

  it('restores each protocol draft instead of leaking shared field values', () => {
    const openai = switchApiProtocolConfig(baseConfig, 'openai');
    const openaiEdited = updateCurrentApiProtocolConfig(openai, {
      apiKey: 'openai-key',
      baseUrl: 'https://openai-proxy.example.com',
      model: 'openai-model',
      apiProviderBaseUrl: null,
    });
    const google = switchApiProtocolConfig(openaiEdited, 'google');
    const googleEdited = updateCurrentApiProtocolConfig(google, {
      apiKey: 'google-key',
      baseUrl: 'https://google-proxy.example.com',
      model: 'google-model',
      apiProviderBaseUrl: null,
    });

    const restoredOpenai = switchApiProtocolConfig(googleEdited, 'openai');

    expect(restoredOpenai).toMatchObject({
      mode: 'api',
      apiProtocol: 'openai',
      apiKey: 'openai-key',
      baseUrl: 'https://openai-proxy.example.com',
      model: 'openai-model',
      apiProviderBaseUrl: null,
    });
    expect(restoredOpenai.apiProtocolConfigs?.google).toMatchObject({
      apiKey: 'google-key',
      baseUrl: 'https://google-proxy.example.com',
      model: 'google-model',
      apiProviderBaseUrl: null,
    });
  });

  it('loads the new protocol default on first visit', () => {
    expect(switchApiProtocolConfig(baseConfig, 'openai')).toMatchObject({
      mode: 'api',
      apiProtocol: 'openai',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
    });
  });

  it('auto-fills Google defaults when switching from a selected known provider', () => {
    expect(switchApiProtocolConfig(baseConfig, 'google')).toMatchObject({
      mode: 'api',
      apiProtocol: 'google',
      apiKey: '',
      baseUrl: 'https://generativelanguage.googleapis.com',
      model: 'gemini-2.0-flash',
      apiProviderBaseUrl: 'https://generativelanguage.googleapis.com',
    });
  });

  it('keeps Azure API version in the Azure draft only', () => {
    const config: AppConfig = {
      ...baseConfig,
      apiProtocol: 'azure',
      apiKey: 'azure-key',
      model: 'deployment-one',
      apiVersion: '2024-10-21',
    };

    const next = switchApiProtocolConfig(config, 'openai');

    expect(next).toMatchObject({
      apiProtocol: 'openai',
      apiKey: '',
      apiVersion: '',
    });
    expect(next.apiProtocolConfigs?.azure).toMatchObject({
      apiKey: 'azure-key',
      model: 'deployment-one',
      apiVersion: '2024-10-21',
    });
  });
});

describe('SettingsDialog API Base URL validation', () => {
  it('accepts public http/https URLs and loopback local providers', () => {
    expect(isValidApiBaseUrl('https://api.openai.com/v1')).toBe(true);
    expect(isValidApiBaseUrl('http://localhost:11434/v1')).toBe(true);
    expect(isValidApiBaseUrl('http://127.0.0.1:11434/v1')).toBe(true);
    expect(isValidApiBaseUrl('http://[::1]:11434/v1')).toBe(true);
    expect(isValidApiBaseUrl('  https://resource.openai.azure.com  ')).toBe(true);

    expect(isValidApiBaseUrl('ddddd')).toBe(false);
    expect(isValidApiBaseUrl('api.openai.com/v1')).toBe(false);
    expect(isValidApiBaseUrl('ftp://api.example.com')).toBe(false);
    expect(isValidApiBaseUrl('http:api.example.com')).toBe(false);
    expect(isValidApiBaseUrl('https://')).toBe(false);
    expect(isValidApiBaseUrl('http://10.0.0.5:11434/v1')).toBe(false);
    expect(isValidApiBaseUrl('http://169.254.1.5:11434/v1')).toBe(false);
    expect(isValidApiBaseUrl('http://172.16.0.5:11434/v1')).toBe(false);
    expect(isValidApiBaseUrl('http://192.168.1.5:11434/v1')).toBe(false);
  });
});
