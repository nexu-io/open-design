/**
 * Regression coverage for the OD_LEGACY_DATA_DIR migration-aware
 * daemon status timeout in apps/packaged/src/sidecars.ts.
 *
 * Background: when the user is recovering 0.3.x `.od/` data via
 * OD_LEGACY_DATA_DIR, apps/daemon/src/legacy-data-migrator.ts runs a
 * synchronous payload copy at module import time, before the daemon
 * sidecar can answer status. With the default 35-second status budget
 * a multi-GB legacy `.od/projects` or `.od/artifacts` tree can hit the
 * timeout while staging is still copying, after which the parent tears
 * the child down mid-promotion and can leave dataDir half-promoted
 * even with the in-process rollback.
 *
 * @see apps/packaged/src/sidecars.ts
 * @see apps/daemon/src/legacy-data-migrator.ts
 * @see https://github.com/nexu-io/open-design/issues/710
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, posix } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { createProcessStampArgs, isProcessAlive, stopProcesses, waitForProcessExit } from '@open-design/platform';
import { createJsonIpcServer, resolveAppIpcPath } from '@open-design/sidecar';
import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_ENV,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
} from '@open-design/sidecar-proto';

import {
  buildPackagedDaemonSpawnEnv,
  closeManagedChild,
  createPackagedSidecarSpawnOptions,
  createRestartPolicy,
  createWebSidecarSupervisor,
  DEFERRED_MANAGED_CHILD_EXIT_GRACE_MS,
  MANAGED_CHILD_EXIT_GRACE_MS,
  openLog,
  registerPackagedWebUrl,
  resolveManagedChildExitGraceMs,
  retireExistingSidecarEndpoint,
  resolveDaemonStatusTimeoutMs,
  resolvePackagedChildBaseEnv,
  resolvePackagedElectronNodeCommand,
  resolvePackagedPathEnv,
  waitForStatus,
} from '../src/sidecars.js';
import type { PackagedNamespacePaths } from '../src/paths.js';

function slashPath(value: string): string {
  return value.replaceAll('\\', '/');
}

async function spawnStampedHungWebOwner(
  socketPath: string,
  ipcPath = socketPath,
): Promise<{ child: ChildProcess; pid: number }> {
  const stamp = {
    app: APP_KEYS.WEB,
    ipc: ipcPath,
    mode: SIDECAR_MODES.RUNTIME,
    namespace: 'packaged-stale-web-test',
    source: SIDECAR_SOURCES.PACKAGED,
  };
  const child = spawn(
    process.execPath,
    [
      '-e',
      "process.on('SIGTERM',()=>{});require('net').createServer(s=>s.resume()).listen(process.env.OD_TEST_SOCK,()=>process.stdout.write('ready\\n'));setInterval(()=>{},1000)",
      '--',
      ...createProcessStampArgs(stamp, OPEN_DESIGN_SIDECAR_CONTRACT),
    ],
    {
      env: { ...process.env, OD_TEST_SOCK: socketPath },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const pid = child.pid;
  if (pid == null) throw new Error('test child did not start');
  await new Promise<void>((resolve, reject) => {
    const fail = (error: Error): void => {
      child.kill('SIGKILL');
      reject(error);
    };
    child.once('error', fail);
    child.once('exit', (code, signal) => {
      fail(new Error(`stamped hung web owner exited before ready code=${code} signal=${signal}`));
    });
    child.stdout?.once('data', () => resolve());
  });
  return { child, pid };
}

describe('resolveDaemonStatusTimeoutMs', () => {
  it('uses the 35-second baseline budget on platforms without a known slow-cold-start class', () => {
    expect(resolveDaemonStatusTimeoutMs({}, 'freebsd')).toBe(35_000);
  });

  it('widens the baseline to 90 seconds on darwin for packaged 0.18.1+ Apple Silicon cold starts', () => {
    // Packaged 0.18.1 macOS launches can exceed the 35s baseline on slower
    // Apple Silicon cold boots, after which the parent tears the sidecars down
    // and the desktop falls back to a stale web URL. The wider budget matches
    // the win32/linux "slow, not dead" safety net.
    // https://github.com/nexu-io/open-design/issues/6637
    expect(resolveDaemonStatusTimeoutMs({}, 'darwin')).toBe(90_000);
  });

  it('widens the baseline to 90 seconds on linux for AppImage FUSE cold starts', () => {
    // Every AppImage launch mounts a fresh FUSE squashfs with a cold VFS page
    // cache, so the daemon demand-pages its bundled node binary through FUSE on
    // EVERY launch and can blow past the 35s baseline. The prewarm pass cuts the
    // usual case to a few seconds; the wider budget is the safety net for slow
    // devices, mirroring the win32 rationale.
    // https://github.com/nexu-io/open-design/issues/5835
    expect(resolveDaemonStatusTimeoutMs({}, 'linux')).toBe(90_000);
  });

  it('widens the baseline to 90 seconds on win32 for AV-scan-slow first launches', () => {
    // Windows Defender scanning freshly-written packaged binaries inflates the
    // daemon cold start (native better-sqlite3 load + first SQLite open + pipe
    // bind) past 35s; PostHog showed ~90% of the status-timeout devices did open
    // on a later launch, so the wider budget lets the first launch succeed.
    expect(resolveDaemonStatusTimeoutMs({}, 'win32')).toBe(90_000);
  });

  it('treats an empty OD_LEGACY_DATA_DIR as unset', () => {
    expect(resolveDaemonStatusTimeoutMs({ OD_LEGACY_DATA_DIR: '' }, 'freebsd')).toBe(35_000);
  });

  it('extends the budget to 30 minutes when OD_LEGACY_DATA_DIR is set', () => {
    // The packaged sidecar must give the daemon a long-enough window to
    // sync-copy a multi-GB legacy `.od/` payload. Anything below ~10
    // minutes was historically observed to time out on real installs.
    const value = resolveDaemonStatusTimeoutMs({
      OD_LEGACY_DATA_DIR: '/path/to/old/.od',
    }, 'linux');
    expect(value).toBeGreaterThanOrEqual(10 * 60 * 1000);
    expect(value).toBe(30 * 60 * 1000);
    // The migration override beats the widened win32 baseline too.
    expect(
      resolveDaemonStatusTimeoutMs({ OD_LEGACY_DATA_DIR: '/path/to/old/.od' }, 'win32'),
    ).toBe(30 * 60 * 1000);
  });

  it('falls back to process.env when called with no argument', () => {
    const original = process.env.OD_LEGACY_DATA_DIR;
    try {
      delete process.env.OD_LEGACY_DATA_DIR;
      expect(resolveDaemonStatusTimeoutMs(undefined, 'linux')).toBe(90_000);
      expect(resolveDaemonStatusTimeoutMs(undefined, 'darwin')).toBe(90_000);
      process.env.OD_LEGACY_DATA_DIR = '/some/legacy/path';
      expect(resolveDaemonStatusTimeoutMs(undefined, 'linux')).toBe(30 * 60 * 1000);
    } finally {
      if (original == null) delete process.env.OD_LEGACY_DATA_DIR;
      else process.env.OD_LEGACY_DATA_DIR = original;
    }
  });
});

describe('packaged web URL registration', () => {
  it('registers the current dynamic web URL with the daemon sidecar and supports a later port', async () => {
    const namespace = `web-url-${process.pid}-${Date.now()}`;
    const daemonIpc = resolveAppIpcPath({
      app: APP_KEYS.DAEMON,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      namespace,
    });
    const received: unknown[] = [];
    const server = await createJsonIpcServer({
      socketPath: daemonIpc,
      handler: async (message) => {
        received.push(message);
        return { accepted: true };
      },
    });

    try {
      await registerPackagedWebUrl(daemonIpc, 'http://127.0.0.1:64248');
      await registerPackagedWebUrl(daemonIpc, 'http://127.0.0.1:53421');
      expect(received).toEqual([
        {
          input: { url: 'http://127.0.0.1:64248' },
          type: 'register-web-url',
        },
        {
          input: { url: 'http://127.0.0.1:53421' },
          type: 'register-web-url',
        },
      ]);
    } finally {
      await server.close();
    }
  });
});

describe('packaged child Vite+ environment forwarding', () => {
  it('pins packaged sidecars to the packaged desktop parent process', () => {
    const env = resolvePackagedChildBaseEnv({}, false, {}, false);

    expect(env[SIDECAR_ENV.TOOLS_DEV_PARENT_PID]).toBe(String(process.pid));
  });

  it('forwards CODEX_HOME so isolated and managed Codex installs never fall back to another user config', () => {
    const env = resolvePackagedChildBaseEnv({
      CODEX_HOME: '/tmp/isolated-codex-home',
      HOME: '/Users/tester',
      RANDOM_INTERNAL_FLAG: 'drop-me',
    });

    expect(env.CODEX_HOME).toBe('/tmp/isolated-codex-home');
    expect(env.RANDOM_INTERNAL_FLAG).toBeUndefined();
  });

  it('keeps VP_HOME in the packaged child base env without forwarding unrelated variables', () => {
    const env = resolvePackagedChildBaseEnv({
      HOME: '/Users/tester',
      LANG: 'en_US.UTF-8',
      RANDOM_INTERNAL_FLAG: 'drop-me',
      VP_HOME: '/Users/tester/.custom-vite-plus',
    });

    expect(env).toMatchObject({
      HOME: '/Users/tester',
      LANG: 'en_US.UTF-8',
      VP_HOME: '/Users/tester/.custom-vite-plus',
    });
    expect(env.RANDOM_INTERNAL_FLAG).toBeUndefined();
  });

  it('forwards standard Node proxy variables to packaged sidecars', () => {
    const env = resolvePackagedChildBaseEnv({
      ALL_PROXY: 'socks5://127.0.0.1:1080',
      HOME: '/Users/tester',
      HTTP_PROXY: 'http://127.0.0.1:7890',
      HTTPS_PROXY: 'http://127.0.0.1:7890',
      NODE_USE_ENV_PROXY: '1',
      NO_PROXY: 'localhost,127.0.0.1',
      RANDOM_INTERNAL_FLAG: 'drop-me',
      all_proxy: 'socks5://127.0.0.1:1081',
      http_proxy: 'http://127.0.0.1:7891',
      https_proxy: 'http://127.0.0.1:7891',
      no_proxy: 'localhost,127.0.0.1,::1',
    });

    expect(env).toMatchObject({
      ALL_PROXY: 'socks5://127.0.0.1:1081',
      HOME: '/Users/tester',
      HTTP_PROXY: 'http://127.0.0.1:7891',
      HTTPS_PROXY: 'http://127.0.0.1:7891',
      NODE_USE_ENV_PROXY: '1',
      NO_PROXY: 'localhost,127.0.0.1,::1',
    });
    if (process.platform !== 'win32') {
      expect(env).toMatchObject({
        all_proxy: 'socks5://127.0.0.1:1081',
        http_proxy: 'http://127.0.0.1:7891',
        https_proxy: 'http://127.0.0.1:7891',
        no_proxy: 'localhost,127.0.0.1,::1',
      });
    }
    expect(env.RANDOM_INTERNAL_FLAG).toBeUndefined();
  });

  it('merges system proxy env when the packaged app was GUI-launched without shell proxy vars', () => {
    const env = resolvePackagedChildBaseEnv(
      {
        HOME: '/Users/tester',
      },
      false,
      {
        HTTP_PROXY: 'http://system-proxy:8080',
        HTTPS_PROXY: 'http://system-proxy:8443',
        ALL_PROXY: 'socks5://system-proxy:1080',
        NO_PROXY: '.local,localhost',
        NODE_USE_ENV_PROXY: '1',
      },
    );

    expect(env).toMatchObject({
      HOME: '/Users/tester',
      HTTP_PROXY: 'http://system-proxy:8080',
      HTTPS_PROXY: 'http://system-proxy:8443',
      ALL_PROXY: 'socks5://system-proxy:1080',
      NO_PROXY: '.local,localhost',
      NODE_USE_ENV_PROXY: '1',
    });
  });

  it('lets forwarded lowercase proxy env override system uppercase proxy env', () => {
    const env = resolvePackagedChildBaseEnv(
      {
        HOME: '/Users/tester',
        https_proxy: 'http://user-lowercase:9443',
      },
      false,
      {
        HTTPS_PROXY: 'http://system-uppercase:8443',
        NODE_USE_ENV_PROXY: '1',
      },
    );

    expect(env.HTTPS_PROXY).toBe('http://user-lowercase:9443');
    if (process.platform !== 'win32') {
      expect(env.https_proxy).toBe('http://user-lowercase:9443');
    }
  });

  it('enables Node env proxy support for forwarded lowercase proxy env', () => {
    const env = resolvePackagedChildBaseEnv(
      {
        HOME: '/Users/tester',
        https_proxy: 'http://user-lowercase:9443',
      },
      false,
      {},
    );

    expect(env.HTTPS_PROXY).toBe('http://user-lowercase:9443');
    expect(env.NODE_USE_ENV_PROXY).toBe('1');
    if (process.platform !== 'win32') {
      expect(env.https_proxy).toBe('http://user-lowercase:9443');
    }
  });

  it('can skip injecting system proxy env into the packaged daemon base env', () => {
    const env = resolvePackagedChildBaseEnv(
      {
        HOME: '/Users/tester',
      },
      true,
      {
        HTTP_PROXY: 'http://system-proxy:8080',
        HTTPS_PROXY: 'http://system-proxy:8443',
        NODE_USE_ENV_PROXY: '1',
      },
      false,
    );

    expect(env).toMatchObject({
      HOME: '/Users/tester',
    });
    expect(env.HTTP_PROXY).toBeUndefined();
    expect(env.HTTPS_PROXY).toBeUndefined();
    expect(env.NODE_USE_ENV_PROXY).toBeUndefined();
  });

  it('forwards OD_ALLOWED_INTERNAL_HOSTS so the daemon can resolve trusted loopback hosts in packaged sidecars', () => {
    const env = resolvePackagedChildBaseEnv({
      HOME: '/Users/tester',
      OD_ALLOWED_INTERNAL_HOSTS: '127.0.0.1,localhost',
      RANDOM_INTERNAL_FLAG: 'drop-me',
    });

    expect(env.OD_ALLOWED_INTERNAL_HOSTS).toBe('127.0.0.1,localhost');
    expect(env.RANDOM_INTERNAL_FLAG).toBeUndefined();
  });

  it('adds custom VP_HOME/bin to the packaged PATH builder', () => {
    const vpHome = mkdtempSync(join(tmpdir(), 'od-packaged-vp-home-'));
    const originalVpHome = process.env.VP_HOME;
    try {
      process.env.VP_HOME = vpHome;
      const pathEntries = resolvePackagedPathEnv('/usr/bin').split(delimiter);

      expect(pathEntries).toContain('/usr/bin');
      expect(pathEntries).toContain(join(vpHome, 'bin'));
    } finally {
      if (originalVpHome == null) delete process.env.VP_HOME;
      else process.env.VP_HOME = originalVpHome;
      rmSync(vpHome, { recursive: true, force: true });
    }
  });
});

describe.runIf(process.platform !== 'win32')('packaged stale web endpoint recovery', () => {
  it('unlinks a web socket whose owner accepts connections but never answers IPC', async () => {
    const root = mkdtempSync(join(tmpdir(), 'od-packaged-stale-web-'));
    const socketPath = join(root, 'web.sock');
    const logPath = join(root, 'web.log');
    const sockets = new Set<Socket>();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
      socket.resume();
    });
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once('error', rejectListen);
      server.listen(socketPath, () => {
        server.off('error', rejectListen);
        resolveListen();
      });
    });

    try {
      await retireExistingSidecarEndpoint(socketPath, logPath, APP_KEYS.WEB);
      expect(existsSync(socketPath)).toBe(false);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('unresponsive web sidecar endpoint removed before relaunch'),
      );
    } finally {
      warn.mockRestore();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('stops the stamped web owner before unlinking its unresponsive socket', async () => {
    const root = mkdtempSync(join(tmpdir(), 'od-packaged-stale-web-owner-'));
    const socketPath = join(root, 'web.sock');
    const logPath = join(root, 'web.log');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { child, pid } = await spawnStampedHungWebOwner(socketPath);

    try {
      await retireExistingSidecarEndpoint(socketPath, logPath, APP_KEYS.WEB);
      expect(isProcessAlive(pid)).toBe(false);
      expect(existsSync(socketPath)).toBe(false);
      expect(readFileSync(logPath, 'utf8')).toContain(
        'stopping unresponsive stamped web sidecar before socket takeover',
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('unresponsive web sidecar endpoint removed before relaunch'),
      );
    } finally {
      warn.mockRestore();
      child.kill('SIGKILL');
      await waitForProcessExit(pid, 1_000);
      rmSync(root, { force: true, recursive: true });
    }
  }, 10_000);

  it('does not unlink when the stamped web owner survives stopProcesses', async () => {
    const root = mkdtempSync(join(tmpdir(), 'od-packaged-stale-web-remaining-'));
    const socketPath = join(root, 'web.sock');
    const logPath = join(root, 'web.log');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { child, pid } = await spawnStampedHungWebOwner(socketPath);
    const stopProcesses = vi.fn(async () => ({
      alreadyStopped: false,
      forcedPids: [],
      matchedPids: [pid],
      remainingPids: [pid],
      stoppedPids: [],
    }));

    try {
      await retireExistingSidecarEndpoint(socketPath, logPath, APP_KEYS.WEB, { stopProcesses });
      expect(isProcessAlive(pid)).toBe(true);
      expect(existsSync(socketPath)).toBe(true);
      expect(readFileSync(logPath, 'utf8')).toContain(
        'unresponsive stamped web sidecar still running after stop',
      );
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      child.kill('SIGKILL');
      await waitForProcessExit(pid, 1_000);
      rmSync(root, { force: true, recursive: true });
    }
  }, 10_000);

  it('does not unlink when process discovery returns no snapshots', async () => {
    const root = mkdtempSync(join(tmpdir(), 'od-packaged-stale-web-empty-list-'));
    const socketPath = join(root, 'web.sock');
    const logPath = join(root, 'web.log');
    const sockets = new Set<Socket>();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
      socket.resume();
    });
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once('error', rejectListen);
      server.listen(socketPath, () => {
        server.off('error', rejectListen);
        resolveListen();
      });
    });
    const listProcessSnapshots = vi.fn(async () => []);

    try {
      await retireExistingSidecarEndpoint(socketPath, logPath, APP_KEYS.WEB, { listProcessSnapshots });
      expect(existsSync(socketPath)).toBe(true);
      expect(readFileSync(logPath, 'utf8')).toContain(
        'process discovery failed before web socket takeover',
      );
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('does not unlink when process discovery throws', async () => {
    const root = mkdtempSync(join(tmpdir(), 'od-packaged-stale-web-list-throw-'));
    const socketPath = join(root, 'web.sock');
    const logPath = join(root, 'web.log');
    const sockets = new Set<Socket>();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
      socket.resume();
    });
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once('error', rejectListen);
      server.listen(socketPath, () => {
        server.off('error', rejectListen);
        resolveListen();
      });
    });
    const listProcessSnapshots = vi.fn(async () => {
      throw new Error('ps-failed');
    });

    try {
      await retireExistingSidecarEndpoint(socketPath, logPath, APP_KEYS.WEB, { listProcessSnapshots });
      expect(existsSync(socketPath)).toBe(true);
      expect(readFileSync(logPath, 'utf8')).toContain(
        'failed to enumerate processes before web socket takeover',
      );
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('does not unlink when stopping the stamped web owner throws', async () => {
    const root = mkdtempSync(join(tmpdir(), 'od-packaged-stale-web-stop-throw-'));
    const socketPath = join(root, 'web.sock');
    const logPath = join(root, 'web.log');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { child, pid } = await spawnStampedHungWebOwner(socketPath);
    const stopProcesses = vi.fn(async () => {
      throw new Error('stop-failed');
    });

    try {
      await retireExistingSidecarEndpoint(socketPath, logPath, APP_KEYS.WEB, { stopProcesses });
      expect(isProcessAlive(pid)).toBe(true);
      expect(existsSync(socketPath)).toBe(true);
      expect(readFileSync(logPath, 'utf8')).toContain(
        'failed to stop unresponsive stamped web sidecar',
      );
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      child.kill('SIGKILL');
      await waitForProcessExit(pid, 1_000);
      rmSync(root, { force: true, recursive: true });
    }
  }, 10_000);

  it('does not stop a stamped web owner of a different ipc path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'od-packaged-stale-web-other-'));
    const ownerSocketPath = join(root, 'owner.sock');
    const targetSocketPath = join(root, 'web.sock');
    const logPath = join(root, 'web.log');
    const sockets = new Set<Socket>();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { child, pid } = await spawnStampedHungWebOwner(ownerSocketPath);
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
      socket.resume();
    });
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once('error', rejectListen);
      server.listen(targetSocketPath, () => {
        server.off('error', rejectListen);
        resolveListen();
      });
    });

    try {
      await retireExistingSidecarEndpoint(targetSocketPath, logPath, APP_KEYS.WEB);
      expect(isProcessAlive(pid)).toBe(true);
      expect(existsSync(ownerSocketPath)).toBe(true);
      expect(existsSync(targetSocketPath)).toBe(false);
    } finally {
      warn.mockRestore();
      child.kill('SIGKILL');
      await waitForProcessExit(pid, 1_000);
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      rmSync(root, { force: true, recursive: true });
    }
  }, 10_000);

  it('does not unlink an unresponsive daemon socket', async () => {
    const root = mkdtempSync(join(tmpdir(), 'od-packaged-stale-daemon-'));
    const socketPath = join(root, 'daemon.sock');
    const logPath = join(root, 'daemon.log');
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
      socket.resume();
    });
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once('error', rejectListen);
      server.listen(socketPath, () => {
        server.off('error', rejectListen);
        resolveListen();
      });
    });

    try {
      await retireExistingSidecarEndpoint(socketPath, logPath, APP_KEYS.DAEMON);
      expect(existsSync(socketPath)).toBe(true);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      rmSync(root, { force: true, recursive: true });
    }
  });
});

describe('resolvePackagedElectronNodeCommand', () => {
  it('uses the hidden Electron helper as the macOS Electron-as-Node command when available', async () => {
    const root = mkdtempSync(join(tmpdir(), 'od-packaged-electron-helper-'));
    try {
      const appPath = posix.join(root.replaceAll('\\', '/'), 'Open Design.app');
      const execPath = posix.join(appPath, 'Contents', 'MacOS', 'Open Design');
      const helperPath = posix.join(
        appPath,
        'Contents',
        'Frameworks',
        'Open Design Helper.app',
        'Contents',
        'MacOS',
        'Open Design Helper',
      );

      mkdirSync(posix.join(appPath, 'Contents', 'MacOS'), { recursive: true });
      mkdirSync(dirname(helperPath), { recursive: true });
      writeFileSync(execPath, '#!/bin/sh\n', 'utf8');
      writeFileSync(helperPath, '#!/bin/sh\n', 'utf8');

      await expect(resolvePackagedElectronNodeCommand(execPath, 'darwin')).resolves.toSatisfy(
        (value: string) => slashPath(value) === helperPath,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('falls back to the main executable when the macOS helper is unavailable', async () => {
    const root = mkdtempSync(join(tmpdir(), 'od-packaged-no-electron-helper-'));
    try {
      const execPath = join(root, 'Open Design.app', 'Contents', 'MacOS', 'Open Design');
      mkdirSync(dirname(execPath), { recursive: true });
      writeFileSync(execPath, '#!/bin/sh\n', 'utf8');

      await expect(resolvePackagedElectronNodeCommand(execPath, 'darwin')).resolves.toBe(execPath);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps the main executable on non-macOS platforms', async () => {
    const execPath = '/opt/Open Design/open-design';

    await expect(resolvePackagedElectronNodeCommand(execPath, 'linux')).resolves.toBe(execPath);
  });
});

/**
 * Build a child-process stand-in that satisfies the `watch.child`
 * shape `waitForStatus` consumes. We only use `once('exit')`,
 * `off('exit')`, and the synchronous `exitCode` / `signalCode`
 * fields, so an EventEmitter plus those two properties is enough.
 */
