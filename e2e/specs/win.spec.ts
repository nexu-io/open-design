// @vitest-environment node

import { execFile, spawn, type ChildProcessByStdio } from 'node:child_process';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, test } from 'vitest';

import { createPackagedSmokeReport } from '@/vitest/packaged-report';

const execFileAsync = promisify(execFile);
const e2eRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = dirname(e2eRoot);
const toolsPackDir = resolveFromWorkspace(process.env.OD_PACKAGED_E2E_TOOLS_PACK_DIR ?? '.tmp/tools-pack');
const namespace = process.env.OD_PACKAGED_E2E_NAMESPACE ?? 'release-beta-win';
const toolsPackBin = join(workspaceRoot, 'tools', 'pack', 'bin', 'tools-pack.mjs');
const toolsServeBin = join(workspaceRoot, 'tools', 'serve', 'bin', 'tools-serve.mjs');
const maxInstallDurationMs = Number.parseInt(process.env.OD_PACKAGED_E2E_WIN_MAX_INSTALL_MS ?? '120000', 10);
const verifyReinstallWhileRunning = process.env.OD_PACKAGED_E2E_WIN_VERIFY_REINSTALL !== '0';
const installIdentity = resolveInstallIdentity(namespace);

const outputNamespaceRoot = join(toolsPackDir, 'out', 'win', 'namespaces', namespace);
const runtimeNamespaceRoot = join(toolsPackDir, 'runtime', 'win', 'namespaces', namespace);
const screenshotPath = join(toolsPackDir, 'screenshots', `${namespace}.png`);
const healthExpression = "fetch('/api/health').then(async response => ({ health: await response.json(), href: location.href, status: response.status, title: document.title }))";
const updaterPopupExpression = `
  (() => {
    const popup = document.querySelector('[data-testid="updater-popup"]');
    const button = document.querySelector('[data-testid="updater-install-button"]');
    return {
      installButtonVisible: button instanceof HTMLButtonElement && !button.disabled,
      text: popup?.textContent?.trim() ?? null,
      title: popup?.querySelector('h2')?.textContent?.trim() ?? null,
      visible: popup instanceof HTMLElement,
    };
  })()
`;
const clickUpdaterInstallExpression = `
  (() => {
    const button = document.querySelector('[data-testid="updater-install-button"]');
    if (!(button instanceof HTMLButtonElement)) return { clicked: false, reason: 'missing-install-button' };
    if (button.disabled) return { clicked: false, reason: 'install-button-disabled' };
    button.click();
    return { clicked: true };
  })()
`;

type DesktopStatus = {
  state?: string;
  title?: string | null;
  url?: string | null;
  windowVisible?: boolean;
};

