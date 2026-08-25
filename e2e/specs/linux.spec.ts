// @vitest-environment node

import { execFile, spawn } from 'node:child_process';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, test } from 'vitest';

import {
  PACKAGED_APP_KEYS,
  expectLinuxRemovedStatus,
  expectPathInside,
  linuxUserHome,
  pathExists,
} from '../lib/linux-helpers.js';
import { resolvePackagedSmokeNamespace } from '@/vitest/suite';

const execFileAsync = promisify(execFile);
const e2eRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = dirname(e2eRoot);
const toolsPackDir = resolveFromWorkspace(process.env.OD_PACKAGED_E2E_TOOLS_PACK_DIR ?? '.tmp/tools-pack');
const namespace = resolvePackagedSmokeNamespace('linux');
const toolsPackBin = join(workspaceRoot, 'tools', 'pack', 'bin', 'tools-pack.mjs');
const screenshotPath = resolveFromWorkspace(
  process.env.OD_PACKAGED_E2E_SCREENSHOT_PATH ?? join(toolsPackDir, 'screenshots', `${namespace}.png`),
);
const healthExpression = "fetch('/api/health').then(async response => ({ health: await response.json(), href: location.href, status: response.status, title: document.title }))";
const shouldRunLinuxHeadlessSmoke =
  process.platform === 'linux' && process.env.OD_PACKAGED_E2E_LINUX_HEADLESS === '1';
const linuxHeadlessDescribe = shouldRunLinuxHeadlessSmoke ? describe : describe.skip;
const shouldRunLinuxAppImageSmoke =
  process.platform === 'linux' && process.env.OD_PACKAGED_E2E_LINUX_APPIMAGE === '1';
const linuxAppImageDescribe = shouldRunLinuxAppImageSmoke ? describe : describe.skip;
const expectedTelemetryRelayUrl = process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL?.trim() || null;

const runtimeNamespaceRoot = join(toolsPackDir, 'runtime', 'linux', 'namespaces', namespace);
const userHome = linuxUserHome();

type LinuxHeadlessInstallResult = {
  launcherPath: string;
  namespace: string;
};

type LinuxHeadlessStartResult = {
  launcherPath: string;
  logPath: string;
  namespace: string;
  pid: number;
  status: {
    namespace: string;
    pid: number;
    startedAt: string;
    url: string;
    version: 1;
  };
};

type LinuxInspectResult = {
  eval?: {
    error?: string;
    ok: boolean;
    value?: unknown;
  };
  screenshot?: {
    path: string;
  };
  status: {
    pid?: number;
    state?: string;
    url?: string | null;
  } | null;
};

type LinuxStopResult = {
  namespace: string;
  remainingPids: number[];
  status: string;
};

type LinuxHeadlessUninstallResult = {
  launcherPath: string;
  namespace: string;
  removed: string;
  stop: LinuxStopResult;
};

type LinuxCleanupResult = {
  skipped: boolean;
};

type LinuxAppImageInstallResult = {
  appImagePath: string;
  desktopFilePath: string;
  iconPath: string;
  namespace: string;
};

type LinuxAppImageStartResult = {
  appImagePath: string;
  executablePath: string;
  logPath: string;
  namespace: string;
  pid: number;
  source: string;
  status: {
    state?: string;
    url?: string | null;
  } | null;
};

type LinuxAppImageUninstallResult = {
  namespace: string;
  removed: {
    appImage: string;
    desktop: string;
    icon: string;
  };
  stop: LinuxStopResult;
};

type LogsResult = {
  logs: Record<string, { lines: string[]; logPath: string }>;
  namespace: string;
};

type HealthEvalValue = {
  health: {
    ok?: unknown;
    service?: unknown;
    version?: unknown;
  };
  href: string;
  status: number;
  title: string;
};

