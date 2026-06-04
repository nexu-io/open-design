// @vitest-environment node

import { createHash } from 'node:crypto';
import { execFile, spawn, type ChildProcessByStdio } from 'node:child_process';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, test } from 'vitest';

import { createPackagedSmokeReport } from '@/vitest/packaged-report';
import {
  applyPackagedUpdateEnv,
  resolvePackagedUpdateScenario,
  type PackagedUpdateScenario,
} from '@/vitest/packaged-update-scenario';
import { releaseAppVersionArgs, resolvePackagedWinInstallIdentity } from '@/vitest/packaged-win-identity';

const execFileAsync = promisify(execFile);
const e2eRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = dirname(e2eRoot);
const toolsPackDir = resolveFromWorkspace(process.env.OD_PACKAGED_E2E_TOOLS_PACK_DIR ?? '.tmp/tools-pack');
const namespace = process.env.OD_PACKAGED_E2E_NAMESPACE ?? 'release-beta-win';
const toolsPackBin = join(workspaceRoot, 'tools', 'pack', 'bin', 'tools-pack.mjs');
const toolsServeBin = join(workspaceRoot, 'tools', 'serve', 'bin', 'tools-serve.mjs');
const maxInstallDurationMs = Number.parseInt(process.env.OD_PACKAGED_E2E_WIN_MAX_INSTALL_MS ?? '120000', 10);
const verifyReinstallWhileRunning = process.env.OD_PACKAGED_E2E_WIN_VERIFY_REINSTALL !== '0';
const verifyViolentUpdater = process.env.OD_PACKAGED_E2E_WIN_UPDATER_VIOLENT !== '0';
const verifyRealUpdateInstaller = process.env.OD_PACKAGED_E2E_WIN_REAL_UPDATE_INSTALL === '1';
const releaseChannel = process.env.OD_PACKAGED_E2E_RELEASE_CHANNEL;
const releaseVersion = process.env.OD_PACKAGED_E2E_RELEASE_VERSION;
const updateScenario = resolvePackagedUpdateScenario({ releaseChannel, releaseVersion });
const installIdentity = resolvePackagedWinInstallIdentity({ namespace, releaseVersion });
const toolsPackReleaseVersionArgs = releaseAppVersionArgs(releaseVersion);
const violentArtifactBytes = Number.parseInt(process.env.OD_PACKAGED_E2E_WIN_UPDATER_BYTES ?? `${16 * 1024 * 1024}`, 10);
const violentChunkDelayMs = Number.parseInt(process.env.OD_PACKAGED_E2E_WIN_UPDATER_CHUNK_DELAY_MS ?? '18', 10);

