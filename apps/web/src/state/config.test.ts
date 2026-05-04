import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG, loadConfig } from './config';
import type { AppConfig } from '../types';

const store = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    store.delete(key);
  }),
  clear: vi.fn(() => {
    store.clear();
  }),
});

afterEach(() => {
  store.clear();
});

describe('loadConfig', () => {
  it('migrates legacy OpenAI-compatible API configs to an explicit apiProtocol', () => {
    const legacyConfig: Partial<AppConfig> = {
      mode: 'api',
      apiKey: 'sk-test',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      agentId: null,
      skillId: null,
      designSystemId: null,
    };
    store.set('open-design:config', JSON.stringify(legacyConfig));

    const config = loadConfig();

    expect(config.mode).toBe('api');
    expect(config.baseUrl).toBe('https://api.deepseek.com');
    expect(config.model).toBe('deepseek-chat');
    expect(config.apiProtocol).toBe('openai');
    expect(config.configMigrationVersion).toBe(1);
  });

  it('migrates legacy Anthropic API configs to an explicit apiProtocol', () => {
    const legacyConfig: Partial<AppConfig> = {
      mode: 'api',
      apiKey: 'sk-test',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-5',
      agentId: null,
      skillId: null,
      designSystemId: null,
    };
    store.set('open-design:config', JSON.stringify(legacyConfig));

    const config = loadConfig();

    expect(config.apiProtocol).toBe('anthropic');
  });

  it('infers protocol for legacy daemon-mode API fields without changing mode', () => {
    const daemonConfig: Partial<AppConfig> = {
      mode: 'daemon',
      apiKey: 'sk-test',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      agentId: 'codex',
      skillId: null,
      designSystemId: null,
    };
    store.set('open-design:config', JSON.stringify(daemonConfig));

    const config = loadConfig();

    expect(config.mode).toBe('daemon');
    expect(config.apiProtocol).toBe('openai');
    expect(config.configMigrationVersion).toBe(1);
  });

  it('does not overwrite an already explicit apiProtocol', () => {
    const explicitConfig: Partial<AppConfig> = {
      mode: 'api',
      apiProtocol: 'anthropic',
      apiKey: 'sk-test',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      agentId: null,
      skillId: null,
      designSystemId: null,
    };
    store.set('open-design:config', JSON.stringify(explicitConfig));

    const config = loadConfig();

    expect(config.apiProtocol).toBe('anthropic');
  });

  it('preserves saved settings when migration sees a malformed base URL', () => {
    const legacyConfig: Partial<AppConfig> = {
      mode: 'api',
      apiKey: 'sk-test',
      baseUrl: 'https://[broken-ipv6',
      model: 'custom-model',
      agentId: null,
      skillId: null,
      designSystemId: null,
    };
    store.set('open-design:config', JSON.stringify(legacyConfig));

    const config = loadConfig();

    expect(config.mode).toBe('api');
    expect(config.apiKey).toBe('sk-test');
    expect(config.baseUrl).toBe('https://[broken-ipv6');
    expect(config.model).toBe('custom-model');
    expect(config.apiProtocol).toBe('anthropic');
  });

  it('returns defaults for malformed localStorage JSON', () => {
    store.set('open-design:config', '{broken-json');

    expect(loadConfig()).toEqual(DEFAULT_CONFIG);
  });

  it('sets an explicit apiProtocol for new default configs', () => {
    expect(DEFAULT_CONFIG.apiProtocol).toBe('anthropic');
    expect(DEFAULT_CONFIG.configMigrationVersion).toBe(1);
  });
});
