import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ByokCredentialService,
  createPlatformByokSecretBackend,
} from '../../src/byok/credential-service.js';

describe.runIf(process.platform === 'win32')('Windows DPAPI BYOK credential smoke', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it('creates, resolves, and deletes a profile without writing its secret as plaintext', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'od-byok-windows-dpapi-'));
    roots.push(dataDir);
    const backend = createPlatformByokSecretBackend('win32', dataDir);
    const service = new ByokCredentialService({ dataDir, backend });
    const apiKey = 'windows-dpapi-smoke-secret';

    await expect(service.status()).resolves.toEqual({
      available: true,
      backend: 'windows-dpapi',
    });
    const profile = await service.upsert({
      id: 'byok-windows-dpapi-smoke',
      label: 'Windows DPAPI smoke',
      protocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5.4',
      apiKey,
    });

    expect(profile).toMatchObject({
      id: 'byok-windows-dpapi-smoke',
      configured: true,
      keyTail: 'cret',
    });
    expect(await service.resolve(profile.id)).toMatchObject({
      apiKey,
      provider: { apiKey },
    });
    expect(
      await readFile(
        path.join(dataDir, 'byok', 'profiles.json'),
        'utf8',
      ),
    ).not.toContain(apiKey);
    const encrypted = await readFile(
      path.join(dataDir, 'byok', 'secrets', `${profile.id}.bin`),
    );
    expect(encrypted.includes(Buffer.from(apiKey, 'utf8'))).toBe(false);

    await expect(service.delete(profile.id)).resolves.toBe(true);
    await expect(service.resolve(profile.id)).resolves.toBeNull();
  });
});
