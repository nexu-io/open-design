// @vitest-environment node

import { execFile } from 'node:child_process';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, test } from 'vitest';

import { createPackagedSmokeReport } from '@/vitest/packaged-report';

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
const desktopRuntime = process.env.OD_PACKAGED_E2E_DESKTOP_RUNTIME;
const desktopRuntimeArgs = desktopRuntime == null || desktopRuntime.length === 0 ? [] : ['--desktop-runtime', desktopRuntime];
const toolsPackBin = join(workspaceRoot, 'tools', 'pack', 'bin', 'tools-pack.mjs');
const outputNamespaceRoot = join(toolsPackDir, 'out', 'linux', 'namespaces', namespace);
const screenshotPath = resolveFromWorkspace(
  process.env.OD_PACKAGED_E2E_SCREENSHOT_PATH ?? join(toolsPackDir, 'screenshots', `${namespace}.png`),
);
const healthExpression = "fetch('/api/health').then(async response => ({ health: await response.json(), href: location.href, status: response.status, title: document.title }))";
const linuxTauriSmokeTimeoutMs = Number(process.env.OD_PACKAGED_E2E_LINUX_TAURI_TIMEOUT_MS ?? 30 * 60_000);
const shouldRunPackagedLinuxTauriSmoke = process.platform === 'linux' && process.env.OD_PACKAGED_E2E_LINUX === '1';
const linuxTauriDescribe = shouldRunPackagedLinuxTauriSmoke ? describe : describe.skip;
const shouldRunLinuxHeadlessSmoke =
  process.platform === 'linux' && process.env.OD_PACKAGED_E2E_LINUX_HEADLESS === '1';
const linuxHeadlessDescribe = shouldRunLinuxHeadlessSmoke ? describe : describe.skip;
const shouldRunLinuxAppImageSmoke =
  process.platform === 'linux' && process.env.OD_PACKAGED_E2E_LINUX_APPIMAGE === '1';
const linuxAppImageDescribe = shouldRunLinuxAppImageSmoke ? describe : describe.skip;

const runtimeNamespaceRoot = join(toolsPackDir, 'runtime', 'linux', 'namespaces', namespace);
const userHome = linuxUserHome();

type LinuxPackResult = {
  appImagePath: string | null;
  outputRoot: string;
  resourceRoot: string;
  runtimeNamespaceRoot: string;
  to: string;
};

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

type SmokeTiming = {
  durationMs: number;
  step: string;
};