const outputNamespaceRoot = join(toolsPackDir, 'out', 'win', 'namespaces', namespace);
const runtimeNamespaceRoot = join(toolsPackDir, 'runtime', 'win', 'namespaces', namespace);
const screenshotPath = join(toolsPackDir, 'screenshots', `${namespace}.png`);
const healthExpression = "fetch('/api/health').then(async response => ({ health: await response.json(), href: location.href, status: response.status, title: document.title }))";
const updaterPopupExpression = `
  (() => {
    const popup = document.querySelector('[data-testid="updater-popup"]');
    const button = document.querySelector('[data-testid="updater-install-button"]');
    const primary = popup?.querySelector('.updater-popup__button--primary');
    const onboarding = document.querySelector('.onboarding-view');
    const rail = document.querySelector('[data-testid="entry-nav-updater"]');
    return {
      href: location.href,
      installButtonVisible: button instanceof HTMLButtonElement && !button.disabled,
      onboardingVisible: onboarding instanceof HTMLElement,
      primaryDisabled: primary instanceof HTMLButtonElement ? primary.disabled : null,
      primaryText: primary instanceof HTMLButtonElement ? primary.textContent?.trim() ?? null : null,
      railTooltip: rail instanceof HTMLElement ? rail.getAttribute('data-tooltip') : null,
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
  (() => {
    const button = document.querySelector('[data-testid="entry-nav-updater"]');
    if (!(button instanceof HTMLButtonElement)) return { clicked: false, reason: 'missing-updater-rail' };
    if (button.getAttribute('aria-disabled') === 'true') return { clicked: false, reason: 'updater-rail-disabled' };
    button.click();
    return { clicked: true };
  })()
`;
const startUpdaterDownloadExpression = `
  (() => {
    const updater = window.__od__?.updater;
    if (updater == null || typeof updater.download !== 'function') {
      return { started: false, reason: 'missing-host-updater-download' };
    }
    void updater.download({ payload: { source: 'packaged-e2e:silent-download' } });
    return { started: true };
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

type WinListResult = {
  current: {
    registryEntries: Array<{
      displayName: string | null;
      displayVersion: string | null;
      installLocation: string | null;
      keyPath: string;
    }>;
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
  update?: {
    active?: {
      path?: string;
      version?: string;
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

type ViolentUpdaterSummary = {
  badChecksum: {
    code: string | undefined;
    requestCount: number;
  };
  cacheClear: {
    downloadedVersion: string | undefined;
  };
  corruptHelperReset: {
    downloadedVersion: string | undefined;
    fullArtifactRequestsAfterTamper: number;
  };
  firstResume: {
    partialBytes: number;
    range: string | null;
  };
  liveLock: {
    code: string | undefined;
    artifactRequestsAfterLock: number;
  };
  rootAttack: {
    code: string | undefined;
  };
  secondResume: {
    partialBytes: number;
    range: string | null;
  };
};

type RealUpdateInstallerSummary = {
  downloadedPath: string;
  displayVersion: string | null;
  nsisLogTail: string[];
  registryEntryCount: number;
};

type DirectInstallerResult = {
  code: number | null;
  nsisLogTail: string[];
};

type InstalledPackagedConfig = {
  namespaceBaseRoot?: unknown;
};

type InstalledAppPackage = {
  name?: unknown;
  productName?: unknown;
};

type UpdaterFixtureProcess = {
  close: () => Promise<void>;
  info: {
    artifactUrl?: string;
    metadataUrl: string;
    sha256?: string;
    version: string;
  };
};

type ViolentUpdaterRequest = {
  aborted?: boolean;
  end?: number;
  method: string;
  path: string;
  range: string | null;
  sent?: number;
  start?: number;
  status: number;
  total?: number;
};

type ViolentUpdaterFixtureProcess = UpdaterFixtureProcess & {
  info: UpdaterFixtureProcess['info'] & {
    artifactBytes: number;
    artifactUrl: string;
    checksumUrl: string;
    publishedSha256: string;
    realSha256: string;
  };
  requests: ViolentUpdaterRequest[];
};

type UpdaterPopupEvalValue = {
  href?: string;
  installButtonVisible: boolean;
  onboardingVisible?: boolean;
  primaryDisabled?: boolean | null;
  primaryText?: string | null;
  railTooltip?: string | null;
  text: string | null;
  title: string | null;
  visible: boolean;
};

type UpdaterClickEvalValue = {
  clicked: boolean;
  reason?: string;
};

type UpdaterStartEvalValue = {
  reason?: string;
  started: boolean;
};

const shouldRunPackagedWinSmoke = process.platform === 'win32' && process.env.OD_PACKAGED_E2E_WIN === '1';
const winDescribe = shouldRunPackagedWinSmoke ? describe : describe.skip;

winDescribe('packaged windows runtime smoke', () => {
  let installed = false;
  let started = false;

  test('[P2] installs, starts, inspects with eval and screenshot, stops, and uninstalls the built windows artifact', async () => {
    const report = await createPackagedSmokeReport('win');
    const updateEnv = captureUpdateEnv();
    let updaterFixture: UpdaterFixtureProcess | null = null;
    let passed = false;
    const timings: SmokeTiming[] = [];
    let violentUpdater: ViolentUpdaterSummary | { skipped: true } = { skipped: true };
    let realUpdateInstaller: RealUpdateInstallerSummary | { skipped: true } = { skipped: true };
    try {
      await measureSmokeStep(timings, 'pre-clean uninstall', async () => {
        await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch(() => null);
      });

      const install = await measureSmokeStep(timings, 'install', async () => runToolsPackJson<WinInstallResult>('install'));
      installed = true;
      const expectedUpdateRoot = await resolveExpectedUpdateRoot(install.installDir);
      await measureSmokeStep(timings, 'clear updater root', async () => clearUpdateRoot(expectedUpdateRoot));

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

      updaterFixture = verifyViolentUpdater
        ? await startViolentUpdaterFixtureProcess(updateScenario, {
            artifactBytes: violentArtifactBytes,
            chunkDelayMs: violentChunkDelayMs,
          })
        : await startUpdaterFixtureProcess(updateScenario);
      if (verifyViolentUpdater) applyManualPackagedUpdateEnv(process.env, updateScenario, updaterFixture.info.metadataUrl);
      else applyPackagedUpdateEnv(process.env, updateScenario, updaterFixture.info.metadataUrl);
      await seedPackagedOnboardingComplete(install.installDir);

      const startDesktop = async (step: string): Promise<WinStartResult> => {
        const nextStart = await measureSmokeStep(timings, step, async () => runToolsPackJson<WinStartResult>('start'));
        started = true;
        return nextStart;
      };
      const stopDesktop = async (step: string): Promise<WinStopResult> => {
        const stop = await measureSmokeStep(timings, step, async () => runToolsPackJson<WinStopResult>('stop'));
        started = false;
        return stop;
      };
      const killDesktop = async (step: string, pid: number): Promise<void> => {
        await measureSmokeStep(timings, step, async () => {
          await forceKillProcessTree(pid);
        });
        started = false;
      };

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
      if (updateScenario.currentVersionOverride == null) {
        expect(value.health.version).toBe(updateScenario.expectedCurrentVersion);
      } else {
        expect(value.health.version).toEqual(expect.any(String));
      }

      if (verifyViolentUpdater) {
        violentUpdater = await runPackagedUpdaterViolentChecks({
          expectedUpdateRoot,
          fixture: assertViolentUpdaterFixture(updaterFixture),
          killDesktop,
          startDesktop: async (step) => {
            start = await startDesktop(step);
            return start;
          },
          stopDesktop,
          timings,
        });
      }

      const fixtureInfo = updaterFixture?.info;
      if (fixtureInfo == null) throw new Error('updater fixture was not initialized');
      const popup = await measureSmokeStep(timings, 'open ready updater prompt', async () =>
        openReadyUpdaterPrompt(fixtureInfo.version),
      );
      expect(popup.visible).toBe(true);
      expect(popup.title).toEqual(expect.any(String));
      expect(popup.title?.trim().length).toBeGreaterThan(0);
      expect(popup.installButtonVisible).toBe(true);
      expect(popup.text ?? '').toContain(updaterFixture.info.version);

      const updateStatus = await measureSmokeStep(timings, 'inspect updater status', async () =>
        runToolsPackJson<WinInspectResult>('inspect', ['--update-action', 'status']),
      );
      expect(updateStatus.update?.state).toBe('downloaded');
      expect(updateStatus.update?.channel).toBe(updateScenario.channel);
      expect(updateStatus.update?.currentVersion).toBe(updateScenario.expectedCurrentVersion);
      expect(updateStatus.update?.availableVersion).toBe(updaterFixture.info.version);
      expectPathInside(updateStatus.update?.downloadPath ?? '', expectedUpdateRoot);

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
      expectPathInside(updateInstall.update?.installResult?.path ?? '', expectedUpdateRoot);

      if (verifyRealUpdateInstaller) {
        realUpdateInstaller = await measureSmokeStep(timings, 'real public update installer acceptance', async () =>
          runRealUpdateInstallerAcceptance({
            installDir: install.installDir,
            startDesktop: async (step) => {
              start = await startDesktop(step);
              return start;
            },
            stopDesktop,
          }),
        );
      }

      let reinstall: DirectInstallerResult | { skipped: true } = { skipped: true };
      if (verifyReinstallWhileRunning && !verifyRealUpdateInstaller) {
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
        expectedUpdateRoot,
        logs: summarizeLogs(logs),
        namespace,
        realUpdateInstaller,
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
          violent: violentUpdater,
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

async function runPackagedUpdaterViolentChecks(options: {
  expectedUpdateRoot: string;
  fixture: ViolentUpdaterFixtureProcess;
  killDesktop: (step: string, pid: number) => Promise<void>;
  startDesktop: (step: string) => Promise<WinStartResult>;
  stopDesktop: (step: string) => Promise<WinStopResult>;
  timings: SmokeTiming[];
}): Promise<ViolentUpdaterSummary> {
  const firstResume = await runInterruptedResumePass('first interrupted updater resume', options);

  await options.stopDesktop('stop before cache-clear updater pass');
  await clearUpdateRoot(options.expectedUpdateRoot);
  await options.startDesktop('start after cache clear');
  await waitForHealthyDesktop();
  const cacheClearStatus = await runUiCheckAndDownloadToReady('cache-clear updater pass', options.fixture.info.version);

  await options.stopDesktop('stop before live-lock updater pass');
  await clearUpdateRoot(options.expectedUpdateRoot);
  const liveLockStart = await options.startDesktop('start live-lock updater pass');
  await waitForHealthyDesktop();
  await checkUpdaterAvailable('live-lock updater check', options.fixture.info.version);
  const liveLockArtifactRequestsBefore = artifactRequests(options.fixture).length;
  await writeManagedDownloadLock(options.expectedUpdateRoot, options.fixture.info.version, liveLockStart.pid);
  await startUpdaterDownload('live-lock updater silent download');
  const liveLockStatus = await waitForUpdaterStatus(
    (inspect) => inspect.update?.state === 'error',
    'live-lock updater error',
  );
  expect(liveLockStatus.update?.error?.code).toBe('download-target-locked');
  const liveLockArtifactRequestsAfter = artifactRequests(options.fixture).length - liveLockArtifactRequestsBefore;
  expect(liveLockArtifactRequestsAfter).toBe(0);

  await options.stopDesktop('stop before corrupt-helper updater pass');
  await clearUpdateRoot(options.expectedUpdateRoot);
  await options.startDesktop('start corrupt-helper updater pass');
  await waitForHealthyDesktop();
  await checkUpdaterAvailable('corrupt-helper updater check', options.fixture.info.version);
  await writeTamperedManagedDownloadState(options.expectedUpdateRoot, options.fixture.info.version);
  const corruptRequestsBefore = artifactRequests(options.fixture).length;
  await runUpdaterDownload('corrupt-helper updater silent download');
  const corruptHelperStatus = await waitForUpdaterStatus(
    (inspect) => inspect.update?.state === 'downloaded',
    'corrupt-helper updater downloaded',
  );
  const corruptNewRequests = artifactRequests(options.fixture).slice(corruptRequestsBefore);
  const fullArtifactRequestsAfterTamper = corruptNewRequests.filter((request) => request.range == null && request.status === 200).length;
  expect(fullArtifactRequestsAfterTamper).toBeGreaterThan(0);
  await expectManagedDownloadsClear(options.expectedUpdateRoot);

  await options.stopDesktop('stop before updater-root attack');
  await clearUpdateRoot(options.expectedUpdateRoot);
  await options.startDesktop('start updater-root attack seed');
  await waitForHealthyDesktop();
  await checkUpdaterAvailable('updater-root attack check', options.fixture.info.version);
  await writeUnexpectedUpdateRootEntry(options.expectedUpdateRoot);
  await options.stopDesktop('stop after updater-root attack seed');
  await options.startDesktop('start updater-root attack restore');
  const rootAttackStatus = await waitForUpdaterStatus(
    (inspect) => inspect.update?.state === 'error',
    'updater-root attack error',
  );
  expect(rootAttackStatus.update?.error?.code).toBe('update-store-invalid-shape');

  const badFixture = await startViolentUpdaterFixtureProcess(updateScenario, {
    artifactBytes: 4 * 1024 * 1024,
    badChecksum: true,
    chunkDelayMs: 1,
  });
  let badChecksumStatus: WinInspectResult | null = null;
  try {
    applyManualPackagedUpdateEnv(process.env, updateScenario, badFixture.info.metadataUrl);
    await options.stopDesktop('stop before checksum-mismatch updater pass');
    await clearUpdateRoot(options.expectedUpdateRoot);
    await options.startDesktop('start checksum-mismatch updater pass');
    await waitForHealthyDesktop();
    await checkUpdaterAvailable('checksum-mismatch updater check', badFixture.info.version);
    await runUpdaterDownload('checksum-mismatch updater silent download');
    badChecksumStatus = await waitForUpdaterStatus(
      (inspect) => inspect.update?.state === 'error',
      'checksum-mismatch updater error',
    );
    expect(badChecksumStatus.update?.error?.code).toBe('checksum-mismatch');
    await expectManagedDownloadsClear(options.expectedUpdateRoot);
  } finally {
    await badFixture.close().catch((error: unknown) => {
      console.error('failed to close bad checksum updater fixture', error);
    });
    applyManualPackagedUpdateEnv(process.env, updateScenario, options.fixture.info.metadataUrl);
  }

  await options.stopDesktop('stop before second interrupted updater resume');
  await clearUpdateRoot(options.expectedUpdateRoot);
  await options.startDesktop('start second interrupted updater resume');
  await waitForHealthyDesktop();
  const secondResume = await runInterruptedResumePass('second interrupted updater resume', options);
  if (badChecksumStatus == null) throw new Error('checksum-mismatch updater pass did not produce a status');

  return {
    badChecksum: {
      code: badChecksumStatus.update?.error?.code,
      requestCount: badFixture.requests.length,
    },
    cacheClear: {
      downloadedVersion: cacheClearStatus.update?.availableVersion,
    },
    corruptHelperReset: {
      downloadedVersion: corruptHelperStatus.update?.availableVersion,
      fullArtifactRequestsAfterTamper,
    },
    firstResume,
    liveLock: {
      artifactRequestsAfterLock: liveLockArtifactRequestsAfter,
      code: liveLockStatus.update?.error?.code,
    },
    rootAttack: {
      code: rootAttackStatus.update?.error?.code,
    },
    secondResume,
  };
}

function assertViolentUpdaterFixture(value: UpdaterFixtureProcess | null): ViolentUpdaterFixtureProcess {
  if (!isViolentUpdaterFixture(value)) {
    throw new Error('expected the violent updater fixture to be active');
  }
  return value;
}

function isViolentUpdaterFixture(value: UpdaterFixtureProcess | null): value is ViolentUpdaterFixtureProcess {
  return (
    value != null &&
    Array.isArray((value as Partial<ViolentUpdaterFixtureProcess>).requests) &&
    typeof (value as Partial<ViolentUpdaterFixtureProcess>).info?.artifactBytes === 'number' &&
    typeof (value as Partial<ViolentUpdaterFixtureProcess>).info?.artifactUrl === 'string' &&
    typeof (value as Partial<ViolentUpdaterFixtureProcess>).info?.checksumUrl === 'string' &&
    typeof (value as Partial<ViolentUpdaterFixtureProcess>).info?.publishedSha256 === 'string' &&
    typeof (value as Partial<ViolentUpdaterFixtureProcess>).info?.realSha256 === 'string'
  );
}

async function runRealUpdateInstallerAcceptance(options: {
  installDir: string;
  startDesktop: (step: string) => Promise<WinStartResult>;
  stopDesktop: (step: string) => Promise<WinStopResult>;
}): Promise<RealUpdateInstallerSummary> {
  if (releaseChannel == null || releaseChannel === '' || releaseVersion == null || releaseVersion === '') {
    throw new Error('OD_PACKAGED_E2E_WIN_REAL_UPDATE_INSTALL requires OD_PACKAGED_E2E_RELEASE_CHANNEL and OD_PACKAGED_E2E_RELEASE_VERSION');
  }
  const expectedUpdateRoot = await resolveExpectedUpdateRoot(options.installDir);
  await options.stopDesktop('stop before real public update installer');
  await clearUpdateRoot(expectedUpdateRoot);
  applyManualPackagedUpdateEnv(
    process.env,
    updateScenario,
    `https://releases.open-design.ai/${updateScenario.channel}/latest/metadata.json`,
  );
  await options.startDesktop('start real public update installer');
  await waitForHealthyDesktop();
  const available = await runToolsPackJson<WinInspectResult>('inspect', ['--update-action', 'check']);
  expect(
    available.update?.state === 'available' || available.update?.state === 'downloaded',
    `real public update available: ${formatUnknown(available)}`,
  ).toBe(true);
  if (available.update?.state !== 'downloaded') {
    await runUpdaterDownload('real public update silent download');
  }
  const downloaded = await waitForUpdaterStatus(
    (inspect) => inspect.update?.state === 'downloaded',
    'real public update downloaded',
    10 * 60_000,
  );
  const downloadedPath = downloaded.update?.downloadPath;
  if (downloadedPath == null) throw new Error(`real public update did not expose a downloadPath: ${formatUnknown(downloaded)}`);
  expectPathInside(downloadedPath, expectedUpdateRoot);
  await options.stopDesktop('stop before installing real public update');
  const installResult = await runDirectInstaller(downloadedPath, options.installDir);
  expect(installResult.code).toBe(0);
  const list = await runToolsPackJson<WinListResult>('list');
  const matchingEntries = list.current.registryEntries.filter((entry) => entry.displayName === installIdentity.displayName);
  expect(matchingEntries.length).toBe(1);
  const entry = matchingEntries[0];
  if (entry == null) throw new Error(`expected one registry entry for ${installIdentity.displayName}`);
  expect(entry.keyPath).toContain(`Open Design-${installIdentity.namespaceToken}`);
  expect(entry.displayVersion).toBe(downloaded.update?.availableVersion);
  await options.startDesktop('start after real public update install');
  await waitForHealthyDesktop();
  return {
    downloadedPath,
    displayVersion: entry.displayVersion,
    nsisLogTail: installResult.nsisLogTail,
    registryEntryCount: matchingEntries.length,
  };
}

