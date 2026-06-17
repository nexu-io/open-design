// @vitest-environment node

import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, test } from 'vitest';

import { createPackagedSmokeReport } from '@/vitest/packaged-report';
import { startPackagedPayloadUpdateFixture, type PackagedPayloadUpdateFixture } from '@/vitest/packaged-payload-update-fixture';
import {
  applyPackagedUpdateEnv,
  resolvePackagedUpdateScenario,
} from '@/vitest/packaged-update-scenario';
import { releaseAppVersionArgs, resolvePackagedWinInstallIdentity } from '@/vitest/packaged-win-identity';
import { resolvePackagedSmokeNamespace } from '@/vitest/suite';

const execFileAsync = promisify(execFile);
const e2eRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = dirname(e2eRoot);
const toolsPackDir = resolveFromWorkspace(process.env.OD_PACKAGED_E2E_TOOLS_PACK_DIR ?? '.tmp/tools-pack');
const namespace = resolvePackagedSmokeNamespace('win');
const toolsPackBin = join(workspaceRoot, 'tools', 'pack', 'bin', 'tools-pack.mjs');
const maxInstallDurationMs = Number.parseInt(process.env.OD_PACKAGED_E2E_WIN_MAX_INSTALL_MS ?? '120000', 10);
const smokeProfile = process.env.OD_PACKAGED_E2E_WIN_SMOKE_PROFILE ?? 'core';
const verifyCoreOnly = smokeProfile === 'core';
const verifyReinstallWhileRunning = !verifyCoreOnly && process.env.OD_PACKAGED_E2E_WIN_VERIFY_REINSTALL !== '0';
const updateMetadataUrl = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_WIN_UPDATE_METADATA_URL);
const updateVersion = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_WIN_UPDATE_VERSION);
const updateBuildJsonPath = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_WIN_UPDATE_BUILD_JSON_PATH);
const releaseChannel = process.env.OD_PACKAGED_E2E_RELEASE_CHANNEL;
const releaseVersion = process.env.OD_PACKAGED_E2E_RELEASE_VERSION;
const updateScenario = resolvePackagedUpdateScenario({ releaseChannel, releaseVersion });
const installIdentity = resolvePackagedWinInstallIdentity({ namespace, releaseVersion });
const toolsPackReleaseVersionArgs = releaseAppVersionArgs(releaseVersion);

const outputNamespaceRoot = join(toolsPackDir, 'out', 'win', 'namespaces', namespace);
const runtimeNamespaceRoot = join(toolsPackDir, 'runtime', 'win', 'namespaces', namespace);
const screenshotPath = join(toolsPackDir, 'screenshots', `${namespace}.png`);
const preUpdateScreenshotPath = join(toolsPackDir, 'screenshots', `${namespace}-before-update.png`);
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
const clickUpdaterRailExpression = `
  (async () => {
    const onboarding = document.querySelector('.entry-shell--onboarding, .entry-onboarding-modal');
    const onboardingSkip = document.querySelector('.onboarding-view__secondary');
    if (onboarding instanceof HTMLElement && onboardingSkip instanceof HTMLButtonElement && !onboardingSkip.disabled) {
      onboardingSkip.click();
      return {
        clicked: false,
        reason: 'onboarding-visible',
        skippedOnboarding: true,
        text: onboardingSkip.textContent?.trim() ?? '',
      };
    }
    const host = window.__od__;
    let hostStatus = null;
    if (host?.updater?.status instanceof Function) {
      hostStatus = await host.updater.status({ payload: { source: 'e2e-open-ready-updater-prompt' } });
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const button = document.querySelector('[data-testid="entry-nav-updater"]');
    if (!(button instanceof HTMLButtonElement)) {
      const candidates = Array.from(document.querySelectorAll('button,[role="button"],a'))
        .map((element) => ({
          aria: element.getAttribute('aria-label'),
          disabled: element instanceof HTMLButtonElement ? element.disabled : element.getAttribute('aria-disabled'),
          testid: element.getAttribute('data-testid'),
          text: element.textContent?.trim() ?? '',
        }))
        .filter((candidate) => candidate.testid != null || /update|install|restart|更新|安装|重启/i.test([candidate.aria, candidate.text].join(' ')))
        .slice(0, 40);
      return { candidates, clicked: false, hostStatus, reason: 'missing-updater-rail' };
    }
    if (button.getAttribute('aria-disabled') === 'true') return { clicked: false, hostStatus, reason: 'updater-rail-disabled' };
    button.click();
    return { clicked: true, hostStatus };
  })()
`;
const ensureMainAppShellExpression = `
  (() => {
    const onboarding = document.querySelector('.entry-shell--onboarding, .entry-onboarding-modal');
    const skip = document.querySelector('.onboarding-view__secondary');
    if (onboarding instanceof HTMLElement && skip instanceof HTMLButtonElement && !skip.disabled) {
      skip.click();
      return { homeVisible: false, onboardingVisible: true, skipped: true, text: skip.textContent?.trim() ?? '' };
    }
    const home = document.querySelector('[data-testid="entry-nav-home"]');
    const homeVisible = home instanceof HTMLElement && home.getClientRects().length > 0;
    if (homeVisible) {
      return { homeVisible: true, onboardingVisible: false, skipped: false };
    }
    return {
      homeVisible: false,
      onboardingVisible: onboarding instanceof HTMLElement,
      skipped: false,
      title: document.title,
      text: document.body?.textContent?.trim().slice(0, 300) ?? '',
    };
  })()
`;

