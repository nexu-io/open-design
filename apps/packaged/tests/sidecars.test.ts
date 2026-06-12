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
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildPackagedDaemonSpawnEnv,
  buildPackagedWebSpawnEnv,
  resolveDaemonStatusTimeoutMs,
  resolvePackagedChildBaseEnv,
  resolvePackagedElectronNodeCommand,
  resolvePackagedPathEnv,
  readSidecarLogTail,
  waitForStatus,
} from '../src/sidecars.js';
import type { PackagedNamespacePaths } from '../src/paths.js';

describe('resolveDaemonStatusTimeoutMs', () => {
  it('uses the default 35-second budget for normal cold boots', () => {
    expect(resolveDaemonStatusTimeoutMs({})).toBe(35_000);
  });

  it('treats an empty OD_LEGACY_DATA_DIR as unset', () => {
    expect(resolveDaemonStatusTimeoutMs({ OD_LEGACY_DATA_DIR: '' })).toBe(35_000);
  });

  it('extends the budget to 30 minutes when OD_LEGACY_DATA_DIR is set', () => {
    // The packaged sidecar must give the daemon a long-enough window to
    // sync-copy a multi-GB legacy `.od/` payload. Anything below ~10
    // minutes was historically observed to time out on real installs.
    const value = resolveDaemonStatusTimeoutMs({
      OD_LEGACY_DATA_DIR: '/path/to/old/.od',
    });
    expect(value).toBeGreaterThanOrEqual(10 * 60 * 1000);
    expect(value).toBe(30 * 60 * 1000);
  });

  it('falls back to process.env when called with no argument', () => {
    const original = process.env.OD_LEGACY_DATA_DIR;
    try {
      delete process.env.OD_LEGACY_DATA_DIR;
      expect(resolveDaemonStatusTimeoutMs()).toBe(35_000);
      process.env.OD_LEGACY_DATA_DIR = '/some/legacy/path';
      expect(resolveDaemonStatusTimeoutMs()).toBe(30 * 60 * 1000);
    } finally {
      if (original == null) delete process.env.OD_LEGACY_DATA_DIR;
      else process.env.OD_LEGACY_DATA_DIR = original;
    }
  });
});

describe('packaged child Vite+ environment forwarding', () => {
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
      all_proxy: 'socks5://127.0.0.1:1081',
      http_proxy: 'http://127.0.0.1:7891',
      https_proxy: 'http://127.0.0.1:7891',
      no_proxy: 'localhost,127.0.0.1,::1',
    });
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