function fakeChild(): EventEmitter & {
  exitCode: number | null;
  pid: number;
  signalCode: NodeJS.Signals | null;
  fireExit: (code: number | null, signal: NodeJS.Signals | null) => void;
} {
  const emitter = new EventEmitter() as EventEmitter & {
    exitCode: number | null;
    pid: number;
    signalCode: NodeJS.Signals | null;
    fireExit: (code: number | null, signal: NodeJS.Signals | null) => void;
  };
  emitter.exitCode = null;
  emitter.pid = 1234;
  emitter.signalCode = null;
  emitter.fireExit = (code, signal) => {
    emitter.exitCode = code;
    emitter.signalCode = signal;
    emitter.emit('exit', code, signal);
  };
  return emitter;
}

describe('buildPackagedDaemonSpawnEnv', () => {
  // PR #974 round-5 (lefarcen P2): the daemon's import-folder gate must
  // be ON when an Electron desktop is being started alongside the daemon
  // and OFF in headless packaged mode (daemon+web only, no shell.openPath
  // surface, no client to register a secret). Pin both branches against
  // a real pure-helper invocation so a future refactor can't silently
  // regress either side.
  function fakePaths(): PackagedNamespacePaths {
    return {
      cacheRoot: '/tmp/od-pkg/cache',
      dataRoot: '/tmp/od-pkg/data',
      desktopIdentityPath: '/tmp/od-pkg/runtime/desktop-root.json',
      desktopLogPath: '/tmp/od-pkg/logs/desktop/latest.log',
      desktopLogsRoot: '/tmp/od-pkg/logs/desktop',
      electronSessionDataRoot: '/tmp/od-pkg/user-data/session',
      electronUserDataRoot: '/tmp/od-pkg/user-data',
      headlessIdentityPath: '/tmp/od-pkg/runtime/headless-root.json',
      installationRoot: '/tmp/od-pkg/..',
      installerObservationRoot: '/tmp/od-pkg/data/observations/installer',
      logsRoot: '/tmp/od-pkg/logs',
      namespaceRoot: '/tmp/od-pkg',
      resourceRoot: '/tmp/od-pkg/resources',
      runtimeRoot: '/tmp/od-pkg/runtime',
      updateRoot: '/tmp/od-pkg/updates',
      webIdentityPath: '/tmp/od-pkg/runtime/web-root.json',
    };
  }

  it('uses the namespace runtime root for child processes without reading cwd', () => {
    const cwd = vi.spyOn(process, 'cwd').mockImplementation(() => {
      throw new Error('uv_cwd');
    });

    try {
      expect(createPackagedSidecarSpawnOptions({
        env: { NODE_ENV: 'production' },
        logFd: 42,
        paths: fakePaths(),
      })).toEqual({
        cwd: '/tmp/od-pkg/runtime',
        env: { NODE_ENV: 'production' },
        stdio: ['ignore', 42, 42],
        windowsHide: true,
      });
      expect(cwd).not.toHaveBeenCalled();
    } finally {
      cwd.mockRestore();
    }
  });

  it('sets OD_REQUIRE_DESKTOP_AUTH=1 when requireDesktopAuth=true (Electron entry)', () => {
    const env = buildPackagedDaemonSpawnEnv(fakePaths(), {
      appVersion: '1.2.3',
      daemonCliEntry: null,
      legacyDataDir: null,
      requireDesktopAuth: true,
    });
    expect(env.OD_REQUIRE_DESKTOP_AUTH).toBe('1');
    expect(env.OD_DATA_DIR).toBe('/tmp/od-pkg/data');
    expect(env.OD_RESOURCE_ROOT).toBe('/tmp/od-pkg/resources');
    expect(env.OD_APP_VERSION).toBe('1.2.3');
    expect(env.OD_LEGACY_DATA_DIR).toBeUndefined();
  });

  it('forwards updater controls needed by a historical desktop handoff', () => {
    const env = buildPackagedDaemonSpawnEnv(fakePaths(), {
      appVersion: '1.2.3',
      daemonCliEntry: null,
      desktopHandoffEnv: {
        OD_UPDATE_CURRENT_VERSION: '1.2.3',
        OD_UPDATE_INSTALLED_VERSION: '1.0.0',
        OD_UPDATE_METADATA_URL: 'http://127.0.0.1:54321/stable/latest/metadata.json',
        PATH: 'must-not-leak-through-handoff-env',
      },
      legacyDataDir: null,
      requireDesktopAuth: true,
    });

    expect(env.OD_UPDATE_CURRENT_VERSION).toBe('1.2.3');
    expect(env.OD_UPDATE_INSTALLED_VERSION).toBe('1.0.0');
    expect(env.OD_UPDATE_METADATA_URL).toBe('http://127.0.0.1:54321/stable/latest/metadata.json');
    expect(env.PATH).toBeUndefined();
  });

  it('omits OD_REQUIRE_DESKTOP_AUTH entirely when requireDesktopAuth=false (headless)', () => {
    const env = buildPackagedDaemonSpawnEnv(fakePaths(), {
      appVersion: null,
      daemonCliEntry: null,
      legacyDataDir: null,
      requireDesktopAuth: false,
    });
    // Round-5 (lefarcen P2): MUST NOT set the env var, even to "0" —
    // the daemon's gate trigger is `process.env.OD_REQUIRE_DESKTOP_AUTH === '1'`,
    // so a literal "0" would behave the same as omitted today, but a
    // future code change to truthy-check the variable would silently
    // re-arm the gate. Omitted is the intent.
    expect('OD_REQUIRE_DESKTOP_AUTH' in env).toBe(false);
    expect(env.OD_DATA_DIR).toBe('/tmp/od-pkg/data');
    expect(env.OD_APP_VERSION).toBeUndefined();
  });

  it('forwards the signed packaged launcher used to bootstrap MCP headlessly', () => {
    const env = buildPackagedDaemonSpawnEnv(fakePaths(), {
      appVersion: '1.2.3',
      daemonCliEntry: '/Applications/Open Design.app/Contents/Resources/app/prebundled/daemon/daemon-cli.mjs',
      legacyDataDir: null,
      mcpBootstrapArgs: [
        '-g',
        '-j',
        '/Applications/Open Design.app',
        '--args',
        '--headless',
      ],
      mcpBootstrapCommand:
        '/usr/bin/open',
      requireDesktopAuth: false,
    });

    expect(env.OD_MCP_BOOTSTRAP_COMMAND).toBe(
      '/usr/bin/open',
    );
    expect(JSON.parse(env.OD_MCP_BOOTSTRAP_ARGS ?? 'null')).toEqual([
      '-g',
      '-j',
      '/Applications/Open Design.app',
      '--args',
      '--headless',
    ]);
  });

  it('forwards OD_LEGACY_DATA_DIR only when set, irrespective of requireDesktopAuth', () => {
    const withLegacy = buildPackagedDaemonSpawnEnv(fakePaths(), {
      appVersion: null,
      daemonCliEntry: null,
      legacyDataDir: '/old/.od',
      requireDesktopAuth: false,
    });
    expect(withLegacy.OD_LEGACY_DATA_DIR).toBe('/old/.od');

    const withEmptyLegacy = buildPackagedDaemonSpawnEnv(fakePaths(), {
      appVersion: null,
      daemonCliEntry: null,
      legacyDataDir: '',
      requireDesktopAuth: true,
    });
    // Empty string must NOT propagate — daemon treats "env set but
    // path invalid" as an error and refuses to start.
    expect('OD_LEGACY_DATA_DIR' in withEmptyLegacy).toBe(false);
  });

  it('forwards daemonCliEntry through OD_DAEMON_CLI_PATH when set', () => {
    const env = buildPackagedDaemonSpawnEnv(fakePaths(), {
      appVersion: null,
      daemonCliEntry: '/path/to/cli/dist/index.js',
      legacyDataDir: null,
      requireDesktopAuth: true,
    });
    expect(env.OD_DAEMON_CLI_PATH).toBe('/path/to/cli/dist/index.js');
  });

  it('forwards the packaged node command as OD_NODE_BIN for agent wrapper calls', () => {
    const env = buildPackagedDaemonSpawnEnv(fakePaths(), {
      appVersion: null,
      daemonCliEntry: null,
      legacyDataDir: null,
      nodeCommand: 'C:\\Users\\Ada\\AppData\\Local\\Programs\\Open Design\\resources\\open-design\\bin\\node.exe',
      requireDesktopAuth: true,
    });

    expect(env.OD_NODE_BIN).toBe(
      'C:\\Users\\Ada\\AppData\\Local\\Programs\\Open Design\\resources\\open-design\\bin\\node.exe',
    );
  });

  it('forwards the packaged telemetry relay URL to the daemon when configured', () => {
    const env = buildPackagedDaemonSpawnEnv(fakePaths(), {
      appVersion: null,
      daemonCliEntry: null,
      legacyDataDir: null,
      requireDesktopAuth: true,
      telemetryRelayUrl: 'https://telemetry.open-design.ai/api/langfuse',
    });
    expect(env.OPEN_DESIGN_TELEMETRY_RELAY_URL).toBe(
      'https://telemetry.open-design.ai/api/langfuse',
    );
  });

  it('forwards the packaged AMR profile to the daemon when configured', () => {
    const env = buildPackagedDaemonSpawnEnv(fakePaths(), {
      appVersion: null,
      amrProfile: 'test',
      daemonCliEntry: null,
      legacyDataDir: null,
      requireDesktopAuth: true,
    });
    expect(env.OPEN_DESIGN_AMR_PROFILE).toBe('test');
  });

  it('forwards the per-profile Vela console origins to the daemon', () => {
    const env = buildPackagedDaemonSpawnEnv(fakePaths(), {
      appVersion: null,
      amrProfile: 'prod',
      daemonCliEntry: null,
      legacyDataDir: null,
      requireDesktopAuth: true,
      velaWebUrl: 'https://prod.example.invalid',
      velaWebUrls: {
        prod: 'https://prod.example.invalid',
        test: 'https://test.example.invalid',
        'feature-test': 'https://feature.example.invalid',
      },
    });
    expect(JSON.parse(env.OD_VELA_WEB_URLS ?? '{}')).toEqual({
      prod: 'https://prod.example.invalid',
      test: 'https://test.example.invalid',
      'feature-test': 'https://feature.example.invalid',
    });
  });

  it.each(['feature-test', 'test'] as const)(
    'enables the vela-cli workspace-team transport for a %s build with an injected vela web origin',
    (amrProfile) => {
      const env = buildPackagedDaemonSpawnEnv(fakePaths(), {
        appVersion: null,
        amrProfile,
        daemonCliEntry: null,
        legacyDataDir: null,
        requireDesktopAuth: true,
        velaWebUrl: 'https://vela.example.invalid',
      });
      expect(env.OPEN_DESIGN_AMR_PROFILE).toBe(amrProfile);
      expect(env.OD_WORKSPACE_CONTEXT_SOURCE).toBe('vela');
      expect(env.OD_TEAM_PROJECTS_TRANSPORT).toBe('vela-cli');
      expect(env.OD_COLLAB_TRANSPORT).toBe('vela-cli');
      expect(env.OD_RESOURCE_TRANSPORT).toBe('vela-cli');
      expect(env.OD_VELA_WEB_URL).toBe('https://vela.example.invalid');
    },
  );

  // The gate is profile AND origin. A build whose CI secret was never
  // configured must degrade to "workspace-team dormant" rather than turn the
  // transports on against an unknown backend.
  it.each(['feature-test', 'test'] as const)(
    'leaves the workspace-team transport off for a %s build with no injected vela web origin',
    (amrProfile) => {
      for (const velaWebUrl of [undefined, null, '', '   ']) {
        const env = buildPackagedDaemonSpawnEnv(fakePaths(), {
          appVersion: null,
          amrProfile,
          daemonCliEntry: null,
          legacyDataDir: null,
          requireDesktopAuth: true,
          velaWebUrl,
        });
        expect('OD_WORKSPACE_CONTEXT_SOURCE' in env).toBe(false);
        expect('OD_TEAM_PROJECTS_TRANSPORT' in env).toBe(false);
        expect('OD_COLLAB_TRANSPORT' in env).toBe(false);
        expect('OD_RESOURCE_TRANSPORT' in env).toBe(false);
        expect('OD_VELA_WEB_URL' in env).toBe(false);
      }
    },
  );

  it('leaves the workspace-team transport off for builds without a workspace-team backend', () => {
    for (const amrProfile of ['prod', 'local', null] as const) {
      const env = buildPackagedDaemonSpawnEnv(fakePaths(), {
        appVersion: null,
        amrProfile,
        daemonCliEntry: null,
        legacyDataDir: null,
        requireDesktopAuth: true,
      });
      expect('OD_WORKSPACE_CONTEXT_SOURCE' in env).toBe(false);
      expect('OD_TEAM_PROJECTS_TRANSPORT' in env).toBe(false);
      expect('OD_COLLAB_TRANSPORT' in env).toBe(false);
      expect('OD_RESOURCE_TRANSPORT' in env).toBe(false);
      expect('OD_VELA_WEB_URL' in env).toBe(false);
    }
  });

  // Workspace Team is released, so a prod bundle handed an origin now turns the
  // transports on — that is the shipping path for stable users.
  it('enables the workspace-team transport for a prod build with an injected vela web origin', () => {
    const env = buildPackagedDaemonSpawnEnv(fakePaths(), {
      appVersion: null,
      amrProfile: 'prod',
      daemonCliEntry: null,
      legacyDataDir: null,
      requireDesktopAuth: true,
      velaWebUrl: 'https://open-design.ai/cloud',
    });
    expect(env.OD_WORKSPACE_CONTEXT_SOURCE).toBe('vela');
    expect(env.OD_TEAM_PROJECTS_TRANSPORT).toBe('vela-cli');
    expect(env.OD_COLLAB_TRANSPORT).toBe('vela-cli');
    expect(env.OD_RESOURCE_TRANSPORT).toBe('vela-cli');
    expect(env.OD_VELA_WEB_URL).toBe('https://open-design.ai/cloud');
  });

  // The profile allowlist remains the load-bearing half of the gate for every
  // profile that is NOT a released Vela backend: a `local` or profile-less
  // bundle handed an origin must still stay dormant rather than point the
  // transports at a backend that does not serve them.
  it('never enables the workspace-team transport for a local or profile-less build', () => {
    for (const amrProfile of ['local', null] as const) {
      const env = buildPackagedDaemonSpawnEnv(fakePaths(), {
        appVersion: null,
        amrProfile,
        daemonCliEntry: null,
        legacyDataDir: null,
        requireDesktopAuth: true,
        velaWebUrl: 'https://vela.example.invalid',
      });
      expect('OD_WORKSPACE_CONTEXT_SOURCE' in env).toBe(false);
      expect('OD_TEAM_PROJECTS_TRANSPORT' in env).toBe(false);
      expect('OD_COLLAB_TRANSPORT' in env).toBe(false);
      expect('OD_RESOURCE_TRANSPORT' in env).toBe(false);
      expect('OD_VELA_WEB_URL' in env).toBe(false);
    }
  });

  // The origin half of the gate is what protects a misconfigured prod build:
  // no injected origin means dormant, never a guessed backend.
  it('keeps a prod build dormant when no vela web origin was injected', () => {
    const env = buildPackagedDaemonSpawnEnv(fakePaths(), {
      appVersion: null,
      amrProfile: 'prod',
      daemonCliEntry: null,
      legacyDataDir: null,
      requireDesktopAuth: true,
    });
    expect('OD_WORKSPACE_CONTEXT_SOURCE' in env).toBe(false);
    expect('OD_TEAM_PROJECTS_TRANSPORT' in env).toBe(false);
    expect('OD_COLLAB_TRANSPORT' in env).toBe(false);
    expect('OD_RESOURCE_TRANSPORT' in env).toBe(false);
    expect('OD_VELA_WEB_URL' in env).toBe(false);
  });

  it('forwards POSTHOG_KEY/POSTHOG_HOST to the daemon spawn env when baked into the bundle', () => {
    const env = buildPackagedDaemonSpawnEnv(fakePaths(), {
      appVersion: null,
      daemonCliEntry: null,
      legacyDataDir: null,
      requireDesktopAuth: true,
      posthogKey: 'phc_packaged_test',
      posthogHost: 'https://us.i.posthog.com',
    });
    expect(env.POSTHOG_KEY).toBe('phc_packaged_test');
    expect(env.POSTHOG_HOST).toBe('https://us.i.posthog.com');
  });

  it('omits POSTHOG_KEY/POSTHOG_HOST for fork builds that lack the secret', () => {
    const env = buildPackagedDaemonSpawnEnv(fakePaths(), {
      appVersion: null,
      daemonCliEntry: null,
      legacyDataDir: null,
      requireDesktopAuth: true,
      posthogKey: null,
      posthogHost: null,
    });
    expect(env.POSTHOG_KEY).toBeUndefined();
    expect(env.POSTHOG_HOST).toBeUndefined();
  });
});

