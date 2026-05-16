import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import {
  configureComposioConfigStore,
  deleteComposioAuthConfigId,
  readComposioConfig,
  readPublicComposioConfig,
  setComposioAuthConfigId,
  writeComposioConfig,
} from '../src/connectors/composio-config.js';
import { composioConnectorProvider, getStaticComposioCatalogDefinitions } from '../src/connectors/composio.js';
import type { ConnectorCatalogDefinition } from '../src/connectors/catalog.js';

async function useTempComposioStore(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'od-composio-config-'));
  configureComposioConfigStore(dir);
  composioConnectorProvider.clearDiscoveryCache();
  return dir;
}

function composioDefinition(id = 'github'): ConnectorCatalogDefinition {
  return {
    id,
    name: id,
    provider: 'composio',
    category: 'code',
    authentication: 'composio',
    tools: [],
    allowedToolNames: [],
  };
}

describe('composio config', () => {
  it('stores Composio settings in the configured data directory', async () => {
    const dir = await useTempComposioStore();

    const publicConfig = writeComposioConfig({
      apiKey: 'cmp_secret_1234',
    });

    expect(publicConfig).toEqual({
      configured: true,
      apiKeyTail: '1234',
    });
    expect(readComposioConfig()).toMatchObject({ apiKey: 'cmp_secret_1234', authConfigIds: {} });
    await expect(readFile(path.join(dir, 'connectors', 'composio-config.json'), 'utf8')).resolves.toContain('cmp_secret_1234');
  });

  it('preserves and updates persisted auth config ids', async () => {
    await useTempComposioStore();
    writeComposioConfig({ apiKey: 'stored_secret', authConfigIds: { github: 'ac_github' } });

    writeComposioConfig({});
    setComposioAuthConfigId('slack', 'ac_slack');
    deleteComposioAuthConfigId('github');

    expect(readComposioConfig()).toEqual({
      apiKey: 'stored_secret',
      authConfigIds: { slack: 'ac_slack' },
    });
  });

  it('does not read Composio credentials from environment variables', async () => {
    await useTempComposioStore();
    const originalApiKey = process.env.COMPOSIO_API_KEY;
    try {
      process.env.COMPOSIO_API_KEY = 'env_secret';

      expect(readPublicComposioConfig()).toMatchObject({ configured: false, apiKeyTail: '' });
      expect(composioConnectorProvider.isConfigured(composioDefinition())).toBe(false);

      writeComposioConfig({ apiKey: 'stored_secret' });
      expect(readPublicComposioConfig()).toMatchObject({ configured: true, apiKeyTail: 'cret' });
    } finally {
      if (originalApiKey === undefined) delete process.env.COMPOSIO_API_KEY;
      else process.env.COMPOSIO_API_KEY = originalApiKey;
    }
  });

  it('can clear the stored API key through settings', async () => {
    await useTempComposioStore();
    writeComposioConfig({ apiKey: 'stored_secret' });

    const publicConfig = writeComposioConfig({ apiKey: '' });

    expect(publicConfig.configured).toBe(false);
    expect(composioConnectorProvider.isConfigured(composioDefinition())).toBe(false);
    expect(readComposioConfig()).toEqual({ apiKey: '', authConfigIds: {} });
  });

  it('clears stored auth config ids when the API key changes', async () => {
    await useTempComposioStore();
    writeComposioConfig({ apiKey: 'stored_secret', authConfigIds: { github: 'ac_github' } });

    const publicConfig = writeComposioConfig({ apiKey: 'new_secret' });

    expect(publicConfig).toEqual({ configured: true, apiKeyTail: 'cret' });
    expect(readComposioConfig()).toEqual({ apiKey: 'new_secret', authConfigIds: {} });
  });

  it('ignores stale unsupported persisted technical fields', async () => {
    await useTempComposioStore();
    writeComposioConfig({ apiKey: 'stored_secret' });

    const publicConfig = writeComposioConfig({ apiKey: '', baseUrl: '', userId: '', timeoutMs: null });

    expect(publicConfig).toEqual({ configured: false, apiKeyTail: '' });
    expect(readComposioConfig()).toEqual({ apiKey: '', authConfigIds: {} });
  });

  it('loads persisted Composio catalog cache into fast definitions', async () => {
    const dir = await useTempComposioStore();
    await mkdir(path.join(dir, 'connectors'), { recursive: true });
    await writeFile(path.join(dir, 'connectors', 'composio-catalog-cache.json'), JSON.stringify({
      schemaVersion: 1,
      provider: 'composio',
      fetchedAt: '2026-05-07T00:00:00.000Z',
      definitions: [
        {
          id: 'slack',
          name: 'Slack',
          provider: 'composio',
          category: 'Communication',
          providerConnectorId: 'SLACK',
          authentication: 'composio',
          toolCount: 48,
          tools: [
            {
              name: 'slack.slack_list_channels',
              title: 'List channels',
              description: 'List Slack channels',
              safety: { sideEffect: 'read', approval: 'auto', reason: 'read-only' },
              refreshEligible: true,
              curation: { useCases: ['personal_daily_digest'], reason: 'Digest source' },
              requiredScopes: ['read'],
              providerToolId: 'SLACK_LIST_CHANNELS',
            },
          ],
          allowedToolNames: ['slack.slack_list_channels'],
          minimumApproval: 'auto',
        },
      ],
    }, null, 2));

    composioConnectorProvider.configureCatalogCache(dir);

    expect(composioConnectorProvider.getFastDefinitions().find((definition) => definition.id === 'slack')).toMatchObject({
      id: 'slack',
      toolCount: 48,
      tools: [expect.objectContaining({
        name: 'slack.slack_list_channels',
        curation: expect.objectContaining({ useCases: ['personal_daily_digest'] }),
      })],
    });
  });

  it('falls back to the static catalog when the persisted cache is empty', async () => {
    const dir = await useTempComposioStore();
    await mkdir(path.join(dir, 'connectors'), { recursive: true });
    await writeFile(path.join(dir, 'connectors', 'composio-catalog-cache.json'), JSON.stringify({
      schemaVersion: 1,
      provider: 'composio',
      fetchedAt: '2026-05-07T00:00:00.000Z',
      definitions: [],
    }, null, 2));

    composioConnectorProvider.configureCatalogCache(dir);

    expect(composioConnectorProvider.getFastDefinitions()).toEqual(getStaticComposioCatalogDefinitions());
  });

  it('does not hydrate persisted catalog cache before the runtime data directory is configured', async () => {
    const defaultCacheDir = path.join(process.cwd(), '.od', 'connectors');
    const defaultCachePath = path.join(defaultCacheDir, 'composio-catalog-cache.json');
    const dir = await useTempComposioStore();
    await mkdir(defaultCacheDir, { recursive: true });
    await writeFile(defaultCachePath, JSON.stringify({
      schemaVersion: 1,
      provider: 'composio',
      fetchedAt: '2026-05-07T00:00:00.000Z',
      definitions: [composioDefinition('wrong-tenant')],
    }, null, 2));

    try {
      vi.resetModules();
      const composioModule = await import('../src/connectors/composio.js');

      expect(composioModule.composioConnectorProvider.getFastDefinitions().find((definition) => definition.id === 'wrong-tenant')).toBeUndefined();

      await mkdir(path.join(dir, 'connectors'), { recursive: true });
      await writeFile(path.join(dir, 'connectors', 'composio-catalog-cache.json'), JSON.stringify({
        schemaVersion: 1,
        provider: 'composio',
        fetchedAt: '2026-05-07T00:00:00.000Z',
        definitions: [composioDefinition('right-tenant')],
      }, null, 2));

      composioModule.composioConnectorProvider.configureCatalogCache(dir);

      expect(composioModule.composioConnectorProvider.getFastDefinitions().find((definition) => definition.id === 'right-tenant')).toMatchObject({
        id: 'right-tenant',
      });
    } finally {
      await rm(defaultCachePath, { force: true });
    }
  });
});
