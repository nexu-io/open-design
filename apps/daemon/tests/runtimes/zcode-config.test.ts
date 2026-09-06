import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ZCODE_PROVIDER_ID,
  listZcodeSavedModels,
  resolveZcodeSavedProvider,
} from '../../src/runtimes/zcode-config.js';

function writeConfig(config: unknown): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'od-zcode-config-'));
  const file = path.join(dir, 'config.json');
  writeFileSync(file, JSON.stringify(config), 'utf8');
  return file;
}

function writeModelCache(cache: unknown): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'od-zcode-model-cache-'));
  const file = path.join(dir, 'bots-model-cache.v2.json');
  writeFileSync(file, JSON.stringify(cache), 'utf8');
  return file;
}

describe('resolveZcodeSavedProvider', () => {
  it('uses builtin:bigmodel by default and maps the saved API-key provider into app-server upsert shape', () => {
    const configPath = writeConfig({
      provider: {
        [DEFAULT_ZCODE_PROVIDER_ID]: {
          kind: 'anthropic',
          source: 'custom',
          options: {
            apiKey: 'saved-key',
            baseURL: 'https://open.bigmodel.cn/api/anthropic',
          },
          models: {
            'GLM-5.2': {},
            'GLM-5.2-Air': {},
          },
        },
      },
    });

    expect(resolveZcodeSavedProvider({ configPath })).toEqual({
      model: {
        providerId: DEFAULT_ZCODE_PROVIDER_ID,
        modelId: 'glm-5.2',
      },
      provider: {
        providerId: DEFAULT_ZCODE_PROVIDER_ID,
        kind: 'anthropic',
        source: 'custom',
        baseURL: 'https://open.bigmodel.cn/api/anthropic',
        apiKey: { source: 'inline', value: 'saved-key' },
        models: [{ modelId: 'glm-5.2' }, { modelId: 'GLM-5.2' }, { modelId: 'GLM-5.2-Air' }],
      },
    });
  });

  it('falls back to the first saved provider and honors an explicit model', () => {
    const configPath = writeConfig({
      provider: {
        'custom:zai': {
          kind: 'anthropic',
          options: {
            apiKey: 'zai-key',
            baseURL: 'https://api.z.ai/api/anthropic',
          },
          models: {
            'GLM-5.2': {},
          },
        },
      },
    });

    expect(resolveZcodeSavedProvider({ configPath, modelId: 'GLM-5.2-Flash' })).toMatchObject({
      model: {
        providerId: 'custom:zai',
        modelId: 'glm-5.2-flash',
      },
      provider: {
        providerId: 'custom:zai',
        source: 'custom',
        apiKey: { source: 'inline', value: 'zai-key' },
        models: [
          { modelId: 'glm-5.2-flash' },
          { modelId: 'GLM-5.2-Flash' },
          { modelId: 'GLM-5.2' },
        ],
      },
    });
  });

  it('maps saved display model ids to cached wire model names when available', () => {
    const configPath = writeConfig({
      provider: {
        [DEFAULT_ZCODE_PROVIDER_ID]: {
          options: { apiKey: 'saved-key' },
          models: {
            'GLM-5.2': {},
            'GLM-5-Turbo': {},
          },
        },
      },
    });
    const modelCachePath = writeModelCache({
      providers: [
        {
          id: DEFAULT_ZCODE_PROVIDER_ID,
          models: [
            { id: 'GLM-5.2' },
            { id: 'GLM-5-Turbo', name: 'glm-5-turbo' },
          ],
        },
      ],
    });

    expect(resolveZcodeSavedProvider({
      configPath,
      modelCachePath,
      modelId: 'GLM-5-Turbo',
    })).toMatchObject({
      model: {
        providerId: DEFAULT_ZCODE_PROVIDER_ID,
        modelId: 'glm-5-turbo',
      },
      provider: {
        models: [
          { modelId: 'glm-5-turbo' },
          { modelId: 'GLM-5-Turbo' },
          { modelId: 'GLM-5.2' },
        ],
      },
    });
  });

  it('honors an explicit provider id', () => {
    const configPath = writeConfig({
      provider: {
        [DEFAULT_ZCODE_PROVIDER_ID]: {
          options: { apiKey: 'bigmodel-key' },
          models: { 'GLM-5.2': {} },
        },
        'custom:zai': {
          options: { apiKey: 'zai-key' },
          models: { 'GLM-Z1': {} },
        },
      },
    });

    expect(resolveZcodeSavedProvider({ configPath, providerId: 'custom:zai' })).toMatchObject({
      model: {
        providerId: 'custom:zai',
        modelId: 'glm-z1',
      },
      provider: {
        providerId: 'custom:zai',
        apiKey: { source: 'inline', value: 'zai-key' },
        models: [{ modelId: 'glm-z1' }, { modelId: 'GLM-Z1' }],
      },
    });
  });

  it('fails clearly when the selected provider has no saved API key', () => {
    const configPath = writeConfig({
      provider: {
        [DEFAULT_ZCODE_PROVIDER_ID]: {
          models: { 'GLM-5.2': {} },
        },
      },
    });

    expect(() => resolveZcodeSavedProvider({ configPath })).toThrow(
      'does not have a saved API key',
    );
  });
});

describe('listZcodeSavedModels', () => {
  it('lists models from the same default provider used by the app-server handshake', () => {
    const configPath = writeConfig({
      provider: {
        [DEFAULT_ZCODE_PROVIDER_ID]: {
          options: { apiKey: 'saved-key' },
          models: {
            'GLM-5.2': {},
            'GLM-5.2-Air': {},
          },
        },
        'custom:zai': {
          options: { apiKey: 'zai-key' },
          models: {
            'GLM-Z1': {},
          },
        },
      },
    });

    const modelCachePath = writeModelCache({
      providers: [
        {
          id: DEFAULT_ZCODE_PROVIDER_ID,
          models: [
            { id: 'GLM-5.2' },
            { id: 'GLM-5.2-Air', name: 'glm-5.2-air' },
          ],
        },
      ],
    });

    expect(listZcodeSavedModels({ configPath, modelCachePath })).toEqual([
      { id: 'glm-5.2', label: 'GLM-5.2' },
      { id: 'glm-5.2-air', label: 'GLM-5.2-Air' },
    ]);
  });

  it('throws when saved config is unavailable', () => {
    expect(() => listZcodeSavedModels({ configPath: '/missing/zcode/config.json' })).toThrow(
      'Failed to read ZCode saved config',
    );
  });

  it('throws when the saved provider has no API key', () => {
    const configPath = writeConfig({
      provider: {
        [DEFAULT_ZCODE_PROVIDER_ID]: {
          models: { 'GLM-5.2': {} },
        },
      },
    });

    expect(() => listZcodeSavedModels({ configPath })).toThrow(
      'does not have a saved API key',
    );
  });
});
