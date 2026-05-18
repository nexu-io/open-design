// @vitest-environment node

import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
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

const execFileAsync = promisify(execFile);
const e2eRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = dirname(e2eRoot);
const toolsPackDir = resolveFromWorkspace(process.env.OD_PACKAGED_E2E_TOOLS_PACK_DIR ?? '.tmp/tools-pack');
const namespace = process.env.OD_PACKAGED_E2E_NAMESPACE ?? 'ci-pr-linux';
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
      expect(desktopLog.lines.join('\n')).toContain('Open Design is running');

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

  test('installs, starts, inspects with eval and screenshot, stops, and uninstalls the built AppImage', async () => {
    let passed = false;
    try {
      const install = await runToolsPackJson<LinuxAppImageInstallResult>('install');
      installed = true;

      expect(install.namespace).toBe(namespace);
      expectPathInside(install.appImagePath, join(userHome, '.local', 'bin'));
      expectPathInside(install.desktopFilePath, join(userHome, '.local', 'share', 'applications'));
      expectPathInside(install.iconPath, join(userHome, '.local', 'share', 'icons', 'hicolor'));

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