type DesktopStatus = {
  pid?: number;
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
  lifecycleTimings?: SmokeTiming[];
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
  lifecycleTimings?: SmokeTiming[];
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
    active?: {
      artifact?: {
        type?: string;
      };
      path?: string;
      version?: string;
    };
    artifact?: {
      type?: string;
      url?: string;
    };
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
    progress?: {
      receivedBytes?: number;
      totalBytes?: number;
    };
    state: string;
  };
  launcher: LauncherSnapshot;
};

type LauncherSnapshot = {
  active: LauncherPointer | null;
  attempt: (LauncherPointer & { channel?: string; namespace?: string }) | null;
  attemptsPath: string;
  channel: string;
  error?: string;
  exists: boolean;
  lastSuccessful: LauncherPointer | null;
  namespace: string;
  root: string;
  runtimePath: string;
  stateRoot: string;
  versionRoots: string[];
  versionsRoot: string;
};

type LauncherPointer = {
  generation: number;
  version: string;
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

type SmokeTiming = {
  durationMs: number;
  step: string;
};

type DirectInstallerResult = {
  code: number | null;
  nsisLogTail: string[];
};

const shouldRunPackagedWinSmoke = process.platform === 'win32' && process.env.OD_PACKAGED_E2E_WIN === '1';
const winDescribe = shouldRunPackagedWinSmoke ? describe : describe.skip;

winDescribe('packaged windows runtime smoke', () => {
  let installed = false;
  let started = false;

  test('[P2] installs, starts, inspects with eval and screenshot, stops, and uninstalls the built windows artifact', async () => {
    const report = await createPackagedSmokeReport('win');
    let passed = false;
    const timings: SmokeTiming[] = [];
    let payloadUpdate: PayloadUpdateSummary | { skipped: true } = { skipped: true };
    let reinstall: DirectInstallerResult | { skipped: true } = { skipped: true };
    let logs: LogsResult | { skipped: true } = { skipped: true };
    let stop: WinStopResult | { skipped: true } = { skipped: true };
    let postUpdateHealth: HealthEvalValue | { skipped: true } = { skipped: true };
    let payloadFixture: PackagedPayloadUpdateFixture | null = null;
    const updateEnv = captureUpdateEnv();
    try {
      await measureSmokeStep(timings, 'pre-clean uninstall', async () => {
        await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch(() => null);
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

      await seedPackagedOnboardingComplete();

      const startDesktop = async (step: string): Promise<WinStartResult> => {
        const nextStart = await measureSmokeStep(timings, step, async () => runToolsPackJson<WinStartResult>('start'));
        started = true;
        return nextStart;
      };
      let expectedPayloadUpdateVersion: string | null = updateVersion;
      if (!verifyCoreOnly) {
        if (updateMetadataUrl != null && updateMetadataUrl !== '') {
          applyPackagedUpdateEnv(process.env, updateScenario, updateMetadataUrl, { openDryRun: false });
        } else {
          const localPayload = await resolveLocalPayloadUpdateFixture();
          expectedPayloadUpdateVersion = localPayload.targetVersion;
          payloadFixture = await startPackagedPayloadUpdateFixture({
            channel: updateScenario.channel,
            payloadPath: localPayload.payloadPath,
            platform: 'win',
            version: localPayload.targetVersion,
          });
          applyPackagedUpdateEnv(process.env, updateScenario, payloadFixture.info.metadataUrl, { openDryRun: false });
        }
      }

      let start = await startDesktop('start');

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
      if (releaseVersion != null && releaseVersion !== '') expect(value.health.version).toBe(releaseVersion);
      else expect(value.health.version).toEqual(expect.any(String));
      assertLauncherPointer(inspect.launcher.active, updateScenario.expectedCurrentVersion, 0, 'initial active');
      assertLauncherPointer(inspect.launcher.lastSuccessful, updateScenario.expectedCurrentVersion, 0, 'initial lastSuccessful');

      await measureSmokeStep(timings, 'ensure main app shell', async () => ensureMainAppShell());

      await mkdir(dirname(preUpdateScreenshotPath), { recursive: true });
      const preUpdateScreenshot = await measureSmokeStep(timings, 'inspect screenshot before update', async () =>
        runToolsPackJson<WinInspectResult>('inspect', ['--path', preUpdateScreenshotPath]),
      );
      expect(preUpdateScreenshot.screenshot?.path).toBe(preUpdateScreenshotPath);
      expect(await fileSizeBytes(preUpdateScreenshotPath)).toBeGreaterThan(0);
      await report.report.save('screenshots/open-design-win-before-update.png', await readFile(preUpdateScreenshotPath));

      if (!verifyCoreOnly) {
        payloadUpdate = await measureSmokeStep(timings, 'payload update acceptance', async () =>
          runPayloadUpdateAcceptance({
            expectedVersion: expectedPayloadUpdateVersion,
          }),
        );
        postUpdateHealth = payloadUpdate.health;
      }

      if (verifyReinstallWhileRunning && verifyCoreOnly) {
        reinstall = await measureSmokeStep(timings, 'direct reinstall while running', async () =>
          runDirectInstaller(install.installerPath, install.installDir),
        );
        started = false;
        expect(reinstall.code).toBe(0);
        expect(reinstall.nsisLogTail.join('\n')).toContain('running instances detected before silent install');
        // The installer closes running instances via pwsh.exe, falling back to
        // powershell.exe (#2799), so the log reads "running instances close via
        // <shell>.exe exit=0" rather than the older "running instances close exit=0".
        expect(reinstall.nsisLogTail.join('\n')).toMatch(/running instances close via (?:pwsh|powershell)\.exe exit=0/);

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
        expect(postReinstallInspect.status?.url).toBe('od://app/');
      }

      await mkdir(dirname(screenshotPath), { recursive: true });
      const screenshot = await measureSmokeStep(timings, 'inspect screenshot', async () =>
        runToolsPackJson<WinInspectResult>('inspect', ['--path', screenshotPath]),
      );
      expect(screenshot.screenshot?.path).toBe(screenshotPath);
      expect(await fileSizeBytes(screenshotPath)).toBeGreaterThan(0);
      await report.saveScreenshot(screenshotPath);

      if (!verifyCoreOnly) {
        logs = await measureSmokeStep(timings, 'logs', async () => runToolsPackJson<LogsResult>('logs'));
        assertLogPathsAndContent(logs);

        stop = await measureSmokeStep(timings, 'stop', async () => runToolsPackJson<WinStopResult>('stop'));
        started = false;
        expect(stop.namespace).toBe(namespace);
        expect(stop.status).not.toBe('partial');
        expect(stop.remainingPids).toEqual([]);
      }

      const uninstall = await measureSmokeStep(timings, 'uninstall remove data', async () =>
        runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']),
      );
      installed = false;
      started = false;
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
          lifecycleTimings: install.lifecycleTimings,
          registryEntryCount: install.registryEntries.length,
          startMenuShortcutExists: install.startMenuShortcutExists,
          timingPath: install.timingPath,
          uninstallerPath: install.uninstallerPath,
        },
        installTiming,
        logs: 'skipped' in logs ? logs : summarizeLogs(logs),
        namespace,
        payloadUpdate,
        reinstall,
        screenshot: report.screenshotRelpath,
        screenshots: {
          afterUpdate: report.screenshotRelpath,
          beforeUpdate: 'screenshots/open-design-win-before-update.png',
        },
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
          before: value,
          after: postUpdateHealth,
        },
      });
      printLifecycleTimings('install lifecycle timings', install.lifecycleTimings);
      printLifecycleTimings('uninstall lifecycle timings', uninstall.lifecycleTimings);
      passed = true;
    } finally {
      restoreUpdateEnv(updateEnv);
      await payloadFixture?.close().catch((error: unknown) => {
        console.error('failed to close payload update fixture', error);
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
        await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch((error: unknown) => {
          console.error('failed to uninstall packaged windows app during cleanup', error);
        });
        installed = false;
      }

      printSmokeTimings(timings);
    }
  }, 720_000);
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

function printLifecycleTimings(title: string, timings: SmokeTiming[] | undefined): void {
  if (timings == null || timings.length === 0) return;
  console.info(
    [
      `[windows ${title}]`,
      ...timings.map((timing) => `${timing.step}: ${Math.round(timing.durationMs / 100) / 10}s`),
    ].join('\n'),
  );
}

type PayloadUpdateSummary = {
  downloaded: NonNullable<WinInspectResult['update']>;
  health: HealthEvalValue;
  launcherAfterConfirm: LauncherSnapshot;
  popup: UpdaterPopupEvalValue;
  terminal: NonNullable<WinInspectResult['update']>;
  targetVersion: string;
};

async function runPayloadUpdateAcceptance(options: {
  expectedVersion: string | null;
}): Promise<PayloadUpdateSummary> {
  const downloadedInspect = await waitForDownloadedUpdater(options.expectedVersion);
  if (downloadedInspect.update == null) throw new Error('payload update download did not return update status');
  const targetVersion = downloadedInspect.update.availableVersion;
  if (targetVersion == null || targetVersion.length === 0) {
    throw new Error(`payload update did not report availableVersion: ${formatUnknown(downloadedInspect.update)}`);
  }
  expect(downloadedInspect.update.artifact?.type).toBe('payload');
  expectPathInside(downloadedInspect.update.downloadPath ?? '', join(runtimeNamespaceRoot, 'updates'));

  const popup = await openReadyUpdaterPrompt(targetVersion);
  expect(popup.visible).toBe(true);
  expect(popup.installButtonVisible).toBe(true);
  expect(popup.text ?? '').toContain(targetVersion);
  expect(popup.text ?? '').not.toMatch(/installer|安装器/i);

  const previousPid = downloadedInspect.status?.pid;
  const clickInstall = await runToolsPackJson<WinInspectResult>('inspect', ['--expr', clickUpdaterInstallExpression]);
  const clickValue = assertUpdaterClickEvalValue(clickInstall.eval?.value);
  expect(clickValue.clicked).toBe(true);

  const postUpdateInspect = await waitForHealthyDesktopVersion(targetVersion, previousPid);
  expect(postUpdateInspect.status?.state).toBe('running');
  expect(postUpdateInspect.status?.url).toBe('od://app/');
  const health = assertHealthEvalValue(postUpdateInspect.eval?.value);
  expect(health.href).toBe('od://app/');
  expect(health.status).toBe(200);
  expect(health.health.ok).toBe(true);
  expect(health.health.version).toBe(targetVersion);
  assertLauncherPointer(postUpdateInspect.launcher.active, targetVersion, 1, 'post-relaunch active');
  assertLauncherPointer(postUpdateInspect.launcher.lastSuccessful, targetVersion, 1, 'post-relaunch lastSuccessful');
  const terminal = await waitForTerminalUpdateState(targetVersion);
  if (terminal.update == null) throw new Error('payload update terminal state did not return update status');
  return {
    downloaded: downloadedInspect.update,
    health,
    launcherAfterConfirm: postUpdateInspect.launcher,
    popup,
    terminal: terminal.update,
    targetVersion,
  };
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
    ...toolsPackReleaseVersionArgs,
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


async function runDirectInstaller(installerPath: string, installDir: string): Promise<DirectInstallerResult> {
  const previousLogLines = await readNsisLogLines();
  const command =
    process.platform === 'win32'
      ? execFileAsync(
          'powershell.exe',
          [
            '-NoLogo',
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            "& { $process = Start-Process -FilePath $env:OD_TEST_INSTALLER_PATH -ArgumentList '/S', $env:OD_TEST_INSTALL_DIR_ARG -Wait -PassThru; exit $process.ExitCode }",
          ],
          {
            cwd: dirname(installerPath),
            env: {
              ...process.env,
              OD_TEST_INSTALL_DIR_ARG: `/D=${installDir}`,
              OD_TEST_INSTALLER_PATH: installerPath,
            },
            maxBuffer: 20 * 1024 * 1024,
          },
        )
      : execFileAsync(installerPath, ['/S', `/D=${installDir}`], {
          cwd: dirname(installerPath),
          env: process.env,
          maxBuffer: 20 * 1024 * 1024,
        });
  const error = await command.then(
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

async function resolveLocalPayloadUpdateFixture(): Promise<{ payloadPath: string; targetVersion: string }> {
  const fallbackBuildJsonPath = resolveFallbackUpdateBuildJsonPath();
  if (fallbackBuildJsonPath == null) {
    throw new Error(
      'full packaged windows payload smoke requires update payload metadata; set OD_PACKAGED_E2E_WIN_UPDATE_METADATA_URL or provide windows-tools-pack-update-build.json next to OD_PACKAGED_E2E_BUILD_JSON_PATH',
    );
  }
  const updateBuild = JSON.parse(stripUtf8Bom(await readFile(fallbackBuildJsonPath, 'utf8'))) as {
    latestYmlPath?: unknown;
    payloadPath?: unknown;
  };
  if (typeof updateBuild.payloadPath !== 'string' || updateBuild.payloadPath.length === 0) {
    throw new Error(`upgrade build metadata missing payloadPath: ${fallbackBuildJsonPath}`);
  }
  const targetVersion =
    updateVersion ??
    (typeof updateBuild.latestYmlPath === 'string' && updateBuild.latestYmlPath.length > 0
      ? await readLatestYmlVersion(updateBuild.latestYmlPath)
      : null);
  if (targetVersion == null || targetVersion.length === 0) {
    throw new Error(`upgrade build metadata missing version: ${fallbackBuildJsonPath}`);
  }
  return {
    payloadPath: resolveFromWorkspace(updateBuild.payloadPath),
    targetVersion,
  };
}

async function waitForDownloadedUpdater(expectedVersion: string | null, timeoutMs = 120_000): Promise<WinInspectResult> {
  const startedAt = Date.now();
  let lastResult: unknown = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const inspect = await runToolsPackJson<WinInspectResult>('inspect', ['--update-action', 'download']);
      lastResult = inspect;
      if (
        inspect.update?.state === 'downloaded' &&
        typeof inspect.update.downloadPath === 'string' &&
        inspect.update.downloadPath.length > 0 &&
        typeof inspect.update.availableVersion === 'string' &&
        inspect.update.availableVersion.length > 0
      ) {
        if (expectedVersion != null && expectedVersion !== '') {
          expect(inspect.update.availableVersion).toBe(expectedVersion);
        }
        expect(inspect.update.artifact?.type).toBe('payload');
        expect(inspect.update.channel).toBe(updateScenario.channel);
        expect(inspect.update.currentVersion).toBe(updateScenario.expectedCurrentVersion);
        return inspect;
      }
    } catch (error) {
      lastResult = error;
    }
    await delay(1000);
  }
  throw new Error(`external Windows updater did not download an installer: ${formatUnknown(lastResult)}`);
}

function assertLauncherPointer(
  pointer: LauncherPointer | null,
  expectedVersion: string,
  expectedGeneration: number,
  label: string,
): void {
  expect(pointer, `${label} pointer`).toEqual({
    generation: expectedGeneration,
    version: expectedVersion,
  });
}

function resolveFallbackUpdateBuildJsonPath(): string | null {
  if (updateBuildJsonPath != null && updateBuildJsonPath !== '') return resolveFromWorkspace(updateBuildJsonPath);
  const mainBuildJsonPath = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_BUILD_JSON_PATH);
  if (mainBuildJsonPath == null || mainBuildJsonPath === '') return null;
  return join(dirname(resolveFromWorkspace(mainBuildJsonPath)), 'windows-tools-pack-update-build.json');
}

async function readLatestYmlVersion(latestYmlPath: string): Promise<string | null> {
  const latestYml = await readFile(resolveFromWorkspace(latestYmlPath), 'utf8').catch(() => null);
  if (latestYml == null) return null;
  const match = /^version:\s+"?([^\r\n"]+)"?/m.exec(stripUtf8Bom(latestYml));
  return match?.[1] ?? null;
}