async function runInterruptedResumePass(
  label: string,
  options: {
    expectedUpdateRoot: string;
    fixture: ViolentUpdaterFixtureProcess;
    killDesktop: (step: string, pid: number) => Promise<void>;
    startDesktop: (step: string) => Promise<WinStartResult>;
  },
): Promise<{ partialBytes: number; range: string | null }> {
  await checkUpdaterAvailable(`${label} check`, options.fixture.info.version);
  const requestsBefore = artifactRequests(options.fixture).length;
  await startUpdaterDownload(`${label} start silent download`);
  const downloading = await waitForUpdaterStatus(
    (inspect) => inspect.update?.state === 'downloading',
    `${label} downloading`,
    30_000,
  );
  await delay(900);
  const pid = downloading.status?.pid ?? (await runToolsPackJson<WinInspectResult>('inspect')).status?.pid;
  if (typeof pid !== 'number' || pid <= 0) throw new Error(`${label}: desktop pid was not available before forced kill`);
  await options.killDesktop(`${label} forced kill`, pid);
  await delay(1200);

  const partial = await readManagedDownloadPartial(options.expectedUpdateRoot);
  expect(partial.bytes).toBeGreaterThan(0);
  const aborted = artifactRequests(options.fixture).slice(requestsBefore).find((request) => request.aborted === true);
  expect(aborted, `${label}: expected an aborted artifact request`).toBeTruthy();

  await options.startDesktop(`${label} restart`);
  await waitForHealthyDesktop();
  await checkUpdaterAvailable(`${label} retry check`, options.fixture.info.version);
  await runUpdaterDownload(`${label} retry silent download`);
  await waitForUpdaterStatus(
    (inspect) => inspect.update?.state === 'downloaded',
    `${label} downloaded after resume`,
  );
  const resumed = artifactRequests(options.fixture)
    .slice(requestsBefore)
    .find((request) => request.status === 206 && request.range === `bytes=${partial.bytes}-`);
  expect(resumed, `${label}: expected Range resume from ${partial.bytes}`).toBeTruthy();
  await expectManagedDownloadsClear(options.expectedUpdateRoot);
  return { partialBytes: partial.bytes, range: resumed?.range ?? null };
}