describe('waitForStatus child-exit fast-fail', () => {
  // mrcfps round-7: when OD_LEGACY_DATA_DIR is set the daemon status
  // budget extends to 30 minutes for legitimate large-payload migrations.
  // But a daemon that throws LegacyMigrationError at startup (invalid
  // legacy dir, existing target payload, symlink, marker write failure)
  // exits before reporting status, and waiting the full 30 minutes makes
  // the packaged app look hung. Racing the IPC polling against the
  // child's exit event surfaces the failure promptly with a pointer to
  // the daemon log.

  it('rejects within milliseconds when the child exits before status is ready', async () => {
    const child = fakeChild();
    const ipcPath = '/tmp/od-test-no-such-ipc-' + Date.now();
    const logPath = '/tmp/od-test-daemon.log';

    const startedAt = Date.now();
    const promise = waitForStatus<{ url: string | null }>(
      ipcPath,
      (status) => status.url != null,
      30 * 60 * 1000,
      { child, logPath },
    );

    // Simulate the daemon throwing in its startup migrator and exiting
    // immediately. With the old code, the wait would have blocked for
    // the full 30-minute budget; with the fix it must reject fast.
    setTimeout(() => child.fireExit(1, null), 50);

    let captured: unknown;
    try {
      await promise;
    } catch (err) {
      captured = err;
    }
    const elapsed = Date.now() - startedAt;

    expect(captured).toBeInstanceOf(Error);
    expect((captured as Error).message).toMatch(/daemon exited before reporting status/);
    expect((captured as Error).message).toContain('code=1');
    expect((captured as Error).message).toContain(logPath);

    // The whole point: don't sit through DAEMON_MIGRATION_STATUS_TIMEOUT_MS.
    // Allow generous slack for slow CI runners; the fix should bound this
    // to roughly the IPC poll cadence (150ms) plus a couple of timer ticks.
    expect(elapsed).toBeLessThan(2_000);
  });

  it('detects a child that exited synchronously before waitForStatus was entered', async () => {
    const child = fakeChild();
    // Pretend the daemon process already exited before we got here. The
    // 'exit' event has already fired and would not re-fire for a late
    // listener, so waitForStatus must read the synchronous exitCode /
    // signalCode fields to see the bad state.
    child.exitCode = 2;
    child.signalCode = null;

    const startedAt = Date.now();
    let captured: unknown;
    try {
      await waitForStatus<{ url: string | null }>(
        '/tmp/od-test-no-such-ipc-pre-' + Date.now(),
        (status) => status.url != null,
        30 * 60 * 1000,
        { child, logPath: '/tmp/od-test-daemon.log' },
      );
    } catch (err) {
      captured = err;
    }
    const elapsed = Date.now() - startedAt;

    expect(captured).toBeInstanceOf(Error);
    expect((captured as Error).message).toMatch(/daemon exited before reporting status/);
    expect((captured as Error).message).toContain('code=2');
    expect(elapsed).toBeLessThan(2_000);
  });

  it('does not accept ready status from a stale IPC endpoint owned by a different pid', async () => {
    const child = fakeChild();
    child.pid = 5678;
    const ipcPath = resolveAppIpcPath({
      app: APP_KEYS.WEB,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      namespace: `stale-ipc-${process.pid}-${Date.now()}`,
    });
    const server = await createJsonIpcServer({
      socketPath: ipcPath,
      handler: async () => ({
        pid: 1234,
        state: 'running',
        updatedAt: new Date().toISOString(),
        url: 'http://127.0.0.1:1234',
      }),
    });

    try {
      let captured: unknown;
      try {
        await waitForStatus<{ pid?: number | null; url: string | null }>(
          ipcPath,
          (status) => status.url != null,
          250,
          { child, logPath: join(tmpdir(), 'od-test-web.log') },
        );
      } catch (err) {
        captured = err;
      }

      expect(captured).toBeInstanceOf(Error);
      expect((captured as Error).message).toContain('sidecar status pid 1234 did not match spawned pid 5678');
    } finally {
      await server.close();
    }
  });
});

