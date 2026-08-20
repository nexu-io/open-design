import { mkdtemp, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  APP_KEYS,
  SIDECAR_MESSAGES,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
} from '@open-design/sidecar-proto';
import { requestJsonIpc } from '@open-design/sidecar';

const stopRuntime = vi.fn(async () => undefined);
const startDaemonRuntime = vi.fn(async () => ({
  stop: stopRuntime,
  url: 'http://127.0.0.1:48123',
}));

vi.mock('../src/daemon-startup.js', () => ({
  startDaemonRuntime,
}));

describe('daemon sidecar startup', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env.OD_WEB_PORT;
    const { resetDesktopAuthForTests } = await import('../src/desktop-auth.js');
    resetDesktopAuthForTests();
  });

  afterEach(async () => {
    const { resetDesktopAuthForTests } = await import('../src/desktop-auth.js');
    resetDesktopAuthForTests();
    delete process.env.OD_WEB_PORT;
  });

  it('starts through the shared daemon startup path and reports live auth state', async () => {
    const { setDesktopAuthSecret } = await import('../src/desktop-auth.js');
    const { startDaemonSidecar } = await import('../src/sidecar/server.js');
    const root = await mkdtemp(join(tmpdir(), 'od-daemon-sidecar-'));
    const handle = await startDaemonSidecar({
      app: APP_KEYS.DAEMON,
      base: root,
      ipc: join(root, 'daemon.sock'),
      mode: SIDECAR_MODES.DEV,
      namespace: 'test',
      source: SIDECAR_SOURCES.TOOLS_DEV,
    });

    try {
      expect(startDaemonRuntime).toHaveBeenCalledWith(
        expect.objectContaining({ port: 0 }),
      );
      const initial = await handle.status();
      expect(initial.state).toBe('running');
      expect(initial.url).toBe('http://127.0.0.1:48123');
      expect(initial.desktopAuthGateActive).toBe(false);

      setDesktopAuthSecret(randomBytes(32));
      const afterAuth = await handle.status();
      expect(afterAuth.desktopAuthGateActive).toBe(true);
    } finally {
      await handle.stop();
      await handle.waitUntilStopped();
      await rm(root, { recursive: true, force: true });
    }

    expect(stopRuntime).toHaveBeenCalled();
  });

  it('registers the live packaged web URL after daemon startup and replaces it on restart', async () => {
    const { startDaemonSidecar } = await import('../src/sidecar/server.js');
    const root = await mkdtemp(join(tmpdir(), 'od-daemon-sidecar-web-url-'));
    const ipc = join(root, 'daemon.sock');
    const handle = await startDaemonSidecar({
      app: APP_KEYS.DAEMON,
      base: root,
      ipc,
      mode: SIDECAR_MODES.RUNTIME,
      namespace: 'packaged-web-url',
      source: SIDECAR_SOURCES.PACKAGED,
    });

    try {
      expect((await handle.status()).trustedWebOriginPort).toBeNull();

      await requestJsonIpc(
        ipc,
        {
          input: { url: 'http://127.0.0.1:64248' },
          type: SIDECAR_MESSAGES.REGISTER_WEB_URL,
        },
        { timeoutMs: 1_000 },
      );
      expect(process.env.OD_WEB_PORT).toBe('64248');
      expect((await handle.status()).trustedWebOriginPort).toBe(64248);

      await requestJsonIpc(
        ipc,
        {
          input: { url: 'http://127.0.0.1:53421' },
          type: SIDECAR_MESSAGES.REGISTER_WEB_URL,
        },
        { timeoutMs: 1_000 },
      );
      expect(process.env.OD_WEB_PORT).toBe('53421');
      expect((await handle.status()).trustedWebOriginPort).toBe(53421);
    } finally {
      await handle.stop();
      await handle.waitUntilStopped();
      await rm(root, { recursive: true, force: true });
    }
  });
});