function stripUtf8Bom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
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

async function ensureMainAppShell(timeoutMs = 45_000): Promise<void> {
  const startedAt = Date.now();
  let lastResult: unknown = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const inspect = await runToolsPackJson<WinInspectResult>('inspect', ['--expr', ensureMainAppShellExpression]);
      lastResult = inspect;
      const value = inspect.eval?.value;
      if (isRecord(value) && value.homeVisible === true) return;
    } catch (error) {
      lastResult = error;
    }
    await delay(750);
  }
  throw new Error(`packaged windows runtime did not reach main app shell: ${formatUnknown(lastResult)}`);
}

async function waitForHealthyDesktopVersion(expectedVersion: string, previousPid: number | null | undefined): Promise<WinInspectResult> {
  const timeoutMs = 120_000;
  const startedAt = Date.now();
  let lastResult: unknown = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const inspect = await runToolsPackJson<WinInspectResult>('inspect', ['--expr', healthExpression]);
      lastResult = inspect;
      if (inspect.status?.state === 'running' && inspect.eval?.ok === true) {
        const value = asHealthEvalValue(inspect.eval.value);
        if (
          value?.status === 200 &&
          value.health.ok === true &&
          value.health.version === expectedVersion &&
          (previousPid == null || inspect.status.pid !== previousPid)
        ) {
          return inspect;
        }
      }
    } catch (error) {
      lastResult = error;
    }
    await delay(1000);
  }

  throw new Error(`packaged windows runtime did not relaunch healthy on ${expectedVersion}: ${formatUnknown(lastResult)}`);
}