/**
 * The web sidecar used to be spawned once and never watched. When it
 * died mid-session — observed 2026-07-25 after a 0.15.1 -> 0.16.1
 * launcher handoff reaped it — nothing respawned it, and the od://
 * proxy kept forwarding to the dead port until the app was relaunched.
 *
 * The supervisor respawns it, but a sidecar that crashes during boot
 * must not respawn forever: each attempt spends a full Next.js boot.
 */
describe('createRestartPolicy', () => {
  it('allows up to maxRestarts inside the window and refuses the next one', () => {
    const policy = createRestartPolicy({ maxRestarts: 3, windowMs: 60_000 });
    expect(policy.allow(1_000)).toBe(true);
    expect(policy.allow(2_000)).toBe(true);
    expect(policy.allow(3_000)).toBe(true);
    expect(policy.allow(4_000)).toBe(false);
  });

  it('forgets attempts that fell out of the window', () => {
    const policy = createRestartPolicy({ maxRestarts: 2, windowMs: 10_000 });
    expect(policy.allow(1_000)).toBe(true);
    expect(policy.allow(2_000)).toBe(true);
    expect(policy.allow(3_000)).toBe(false);
    // 12_001 is more than windowMs after both recorded attempts, so the
    // window is empty again and a fresh burst is allowed.
    expect(policy.allow(12_001)).toBe(true);
  });

  it('defaults to 5 restarts per 60s window', () => {
    const policy = createRestartPolicy();
    for (let i = 0; i < 5; i += 1) {
      expect(policy.allow(1_000 + i)).toBe(true);
    }
    expect(policy.allow(1_006)).toBe(false);
  });
});