async function runUiCheckAndDownloadToReady(label: string, version: string): Promise<WinInspectResult> {
  await checkUpdaterAvailable(`${label} check`, version);
  await runUpdaterDownload(`${label} silent download`);
  const status = await waitForUpdaterStatus(
    (inspect) => inspect.update?.state === 'downloaded',
    `${label} downloaded`,
  );
  return status;
}

async function checkUpdaterAvailable(label: string, version: string): Promise<WinInspectResult> {
  const status = await runToolsPackJson<WinInspectResult>('inspect', ['--update-action', 'check']);
  expect(status.update?.state, `${label}: expected updater check to find an available update`).toBe('available');
  expect(status.update?.availableVersion).toBe(version);
  return status;
}

async function runUpdaterDownload(label: string): Promise<WinInspectResult> {
  const status = await runToolsPackJson<WinInspectResult>('inspect', ['--update-action', 'download']);
  expect(
    status.update?.state === 'downloaded' || status.update?.state === 'error',
    `${label}: expected updater download to settle`,
  ).toBe(true);
  return status;
}

async function startUpdaterDownload(label: string): Promise<void> {
  const started = await runToolsPackJson<WinInspectResult>('inspect', ['--expr', startUpdaterDownloadExpression]);
  const value = assertUpdaterStartEvalValue(started.eval?.value);
  expect(value.started, `${label}: ${value.reason ?? 'updater download was not started'}`).toBe(true);
}

