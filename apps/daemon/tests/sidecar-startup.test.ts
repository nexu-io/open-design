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
  type DesktopRenderFramesInput,
  type DesktopRenderFramesResult,
} from '@open-design/sidecar-proto';

const stopRuntime = vi.fn(async () => undefined);
const startDaemonRuntime = vi.fn(async (_options?: unknown) => ({
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

  it('passes the supervised child environment through the sidecar integration seam', async () => {
    const { startDaemonSidecar } = await import('../src/sidecar/server.js');
    const inheritedEnvironment = vi.fn(() => ({ OD_OPAQUE_CLIENT_CAPABILITY: 'capability' }));
    const handle = await startDaemonSidecar({
      app: APP_KEYS.DAEMON,
      base: tmpdir(),
      ipc: join(tmpdir(), 'daemon-environment.sock'),
      mode: SIDECAR_MODES.DEV,
      namespace: 'environment',
      source: SIDECAR_SOURCES.TOOLS_DEV,
    }, { inheritedEnvironment });

    try {
      expect(startDaemonRuntime).toHaveBeenCalledWith(expect.objectContaining({ inheritedEnvironment }));
    } finally {
      await handle.stop();
    }
  });

  it('registers the live packaged web URL after daemon startup and replaces it on restart', async () => {
    const { startDaemonSidecar } = await import('../src/sidecar/server.js');
    const root = await mkdtemp(join(tmpdir(), 'od-daemon-sidecar-web-url-'));
    const handle = await startDaemonSidecar({
      app: APP_KEYS.DAEMON,
      base: root,
      ipc: join(root, 'daemon.sock'),
      mode: SIDECAR_MODES.RUNTIME,
      namespace: 'packaged-web-url',
      source: SIDECAR_SOURCES.PACKAGED,
    });

    try {
      expect((await handle.status()).trustedWebOriginPort).toBeNull();

      await handle.invoke(SIDECAR_MESSAGES.REGISTER_WEB_URL, { url: 'http://127.0.0.1:64248' });
      expect(process.env.OD_WEB_PORT).toBe('64248');
      expect((await handle.status()).trustedWebOriginPort).toBe(64248);

      await handle.invoke(SIDECAR_MESSAGES.REGISTER_WEB_URL, { url: 'http://127.0.0.1:53421' });
      expect(process.env.OD_WEB_PORT).toBe('53421');
      expect((await handle.status()).trustedWebOriginPort).toBe(53421);
    } finally {
      await handle.stop();
      await handle.waitUntilStopped();
      await rm(root, { recursive: true, force: true });
    }
  });
  it('does not invoke frame rendering on an older desktop without the advertised capability', async () => {
    const { startDaemonSidecar } = await import('../src/sidecar/server.js');
    const root = await mkdtemp(join(tmpdir(), 'od-daemon-sidecar-frame-gate-'));
    const invokeDesktop = vi.fn();
    const statusDesktop = vi.fn(async () => ({
      pid: process.pid,
      state: 'running' as const,
      updatedAt: new Date().toISOString(),
      url: null,
      windowVisible: false,
    }));
    const handle = await startDaemonSidecar({
      app: APP_KEYS.DAEMON,
      base: root,
      ipc: join(root, 'daemon.sock'),
      mode: SIDECAR_MODES.RUNTIME,
      namespace: `frame-gate-${randomBytes(4).toString('hex')}`,
      source: SIDECAR_SOURCES.PACKAGED,
    }, { invokeDesktop, statusDesktop });

    try {
      const runtimeOptions = startDaemonRuntime.mock.lastCall?.[0] as {
        desktopFrameRenderer?: (
          input: DesktopRenderFramesInput,
        ) => Promise<DesktopRenderFramesResult>;
      };
      const result = await runtimeOptions.desktopFrameRenderer?.({
        height: 180,
        html: '<main></main>',
        outputDir: join(root, 'frames'),
        width: 320,
      });
      expect(result).toMatchObject({
        errorCode: 'FRAME_RENDERER_NOT_READY',
        ok: false,
      });
      expect(statusDesktop).toHaveBeenCalledWith(5_000);
      expect(invokeDesktop).not.toHaveBeenCalled();
    } finally {
      await handle.stop();
      await handle.waitUntilStopped();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('defers lifecycle stop while a handoff journal hold is active', async () => {
    const {
      holdParentMonitorExit,
      waitForParentMonitorRelease,
    } = await import('../src/sidecar/parent-monitor-gate.js');
    const release = holdParentMonitorExit();
    const stop = vi.fn(async () => undefined);
    const lifecycleStop = waitForParentMonitorRelease().then(stop);

    try {
      await Promise.resolve();
      expect(stop).not.toHaveBeenCalled();
      release();
      await lifecycleStop;
      expect(stop).toHaveBeenCalledOnce();
    } finally {
      release();
    }
  });
});