describe('createWebSidecarSupervisor', () => {
  type SupervisorChild = {
    exit(): void;
    exited: boolean;
    exitListeners: Array<() => void>;
    name: string;
  };

  const child = (name: string): SupervisorChild => {
    const value: SupervisorChild = {
      exit() {
        value.exited = true;
        for (const listener of value.exitListeners.splice(0)) listener();
      },
      exited: false,
      exitListeners: [],
      name,
    };
    return value;
  };

  it('keeps retrying when a replacement exits before readiness', async () => {
    const initial = child('initial');
    const failedReplacement = child('failed-replacement');
    const recovered = child('recovered');
    const spawnQueue = [initial, failedReplacement, recovered];
    const closed: string[] = [];
    const registered: string[] = [];

    const supervisor = createWebSidecarSupervisor<SupervisorChild, { url: string | null }>({
      closeChild: async (value) => {
        closed.push(value.name);
      },
      hasExited: (value) => value.exited,
      onExit: (value, listener) => value.exitListeners.push(listener),
      policy: createRestartPolicy({ maxRestarts: 5, windowMs: 60_000 }),
      registerUrl: async (url) => {
        registered.push(url);
      },
      spawn: async () => {
        const value = spawnQueue.shift();
        if (value == null) throw new Error('unexpected extra spawn');
        return value;
      },
      waitUntilReady: async (value) => {
        if (value === failedReplacement) {
          value.exit();
          throw new Error('replacement exited during boot');
        }
        return {
          url: value === initial
            ? 'http://127.0.0.1:61001'
            : 'http://127.0.0.1:61003',
        };
      },
    });

    await expect(supervisor.start()).resolves.toEqual({ url: 'http://127.0.0.1:61001' });
    initial.exit();

    await vi.waitFor(() => {
      expect(supervisor.currentUrl()).toBe('http://127.0.0.1:61003');
    });
    expect(registered).toEqual([
      'http://127.0.0.1:61001',
      'http://127.0.0.1:61003',
    ]);
    expect(closed).toEqual(['initial', 'failed-replacement']);
    expect(spawnQueue).toHaveLength(0);

    await supervisor.close();
    expect(closed).toEqual(['initial', 'failed-replacement', 'recovered']);
  });

  it('stops retrying when boot failures exhaust the restart budget', async () => {
    const initial = child('initial');
    const failedOne = child('failed-one');
    const failedTwo = child('failed-two');
    const spawnQueue = [initial, failedOne, failedTwo];
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const supervisor = createWebSidecarSupervisor<SupervisorChild, { url: string | null }>({
      closeChild: async () => undefined,
      hasExited: (value) => value.exited,
      onExit: (value, listener) => value.exitListeners.push(listener),
      policy: createRestartPolicy({ maxRestarts: 2, windowMs: 60_000 }),
      registerUrl: async () => undefined,
      spawn: async () => {
        const value = spawnQueue.shift();
        if (value == null) throw new Error('unexpected extra spawn');
        return value;
      },
      waitUntilReady: async (value) => {
        if (value !== initial) {
          value.exit();
          throw new Error('replacement exited during boot');
        }
        return { url: 'http://127.0.0.1:61501' };
      },
    });

    try {
      await supervisor.start();
      initial.exit();

      await vi.waitFor(() => {
        expect(errorLog).toHaveBeenCalledWith(
          'packaged web sidecar restart budget exhausted; not respawning',
        );
      });
      expect(spawnQueue).toHaveLength(0);
      expect(supervisor.currentUrl()).toBe('http://127.0.0.1:61501');
    } finally {
      await supervisor.close();
      errorLog.mockRestore();
    }
  });

  it('closes a replacement whose deferred spawn resolves after shutdown starts', async () => {
    const initial = child('initial');
    const lateReplacement = child('late-replacement');
    let resolveLateSpawn!: (value: SupervisorChild) => void;
    const lateSpawn = new Promise<SupervisorChild>((resolve) => {
      resolveLateSpawn = resolve;
    });
    const closed: string[] = [];
    const registered: string[] = [];
    let spawnCount = 0;

    const supervisor = createWebSidecarSupervisor<SupervisorChild, { url: string | null }>({
      closeChild: async (value) => {
        closed.push(value.name);
      },
      hasExited: (value) => value.exited,
      onExit: (value, listener) => value.exitListeners.push(listener),
      registerUrl: async (url) => {
        registered.push(url);
      },
      spawn: async () => {
        spawnCount += 1;
        return spawnCount === 1 ? initial : await lateSpawn;
      },
      waitUntilReady: async (value) => ({
        url: value === initial
          ? 'http://127.0.0.1:62001'
          : 'http://127.0.0.1:62002',
      }),
    });

    await supervisor.start();
    initial.exit();
    await vi.waitFor(() => expect(spawnCount).toBe(2));

    const closePromise = supervisor.close();
    resolveLateSpawn(lateReplacement);
    await closePromise;

    expect(registered).toEqual(['http://127.0.0.1:62001']);
    expect(closed).toEqual(['initial', 'late-replacement']);
    expect(lateReplacement.exitListeners).toHaveLength(1);
    expect(supervisor.currentUrl()).toBe('http://127.0.0.1:62001');
  });
});