async function openReadyUpdaterPrompt(version: string): Promise<UpdaterPopupEvalValue> {
  await clickUpdaterRailButton('open ready updater prompt');
  return await waitForUpdaterPopupMatching(
    (popup) => popup.visible && popup.installButtonVisible && (popup.text ?? '').includes(version),
    'ready updater prompt',
  );
}

async function clickUpdaterRailButton(label: string): Promise<void> {
  const click = await runToolsPackJson<WinInspectResult>('inspect', ['--expr', clickUpdaterRailExpression]);
  const value = assertUpdaterClickEvalValue(click.eval?.value);
  expect(value.clicked, `${label}: ${value.reason ?? 'updater rail not clicked'}`).toBe(true);
}

async function waitForUpdaterStatus(
  predicate: (inspect: WinInspectResult) => boolean,
  label: string,
  timeoutMs = 120_000,
): Promise<WinInspectResult> {
  const startedAt = Date.now();
  let lastResult: unknown = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const inspect = await runToolsPackJson<WinInspectResult>('inspect', ['--update-action', 'status']);
      lastResult = inspect;
      if (predicate(inspect)) return inspect;
    } catch (error) {
      lastResult = error;
    }
    await delay(750);
  }
  throw new Error(`${label}: updater status timed out: ${formatUnknown(lastResult)}`);
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
    await delay(750);
  }
  throw new Error(`${label}: updater popup timed out: ${formatUnknown(lastResult)}`);
}