linuxHeadlessDescribe('packaged linux headless runtime smoke', () => {
  let installed = false;
  let started = false;

  test('installs, starts, inspects status, logs, stops, uninstalls, and cleans up headless runtime', async () => {
    let passed = false;
    try {
      const install = await runToolsPackJson<LinuxHeadlessInstallResult>('install', ['--headless']);
      installed = true;
      expect(install.namespace).toBe(namespace);
      expectPathInside(install.launcherPath, join(userHome, '.local', 'bin'));
      expect(await pathExists(install.launcherPath)).toBe(true);

      const start = await runToolsPackJson<LinuxHeadlessStartResult>('start', ['--headless']);
      started = true;
      expect(start.namespace).toBe(namespace);
      expect(start.pid).toBeGreaterThan(0);
      expect(start.status.namespace).toBe(namespace);
      expect(start.status.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/?$/);
      expectPathInside(start.logPath, join(runtimeNamespaceRoot, 'logs', 'desktop'));

      const inspect = await runToolsPackJson<LinuxInspectResult>('inspect', ['--headless']);
      expect(inspect.status?.state).toBe('running');
      expect(inspect.status?.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/?$/);

      const logs = await runToolsPackJson<LogsResult>('logs');
      expect(logs.namespace).toBe(namespace);
      const desktopLog = logs.logs.desktop;
      if (desktopLog == null) {
        throw new Error('expected desktop log entry');
      }
      expectPathInside(desktopLog.logPath, join(runtimeNamespaceRoot, 'logs', 'desktop'));
      expect(desktopLog.lines.join('\n')).toContain('OpenDesign is running');

      const stop = await runToolsPackJson<LinuxStopResult>('stop', ['--headless']);
      started = false;
      expect(stop.namespace).toBe(namespace);
      expect(stop.status).not.toBe('partial');
      expect(stop.remainingPids).toEqual([]);

      const uninstall = await runToolsPackJson<LinuxHeadlessUninstallResult>('uninstall', ['--headless']);
      installed = false;
      expect(uninstall.namespace).toBe(namespace);
      expectLinuxRemovedStatus('headless launcher', uninstall.removed);
      expect(await pathExists(install.launcherPath)).toBe(false);

      const cleanup = await runToolsPackJson<LinuxCleanupResult>('cleanup', ['--headless']);
      expect(cleanup.skipped).toBe(false);
      passed = true;
    } finally {
      if (!passed) {
        await printPackagedLogs().catch((error: unknown) => {
          console.error('failed to read packaged linux logs after failure', error);
        });
      }
      if (started || installed) {
        await runToolsPackJson<LinuxHeadlessUninstallResult>('uninstall', ['--headless']).catch((error: unknown) => {
          console.error('failed to uninstall packaged linux headless runtime during cleanup', error);
        });
        started = false;
        installed = false;
      }
    }
  }, 180_000);
});

linuxAppImageDescribe('packaged linux AppImage runtime smoke', () => {
  let installed = false;
  let started = false;
  let headlessStarted = false;
  let headlessLaunchPid: number | null = null;

  test('installs, validates a configured baked relay in AppImage headless, starts desktop, and uninstalls', async () => {
    let passed = false;
    try {
      const install = await runToolsPackJson<LinuxAppImageInstallResult>('install');
      installed = true;

      expect(install.namespace).toBe(namespace);
      expectPathInside(install.appImagePath, join(userHome, '.local', 'bin'));
      expectPathInside(install.desktopFilePath, join(userHome, '.local', 'share', 'applications'));
      expectPathInside(install.iconPath, join(userHome, '.local', 'share', 'icons', 'hicolor'));

      // This is the official AppImage executable's own `--headless` branch,
      // not tools-pack's separate standalone headless launcher. Release jobs
      // inject the relay while building the AppImage; remove it from the
      // launch env so the daemon can only receive the baked config value.
      if (expectedTelemetryRelayUrl != null) {
        const headless = await startInstalledAppImageHeadlessAndFindRelay(
          install.appImagePath,
          expectedTelemetryRelayUrl,
        );
        headlessStarted = true;
        headlessLaunchPid = headless.launchPid;
        expect(headless.relayDaemonPid).toBeGreaterThan(0);

        const headlessStop = await runToolsPackJson<LinuxStopResult>('stop', ['--headless']);
        expect(headlessStop.status).not.toBe('partial');
        expect(headlessStop.remainingPids).toEqual([]);
        headlessStarted = false;
        headlessLaunchPid = null;
      }

      const start = await runToolsPackJson<LinuxAppImageStartResult>('start');
      started = true;

      expect(start.namespace).toBe(namespace);
      expect(start.source).toBe('installed');
      expectPathInside(start.appImagePath, join(userHome, '.local', 'bin'));
      expectPathInside(start.executablePath, join(userHome, '.local', 'bin'));
      expectPathInside(start.logPath, join(runtimeNamespaceRoot, 'logs', 'desktop'));
      expect(start.pid).toBeGreaterThan(0);
      if (start.status != null) {
        expect(start.status.state).toBe('running');
      }

      const inspect = await waitForHealthyAppImageDesktop();
      expect(inspect.status?.state).toBe('running');
      expect(inspect.status?.url).toMatch(/^(od:\/\/app\/|http:\/\/127\.0\.0\.1:\d+\/?$)/);

      const value = assertHealthEvalValue(inspect.eval?.value);
      expect(value.status).toBe(200);
      expect(value.health.ok).toBe(true);
      expect(value.health.version).toEqual(expect.any(String));

      const screenshot = await runToolsPackJson<LinuxInspectResult>('inspect', ['--path', screenshotPath]);
      expect(screenshot.screenshot?.path).toBe(screenshotPath);
      expect(await fileSizeBytes(screenshotPath)).toBeGreaterThan(0);

      assertLogPathsAndContent(await runToolsPackJson<LogsResult>('logs'));

      const stop = await runToolsPackJson<LinuxStopResult>('stop');
      started = false;
      expect(stop.namespace).toBe(namespace);
      expect(stop.status).not.toBe('partial');
      expect(stop.remainingPids).toEqual([]);

      const uninstall = await runToolsPackJson<LinuxAppImageUninstallResult>('uninstall');
      installed = false;
      expect(uninstall.namespace).toBe(namespace);
      expectLinuxRemovedStatus('AppImage', uninstall.removed.appImage);
      expectLinuxRemovedStatus('desktop file', uninstall.removed.desktop);
      expectLinuxRemovedStatus('icon', uninstall.removed.icon);
      expect(await pathExists(install.appImagePath)).toBe(false);
      passed = true;
    } finally {
      if (!passed) {
        await printPackagedLogs().catch((error: unknown) => {
          console.error('failed to read packaged linux logs after failure', error);
        });
      }
      if (headlessStarted) {
        await runToolsPackJson<LinuxStopResult>('stop', ['--headless']).catch((error: unknown) => {
          console.error('failed to stop packaged AppImage --headless runtime during cleanup', error);
          if (headlessLaunchPid != null) {
            try {
              process.kill(-headlessLaunchPid, 'SIGTERM');
            } catch {
              // The process may already have exited.
            }
          }
        });
        headlessStarted = false;
        headlessLaunchPid = null;
      }
      if (started || installed) {
        await runToolsPackJson<LinuxAppImageUninstallResult>('uninstall').catch((error: unknown) => {
          console.error('failed to uninstall packaged linux AppImage during cleanup', error);
        });
        started = false;
        installed = false;
      }
    }
  }, 240_000);
});