async function waitForTerminalUpdateState(expectedVersion: string): Promise<WinInspectResult> {
  const timeoutMs = 60_000;
  const startedAt = Date.now();
  let lastResult: unknown = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const inspect = await runToolsPackJson<WinInspectResult>('inspect', ['--update-action', 'status']);
      lastResult = inspect;
      if (inspect.update?.state === 'not-available' && inspect.update.currentVersion === expectedVersion) return inspect;
    } catch (error) {
      lastResult = error;
    }
    await delay(750);
  }

  throw new Error(`packaged windows updater did not reach terminal no-update state: ${formatUnknown(lastResult)}`);
}

async function openReadyUpdaterPrompt(version: string): Promise<UpdaterPopupEvalValue> {
  await clickUpdaterRailButton('open ready updater prompt');
  return await waitForUpdaterPopupMatching(
    (popup) => popup.visible && popup.installButtonVisible && (popup.text ?? '').includes(version),
    'ready updater prompt',
  );
}

async function clickUpdaterRailButton(label: string, timeoutMs = 90_000): Promise<void> {
  const startedAt = Date.now();
  let lastResult: unknown = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const click = await runToolsPackJson<WinInspectResult>('inspect', ['--expr', clickUpdaterRailExpression]);
      const value = assertUpdaterClickEvalValue(click.eval?.value);
      lastResult = value;
      if (value.clicked) return;
    } catch (error) {
      lastResult = error;
    }
    await delay(750);
  }
  throw new Error(`${label}: updater rail did not become clickable: ${formatUnknown(lastResult)}`);
}