async function forceKillProcessTree(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    await execFileAsync('taskkill.exe', ['/PID', String(pid), '/F'], {
      env: process.env,
      windowsHide: true,
    }).catch((error: unknown) => {
      if (isExecError(error) && /not found|not running|no running instance/i.test(`${error.stdout}\n${error.stderr}`)) return;
      throw error;
    });
    return;
  }
  process.kill(pid, 'SIGKILL');
}

function artifactRequests(fixture: ViolentUpdaterFixtureProcess): ViolentUpdaterRequest[] {
  return fixture.requests.filter((request) => request.path === new URL(fixture.info.artifactUrl).pathname);
}

async function clearUpdateRoot(updateRoot: string): Promise<void> {
  assertSafeUpdateRoot(updateRoot);
  await rm(updateRoot, { force: true, recursive: true });
}

function assertSafeUpdateRoot(updateRoot: string): void {
  const resolved = resolve(updateRoot);
  if (basename(resolved) !== 'updates' || basename(dirname(resolved)) !== namespace) {
    throw new Error(`refusing to mutate unexpected update root: ${resolved}`);
  }
}

async function readManagedDownloadPartial(updateRoot: string): Promise<{ bytes: number; path: string }> {
  const partialRoot = join(updateRoot, 'downloads', '.partial');
  const entries = await readdir(partialRoot).catch(() => []);
  const partial = entries.find((entry) => entry.endsWith('.partial'));
  if (partial == null) throw new Error(`expected a managed download partial under ${partialRoot}`);
  const partialPath = join(partialRoot, partial);
  return { bytes: (await stat(partialPath)).size, path: partialPath };
}

async function expectManagedDownloadsClear(updateRoot: string): Promise<void> {
  const downloadsRoot = join(updateRoot, 'downloads');
  for (const child of ['.locks', '.partial', '.state']) {
    const entries = await readdir(join(downloadsRoot, child)).catch(() => []);
    expect(entries, `${child} should be empty after copy-and-clear/reset`).toEqual([]);
  }
}

async function ensureManagedDownloadBase(updateRoot: string): Promise<string> {
  const downloadsRoot = join(updateRoot, 'downloads');
  await mkdir(join(downloadsRoot, '.locks'), { recursive: true });
  await mkdir(join(downloadsRoot, '.partial'), { recursive: true });
  await mkdir(join(downloadsRoot, '.state'), { recursive: true });
  await writeFile(
    join(downloadsRoot, '.open-design-download-root.json'),
    `${JSON.stringify({
      createdAt: new Date().toISOString(),
      kind: 'open-design-managed-download-root',
      schemaVersion: 1,
    }, null, 2)}\n`,
    'utf8',
  );
  return downloadsRoot;
}

async function writeManagedDownloadLock(updateRoot: string, version: string, pid: number): Promise<string> {
  const downloadsRoot = await ensureManagedDownloadBase(updateRoot);
  const key = managedDownloadTargetKey(version);
  const lockPath = join(downloadsRoot, '.locks', `${key}.lock`);
  await writeFile(lockPath, `${JSON.stringify({ createdAt: new Date().toISOString(), pid })}\n`, 'utf8');
  return lockPath;
}

async function writeTamperedManagedDownloadState(updateRoot: string, version: string): Promise<void> {
  const downloadsRoot = await ensureManagedDownloadBase(updateRoot);
  const key = managedDownloadTargetKey(version);
  await writeFile(join(downloadsRoot, '.state', `${key}.json`), `${JSON.stringify({ kind: 'tampered' })}\n`, 'utf8');
  await writeFile(join(downloadsRoot, '.partial', `${key}.partial`), 'tampered partial', 'utf8');
}

async function writeUnexpectedUpdateRootEntry(updateRoot: string): Promise<void> {
  assertSafeUpdateRoot(updateRoot);
  await writeFile(join(updateRoot, 'unexpected-root-entry.txt'), 'tamper', 'utf8');
}

function managedDownloadTargetKey(version: string): string {
  return createHash('sha256').update(`package-launcher\0${updaterOutputFileName(version)}`).digest('hex');
}

function updaterOutputFileName(version: string): string {
  return [
    'open-design',
    sanitizeUpdaterPathSegment(version),
    'win',
    'x64',
    'installer',
  ].join('-') + '.exe';
}

function sanitizeUpdaterPathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'update';
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