linuxTauriDescribe('packaged linux Tauri runtime smoke', () => {
  let installed = false;
  let started = false;
  let headlessStarted = false;

  test('builds AppImage, installs, starts, inspects, stops, and keeps headless working', async () => {
    if (desktopRuntime !== 'tauri') {
      throw new Error('OD_PACKAGED_E2E_DESKTOP_RUNTIME=tauri is required for the packaged linux Tauri smoke');
    }
    const report = await createPackagedSmokeReport('linux');
    const timings: SmokeTiming[] = [];
    let passed = false;
    try {
      await measureSmokeStep(timings, 'pre-clean uninstall', async () => {
        await runToolsPackJson<LinuxAppImageUninstallResult>('uninstall').catch(() => null);
      });

      const build = await measureSmokeStep(timings, process.env.OD_PACKAGED_E2E_REUSE_BUILD === '1' ? 'load build json' : 'build appimage', async () =>
        process.env.OD_PACKAGED_E2E_REUSE_BUILD === '1'
          ? readBuildJson<LinuxPackResult>()
          : runToolsPackJson<LinuxPackResult>('build', ['--to', 'appimage']),
      );
      expect(build.to).toBe('appimage');
      expect(build.appImagePath).toEqual(expect.any(String));
      expectPathInside(build.outputRoot, join(outputNamespaceRoot, 'builder'));
      expectPathInside(build.resourceRoot, join(outputNamespaceRoot, 'resources', 'open-design'));
      expectPathInside(build.runtimeNamespaceRoot, runtimeNamespaceRoot);
      expect(await fileSizeBytes(build.appImagePath!)).toBeGreaterThan(0);

      const install = await measureSmokeStep(timings, 'install appimage', async () =>
        runToolsPackJson<LinuxAppImageInstallResult>('install'),
      );
      installed = true;
      expect(install.namespace).toBe(namespace);
      expect(install.appImagePath).toMatch(/\.AppImage$/);
      expect(await fileSizeBytes(install.appImagePath)).toBeGreaterThan(0);

      const start = await measureSmokeStep(timings, 'start appimage', async () =>
        runToolsPackJson<LinuxAppImageStartResult>('start'),
      );
      started = true;
      expect(start.namespace).toBe(namespace);
      expect(start.source).toBe('installed');
      expect(start.appImagePath).toBe(install.appImagePath);
      expect(start.executablePath).toBe(install.appImagePath);
      expectPathInside(start.logPath, join(runtimeNamespaceRoot, 'logs', 'desktop'));
      expect(start.pid).toBeGreaterThan(0);
      if (start.status != null) {
        expect(start.status.state).toBe('running');
        expect(start.status.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/?$/);
      }

      const inspect = await measureSmokeStep(timings, 'wait healthy inspect eval', async () =>
        waitForHealthyLinuxDesktop('packaged linux Tauri runtime did not become healthy'),
      );
      expect(inspect.status?.state).toBe('running');
      expect(inspect.status?.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/?$/);
      const value = assertHealthEvalValue(inspect.eval?.value);
      expect(value.href).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/?$/);
      expect(value.status).toBe(200);
      expect(value.health.ok).toBe(true);
      expect(value.health.version).toEqual(expect.any(String));

      await mkdir(dirname(screenshotPath), { recursive: true });
      const screenshot = await measureSmokeStep(timings, 'inspect screenshot', async () =>
        runToolsPackJson<LinuxInspectResult>('inspect', ['--path', screenshotPath]),
      );
      expect(screenshot.screenshot?.path).toBe(screenshotPath);
      expect(await fileSizeBytes(screenshotPath)).toBeGreaterThan(0);
      await report.saveScreenshot(screenshotPath);

      const logs = await measureSmokeStep(timings, 'logs', async () => runToolsPackJson<LogsResult>('logs'));
      assertLogPathsAndContent(logs);

      const stop = await measureSmokeStep(timings, 'stop appimage', async () =>
        runToolsPackJson<LinuxStopResult>('stop'),
      );
      started = false;
      expect(stop.namespace).toBe(namespace);
      expect(stop.status).not.toBe('partial');
      expect(stop.remainingPids).toEqual([]);

      const headlessInstall = await measureSmokeStep(timings, 'install headless', async () =>
        runToolsPackJson<LinuxHeadlessInstallResult>('install', ['--headless']),
      );
      expect(headlessInstall.namespace).toBe(namespace);
      expect(headlessInstall.launcherPath).toContain(namespace);

      const headlessStart = await measureSmokeStep(timings, 'start headless', async () =>
        runToolsPackJson<LinuxHeadlessStartResult>('start', ['--headless']),
      );
      headlessStarted = true;
      expect(headlessStart.namespace).toBe(namespace);
      expect(headlessStart.pid).toBeGreaterThan(0);
      expect(headlessStart.status.namespace).toBe(namespace);
      expect(headlessStart.status.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/?$/);
      expectPathInside(headlessStart.logPath, join(runtimeNamespaceRoot, 'logs', 'desktop'));

      const headlessStop = await measureSmokeStep(timings, 'stop headless', async () =>
        runToolsPackJson<LinuxStopResult>('stop', ['--headless']),
      );
      headlessStarted = false;
      expect(headlessStop.namespace).toBe(namespace);
      expect(headlessStop.status).not.toBe('partial');
      expect(headlessStop.remainingPids).toEqual([]);

      const uninstall = await measureSmokeStep(timings, 'uninstall appimage', async () =>
        runToolsPackJson<LinuxAppImageUninstallResult>('uninstall'),
      );
      installed = false;
      expect(uninstall.namespace).toBe(namespace);
      expectLinuxRemovedStatus('AppImage', uninstall.removed.appImage);
      expectLinuxRemovedStatus('desktop file', uninstall.removed.desktop);
      expectLinuxRemovedStatus('icon', uninstall.removed.icon);

      await report.saveSummary({
        build,
        headless: {
          install: headlessInstall,
          start: headlessStart,
          stop: headlessStop,
        },
        health: value,
        install,
        logs: summarizeLogs(logs),
        namespace,
        screenshot: report.screenshotRelpath,
        start: {
          executablePath: start.executablePath,
          logPath: start.logPath,
          pid: start.pid,
          source: start.source,
          status: start.status,
        },
        stop,
        timings,
        uninstall,
      });
      passed = true;
    } finally {
      if (!passed) {
        await printPackagedLogs().catch((error: unknown) => {
          console.error('failed to read packaged linux logs after failure', error);
        });
      }

      if (headlessStarted) {
        await runToolsPackJson<LinuxStopResult>('stop', ['--headless']).catch((error: unknown) => {
          console.error('failed to stop packaged linux headless app during cleanup', error);
        });
        headlessStarted = false;
      }

      if (started) {
        await runToolsPackJson<LinuxStopResult>('stop').catch((error: unknown) => {
          console.error('failed to stop packaged linux app during cleanup', error);
        });
        started = false;
      }

      if (installed) {
        await runToolsPackJson<LinuxAppImageUninstallResult>('uninstall').catch((error: unknown) => {
          console.error('failed to uninstall packaged linux app during cleanup', error);
        });
        installed = false;
      }

      printSmokeTimings(timings);
    }
  }, linuxTauriSmokeTimeoutMs);
});

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
    ...desktopRuntimeArgs,
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