async function waitForUpdaterPopupMatching(
  predicate: (value: UpdaterPopupEvalValue) => boolean,
  label: string,
  timeoutMs = 90_000,
): Promise<UpdaterPopupEvalValue> {
  const startedAt = Date.now();
  let lastResult: unknown = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const inspect = await runToolsPackJson<WinInspectResult>('inspect', ['--expr', updaterPopupExpression]);
      lastResult = inspect;
      if (inspect.status?.state === 'running' && inspect.eval?.ok === true) {
        const value = asUpdaterPopupEvalValue(inspect.eval.value);
        if (value != null && predicate(value)) return value;
      }
    } catch (error) {
      lastResult = error;
    }
    await delay(1000);
  }

  throw new Error(`${label}: updater popup timed out: ${formatUnknown(lastResult)}`);
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
  const unexpectedStandaloneExits = combined
    .split(/\r?\n/)
    .filter((line) => /standalone Next\.js server exited/i.test(line) && !/signal=SIGTERM/i.test(line));
  expect(combined).not.toMatch(/ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING/);
  expect(combined).not.toMatch(/packaged runtime failed/i);
  expect(unexpectedStandaloneExits).toEqual([]);
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
  await printUpdaterHelperLogs();
  await printLauncherRuntimeSnapshot();
}