const UPDATE_ENV_KEYS = [
  'OD_UPDATE_AUTO_CHECK',
  'OD_UPDATE_AUTO_DOWNLOAD',
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

function applyManualPackagedUpdateEnv(
  env: NodeJS.ProcessEnv,
  scenario: PackagedUpdateScenario,
  metadataUrl: string,
): void {
  applyPackagedUpdateEnv(env, scenario, metadataUrl);
  env.OD_UPDATE_AUTO_CHECK = '0';
  env.OD_UPDATE_AUTO_DOWNLOAD = '0';
}

async function startUpdaterFixtureProcess(scenario: PackagedUpdateScenario): Promise<UpdaterFixtureProcess> {
  const child = spawn(
    process.execPath,
    [
      toolsServeBin,
      'start',
      'updater',
      '--json',
      '--channel',
      scenario.channel,
      '--version',
      scenario.fixtureVersion,
      '--platform',
      'win',
    ],
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

async function startViolentUpdaterFixtureProcess(
  scenario: PackagedUpdateScenario,
  options: { artifactBytes: number; badChecksum?: boolean; chunkDelayMs: number },
): Promise<ViolentUpdaterFixtureProcess> {
  const channel = scenario.channel;
  const version = scenario.fixtureVersion;
  const host = '127.0.0.1';
  const artifactName = `open-design-${version}-win-x64-setup.exe`;
  const artifact = createDeterministicArtifact(options.artifactBytes);
  const realSha256 = createHash('sha256').update(artifact).digest('hex');
  const publishedSha256 =
    options.badChecksum === true
      ? `${realSha256.slice(0, -1)}${realSha256.endsWith('0') ? '1' : '0'}`
      : realSha256;
  const requests: ViolentUpdaterRequest[] = [];
  let origin = '';

  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', origin || `http://${host}`).pathname;
    if (path === `/${channel}/latest/metadata.json`) {
      const body = JSON.stringify({
        channel,
        generatedAt: new Date().toISOString(),
        ...fixtureChannelMetadata(channel, version),
        platforms: {
          win: {
            arch: 'x64',
            artifacts: {
              installer: {
                contentType: 'application/vnd.microsoft.portable-executable',
                name: artifactName,
                sha256Url: `${origin}/${channel}/versions/${version}/${artifactName}.sha256`,
                size: artifact.byteLength,
                url: `${origin}/${channel}/versions/${version}/${artifactName}`,
              },
            },
            channel,
            enabled: true,
            feed: null,
            label: 'Windows x64',
            platform: 'win',
            platformKey: 'win',
            signed: false,
          },
        },
        version: 1,
      });
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.setHeader('content-length', String(Buffer.byteLength(body)));
      response.end(request.method === 'HEAD' ? undefined : body);
      requests.push({ method: request.method ?? 'GET', path, range: request.headers.range ?? null, status: 200 });
      return;
    }
    if (path === `/${channel}/versions/${version}/${artifactName}.sha256`) {
      const body = `${publishedSha256}  ${artifactName}\n`;
      response.setHeader('content-type', 'text/plain; charset=utf-8');
      response.setHeader('content-length', String(Buffer.byteLength(body)));
      response.end(request.method === 'HEAD' ? undefined : body);
      requests.push({ method: request.method ?? 'GET', path, range: request.headers.range ?? null, status: 200 });
      return;
    }
    if (path === `/${channel}/versions/${version}/${artifactName}`) {
      sendViolentArtifact(request, response, artifact, options.chunkDelayMs, path, requests);
      return;
    }
    response.statusCode = 404;
    response.end('not found');
    requests.push({ method: request.method ?? 'GET', path, range: request.headers.range ?? null, status: 404 });
  });

  await listen(server, 0, host);
  origin = serverOrigin(server);
  const artifactUrl = `${origin}/${channel}/versions/${version}/${artifactName}`;
  return {
    close: () => closeServer(server),
    info: {
      artifactBytes: artifact.byteLength,
      artifactUrl,
      checksumUrl: `${artifactUrl}.sha256`,
      metadataUrl: `${origin}/${channel}/latest/metadata.json`,
      publishedSha256,
      realSha256,
      sha256: publishedSha256,
      version,
    },
    requests,
  };
}

function createDeterministicArtifact(bytes: number): Buffer {
  if (!Number.isInteger(bytes) || bytes <= 0) throw new Error(`artifact bytes must be positive, got ${bytes}`);
  const artifact = Buffer.allocUnsafe(bytes);
  for (let index = 0; index < artifact.length; index += 1) {
    artifact[index] = (index * 31 + (index >>> 3)) & 0xff;
  }
  return artifact;
}

function fixtureChannelMetadata(channel: PackagedUpdateScenario['channel'], version: string): Record<string, unknown> {
  if (channel === 'stable') {
    return {
      baseVersion: version,
      releaseVersion: version,
      stableVersion: version,
    };
  }
  const counted = prereleaseCounterParts(version);
  if (counted == null) throw new Error(`fixture version is not a counted prerelease: ${version}`);
  if (channel === 'beta') {
    return {
      baseVersion: counted.baseVersion,
      betaNumber: counted.number,
      betaVersion: version,
    };
  }
  if (channel === 'nightly') {
    return {
      baseVersion: counted.baseVersion,
      nightlyNumber: counted.number,
      nightlyVersion: version,
      releaseVersion: version,
      stableVersion: counted.baseVersion,
    };
  }
  return {
    baseVersion: counted.baseVersion,
    previewNumber: counted.number,
    previewVersion: version,
    releaseVersion: version,
  };
}

function prereleaseCounterParts(version: string): { baseVersion: string; number: number } | null {
  const hyphen = /^(\d+\.\d+\.\d+)-.+\.(\d+)$/.exec(version);
  if (hyphen?.[1] != null && hyphen[2] != null) return { baseVersion: hyphen[1], number: Number(hyphen[2]) };
  const dotted = /^(\d+\.\d+\.\d+)\.[^.]+\.(\d+)$/.exec(version);
  if (dotted?.[1] != null && dotted[2] != null) return { baseVersion: dotted[1], number: Number(dotted[2]) };
  return null;
}

function sendViolentArtifact(
  request: IncomingMessage,
  response: ServerResponse,
  artifact: Buffer,
  chunkDelayMs: number,
  path: string,
  requests: ViolentUpdaterRequest[],
): void {
  const rangeHeader = request.headers.range;
  const range = parseByteRange(rangeHeader, artifact.byteLength);
  response.setHeader('accept-ranges', 'bytes');
  response.setHeader('content-type', 'application/vnd.microsoft.portable-executable');
  if (range === 'invalid' || range === 'unsatisfiable') {
    response.statusCode = 416;
    response.setHeader('content-range', `bytes */${artifact.byteLength}`);
    response.end();
    requests.push({ method: request.method ?? 'GET', path, range: rangeHeader ?? null, status: 416 });
    return;
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? artifact.byteLength - 1;
  const total = end - start + 1;
  if (range != null) {
    response.statusCode = 206;
    response.setHeader('content-range', `bytes ${start}-${end}/${artifact.byteLength}`);
  }
  response.setHeader('content-length', String(total));

  const entry: ViolentUpdaterRequest = {
    end,
    method: request.method ?? 'GET',
    path,
    range: rangeHeader ?? null,
    sent: 0,
    start,
    status: response.statusCode,
    total,
  };
  let done = false;
  response.on('close', () => {
    if (!done) requests.push({ ...entry, aborted: true });
  });
  if (request.method === 'HEAD') {
    done = true;
    requests.push({ ...entry, aborted: false, sent: 0 });
    response.end();
    return;
  }

  let cursor = start;
  const pump = () => {
    if (cursor > end) {
      done = true;
      requests.push({ ...entry, aborted: false });
      response.end();
      return;
    }
    const next = Math.min(cursor + 64 * 1024, end + 1);
    const chunk = artifact.subarray(cursor, next);
    cursor = next;
    entry.sent = (entry.sent ?? 0) + chunk.byteLength;
    if (!response.write(chunk)) {
      response.once('drain', () => setTimeout(pump, chunkDelayMs));
      return;
    }
    setTimeout(pump, chunkDelayMs);
  };
  pump();
}

type ParsedRange = { end: number; start: number } | 'invalid' | 'unsatisfiable' | null;

function parseByteRange(value: string | undefined, size: number): ParsedRange {
  if (value == null) return null;
  if (!value.startsWith('bytes=')) return 'invalid';
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  const rawStart = match?.[1];
  const rawEnd = match?.[2];
  if (rawStart == null || rawEnd == null || (rawStart.length === 0 && rawEnd.length === 0)) return 'invalid';
  if (rawStart.length === 0) {
    const suffix = Number(rawEnd);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return 'invalid';
    return { start: Math.max(size - suffix, 0), end: size - 1 };
  }
  const start = Number(rawStart);
  const end = rawEnd.length === 0 ? size - 1 : Number(rawEnd);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) return 'invalid';
  if (start >= size) return 'unsatisfiable';
  return { start, end: Math.min(end, size - 1) };
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, host, () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => (error == null ? resolveClose() : rejectClose(error)));
  });
}

