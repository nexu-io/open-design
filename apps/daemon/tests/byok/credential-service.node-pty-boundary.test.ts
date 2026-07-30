import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('BYOK credential node-pty boundary', () => {
  const roots: string[] = [];

  afterEach(async () => {
    vi.doUnmock('node-pty');
    vi.resetModules();
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('keeps non-Keychain credential paths usable when node-pty cannot load', async () => {
    vi.resetModules();
    vi.doMock('node-pty', () => {
      throw new Error('simulated missing node-pty native addon');
    });

    const { ByokCredentialService } = await import('../../src/byok/credential-service.js');
    const dataDir = await mkdtemp(path.join(tmpdir(), 'od-byok-node-pty-boundary-'));
    roots.push(dataDir);
    const secrets = new Map<string, string>();
    const service = new ByokCredentialService({
      dataDir,
      backend: {
        kind: 'test-memory',
        available: async () => true,
        set: async (profileId: string, secret: string) => {
          secrets.set(profileId, secret);
        },
        get: async (profileId: string) => secrets.get(profileId) ?? null,
        delete: async (profileId: string) => secrets.delete(profileId),
      },
    });

    await expect(service.status()).resolves.toEqual({ available: true, backend: 'test-memory' });
    await expect(service.upsert({
      id: 'byok-node-pty-boundary',
      label: 'Boundary test',
      protocol: 'openai',
      baseUrl: 'https://example.test/v1',
      model: 'test-model',
      apiKey: 'test-secret',
    })).resolves.toMatchObject({
      configured: true,
      id: 'byok-node-pty-boundary',
    });
  });

  it('fails only the macOS Keychain write with an attributable storage error', async () => {
    vi.resetModules();
    vi.doMock('node-pty', () => {
      throw new Error('simulated missing node-pty native addon');
    });

    const { createPlatformByokSecretBackend } = await import('../../src/byok/credential-service.js');
    const backend = createPlatformByokSecretBackend('darwin');

    await expect(backend.set('byok-node-pty-boundary', 'test-secret')).rejects.toThrow(
      /secure credential storage is unavailable.*native PTY helper/iu,
    );
  });
});
