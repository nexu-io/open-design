import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { startToolsServeUpdaterFixture, type ToolsServeUpdaterFixture } from '@/vitest/tools-serve-updater-fixture';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('packaged updater fixture bridge', () => {
  let fixture: ToolsServeUpdaterFixture | null = null;

  afterEach(async () => {
    await fixture?.close();
    fixture = null;
  });

  it('[P1] carries the installed-outer reinstall floor into fixture metadata', async () => {
    const port = await reserveLoopbackPort();
    fixture = await startToolsServeUpdaterFixture({
      channel: 'stable',
      controlLauncherVersionMin: '0.16.0',
      controlLauncherVersionUrl: 'https://example.test/updater-recovery',
      platform: 'win',
      port,
      version: '0.16.0',
      workspaceRoot,
    });

    const response = await fetch(fixture.info.metadataUrl);
    expect(response.ok).toBe(true);
    expect(new URL(fixture.info.metadataUrl).port).toBe(String(port));
    const metadata = await response.json() as {
      control?: { launcher?: { version?: { min?: string; url?: string } } };
    };
    expect(metadata.control?.launcher?.version).toEqual({
      min: '0.16.0',
      url: 'https://example.test/updater-recovery',
    });
  });
});

async function reserveLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve, reject) => server.close((error) => error == null ? resolve() : reject(error)));
  if (address == null || typeof address === 'string') throw new Error('failed to reserve loopback port');
  return address.port;
}