function serverOrigin(server: Server): string {
  const address = server.address();
  if (address == null || typeof address === 'string') throw new Error('updater fixture did not listen on TCP');
  return `http://127.0.0.1:${address.port}`;
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

function assertUpdaterStartEvalValue(value: unknown): UpdaterStartEvalValue {
  const normalized = asUpdaterStartEvalValue(value);
  if (normalized == null) {
    throw new Error(`unexpected updater start eval value: ${formatUnknown(value)}`);
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

function asUpdaterStartEvalValue(value: unknown): UpdaterStartEvalValue | null {
  if (!isRecord(value)) return null;
  if (typeof value.started !== 'boolean') return null;
  if (value.reason != null && typeof value.reason !== 'string') return null;
  return value as UpdaterStartEvalValue;
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

async function seedPackagedOnboardingComplete(installDir: string): Promise<void> {
  const configPath = join(await resolveExpectedDataRoot(installDir), 'app-config.json');
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify({ onboardingCompleted: true }, null, 2)}\n`, 'utf8');
}

async function resolveExpectedUpdateRoot(installDir: string): Promise<string> {
  return join(await resolveExpectedNamespaceRoot(installDir), 'updates');
}

async function resolveExpectedDataRoot(installDir: string): Promise<string> {
  return join(await resolveExpectedNamespaceRoot(installDir), 'data');
}

async function resolveExpectedNamespaceRoot(installDir: string): Promise<string> {
  const installedConfig = JSON.parse(
    await readFile(join(installDir, 'resources', 'open-design-config.json'), 'utf8'),
  ) as InstalledPackagedConfig;
  const configuredNamespaceBaseRoot =
    typeof installedConfig.namespaceBaseRoot === 'string' && installedConfig.namespaceBaseRoot.length > 0
      ? installedConfig.namespaceBaseRoot
      : null;
  const namespaceBaseRoot =
    configuredNamespaceBaseRoot ?? join(defaultWindowsAppDataRoot(await readInstalledAppName(installDir)), 'namespaces');
  return join(resolve(namespaceBaseRoot), namespace);
}

async function readInstalledAppName(installDir: string): Promise<string> {
  const appPackage = JSON.parse(
    await readFile(join(installDir, 'resources', 'app', 'package.json'), 'utf8'),
  ) as InstalledAppPackage;
  if (typeof appPackage.productName === 'string' && appPackage.productName.length > 0) return appPackage.productName;
  if (typeof appPackage.name === 'string' && appPackage.name.length > 0) return appPackage.name;
  return 'Open Design';
}

function defaultWindowsAppDataRoot(appName: string): string {
  return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), appName);
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