type WinInstallResult = {
  desktopShortcutExists: boolean;
  desktopShortcutPath: string;
  installDir: string;
  installPayload: {
    fileCount: number;
    totalBytes: number;
    topLevel: Array<{
      bytes: number;
      fileCount: number;
      path: string;
    }>;
  };
  installerPath: string;
  namespace: string;
  registryEntries: unknown[];
  startMenuShortcutExists: boolean;
  startMenuShortcutPath: string;
  timingPath: string;
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

type WinCleanupResult = {
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

type WinUninstallResult = {
  namespace: string;
  residueObservation?: WinCleanupResult['residueObservation'];
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
  update?: {
    availableVersion?: string;
    channel?: string;
    currentVersion?: string;
    downloadPath?: string;
    error?: {
      code: string;
      message: string;
    };
    installResult?: {
      dryRun?: boolean;
      path: string;
    };
    state: string;
  };
};

type LogsResult = {
  logs: Record<string, { lines: string[]; logPath: string }>;
  namespace: string;
};

type TimingResult = {
  action: string;
  durationMs: number;
  status: string;
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

type DirectInstallerResult = {
  code: number | null;
  nsisLogTail: string[];
};

type UpdaterFixtureProcess = {
  close: () => Promise<void>;
  info: {
    metadataUrl: string;
    version: string;
  };
};

type UpdaterPopupEvalValue = {
  installButtonVisible: boolean;
  text: string | null;
  title: string | null;
  visible: boolean;
};

type UpdaterClickEvalValue = {
  clicked: boolean;
  reason?: string;
};

const shouldRunPackagedWinSmoke = process.platform === 'win32' && process.env.OD_PACKAGED_E2E_WIN === '1';
const winDescribe = shouldRunPackagedWinSmoke ? describe : describe.skip;

winDescribe('packaged windows runtime smoke', () => {
  let installed = false;
  let started = false;

  test('installs, starts, inspects with eval and screenshot, stops, and uninstalls the built windows artifact', async () => {
    const report = await createPackagedSmokeReport('win');
    const updateEnv = captureUpdateEnv();
    let updaterFixture: UpdaterFixtureProcess | null = null;
    let passed = false;
    const timings: SmokeTiming[] = [];
    try {
      await measureSmokeStep(timings, 'pre-clean uninstall', async () => {
        await runToolsPackJson<WinUninstallResult>('uninstall').catch(() => null);
      });

      const install = await measureSmokeStep(timings, 'install', async () => runToolsPackJson<WinInstallResult>('install'));
      installed = true;

      expect(install.namespace).toBe(namespace);
      expectPathInside(install.installerPath, join(outputNamespaceRoot, 'builder'));
      expectPathInside(install.installDir, join(runtimeNamespaceRoot, 'install'));
      expectPathInside(install.uninstallerPath, install.installDir);
      expect(basename(install.uninstallerPath)).toBe(`Uninstall ${installIdentity.displayName}.exe`);
      expect(install.desktopShortcutExists).toBe(true);
      expect(install.startMenuShortcutExists).toBe(true);
      expect(basename(install.desktopShortcutPath)).toBe(`${installIdentity.displayName}.lnk`);
      expect(basename(install.startMenuShortcutPath)).toBe(`${installIdentity.displayName}.lnk`);
      expect(install.registryEntries.length).toBeGreaterThan(0);
      expect(JSON.stringify(install.registryEntries)).toContain(installIdentity.displayName);
      expect(JSON.stringify(install.registryEntries)).toContain(`Open Design-${installIdentity.namespaceToken}`);
      expect(install.installPayload.fileCount).toBeGreaterThan(0);
      expect(install.installPayload.totalBytes).toBeGreaterThan(0);
      expect(install.installPayload.topLevel.length).toBeGreaterThan(0);
      const installTiming = await readTiming(install.timingPath);
      expect(installTiming.action).toBe('install');
      expect(installTiming.status).toBe('success');
      if (installTiming.durationMs > maxInstallDurationMs) {
        throw new Error(
          [
            `windows installer exceeded ${maxInstallDurationMs}ms budget: ${installTiming.durationMs}ms`,
            `installed files=${install.installPayload.fileCount} bytes=${install.installPayload.totalBytes}`,
            `top-level payload=${JSON.stringify(install.installPayload.topLevel.slice(0, 8))}`,
          ].join('\n'),
        );
      }

      updaterFixture = await startUpdaterFixtureProcess();
      process.env.OD_UPDATE_ENABLED = '1';
      process.env.OD_UPDATE_METADATA_URL = updaterFixture.info.metadataUrl;
      process.env.OD_UPDATE_CURRENT_VERSION = '99.0.0-beta.0';
      process.env.OD_UPDATE_OPEN_DRY_RUN = '1';
      process.env.OD_UPDATE_AUTO_CHECK = '1';

      let start = await measureSmokeStep(timings, 'start', async () => runToolsPackJson<WinStartResult>('start'));
      started = true;

      expect(start.namespace).toBe(namespace);
      expect(start.source).toBe('installed');
      expectPathInside(start.executablePath, install.installDir);
      expectPathInside(start.logPath, join(runtimeNamespaceRoot, 'logs', 'desktop'));
      expect(start.pid).toBeGreaterThan(0);

      const inspect = await measureSmokeStep(timings, 'wait healthy inspect eval', async () => waitForHealthyDesktop());
      expect(inspect.status?.state).toBe('running');
      expect(inspect.status?.url).toBe('od://app/');

      const value = assertHealthEvalValue(inspect.eval?.value);
      expect(value.href).toBe('od://app/');
      expect(value.status).toBe(200);
      expect(value.health.ok).toBe(true);
      expect(value.health.version).toEqual(expect.any(String));

      const popup = await measureSmokeStep(timings, 'wait updater popup', async () => waitForUpdaterPopup());
      expect(popup.visible).toBe(true);
      expect(popup.title).toBe('Update ready');
      expect(popup.installButtonVisible).toBe(true);
      expect(popup.text ?? '').toContain(updaterFixture.info.version);

      const updateStatus = await measureSmokeStep(timings, 'inspect updater status', async () =>
        runToolsPackJson<WinInspectResult>('inspect', ['--update-action', 'status']),
      );
      expect(updateStatus.update?.state).toBe('downloaded');
      expect(updateStatus.update?.channel).toBe('beta');
      expect(updateStatus.update?.currentVersion).toBe('99.0.0-beta.0');
      expect(updateStatus.update?.availableVersion).toBe(updaterFixture.info.version);
      expectPathInside(updateStatus.update?.downloadPath ?? '', join(runtimeNamespaceRoot, 'updates'));

      const clickInstall = await measureSmokeStep(timings, 'click updater installer', async () =>
        runToolsPackJson<WinInspectResult>('inspect', ['--expr', clickUpdaterInstallExpression]),
      );
      const clickValue = assertUpdaterClickEvalValue(clickInstall.eval?.value);
      expect(clickValue.clicked).toBe(true);
      const updateInstall = await measureSmokeStep(timings, 'wait updater installer opened', async () =>
        waitForUpdaterInstallerOpened(),
      );
      expect(updateInstall.update?.state).toBe('downloaded');
      expect(updateInstall.update?.installResult?.dryRun).toBe(true);
      expectPathInside(updateInstall.update?.installResult?.path ?? '', join(runtimeNamespaceRoot, 'updates'));

      let reinstall: DirectInstallerResult | { skipped: true } = { skipped: true };
      if (verifyReinstallWhileRunning) {
        reinstall = await measureSmokeStep(timings, 'direct reinstall while running', async () =>
          runDirectInstaller(install.installerPath, install.installDir),
        );
        started = false;
        expect(reinstall.code).toBe(0);
        expect(reinstall.nsisLogTail.join('\n')).toContain('running instances detected before silent install');
        expect(reinstall.nsisLogTail.join('\n')).toContain('running instances close exit=0');

        start = await measureSmokeStep(timings, 'restart after direct reinstall', async () =>
          runToolsPackJson<WinStartResult>('start'),
        );
        started = true;
        expect(start.namespace).toBe(namespace);
        expect(start.source).toBe('installed');
        expectPathInside(start.executablePath, install.installDir);

        const postReinstallInspect = await measureSmokeStep(timings, 'wait healthy inspect after reinstall', async () =>
          waitForHealthyDesktop(),
        );
        expect(postReinstallInspect.status?.state).toBe('running');
      }

      await mkdir(dirname(screenshotPath), { recursive: true });
      const screenshot = await measureSmokeStep(timings, 'inspect screenshot', async () =>
        runToolsPackJson<WinInspectResult>('inspect', ['--path', screenshotPath]),
      );
      expect(screenshot.screenshot?.path).toBe(screenshotPath);
      expect(await fileSizeBytes(screenshotPath)).toBeGreaterThan(0);
      await report.saveScreenshot(screenshotPath);

      const logs = await measureSmokeStep(timings, 'logs', async () => runToolsPackJson<LogsResult>('logs'));
      assertLogPathsAndContent(logs);

      const stop = await measureSmokeStep(timings, 'stop', async () => runToolsPackJson<WinStopResult>('stop'));
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
      expect(uninstall.residueObservation?.startMenuShortcutExists).toBe(false);
      expect(uninstall.residueObservation?.userDesktopShortcutExists).toBe(false);
      await report.saveSummary({
        health: value,
        install: {
          desktopShortcutExists: install.desktopShortcutExists,
          installDir: install.installDir,
          installPayload: install.installPayload,
          installerPath: install.installerPath,
          registryEntryCount: install.registryEntries.length,
          startMenuShortcutExists: install.startMenuShortcutExists,
          timingPath: install.timingPath,
          uninstallerPath: install.uninstallerPath,
        },
        installTiming,
        logs: summarizeLogs(logs),
        namespace,
        reinstall,
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
        update: {
          install: updateInstall.update,
          popup,
          status: updateStatus.update,
        },
      });
      passed = true;
    } finally {
      restoreUpdateEnv(updateEnv);
      await updaterFixture?.close().catch((error: unknown) => {
        console.error('failed to close updater fixture', error);
      });
      if (!passed) {
        await printPackagedLogs().catch((error: unknown) => {
          console.error('failed to read packaged windows logs after failure', error);
        });
      }

      if (started) {
        await runToolsPackJson<WinStopResult>('stop').catch((error: unknown) => {
          console.error('failed to stop packaged windows app during cleanup', error);
        });
        started = false;
      }

      if (installed) {
        await runToolsPackJson<WinUninstallResult>('uninstall').catch((error: unknown) => {
          console.error('failed to uninstall packaged windows app during cleanup', error);
        });
        installed = false;
      }

      printSmokeTimings(timings);
    }
  }, 300_000);
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
      '[windows smoke timings]',
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
          `tools-pack win ${action} failed`,
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

const UPDATE_ENV_KEYS = [
  'OD_UPDATE_AUTO_CHECK',
  'OD_UPDATE_ENABLED',
  'OD_UPDATE_METADATA_URL',
  'OD_UPDATE_CURRENT_VERSION',
  'OD_UPDATE_OPEN_DRY_RUN',
] as const;

function captureUpdateEnv(): Partial<Record<(typeof UPDATE_ENV_KEYS)[number], string>> {
  return Object.fromEntries(
    UPDATE_ENV_KEYS
      .map((key) => [key, process.env[key]] as const)
      .filter((entry): entry is readonly [(typeof UPDATE_ENV_KEYS)[number], string] => entry[1] != null),
  );
}

function restoreUpdateEnv(previous: Partial<Record<(typeof UPDATE_ENV_KEYS)[number], string>>): void {
  for (const key of UPDATE_ENV_KEYS) {
    if (previous[key] == null) delete process.env[key];
    else process.env[key] = previous[key];
  }
}

async function startUpdaterFixtureProcess(): Promise<UpdaterFixtureProcess> {
  const child = spawn(
    process.execPath,
    [toolsServeBin, 'start', 'updater', '--json', '--channel', 'beta', '--version', '99.0.0-beta.1', '--platform', 'win'],
    {
      cwd: workspaceRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const info = await readUpdaterFixtureInfo(child);
  return {
    async close() {
      if (child.exitCode != null) return;
      child.kill('SIGTERM');
      await new Promise<void>((resolveClose) => {
        child.once('exit', () => resolveClose());
        setTimeout(resolveClose, 2000).unref();
      });
    },
    info,
  };
}

async function readUpdaterFixtureInfo(child: ChildProcessByStdio<null, Readable, Readable>): Promise<UpdaterFixtureProcess['info']> {
  let stdout = '';
  let stderr = '';
  return await new Promise<UpdaterFixtureProcess['info']>((resolveInfo, rejectInfo) => {
    const timeout = setTimeout(() => {
      rejectInfo(new Error(`tools-serve updater did not report metadata in time\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 10_000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      const line = stdout.split('\n').find((entry) => entry.trim().startsWith('{'));
      if (line == null) return;
      clearTimeout(timeout);
      try {
        const parsed = JSON.parse(line) as UpdaterFixtureProcess['info'];
        resolveInfo(parsed);
      } catch (error) {
        rejectInfo(error);
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      rejectInfo(new Error(`tools-serve updater exited before ready (code=${code}, signal=${signal ?? 'none'})\nstderr:\n${stderr}`));
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      rejectInfo(error);
    });
  });
}

async function runDirectInstaller(installerPath: string, installDir: string): Promise<DirectInstallerResult> {
  const previousLogLines = await readNsisLogLines();
  const error = await execFileAsync(installerPath, ['/S', `/D=${installDir}`], {
    cwd: dirname(installerPath),
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
    windowsVerbatimArguments: true,
  }).then(
    () => null,
    (caught: unknown) => caught,
  );
  const code = isExecError(error) ? Number(error.code) : error == null ? 0 : null;
  return {
    code,
    nsisLogTail: (await readNsisLogLines()).slice(previousLogLines.length),
  };
}

async function readNsisLogLines(): Promise<string[]> {
  const raw = await readFile(join(outputNamespaceRoot, 'logs', 'nsis.log'), 'utf8').catch(() => '');
  return raw.split(/\r?\n/).filter((line) => line.length > 0);
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

  throw new Error(`packaged windows runtime did not become healthy: ${formatUnknown(lastResult)}`);
}

async function waitForUpdaterPopup(): Promise<UpdaterPopupEvalValue> {
  const timeoutMs = 90_000;
  const startedAt = Date.now();
  let lastResult: unknown = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const inspect = await runToolsPackJson<WinInspectResult>('inspect', ['--expr', updaterPopupExpression]);
      lastResult = inspect;
      if (inspect.status?.state === 'running' && inspect.eval?.ok === true) {
        const value = asUpdaterPopupEvalValue(inspect.eval.value);
        if (value?.visible === true && value.installButtonVisible === true) return value;
      }
    } catch (error) {
      lastResult = error;
    }
    await delay(1000);
  }

  throw new Error(`packaged windows updater popup did not appear: ${formatUnknown(lastResult)}`);
}

async function waitForUpdaterInstallerOpened(): Promise<WinInspectResult> {
  const timeoutMs = 60_000;
  const startedAt = Date.now();
  let lastResult: unknown = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const inspect = await runToolsPackJson<WinInspectResult>('inspect', ['--update-action', 'status']);
      lastResult = inspect;
      if (inspect.update?.installResult?.path != null) return inspect;
    } catch (error) {
      lastResult = error;
    }
    await delay(1000);
  }

  throw new Error(`packaged windows updater did not observe installer open: ${formatUnknown(lastResult)}`);
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

function assertUpdaterClickEvalValue(value: unknown): UpdaterClickEvalValue {
  const normalized = asUpdaterClickEvalValue(value);
  if (normalized == null) {
    throw new Error(`unexpected updater click eval value: ${formatUnknown(value)}`);
  }
  return normalized;
}

function asHealthEvalValue(value: unknown): HealthEvalValue | null {
  if (!isRecord(value)) return null;
  if (typeof value.href !== 'string' || typeof value.status !== 'number' || typeof value.title !== 'string') return null;
  if (!isRecord(value.health)) return null;
  return value as HealthEvalValue;
}

function asUpdaterPopupEvalValue(value: unknown): UpdaterPopupEvalValue | null {
  if (!isRecord(value)) return null;
  if (typeof value.visible !== 'boolean') return null;
  if (typeof value.installButtonVisible !== 'boolean') return null;
  if (value.title != null && typeof value.title !== 'string') return null;
  if (value.text != null && typeof value.text !== 'string') return null;
  return value as UpdaterPopupEvalValue;
}

function asUpdaterClickEvalValue(value: unknown): UpdaterClickEvalValue | null {
  if (!isRecord(value)) return null;
  if (typeof value.clicked !== 'boolean') return null;
  if (value.reason != null && typeof value.reason !== 'string') return null;
  return value as UpdaterClickEvalValue;
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

async function readTiming(filePath: string): Promise<TimingResult> {
  return JSON.parse(await readFile(filePath, 'utf8')) as TimingResult;
}

function resolveFromWorkspace(filePath: string): string {
  return isAbsolute(filePath) ? filePath : resolve(workspaceRoot, filePath);
}

function resolveInstallIdentity(value: string): { displayName: string; namespaceToken: string } {
  const namespaceToken = value.replace(/[^A-Za-z0-9._-]+/g, '-');
  const displayName = /(^|[-_.])beta($|[-_.])/i.test(value)
    ? 'Open Design Beta'
    : /(^|[-_.])preview($|[-_.])/i.test(value)
      ? 'Open Design Preview'
    : value === 'default'
      ? 'Open Design'
      : `Open Design ${namespaceToken}`;
  return { displayName, namespaceToken };
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
