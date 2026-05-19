// @vitest-environment node

import { execFile } from 'node:child_process';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, test } from 'vitest';

import { createPackagedSmokeReport } from '@/vitest/packaged-report';

const execFileAsync = promisify(execFile);
const e2eRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = dirname(e2eRoot);
const toolsPackDir = resolveFromWorkspace(process.env.OD_PACKAGED_E2E_TOOLS_PACK_DIR ?? '.tmp/tools-pack');
const namespace = process.env.OD_PACKAGED_E2E_NAMESPACE ?? 'tauri-win-smoke';
const toolsPackBin = join(workspaceRoot, 'tools', 'pack', 'bin', 'tools-pack.mjs');
const outputNamespaceRoot = join(toolsPackDir, 'out', 'win', 'namespaces', namespace);
const runtimeNamespaceRoot = join(toolsPackDir, 'runtime', 'win', 'namespaces', namespace);
const screenshotPath = process.env.OD_PACKAGED_E2E_SCREENSHOT_PATH ?? join(toolsPackDir, 'screenshots', `${namespace}.png`);
const healthExpression = "fetch('/api/health').then(async response => ({ health: await response.json(), href: location.href, status: response.status, title: document.title }))";
const reuseBuild = process.env.OD_PACKAGED_E2E_REUSE_BUILD === '1';

type DesktopStatus = {
  state?: string;
  title?: string | null;
  url?: string | null;
  windowVisible?: boolean;
};

type WinPackResult = {
  installerPath: string | null;
  outputRoot: string;
  resourceRoot: string;
  runtimeNamespaceRoot: string;
  to: string;
};

type WinInstallResult = {
  desktopShortcutExists: boolean;
  desktopShortcutPath: string;
  installDir: string;
  installerPath: string;
  namespace: string;
  startMenuShortcutExists: boolean;
  startMenuShortcutPath: string;
  uninstallerPath: string;
};

type WinStartResult = {
  executablePath: string;
  logPath: string;
  namespace: string;
  pid: number;
  source: string;
  status: DesktopStatus | null;
};

type WinStopResult = {
  namespace: string;
  remainingPids: number[];
  status: string;
};

type WinUninstallResult = {
  namespace: string;
  residueObservation?: {
    installedExeExists?: boolean;
    managedProcessPids?: number[];
    productNamespaceRootExists?: boolean;
    registryResidues?: string[];
    startMenuShortcutExists?: boolean;
    uninstallerExists?: boolean;
    userDesktopShortcutExists?: boolean;
  };
};