describe('resolvePackagedElectronNodeCommand', () => {
  it('uses the hidden Electron helper as the macOS Electron-as-Node command when available', async () => {
    const root = mkdtempSync(join(tmpdir(), 'od-packaged-electron-helper-'));
    try {
      const appPath = join(root, 'Open Design.app');
      const execPath = join(appPath, 'Contents', 'MacOS', 'Open Design');
      const helperPath = join(
        appPath,
        'Contents',
        'Frameworks',
        'Open Design Helper.app',
        'Contents',
        'MacOS',
        'Open Design Helper',
      );

      mkdirSync(join(appPath, 'Contents', 'MacOS'), { recursive: true });
      mkdirSync(dirname(helperPath), { recursive: true });
      writeFileSync(execPath, '#!/bin/sh\n', 'utf8');
      writeFileSync(helperPath, '#!/bin/sh\n', 'utf8');

      await expect(resolvePackagedElectronNodeCommand(execPath, 'darwin')).resolves.toBe(helperPath);
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
  signalCode: NodeJS.Signals | null;
  fireExit: (code: number | null, signal: NodeJS.Signals | null) => void;
} {
  const emitter = new EventEmitter() as EventEmitter & {
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    fireExit: (code: number | null, signal: NodeJS.Signals | null) => void;
  };
  emitter.exitCode = null;
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

describe("buildPackagedDaemonSpawnEnv network injection", () => {
  const paths = {
    dataRoot: "/tmp/ns/data",
    resourceRoot: "/tmp/ns/res",
    installationRoot: "/tmp/ns/install",
  } as unknown as import("../src/paths.js").PackagedNamespacePaths;

  it("keeps dynamic daemon port and no token by default (no network)", () => {
    const env = buildPackagedDaemonSpawnEnv(paths, {
      appVersion: null,
      daemonCliEntry: null,
      requireDesktopAuth: false,
    });
    expect(env.OD_PORT).toBe("0");
    expect(env.OD_BIND_HOST).toBeUndefined();
    expect(env.OD_API_TOKEN).toBeUndefined();
  });

  it("injects bind host and token when network is provided", () => {
    const env = buildPackagedDaemonSpawnEnv(paths, {
      appVersion: null,
      daemonCliEntry: null,
      requireDesktopAuth: false,
      network: { bindHost: "0.0.0.0", apiToken: "odtoken_xyz", daemonPort: null },
    });
    expect(env.OD_BIND_HOST).toBe("0.0.0.0");
    expect(env.OD_API_TOKEN).toBe("odtoken_xyz");
    expect(env.OD_PORT).toBe("0");
  });

  it("honors an explicit daemon port", () => {
    const env = buildPackagedDaemonSpawnEnv(paths, {
      appVersion: null,
      daemonCliEntry: null,
      requireDesktopAuth: false,
      network: { daemonPort: 7777, bindHost: null, apiToken: null },
    });
    expect(env.OD_PORT).toBe("7777");
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

  it('embeds the daemon log tail in the error so the crash surfaces in the terminal', async () => {
    // The packaged sidecars redirect the daemon's stdout/stderr into
    // latest.log, so a startup crash (e.g. the OD_RESOURCE_ROOT guard) only
    // lives in that file. waitForStatus must read it back and embed it in the
    // thrown error — the launcher writes error.message to stderr, so the real
    // stack trace prints in the terminal first while the full log stays on disk.
    const dir = mkdtempSync(join(tmpdir(), 'od-log-tail-'));
    const logPath = join(dir, 'latest.log');
    const crash =
      'Error: OD_RESOURCE_ROOT must be under the workspace root or app resources path\n' +
      '    at resolveDaemonResourceRoot (.../server.js:660:15)';
    writeFileSync(logPath, `${crash}\n`);

    const child = fakeChild();
    const promise = waitForStatus<{ url: string | null }>(
      '/tmp/od-test-no-such-ipc-tail-' + Date.now(),
      (status) => status.url != null,
      30 * 60 * 1000,
      { child, logPath },
    );
    setTimeout(() => child.fireExit(1, null), 50);

    let captured: unknown;
    try {
      await promise;
    } catch (err) {
      captured = err;
    }

    expect(captured).toBeInstanceOf(Error);
    const message = (captured as Error).message;
    expect(message).toContain('OD_RESOURCE_ROOT must be under');
    expect(message).toContain('resolveDaemonResourceRoot');
    // Full log path still pointed to for later inspection.
    expect(message).toContain(logPath);

    rmSync(dir, { force: true, recursive: true });
  });
});

describe('readSidecarLogTail', () => {
  it('returns the trimmed tail and caps overly long logs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'od-log-tail-cap-'));
    const logPath = join(dir, 'latest.log');
    const body = 'x'.repeat(10_000);
    writeFileSync(logPath, `head-marker\n${body}\n\n`);

    const tail = await readSidecarLogTail(logPath, 4000);
    expect(tail.length).toBeLessThanOrEqual(4000 + 2);
    expect(tail.startsWith('…\n')).toBe(true);
    // Trailing blank lines are trimmed.
    expect(tail.endsWith('x')).toBe(true);

    rmSync(dir, { force: true, recursive: true });
  });

  it('returns empty string when the log is missing or empty', async () => {
    expect(await readSidecarLogTail('/tmp/od-no-such-log-' + Date.now())).toBe('');
  });
});

describe('buildPackagedWebSpawnEnv', () => {
  it('defaults to dynamic web port and no OD_HOST when no network', () => {
    const env = buildPackagedWebSpawnEnv({
      daemonUrl: 'http://127.0.0.1:7456',
      webStandaloneRoot: null,
      webOutputMode: 'server',
    });
    expect(env.OD_WEB_PORT).toBe('0');
    expect(env.PORT).toBe('0');
    expect(env.OD_HOST).toBeUndefined();
    expect(env.OD_WEB_OUTPUT_MODE).toBe('server');
  });

  it('injects web host and web port from network', () => {
    const env = buildPackagedWebSpawnEnv({
      daemonUrl: 'http://127.0.0.1:7456',
      webStandaloneRoot: null,
      webOutputMode: 'server',
      network: { webHost: '0.0.0.0', webPort: 8080 },
    });
    expect(env.OD_HOST).toBe('0.0.0.0');
    expect(env.OD_WEB_PORT).toBe('8080');
    expect(env.PORT).toBe('8080');
  });

  it('always wires the daemon port from daemonUrl, never from network.daemonPort', () => {
    const env = buildPackagedWebSpawnEnv({
      daemonUrl: 'http://127.0.0.1:55001',
      webStandaloneRoot: null,
      webOutputMode: 'server',
      // a stray daemonPort must NOT leak into the web child's daemon wiring
      network: { webPort: 8080, daemonPort: 9999 },
    });
    expect(env.OD_PORT).toBe('55001');
  });

  it('points the web proxy at a concrete non-loopback daemon host', () => {
    // `open-design start --host 192.168.1.10` binds the daemon ONLY to that
    // address, so loopback is not listening; the web child must proxy /api to
    // the real bind host, not 127.0.0.1.
    const env = buildPackagedWebSpawnEnv({
      daemonUrl: 'http://192.168.1.10:7457',
      webStandaloneRoot: null,
      webOutputMode: 'server',
      network: { bindHost: '192.168.1.10', webPort: 0 },
    });
    expect(env.OD_DAEMON_HOST).toBe('192.168.1.10');
    expect(env.OD_PORT).toBe('7457');
  });

  it('omits OD_DAEMON_HOST for loopback, bind-all, and unset hosts (web defaults to 127.0.0.1)', () => {
    for (const bindHost of [undefined, null, '', '127.0.0.1', 'localhost', '0.0.0.0', '::']) {
      const env = buildPackagedWebSpawnEnv({
        daemonUrl: 'http://127.0.0.1:7456',
        webStandaloneRoot: null,
        webOutputMode: 'server',
        network: { bindHost, webPort: 0 },
      });
      expect(env.OD_DAEMON_HOST, `bindHost=${String(bindHost)}`).toBeUndefined();
    }
  });
});