async function startInstalledAppImageHeadlessAndFindRelay(
  appImagePath: string,
  expectedRelayUrl: string,
): Promise<{ launchPid: number; relayDaemonPid: number }> {
  const markerPath = join(runtimeNamespaceRoot, 'runtime', 'headless-root.json');
  const webMarkerPath = join(runtimeNamespaceRoot, 'runtime', 'web-root.json');
  await Promise.all([
    rm(markerPath, { force: true }),
    rm(webMarkerPath, { force: true }),
  ]);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    OD_PACKAGED_NAMESPACE: namespace,
    OD_PACKAGED_NAMESPACE_BASE_ROOT: dirname(runtimeNamespaceRoot),
  };
  delete env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
  const child = spawn(appImagePath, ['--appimage-extract-and-run', '--headless'], {
    cwd: dirname(appImagePath),
    detached: true,
    env,
    stdio: 'ignore',
  });
  if (child.pid == null) throw new Error('AppImage --headless did not report a process id');
  const launchPid = child.pid;
  child.unref();

  try {
    const timeoutMs = 90_000;
    const startedAt = Date.now();
    let lastState = 'headless identity not written';
    while (Date.now() - startedAt < timeoutMs) {
      if (child.exitCode != null) {
        throw new Error(`AppImage --headless exited before relay observation (code ${child.exitCode})`);
      }
      const rootPid = await readHeadlessRootPid(markerPath);
      if (rootPid != null) {
        if (!await isProcessDescendant(rootPid, launchPid)) {
          lastState = `headless marker pid ${rootPid} does not belong to launch pid ${launchPid}`;
        } else {
          const relayPid = await findDescendantWithRelay(rootPid, expectedRelayUrl);
          if (relayPid != null) return { launchPid, relayDaemonPid: relayPid };
          lastState = `headless root pid ${rootPid} is live but no descendant has the baked relay`;
        }
      }
      await delay(200);
    }
    throw new Error(`AppImage --headless did not pass its baked relay to the daemon: ${lastState}`);
  } catch (error) {
    try {
      process.kill(-launchPid, 'SIGTERM');
    } catch {
      // The process may already have exited; preserve the original failure.
    }
    throw error;
  }
}

async function readHeadlessRootPid(markerPath: string): Promise<number | null> {
  try {
    const marker = JSON.parse(await readFile(markerPath, 'utf8')) as { pid?: unknown };
    return typeof marker.pid === 'number' && Number.isSafeInteger(marker.pid) ? marker.pid : null;
  } catch {
    return null;
  }
}

async function findDescendantWithRelay(rootPid: number, expectedRelayUrl: string): Promise<number | null> {
  const entries = await readdir('/proc', { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/u.test(entry.name)) continue;
    const pid = Number(entry.name);
    if (!await isProcessDescendant(pid, rootPid)) continue;
    const relay = await readProcessEnvValue(pid, 'OPEN_DESIGN_TELEMETRY_RELAY_URL');
    if (relay === expectedRelayUrl) return pid;
  }
  return null;
}