/**
 * Every packaged launch opens each sidecar's latest.log with mode "w",
 * which used to DESTROY the prior session's log. That is exactly the log
 * that matters after an incident-triggered relaunch: the support bundle
 * contained only the ~70 lines written since the restart while the
 * incident-time daemon log was gone. openLog must rotate the prior file
 * aside as previous.log (exactly one prior session, no unbounded growth)
 * before truncating.
 */
describe('packaged sidecar log rotation', () => {
  it('rotates the prior latest.log aside as previous.log before truncating', async () => {
    const root = mkdtempSync(join(tmpdir(), 'od-log-rotate-'));
    const logDir = join(root, 'logs', 'daemon');
    const logPath = join(logDir, 'latest.log');
    const previousPath = join(logDir, 'previous.log');
    try {
      // Session 1: nothing to rotate, log dir gets created.
      const first = await openLog(logPath);
      await first.write('session-1 incident line\n');
      await first.close();

      // Session 2 (the relaunch after the incident): session 1's content must
      // survive as previous.log while latest.log starts fresh.
      const second = await openLog(logPath);
      expect(readFileSync(previousPath, 'utf8')).toContain('session-1 incident line');
      expect(readFileSync(logPath, 'utf8')).toBe('');
      await second.write('session-2 line\n');
      await second.close();

      // Session 3: previous.log holds exactly the MOST RECENT prior session,
      // not an accumulation of every session ever.
      const third = await openLog(logPath);
      await third.close();
      const previousContent = readFileSync(previousPath, 'utf8');
      expect(previousContent).toContain('session-2 line');
      expect(previousContent).not.toContain('session-1 incident line');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  /**
   * Rotation is best-effort, but "best-effort" must never degrade INTO the data
   * loss it exists to prevent. If the rename fails for anything other than the
   * first-launch ENOENT — a Windows share-lock on previous.log, a read-only or
   * exotic filesystem — truncating latest.log destroys the only copy of the
   * incident-time log while previous.log stays unavailable to diagnostics.
   *
   * The rejection is injected with a real filesystem condition rather than a
   * module mock: renaming a file onto an existing DIRECTORY fails (EISDIR on
   * POSIX, EPERM/EACCES on Windows), which is a non-ENOENT failure on every
   * platform this ships to.
   */
  it('keeps the prior log instead of truncating it when rotation fails', async () => {
    const root = mkdtempSync(join(tmpdir(), 'od-log-rotate-fail-'));
    const logDir = join(root, 'logs', 'daemon');
    const logPath = join(logDir, 'latest.log');
    try {
      mkdirSync(logDir, { recursive: true });
      writeFileSync(logPath, 'incident line that must survive\n');
      // previous.log is a directory, so rename(latest.log -> previous.log) fails
      // with a non-ENOENT error.
      mkdirSync(join(logDir, 'previous.log'), { recursive: true });

      const handle = await openLog(logPath);
      // The prior session survives in place; rotation failing is not a licence
      // to erase it.
      expect(readFileSync(logPath, 'utf8')).toContain('incident line that must survive');
      // ...and the returned handle still works, appending after the kept bytes.
      await handle.write('post-rotation-failure line\n');
      await handle.close();

      const merged = readFileSync(logPath, 'utf8');
      expect(merged).toContain('incident line that must survive');
      expect(merged).toContain('post-rotation-failure line');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('packaged managed-child shutdown grace', () => {
  it('keeps the ordinary 5s grace unless shutdown is deferred', () => {
    expect(resolveManagedChildExitGraceMs(undefined)).toBe(MANAGED_CHILD_EXIT_GRACE_MS);
    expect(resolveManagedChildExitGraceMs({ accepted: true })).toBe(MANAGED_CHILD_EXIT_GRACE_MS);
    expect(resolveManagedChildExitGraceMs({ accepted: true, deferred: false })).toBe(
      MANAGED_CHILD_EXIT_GRACE_MS,
    );
    expect(resolveManagedChildExitGraceMs({ accepted: true, deferred: true })).toBe(
      DEFERRED_MANAGED_CHILD_EXIT_GRACE_MS,
    );
  });
});

describe.runIf(process.platform !== 'win32')(
  'packaged deferred shutdown vs stopProcesses SIGKILL',
  () => {
    const journalNames = ['handoff.json', 'attempts.json', 'runtime.json'] as const;

    async function spawnSlowJournalChild(journalDir: string, writeDelayMs: number): Promise<{
      child: ChildProcess;
      pid: number;
    }> {
      mkdirSync(journalDir, { recursive: true });
      const child = spawn(
        process.execPath,
        [
          '-e',
          [
            "process.on('SIGTERM',()=>{});",
            "const fs=require('fs');",
            "const path=require('path');",
            "const dir=process.env.OD_TEST_JOURNAL_DIR;",
            "const delay=Number(process.env.OD_TEST_WRITE_DELAY_MS);",
            "const files=['handoff.json','attempts.json','runtime.json'];",
            '(async()=>{',
            '  for (const file of files) {',
            '    await new Promise((resolve)=>setTimeout(resolve, delay));',
            "    fs.writeFileSync(path.join(dir, file), JSON.stringify({ committed: file }) + '\\n');",
            '  }',
            '})();',
            'setInterval(()=>{}, 1000);',
          ].join(''),
        ],
        {
          env: {
            ...process.env,
            OD_TEST_JOURNAL_DIR: journalDir,
            OD_TEST_WRITE_DELAY_MS: String(writeDelayMs),
          },
          stdio: 'ignore',
        },
      );
      const pid = child.pid;
      if (pid == null) {
        child.kill('SIGKILL');
        throw new Error('slow journal child did not start');
      }
      return { child, pid };
    }

    function committedJournalCount(journalDir: string): number {
      return journalNames.filter((name) => existsSync(join(journalDir, name))).length;
    }

    it('lets real stopProcesses SIGKILL truncate a non-deferred journal', async () => {
      const root = mkdtempSync(join(tmpdir(), 'od-packaged-sigkill-trunc-'));
      const ipcPath = join(root, 'daemon.sock');
      const logPath = join(root, 'daemon.log');
      const journalDir = join(root, 'journal');
      const server = await createJsonIpcServer({
        socketPath: ipcPath,
        handler: async () => ({ accepted: true }),
      });
      const { child, pid } = await spawnSlowJournalChild(journalDir, 200);
      const logHandle = await openLog(logPath);
      let stopResult: Awaited<ReturnType<typeof stopProcesses>> | undefined;

      try {
        await closeManagedChild(
          {
            app: APP_KEYS.DAEMON,
            child,
            ipcPath,
            logHandle,
            logPath,
          },
          {
            exitGraceMs: 0,
            stopOptions: { killGraceMs: 1_000, termGraceMs: 0 },
            stopProcesses: async (pids, options) => {
              stopResult = await stopProcesses(pids, options);
              return stopResult;
            },
          },
        );

        expect(committedJournalCount(journalDir)).toBeLessThan(journalNames.length);
        expect(stopResult?.forcedPids).toContain(pid);
        expect(isProcessAlive(pid)).toBe(false);
      } finally {
        child.kill('SIGKILL');
        await waitForProcessExit(pid, 1_000);
        await server.close();
        rmSync(root, { recursive: true, force: true });
      }
    }, 10_000);

    it('commits all three journal files before deferred stopProcesses SIGKILL', async () => {
      const root = mkdtempSync(join(tmpdir(), 'od-packaged-sigkill-hold-'));
      const ipcPath = join(root, 'daemon.sock');
      const logPath = join(root, 'daemon.log');
      const journalDir = join(root, 'journal');
      const server = await createJsonIpcServer({
        socketPath: ipcPath,
        handler: async () => ({ accepted: true, deferred: true }),
      });
      const { child, pid } = await spawnSlowJournalChild(journalDir, 100);
      const logHandle = await openLog(logPath);
      let stopResult: Awaited<ReturnType<typeof stopProcesses>> | undefined;

      try {
        await closeManagedChild(
          {
            app: APP_KEYS.DAEMON,
            child,
            ipcPath,
            logHandle,
            logPath,
          },
          {
            deferredExitGraceMs: 1_500,
            exitGraceMs: 0,
            stopOptions: { killGraceMs: 1_000, termGraceMs: 0 },
            stopProcesses: async (pids, options) => {
              stopResult = await stopProcesses(pids, options);
              return stopResult;
            },
          },
        );

        expect(committedJournalCount(journalDir)).toBe(journalNames.length);
        expect(stopResult?.forcedPids).toContain(pid);
        expect(isProcessAlive(pid)).toBe(false);
      } finally {
        child.kill('SIGKILL');
        await waitForProcessExit(pid, 1_000);
        await server.close();
        rmSync(root, { recursive: true, force: true });
      }
    }, 10_000);
  },
);