async function readBuildJson<T>(): Promise<T> {
  const path = process.env.OD_PACKAGED_E2E_BUILD_JSON_PATH;
  if (path == null || path.length === 0) {
    throw new Error('OD_PACKAGED_E2E_BUILD_JSON_PATH is required when OD_PACKAGED_E2E_REUSE_BUILD=1');
  }
  try {
    return JSON.parse(await readFile(resolveFromWorkspace(path), 'utf8')) as T;
  } catch (error) {
    throw new Error(`failed to read tools-pack build JSON at ${path}: ${formatUnknown(error)}`);
  }
}

async function measureSmokeStep<T>(timings: SmokeTiming[], step: string, run: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    return await run();
  } finally {
    timings.push({ durationMs: Date.now() - startedAt, step });
  }
}

function printSmokeTimings(timings: SmokeTiming[]): void {
  const totalMs = timings.reduce((sum, timing) => sum + timing.durationMs, 0);
  console.info(
    [
      '[linux smoke timings]',
      ...timings.map((timing) => `${timing.step}: ${Math.round(timing.durationMs / 100) / 10}s`),
      `measured total: ${Math.round(totalMs / 100) / 10}s`,
    ].join('\n'),
  );
}

async function waitForHealthyLinuxDesktop(timeoutMessage: string): Promise<LinuxInspectResult> {
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

  throw new Error(`${timeoutMessage}: ${formatUnknown(lastResult)}`);
}

async function waitForHealthyAppImageDesktop(): Promise<LinuxInspectResult> {
  return waitForHealthyLinuxDesktop('packaged linux AppImage runtime did not become healthy');
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

function summarizeLogs(result: LogsResult): Record<string, { lineCount: number; logPath: string }> {
  return Object.fromEntries(
    Object.entries(result.logs).map(([app, entry]) => [
      app,
      {
        lineCount: entry.lines.length,
        logPath: entry.logPath,
      },
    ]),
  );
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
