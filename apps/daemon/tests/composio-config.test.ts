import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import {
  configureComposioConfigStore,
  readComposioConfig,
  readPublicComposioConfig,
  writeComposioConfig,
} from '../src/connectors/composio-config.js';
import { composioConnectorProvider } from '../src/connectors/composio.js';
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
    expect(readComposioConfig()).toMatchObject({ apiKey: 'cmp_secret_1234' });
    await expect(readFile(path.join(dir, 'connectors', 'composio-config.json'), 'utf8')).resolves.toContain('cmp_secret_1234');
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
  });

  it('ignores stale persisted technical fields', async () => {
    await useTempComposioStore();
    writeComposioConfig({ apiKey: 'stored_secret' });

    const publicConfig = writeComposioConfig({ apiKey: '', baseUrl: '', userId: '', timeoutMs: null, authConfigIds: { github: 'stale' } });

    expect(publicConfig).toEqual({ configured: false, apiKeyTail: '' });
    expect(readComposioConfig()).toEqual({ apiKey: '' });
  });
});