async function printUpdaterHelperLogs(): Promise<void> {
  const helpersRoot = join(runtimeNamespaceRoot, 'updates', 'helpers');
  const entries = await readdir(helpersRoot).catch(() => []);
  for (const entry of entries.filter((name) => name.endsWith('.log')).sort()) {
    const logPath = join(helpersRoot, entry);
    const content = await readFile(logPath, 'utf8').catch(() => '');
    console.error(`[updater-helper] ${logPath}`);
    console.error(content.trim() || '(no log lines)');
  }
}

async function printLauncherRuntimeSnapshot(): Promise<void> {
  const runtimePath = join(toolsPackDir, 'runtime', 'win', 'launcher', 'channels', updateScenario.channel, 'namespaces', namespace, 'runtime.json');
  const content = await readFile(runtimePath, 'utf8').catch(() => null);
  console.error(`[launcher-runtime] ${runtimePath}`);
  console.error(content?.trim() ?? '(missing)');
}

function assertHealthEvalValue(value: unknown): HealthEvalValue {
  const normalized = asHealthEvalValue(value);
  if (normalized == null) {
    throw new Error(`unexpected health eval value: ${formatUnknown(value)}`);
  }
  return normalized;
}

function assertUpdaterClickEvalValue(value: unknown): UpdaterClickEvalValue {
  if (!isRecord(value) || typeof value.clicked !== 'boolean') {
    throw new Error(`unexpected updater click eval value: ${formatUnknown(value)}`);
  }
  return value as UpdaterClickEvalValue;
}