type WinInspectResult = {
  eval?: {
    error?: string;
    ok: boolean;
    value?: unknown;
  };
  screenshot?: {
    path: string;
  };
  status: DesktopStatus | null;
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

const shouldRunPackagedWinTauriSmoke = process.platform === 'win32' && process.env.OD_PACKAGED_E2E_WIN_TAURI === '1';
const winTauriDescribe = shouldRunPackagedWinTauriSmoke ? describe : describe.skip;

winTauriDescribe('packaged windows Tauri runtime smoke', () => {
  let installed = false;
  let started = false;

  test('builds NSIS, installs, starts, inspects with eval and screenshot, stops, and uninstalls', async () => {
    const report = await createPackagedSmokeReport('win');
    const timings: SmokeTiming[] = [];
    let passed = false;
    try {
      await measureSmokeStep(timings, 'pre-clean uninstall', async () => {
        await runToolsPackJson<WinUninstallResult>('uninstall').catch(() => null);
      });

      const build = await measureSmokeStep(timings, reuseBuild ? 'load build json' : 'build nsis', async () =>
        reuseBuild ? readBuildJson<WinPackResult>() : runToolsPackJson<WinPackResult>('build', ['--to', 'nsis']),
      );
      expect(build.to).toBe('nsis');
      expect(build.installerPath).toEqual(expect.any(String));
      expectPathInside(build.outputRoot, outputNamespaceRoot);
      expectPathInside(build.resourceRoot, join(outputNamespaceRoot, 'resources', 'open-design'));
      expectPathInside(build.runtimeNamespaceRoot, runtimeNamespaceRoot);
      expect(await fileSizeBytes(build.installerPath!)).toBeGreaterThan(0);

      const install = await measureSmokeStep(timings, 'install nsis', async () =>
        runToolsPackJson<WinInstallResult>('install'),
      );
      installed = true;
      expect(install.namespace).toBe(namespace);
      expect(install.installerPath).toBe(build.installerPath);
      expectPathInside(install.installerPath, join(outputNamespaceRoot, 'builder'));
      expectPathInside(install.installDir, join(runtimeNamespaceRoot, 'install'));
      expectPathInside(install.uninstallerPath, install.installDir);
      expect(basename(install.uninstallerPath)).toMatch(/^Uninstall /);
      expect(install.desktopShortcutExists).toBe(true);
      expect(install.startMenuShortcutExists).toBe(true);

      const start = await measureSmokeStep(timings, 'start installed app', async () =>
        runToolsPackJson<WinStartResult>('start'),
      );
      started = true;
      expect(start.namespace).toBe(namespace);
      expect(start.source).toBe('installed');
      expectPathInside(start.executablePath, install.installDir);
      expectPathInside(start.logPath, join(runtimeNamespaceRoot, 'logs', 'desktop'));
      expect(start.pid).toBeGreaterThan(0);
      if (start.status != null) {
        expect(start.status.state).toBe('running');
        expect(start.status.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/?$/);
      }

      const inspect = await measureSmokeStep(timings, 'wait healthy inspect eval', async () =>
        waitForHealthyDesktop(),
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
        runToolsPackJson<WinInspectResult>('inspect', ['--path', screenshotPath]),
      );
      expect(screenshot.screenshot?.path).toBe(screenshotPath);
      expect(await fileSizeBytes(screenshotPath)).toBeGreaterThan(0);
      await report.saveScreenshot(screenshotPath);

      const logs = await measureSmokeStep(timings, 'logs', async () => runToolsPackJson<LogsResult>('logs'));
      assertLogPathsAndContent(logs);

      const stop = await measureSmokeStep(timings, 'stop installed app', async () =>
        runToolsPackJson<WinStopResult>('stop'),
      );
      started = false;
      expect(stop.namespace).toBe(namespace);
      expect(stop.status).not.toBe('partial');
      expect(stop.remainingPids).toEqual([]);

      const uninstall = await measureSmokeStep(timings, 'uninstall remove data', async () =>
        runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']),
      );
      installed = false;
      expect(uninstall.namespace).toBe(namespace);
      expect(uninstall.residueObservation?.managedProcessPids ?? []).toEqual([]);
      expect(uninstall.residueObservation?.productNamespaceRootExists).toBe(false);
      expect(uninstall.residueObservation?.registryResidues ?? []).toEqual([]);
      expect(uninstall.residueObservation?.installedExeExists).toBe(false);
      expect(uninstall.residueObservation?.uninstallerExists).toBe(false);

      await report.saveSummary({
        build,
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
          console.error('failed to read packaged windows Tauri logs after failure', error);
        });
      }

      if (started) {
        await runToolsPackJson<WinStopResult>('stop').catch((error: unknown) => {
          console.error('failed to stop packaged windows Tauri app during cleanup', error);
        });
        started = false;
      }

      if (installed) {
        await runToolsPackJson<WinUninstallResult>('uninstall').catch((error: unknown) => {
          console.error('failed to uninstall packaged windows Tauri app during cleanup', error);
        });
        installed = false;
      }

      printSmokeTimings(timings);
    }
  }, 600_000);
});

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
      '[windows Tauri smoke timings]',
      ...timings.map((timing) => `${timing.step}: ${Math.round(timing.durationMs / 100) / 10}s`),
      `measured total: ${Math.round(totalMs / 100) / 10}s`,
    ].join('\n'),
  );
}

async function runToolsPackJson<T>(action: string, extraArgs: string[] = []): Promise<T> {
  const args = [
    toolsPackBin,
    'win',
    action,
    '--dir',
    toolsPackDir,
    '--namespace',
    namespace,
    '--desktop-runtime',
    'tauri',
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
          `tools-pack win ${action} --desktop-runtime tauri failed`,
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
    throw new Error(`tools-pack win ${action} did not print JSON: ${String(error)}\n${result.stdout}`);
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

async function waitForHealthyDesktop(): Promise<WinInspectResult> {
  const timeoutMs = 90_000;
  const startedAt = Date.now();
  let lastResult: unknown = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const inspect = await runToolsPackJson<WinInspectResult>('inspect', ['--expr', healthExpression]);
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

  throw new Error(`packaged windows Tauri runtime did not become healthy: ${formatUnknown(lastResult)}`);
}

function assertLogPathsAndContent(result: LogsResult): void {
  expect(result.namespace).toBe(namespace);
  for (const app of ['desktop', 'web', 'daemon']) {
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

function expectPathInside(filePath: string, expectedRoot: string): void {
  const normalizedPath = resolve(filePath);
  const normalizedRoot = resolve(expectedRoot);
  expect(
    normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}${sep}`),
    `${normalizedPath} should be inside ${normalizedRoot}`,
  ).toBe(true);
}

async function fileSizeBytes(filePath: string): Promise<number> {
  return (await stat(filePath)).size;
}

function resolveFromWorkspace(filePath: string): string {
  return isAbsolute(filePath) ? filePath : resolve(workspaceRoot, filePath);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function isExecError(value: unknown): value is { code?: unknown; message: string; stderr: string; stdout: string } {
  return (
    isRecord(value) &&
    typeof value.message === 'string' &&
    typeof value.stdout === 'string' &&
    typeof value.stderr === 'string'
  );
}

function formatUnknown(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