async function isProcessDescendant(pid: number, rootPid: number): Promise<boolean> {
  let current = pid;
  const visited = new Set<number>();
  while (current > 1 && !visited.has(current)) {
    if (current === rootPid) return true;
    visited.add(current);
    const parent = await readProcessParentPid(current);
    if (parent == null) return false;
    current = parent;
  }
  return false;
}

async function readProcessParentPid(pid: number): Promise<number | null> {
  try {
    const status = await readFile(`/proc/${pid}/status`, 'utf8');
    const match = /^PPid:\s+(\d+)$/mu.exec(status);
    return match == null ? null : Number(match[1]);
  } catch {
    return null;
  }
}

async function readProcessEnvValue(pid: number, key: string): Promise<string | null> {
  try {
    const raw = await readFile(`/proc/${pid}/environ`, 'utf8');
    const prefix = `${key}=`;
    const entry = raw.split('\0').find((value) => value.startsWith(prefix));
    return entry == null ? null : entry.slice(prefix.length);
  } catch {
    return null;
  }
}

async function runToolsPackJson<T>(action: string, extraArgs: string[] = []): Promise<T> {
  const args = [
    toolsPackBin,
    'linux',
    action,
    '--dir',
    toolsPackDir,
    '--namespace',
    namespace,
    '--json',
    ...extraArgs,
  ];
  const result = await execFileAsync(process.execPath, args, {
    cwd: workspaceRoot,
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  }).catch((error: unknown) => {
    if (isExecError(error)) {
      throw new Error(
        [
          `tools-pack linux ${action} failed`,
          `message:\n${error.message}`,
          `stdout:\n${error.stdout}`,
          `stderr:\n${error.stderr}`,
        ].join('\n'),
      );
    }
    throw error;
  });

  try {
    return JSON.parse(result.stdout) as T;
  } catch (error) {
    throw new Error(`tools-pack linux ${action} did not print JSON: ${String(error)}\n${result.stdout}`);
  }
}

async function waitForHealthyAppImageDesktop(): Promise<LinuxInspectResult> {
  const timeoutMs = 90_000;
  const startedAt = Date.now();
  let lastResult: unknown = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const inspect = await runToolsPackJson<LinuxInspectResult>('inspect', ['--expr', healthExpression]);
      lastResult = inspect;
      if (inspect.status?.state === 'running' && inspect.eval?.ok === true) {
        const value = asHealthEvalValue(inspect.eval.value);
        if (value?.status === 200 && value.health.ok === true && typeof value.health.version === 'string') {
          return inspect;
        }
      }
    } catch (error) {
      lastResult = error;
    }
    await delay(1000);
  }

  throw new Error(`packaged linux AppImage runtime did not become healthy: ${formatUnknown(lastResult)}`);
}

function assertLogPathsAndContent(result: LogsResult): void {
  expect(result.namespace).toBe(namespace);
  for (const app of PACKAGED_APP_KEYS) {
    const entry = result.logs[app];
    if (entry == null) {
      throw new Error(`expected ${app} log entry`);
    }
    expectPathInside(entry.logPath, join(runtimeNamespaceRoot, 'logs', app));
  }

  const combined = Object.values(result.logs)
    .flatMap((entry) => entry.lines)
    .join('\n');
  expect(combined).not.toMatch(/ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING/);
  expect(combined).not.toMatch(/packaged runtime failed/i);
  expect(combined).not.toMatch(/standalone Next\.js server exited/i);
}

async function printPackagedLogs(): Promise<void> {
  const result = await runToolsPackJson<LogsResult>('logs');
  for (const [app, entry] of Object.entries(result.logs)) {
    console.error(`[${app}] ${entry.logPath}`);
    console.error(entry.lines.join('\n') || '(no log lines)');
  }
}

function resolveFromWorkspace(filePath: string): string {
  return isAbsolute(filePath) ? filePath : resolve(workspaceRoot, filePath);
}

function assertHealthEvalValue(value: unknown): HealthEvalValue {
  const normalized = asHealthEvalValue(value);
  if (normalized == null) {
    throw new Error(`unexpected health eval value: ${formatUnknown(value)}`);
  }
  return normalized;
}

function asHealthEvalValue(value: unknown): HealthEvalValue | null {
  if (!isRecord(value)) return null;
  if (typeof value.href !== 'string' || typeof value.status !== 'number' || typeof value.title !== 'string') return null;
  if (!isRecord(value.health)) return null;
  return value as HealthEvalValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

async function fileSizeBytes(filePath: string): Promise<number> {
  return (await stat(filePath)).size;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function formatUnknown(value: unknown): string {
  if (value instanceof Error) return value.stack ?? value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

type ExecError = Error & {
  stderr?: string;
  stdout?: string;
};

function isExecError(error: unknown): error is ExecError {
  return error instanceof Error && ('stderr' in error || 'stdout' in error);
}