function asUpdaterPopupEvalValue(value: unknown): UpdaterPopupEvalValue | null {
  if (!isRecord(value)) return null;
  if (typeof value.visible !== 'boolean') return null;
  if (typeof value.installButtonVisible !== 'boolean') return null;
  if (value.text != null && typeof value.text !== 'string') return null;
  if (value.title != null && typeof value.title !== 'string') return null;
  return value as UpdaterPopupEvalValue;
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

async function readTiming(filePath: string): Promise<TimingResult> {
  return JSON.parse(await readFile(filePath, 'utf8')) as TimingResult;
}

async function seedPackagedOnboardingComplete(): Promise<void> {
  // Pre-mark first-run onboarding as complete so the packaged app boots
  // straight to the home shell. Since #4389 the Connect onboarding step is
  // required and has no Skip affordance, so the only way past it on a fresh
  // install is an `onboardingCompleted: true` config the daemon reads on boot.
  //
  // Write to the SAME data dir the running daemon actually reads —
  // `<runtimeNamespaceRoot>/data` — not a path derived from the installed
  // app's baked config. `tools-pack win start` rewrites the launch config's
  // `namespaceBaseRoot` to the tools-pack runtime root (see
  // writeInstalledLaunchPackagedConfig in tools/pack/src/win/lifecycle.ts) and
  // hands it to the runtime via OD_PACKAGED_CONFIG_PATH, so the live daemon's
  // RUNTIME_DATA_DIR is always under runtimeNamespaceRoot regardless of what
  // the installer baked. Deriving the path from the installed manifest landed
  // the seed elsewhere (the AppData fallback), so the daemon never saw it and
  // the app stuck on onboarding once the Skip button was removed. This mirrors
  // the macOS smoke's seed, which already writes under runtimeNamespaceRoot.
  const configPath = join(runtimeNamespaceRoot, 'data', 'app-config.json');
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify({ onboardingCompleted: true }, null, 2)}\n`, 'utf8');
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

function normalizeOptionalEnv(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized == null || normalized.length === 0 ? null : normalized;
}
