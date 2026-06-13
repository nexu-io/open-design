import { mkdtemp, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  APP_KEYS,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
} from '@open-design/sidecar-proto';

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
    const { resetDesktopAuthForTests } = await import('../src/desktop-auth.js');
    resetDesktopAuthForTests();
  });

  afterEach(async () => {
    const { resetDesktopAuthForTests } = await import('../src/desktop-auth.js');
    resetDesktopAuthForTests();
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
});
