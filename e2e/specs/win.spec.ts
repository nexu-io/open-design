// @vitest-environment node

import { execFile } from 'node:child_process';
<<<<<<< HEAD
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
=======
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
>>>>>>> upstream/main
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

const execFileAsync = promisify(execFile);
const e2eRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = dirname(e2eRoot);
const toolsPackDir = resolveFromWorkspace(process.env.OD_PACKAGED_E2E_TOOLS_PACK_DIR ?? '.tmp/tools-pack');
const namespace = process.env.OD_PACKAGED_E2E_NAMESPACE ?? 'release-beta-win';
const toolsPackBin = join(workspaceRoot, 'tools', 'pack', 'bin', 'tools-pack.mjs');
const maxInstallDurationMs = Number.parseInt(process.env.OD_PACKAGED_E2E_WIN_MAX_INSTALL_MS ?? '120000', 10);
const smokeProfile = process.env.OD_PACKAGED_E2E_WIN_SMOKE_PROFILE ?? 'core';
const verifyCoreOnly = smokeProfile === 'core';
const verifyReinstallWhileRunning = !verifyCoreOnly && process.env.OD_PACKAGED_E2E_WIN_VERIFY_REINSTALL !== '0';
const updateMetadataUrl = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_WIN_UPDATE_METADATA_URL);
const updateVersion = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_WIN_UPDATE_VERSION);
const updateBuildJsonPath = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_WIN_UPDATE_BUILD_JSON_PATH);
<<<<<<< HEAD
=======
const intermediateUpdateBuildJsonPath = normalizeOptionalEnv(
  process.env.OD_PACKAGED_E2E_WIN_INTERMEDIATE_UPDATE_BUILD_JSON_PATH,
);
const updateFixture = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_WIN_UPDATE_FIXTURE);
const updateFixturePort = resolveOptionalFixturePort(process.env.OD_PACKAGED_E2E_WIN_UPDATE_FIXTURE_PORT);
const updateFixtureMode = resolveUpdateFixtureMode(process.env.OD_PACKAGED_E2E_WIN_UPDATE_MODE);
>>>>>>> upstream/main
const releaseChannel = process.env.OD_PACKAGED_E2E_RELEASE_CHANNEL;
const releaseVersion = process.env.OD_PACKAGED_E2E_RELEASE_VERSION;
const updateScenario = resolvePackagedUpdateScenario({ releaseChannel, releaseVersion });
const installIdentity = resolvePackagedWinInstallIdentity({ namespace, releaseVersion });
const toolsPackReleaseVersionArgs = releaseAppVersionArgs(releaseVersion);

const outputNamespaceRoot = join(toolsPackDir, 'out', 'win', 'namespaces', namespace);
const runtimeNamespaceRoot = join(toolsPackDir, 'runtime', 'win', 'namespaces', namespace);
const launcherNamespaceRoot = join(
  toolsPackDir,
  'runtime',
  'win',
  'launcher',
  'channels',
  updateScenario.channel,
  'namespaces',
  namespace,
);
const screenshotPath = join(toolsPackDir, 'screenshots', `${namespace}.png`);
const preUpdateScreenshotPath = join(toolsPackDir, 'screenshots', `${namespace}-before-update.png`);
const healthExpression = "fetch('/api/health').then(async response => ({ health: await response.json(), href: location.href, status: response.status, title: document.title }))";
const updaterPopupExpression = `
  (() => {
    const popup = document.querySelector('[data-testid="updater-popup"]');
    const button = document.querySelector('[data-testid="updater-install-button"]');
    const reinstallLink = document.querySelector('[data-testid="updater-reinstall-learn-more"]');
    return {
      installButtonVisible: button instanceof HTMLButtonElement && !button.disabled,
      reinstallLinkVisible: reinstallLink instanceof HTMLElement,
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
    reinstall?: {
      installedVersion?: string;
      minVersion?: string;
      reason: string;
      url?: string;
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
  reinstallLinkVisible: boolean;
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

type InstalledPackagedConfig = {
  namespaceBaseRoot?: unknown;
};

type InstalledRuntimeConfig = {
  active?: {
    entry?: {
      cwd?: unknown;
    };
    root?: unknown;
  };
};

type InstalledAppPackage = {
  name?: unknown;
  productName?: unknown;
  version?: unknown;
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
<<<<<<< HEAD
    let payloadUpdate: PayloadUpdateSummary | { skipped: true } = { skipped: true };
=======
    let intermediatePayloadUpdate: PayloadUpdateSummary | { skipped: true } = { skipped: true };
    let payloadUpdate: InstallerFallbackSummary | PayloadUpdateSummary | { skipped: true } = { skipped: true };
    let updaterRecovery: UpdaterRecoverySummary | { skipped: true } = { skipped: true };
>>>>>>> upstream/main
    let reinstall: DirectInstallerResult | { skipped: true } = { skipped: true };
    let logs: LogsResult | { skipped: true } = { skipped: true };
    let stop: WinStopResult | { skipped: true } = { skipped: true };
    let postUpdateHealth: HealthEvalValue | { skipped: true } = { skipped: true };
<<<<<<< HEAD
    let payloadFixture: PackagedPayloadUpdateFixture | null = null;
=======
    let upgradePersistence: UpgradePersistenceSeed | { skipped: true } = { skipped: true };
    let payloadFixture: ToolsServeUpdaterFixture | null = null;
    let intermediateUpdateFixture: Awaited<ReturnType<typeof resolveLocalUpdateFixture>> | null = null;
    let localUpdateFixture: Awaited<ReturnType<typeof resolveLocalUpdateFixture>> | null = null;
>>>>>>> upstream/main
    const updateEnv = captureUpdateEnv();
    try {
      await measureSmokeStep(timings, 'pre-clean uninstall', async () => {
        await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch(() => null);
        await resetPackagedUpdaterNamespaceRoots();
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

      await seedPackagedOnboardingComplete(install.installDir);

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
<<<<<<< HEAD
          const localPayload = await resolveLocalPayloadUpdateFixture();
          expectedPayloadUpdateVersion = localPayload.targetVersion;
          payloadFixture = await startPackagedPayloadUpdateFixture({
            channel: updateScenario.channel,
            payloadPath: localPayload.payloadPath,
            platform: 'win',
            version: localPayload.targetVersion,
=======
          assertToolsServeFixtureEnabled('Windows', updateFixture);
          localUpdateFixture = await resolveLocalUpdateFixture();
          if (intermediateUpdateBuildJsonPath != null) {
            if (updateFixtureMode !== 'payload') {
              throw new Error('Windows intermediate updater recovery requires payload fixture mode');
            }
            intermediateUpdateFixture = await resolveLocalUpdateFixture(intermediateUpdateBuildJsonPath);
          }
          const initialUpdateFixture = intermediateUpdateFixture ?? localUpdateFixture;
          expectedPayloadUpdateVersion = initialUpdateFixture.targetVersion;
          payloadFixture = await startToolsServeUpdaterFixture({
            artifactPath: initialUpdateFixture.installerPath,
            channel: updateScenario.channel,
            ...(updateFixtureMode === 'payload' ? { payloadPath: initialUpdateFixture.payloadPath } : {}),
            platform: 'win',
            ...(updateFixturePort == null ? {} : { port: updateFixturePort }),
            version: initialUpdateFixture.targetVersion,
            workspaceRoot,
>>>>>>> upstream/main
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
<<<<<<< HEAD
        payloadUpdate = await measureSmokeStep(timings, 'payload update acceptance', async () =>
          runPayloadUpdateAcceptance({
            expectedVersion: expectedPayloadUpdateVersion,
          }),
=======
        const persistedProjectId = 'skipped' in upgradePersistence ? null : upgradePersistence.projectId;
        payloadUpdate = await measureSmokeStep(timings, `${updateFixtureMode} update acceptance`, async () =>
          updateFixtureMode === 'installer'
            ? runInstallerFallbackAcceptance({
                expectedVersion: expectedPayloadUpdateVersion,
                fixture: payloadFixture,
                installDir: install.installDir,
                persistedProjectId,
              })
            : runPayloadUpdateAcceptance({
                expectedVersion: expectedPayloadUpdateVersion,
                ...(intermediateUpdateFixture == null
                  ? {}
                  : { legacyInstalledExecutablePath: join(install.installDir, 'Open Design.exe') }),
                persistedProjectId,
                verifyPptx: intermediateUpdateFixture == null,
              }),
>>>>>>> upstream/main
        );
        postUpdateHealth = payloadUpdate.health;

        if (intermediateUpdateFixture != null && localUpdateFixture != null && payloadFixture != null) {
          if ('skipped' in payloadUpdate || !('launcherAfterConfirm' in payloadUpdate)) {
            throw new Error('Windows intermediate update did not complete through the payload path');
          }
          const intermediateIdentityPid = payloadUpdate.identity.pid;
          intermediatePayloadUpdate = payloadUpdate;
          await payloadFixture.close();
          payloadFixture = await startToolsServeUpdaterFixture({
            artifactPath: localUpdateFixture.installerPath,
            channel: updateScenario.channel,
            payloadPath: localUpdateFixture.payloadPath,
            platform: 'win',
            ...(updateFixturePort == null ? {} : { port: updateFixturePort }),
            version: localUpdateFixture.targetVersion,
            workspaceRoot,
          });
          applyPackagedUpdateEnv(process.env, updateScenario, payloadFixture.info.metadataUrl, { openDryRun: false });
          const intermediateVersion = intermediateUpdateFixture.targetVersion;
          const targetVersion = localUpdateFixture.targetVersion;
          process.env.OD_UPDATE_CURRENT_VERSION = intermediateVersion;
          const fixtureSwitchStop = await measureSmokeStep(timings, 'stop before target update fixture', async () =>
            runToolsPackJson<WinStopResult>('stop'),
          );
          started = false;
          expect(fixtureSwitchStop.status).not.toBe('partial');
          expect(fixtureSwitchStop.remainingPids).toEqual([]);
          start = await startDesktop('restart with target update fixture');
          expect(start.source).toBe('installed');
          await measureSmokeStep(timings, 'wait healthy after target fixture restart', async () =>
            waitForHealthyDesktopVersion(intermediateVersion, intermediateIdentityPid),
          );
          expectedPayloadUpdateVersion = targetVersion;
          payloadUpdate = await measureSmokeStep(timings, 'target payload update acceptance', async () =>
            runPayloadUpdateAcceptance({
              expectedCurrentVersion: intermediateVersion,
              expectedVersion: targetVersion,
              persistedProjectId,
            }),
          );
          postUpdateHealth = payloadUpdate.health;
        }

        // A local full payload fixture has both artifacts, so reuse the exact
        // target version with an installed-outer floor. The running payload is
        // already at targetVersion while the physical outer is still the base
        // install: only an outer-version-aware updater can offer this
        // same-version installer reinstall.
        if (
          updateFixtureMode === 'payload' &&
          localUpdateFixture != null &&
          payloadFixture != null &&
          expectedPayloadUpdateVersion != null
        ) {
          await payloadFixture.close();
          payloadFixture = await startToolsServeUpdaterFixture({
            artifactPath: localUpdateFixture.installerPath,
            channel: updateScenario.channel,
            controlLauncherVersionMin: expectedPayloadUpdateVersion,
            controlLauncherVersionUrl: 'https://example.test/updater-recovery',
            payloadPath: localUpdateFixture.payloadPath,
            platform: 'win',
            ...(updateFixturePort == null ? {} : { port: updateFixturePort }),
            version: expectedPayloadUpdateVersion,
            workspaceRoot,
          });
          applyPackagedUpdateEnv(process.env, updateScenario, payloadFixture.info.metadataUrl, { openDryRun: false });
          process.env.OD_UPDATE_CURRENT_VERSION = expectedPayloadUpdateVersion;
          const recoveryFixture = payloadFixture;
          const recoveryTargetVersion = expectedPayloadUpdateVersion;
          updaterRecovery = await measureSmokeStep(timings, 'same-version reinstall and clear-cache recovery', async () =>
            runSameVersionUpdaterRecoveryAcceptance({
              expectedInstalledVersion: updateScenario.expectedCurrentVersion,
              fixture: recoveryFixture,
              installDir: install.installDir,
              persistedProjectId,
              targetVersion: recoveryTargetVersion,
            }),
          );
          postUpdateHealth = updaterRecovery.installer.health;
        }
      }

      if (verifyReinstallWhileRunning && verifyCoreOnly) {
        reinstall = await measureSmokeStep(timings, 'direct reinstall while running', async () =>
          runDirectInstaller(install.installerPath, install.installDir),
        );
        started = false;
        expect(reinstall.code).toBe(0);
        assertTransactionalInPlaceInstallLog(reinstall.nsisLogTail);

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
        intermediatePayloadUpdate,
        logs: 'skipped' in logs ? logs : summarizeLogs(logs),
        namespace,
        payloadUpdate,
        updaterRecovery,
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

  // Silent startup update acceptance (mirror of the mac lane): with the
  // daemon-owned allowSilentUpdates preference on, a payload downloaded in a
  // previous session must apply on the next cold start's first scheduler tick
  // without any user-facing updater action.
  const silentUpdateTest =
    !verifyCoreOnly && updateFixture === 'tools-serve' && updateFixtureMode === 'payload' ? test : test.skip;
  silentUpdateTest('applies a downloaded payload silently on the next cold start', async () => {
    const updateEnv = captureUpdateEnv();
    let payloadFixtureLocal: ToolsServeUpdaterFixture | null = null;
    let cleanupStarted = false;
    let cleanupInstalled = false;
    try {
      const localUpdate = await resolveLocalUpdateFixture();
      const targetVersion = localUpdate.targetVersion;

      await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch(() => null);
      await resetPackagedUpdaterNamespaceRoots();
      await runToolsPackJson<WinInstallResult>('install');
      cleanupInstalled = true;
      await seedPackagedOnboardingComplete();

      payloadFixtureLocal = await startToolsServeUpdaterFixture({
        artifactPath: localUpdate.installerPath,
        channel: updateScenario.channel,
        payloadPath: localUpdate.payloadPath,
        platform: 'win',
        version: targetVersion,
        workspaceRoot,
      });
      applyPackagedUpdateEnv(process.env, updateScenario, payloadFixtureLocal.info.metadataUrl, { openDryRun: false });

      const start = await runToolsPackJson<WinStartResult>('start');
      cleanupStarted = true;
      expect(start.source).toBe('installed');
      await waitForDownloadedUpdater(targetVersion, 'payload');

      // Enable the daemon-owned preference through the production HTTP path
      // (the same GET + merged PUT the web settings surface performs).
      const enableSilent = await runToolsPackJson<WinInspectResult>('inspect', ['--expr', `
        (async () => {
          const current = await (await fetch('/api/app-config')).json();
          const response = await fetch('/api/app-config', {
            headers: { 'content-type': 'application/json' },
            method: 'PUT',
            body: JSON.stringify({ ...(current.config ?? {}), allowSilentUpdates: true }),
          });
          const written = await response.json();
          return { ok: response.ok, allowSilentUpdates: written.config?.allowSilentUpdates };
        })()
      `]);
      expect(enableSilent.eval?.value).toEqual({ allowSilentUpdates: true, ok: true });

      const stop = await runToolsPackJson<WinStopResult>('stop');
      cleanupStarted = false;
      expect(stop.status).not.toBe('partial');

      // Cold start: the first scheduler tick applies the already-downloaded
      // payload silently and relaunches; no updater action is issued here.
      const coldStart = await runToolsPackJson<WinStartResult>('start');
      cleanupStarted = true;
      expect(coldStart.source).toBe('installed');
      const silent = await waitForHealthyDesktopVersion(targetVersion, start.pid);
      expect(settledLauncherGeneration(silent.launcher, targetVersion)).not.toBeNull();
      expect(silent.launcher.active?.version).toBe(targetVersion);
      expect(silent.launcher.lastSuccessful?.version).toBe(targetVersion);
      expect(silent.launcher.attempt).toBeNull();

      const terminal = await waitForTerminalUpdateState(targetVersion);
      expect(terminal.update?.currentVersion).toBe(targetVersion);
    } finally {
      restoreUpdateEnv(updateEnv);
      await payloadFixtureLocal?.close().catch((error: unknown) => {
        console.error('failed to close silent update fixture', error);
      });
      if (cleanupStarted) {
        await runToolsPackJson<WinStopResult>('stop').catch((error: unknown) => {
          console.error('failed to stop packaged windows app during silent-update cleanup', error);
        });
      }
      if (cleanupInstalled) {
        await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch((error: unknown) => {
          console.error('failed to uninstall packaged windows app during silent-update cleanup', error);
        });
      }
    }
  }, 720_000);

  // Crash-rollback acceptance (mirror of the mac lane): a payload that spawns
  // but dies before its own launcher bookkeeping must leave the pre-armed
  // attempt behind; the next cold start rolls back to the last successful
  // version, and a version-bumped healthy release self-heals.
  const rollbackTest =
    !verifyCoreOnly && updateFixture === 'tools-serve' && updateFixtureMode === 'payload' ? test : test.skip;
  rollbackTest('rolls back a crashing payload and self-heals on the next good update', async () => {
    const updateEnv = captureUpdateEnv();
    let corruptFixture: ToolsServeUpdaterFixture | null = null;
    let goodFixture: ToolsServeUpdaterFixture | null = null;
    const corruptWorkDir = join(toolsPackDir, 'corrupt-payload-fixture');
    let cleanupStarted = false;
    let cleanupInstalled = false;
    try {
      const localUpdate = await resolveLocalUpdateFixture();
      const targetVersion = localUpdate.targetVersion;

      await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch(() => null);
      await resetPackagedUpdaterNamespaceRoots();
      const install = await runToolsPackJson<WinInstallResult>('install');
      cleanupInstalled = true;
      await seedPackagedOnboardingComplete();

      const sevenZipExe = join(install.installDir, 'resources', 'open-design', 'bin', '7z.exe');
      expect((await stat(sevenZipExe)).isFile()).toBe(true);
      const corruptPayloadPath = await buildCorruptedWinPayloadFixture(
        localUpdate.payloadPath,
        corruptWorkDir,
        sevenZipExe,
      );

      corruptFixture = await startToolsServeUpdaterFixture({
        artifactPath: localUpdate.installerPath,
        channel: updateScenario.channel,
        payloadPath: corruptPayloadPath,
        platform: 'win',
        version: targetVersion,
        workspaceRoot,
      });
      applyPackagedUpdateEnv(process.env, updateScenario, corruptFixture.info.metadataUrl, { openDryRun: false });

      const start = await runToolsPackJson<WinStartResult>('start');
      cleanupStarted = true;
      expect(start.source).toBe('installed');
      const readyUpdate = await waitForDownloadedUpdater(targetVersion, 'payload');
      const launcherRuntimePath = readyUpdate.launcher.runtimePath;
      const launcherAttemptsPath = readyUpdate.launcher.attemptsPath;

      const popup = await openReadyUpdaterPrompt(targetVersion);
      expect(popup.installButtonVisible).toBe(true);
      const clickInstall = await runToolsPackJson<WinInspectResult>('inspect', ['--expr', clickUpdaterInstallExpression]);
      expect(assertUpdaterClickEvalValue(clickInstall.eval?.value).clicked).toBe(true);

      // The app quits for the relaunch; the corrupted payload stub then exits
      // before any launcher bookkeeping. Wait for the desktop to disappear.
      await waitForDesktopGone('crashing payload never became the desktop');
      cleanupStarted = false;

      // The pre-armed attempt is the rollback evidence the crash left behind.
      const strandedAttempt = JSON.parse(await readFile(launcherAttemptsPath, 'utf8')) as {
        generation?: number;
        version?: string;
      };
      expect(strandedAttempt.version).toBe(targetVersion);
      const strandedRuntime = JSON.parse(await readFile(launcherRuntimePath, 'utf8')) as {
        active?: { generation?: number; version?: string };
        lastSuccessful?: { generation?: number; version?: string };
      };
      expect(strandedRuntime.active?.version).toBe(targetVersion);
      expect(strandedRuntime.lastSuccessful?.version).toBe(updateScenario.expectedCurrentVersion);
      expect(strandedAttempt.generation).toBe(strandedRuntime.active?.generation);

      // Cold start rolls back: the installed outer sees the unconfirmed
      // attempt, selects lastSuccessful, and serves the base version again.
      const rollbackStart = await runToolsPackJson<WinStartResult>('start');
      cleanupStarted = true;
      expect(rollbackStart.source).toBe('installed');
      const rolledBack = await waitForHealthyDesktopVersion(updateScenario.expectedCurrentVersion, start.pid, false);
      expect(rolledBack.launcher.lastSuccessful?.version).toBe(updateScenario.expectedCurrentVersion);
      // Degraded steady state: the broken pointer stays active with its
      // attempt as evidence until a healthy release replaces it.
      expect(rolledBack.launcher.active?.version).toBe(targetVersion);
      expect(rolledBack.launcher.attempt?.version).toBe(targetVersion);

      // Self-heal: real recovery releases ship as version+1 (versioned
      // artifacts are immutable), so the next update arrives under a bumped
      // version with a healthy payload and converges.
      const healedVersion = bumpCountedVersion(targetVersion);
      const healedPayloadPath = await buildVersionBumpedWinPayloadFixture(
        localUpdate.payloadPath,
        corruptWorkDir,
        sevenZipExe,
        healedVersion,
      );
      await corruptFixture.close();
      corruptFixture = null;
      goodFixture = await startToolsServeUpdaterFixture({
        artifactPath: localUpdate.installerPath,
        channel: updateScenario.channel,
        payloadPath: healedPayloadPath,
        platform: 'win',
        version: healedVersion,
        workspaceRoot,
      });
      applyPackagedUpdateEnv(process.env, updateScenario, goodFixture.info.metadataUrl, { openDryRun: false });
      const healStop = await runToolsPackJson<WinStopResult>('stop');
      cleanupStarted = false;
      expect(healStop.status).not.toBe('partial');
      const healStart = await runToolsPackJson<WinStartResult>('start');
      cleanupStarted = true;
      expect(healStart.source).toBe('installed');
      await waitForDownloadedUpdater(healedVersion, 'payload', 120_000, updateScenario.expectedCurrentVersion);
      await openReadyUpdaterPrompt(healedVersion);
      const healClick = await runToolsPackJson<WinInspectResult>('inspect', ['--expr', clickUpdaterInstallExpression]);
      expect(assertUpdaterClickEvalValue(healClick.eval?.value).clicked).toBe(true);
      const healed = await waitForHealthyDesktopVersion(healedVersion, rollbackStart.pid);
      expect(settledLauncherGeneration(healed.launcher, healedVersion)).not.toBeNull();
      expect(healed.launcher.active?.version).toBe(healedVersion);
      expect(healed.launcher.lastSuccessful?.version).toBe(healedVersion);
      expect(healed.launcher.attempt).toBeNull();
    } finally {
      restoreUpdateEnv(updateEnv);
      await corruptFixture?.close().catch((error: unknown) => {
        console.error('failed to close corrupt payload fixture', error);
      });
      await goodFixture?.close().catch((error: unknown) => {
        console.error('failed to close healthy payload fixture', error);
      });
      await rm(corruptWorkDir, { force: true, recursive: true }).catch(() => undefined);
      if (cleanupStarted) {
        await runToolsPackJson<WinStopResult>('stop').catch((error: unknown) => {
          console.error('failed to stop packaged windows app during rollback cleanup', error);
        });
      }
      if (cleanupInstalled) {
        await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch((error: unknown) => {
          console.error('failed to uninstall packaged windows app during rollback cleanup', error);
        });
      }
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
<<<<<<< HEAD
=======
  pptx: PptxExportEvalValue | { skipped: true };
>>>>>>> upstream/main
  terminal: NonNullable<WinInspectResult['update']>;
  targetVersion: string;
};

<<<<<<< HEAD
async function runPayloadUpdateAcceptance(options: {
  expectedVersion: string | null;
}): Promise<PayloadUpdateSummary> {
  const downloadedInspect = await waitForDownloadedUpdater(options.expectedVersion);
=======
type InstallerFallbackSummary = {
  coldStart: {
    health: HealthEvalValue;
    start: WinStartResult;
    stop: WinStopResult;
  };
  downloaded: NonNullable<WinInspectResult['update']>;
  downloadedSha256: string;
  fixtureSha256: string;
  health: HealthEvalValue;
  install: DirectInstallerResult;
  list: WinListResult;
  pptx: PptxExportEvalValue;
  targetVersion: string;
};

type UpdaterRecoverySummary = {
  cleared: NonNullable<WinInspectResult['update']>;
  downloadedBeforeClear: NonNullable<WinInspectResult['update']>;
  installer: InstallerFallbackSummary;
  popup: UpdaterPopupEvalValue;
  terminal: NonNullable<WinInspectResult['update']>;
};

async function runSameVersionUpdaterRecoveryAcceptance(options: {
  expectedInstalledVersion: string;
  fixture: ToolsServeUpdaterFixture;
  installDir: string;
  persistedProjectId: string | null;
  targetVersion: string;
}): Promise<UpdaterRecoverySummary> {
  const stop = await runToolsPackJson<WinStopResult>('stop');
  expect(stop.status).not.toBe('partial');
  expect(stop.remainingPids).toEqual([]);
  const start = await runToolsPackJson<WinStartResult>('start');
  expect(start.source).toBe('installed');
  const running = await waitForHealthyDesktopVersion(options.targetVersion, null);

  const downloadedInspect = await waitForDownloadedUpdater(
    options.targetVersion,
    'installer',
    120_000,
    options.targetVersion,
  );
  if (downloadedInspect.update == null) {
    throw new Error('same-version reinstall did not return updater status');
  }
  expect(downloadedInspect.update.reinstall).toEqual({
    installedVersion: options.expectedInstalledVersion,
    minVersion: options.targetVersion,
    reason: 'outer-below-min',
    url: 'https://example.test/updater-recovery',
  });
  expect(downloadedInspect.status?.pid).toBe(running.status?.pid);

  const popup = await openReadyUpdaterPrompt(options.targetVersion);
  expect(popup.visible).toBe(true);
  expect(popup.installButtonVisible).toBe(true);
  expect(popup.reinstallLinkVisible).toBe(true);

  const clearedInspect = await runToolsPackJson<WinInspectResult>('inspect', ['--update-action', 'clear-cache']);
  if (clearedInspect.update == null) throw new Error('clear-cache did not return updater status');
  expect(clearedInspect.update.state).toBe('idle');
  expect(clearedInspect.update.active).toBeUndefined();
  expect(clearedInspect.update.downloadPath).toBeUndefined();
  expect(clearedInspect.update.reinstall).toBeUndefined();
  expect(clearedInspect.launcher.active).toEqual(downloadedInspect.launcher.active);
  expect(clearedInspect.launcher.lastSuccessful).toEqual(downloadedInspect.launcher.lastSuccessful);

  const installer = await runInstallerFallbackAcceptance({
    expectedCurrentVersion: options.targetVersion,
    expectedVersion: options.targetVersion,
    fixture: options.fixture,
    installDir: options.installDir,
    persistedProjectId: options.persistedProjectId,
  });
  const installedConfig = JSON.parse(
    await readFile(join(options.installDir, 'resources', 'open-design-config.json'), 'utf8'),
  ) as { appVersion?: unknown };
  expect(installedConfig.appVersion).toBe(options.targetVersion);

  const terminalInspect = await waitForTerminalUpdateState(options.targetVersion);
  if (terminalInspect.update == null) throw new Error('reinstalled outer did not return terminal updater status');
  expect(terminalInspect.update.reinstall).toBeUndefined();

  return {
    cleared: clearedInspect.update,
    downloadedBeforeClear: downloadedInspect.update,
    installer,
    popup,
    terminal: terminalInspect.update,
  };
}

async function runPayloadUpdateAcceptance(options: {
  expectedCurrentVersion?: string;
  expectedVersion: string | null;
  legacyInstalledExecutablePath?: string;
  persistedProjectId: string | null;
  verifyPptx?: boolean;
}): Promise<PayloadUpdateSummary> {
  const downloadedInspect = await waitForDownloadedUpdater(
    options.expectedVersion,
    'payload',
    120_000,
    options.expectedCurrentVersion,
  );
>>>>>>> upstream/main
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
<<<<<<< HEAD
  assertLauncherPointer(postUpdateInspect.launcher.active, targetVersion, 1, 'post-relaunch active');
  assertLauncherPointer(postUpdateInspect.launcher.lastSuccessful, targetVersion, 1, 'post-relaunch lastSuccessful');
  const terminal = await waitForTerminalUpdateState(targetVersion);
  if (terminal.update == null) throw new Error('payload update terminal state did not return update status');
=======
  const confirmedGeneration = settledLauncherGeneration(postUpdateInspect.launcher, targetVersion);
  if (confirmedGeneration == null) throw new Error('post-update launcher did not settle on the target version');
  assertLauncherPointer(postUpdateInspect.launcher.active, targetVersion, confirmedGeneration, 'post-relaunch active');
  assertLauncherPointer(
    postUpdateInspect.launcher.lastSuccessful,
    targetVersion,
    confirmedGeneration,
    'post-relaunch lastSuccessful',
  );
  expect(postUpdateInspect.launcher.attempt).toBeNull();
  assertSettledDesktopHandoff(postUpdateInspect.launcher.handoff);
  const identity = await readDesktopIdentityMarker();
  await assertPayloadDesktopIdentity(
    identity,
    postUpdateInspect.launcher,
    targetVersion,
    options.legacyInstalledExecutablePath,
  );

  let pptx: PayloadUpdateSummary['pptx'] = { skipped: true };
  if (options.verifyPptx !== false) {
    const pptxExpression = options.persistedProjectId == null
      ? pptxExportExpression
      : existingProjectPptxExportExpression(options.persistedProjectId);
    const pptxInspect = await runToolsPackJson<WinInspectResult>('inspect', ['--expr', pptxExpression]);
    pptx = assertPptxExportEvalValue(pptxInspect.eval?.value);
    if (options.persistedProjectId != null) expect(pptx.projectId).toBe(options.persistedProjectId);
  }
  const terminal = await waitForTerminalUpdateState(targetVersion);
  if (terminal.update == null) throw new Error('payload update terminal state did not return update status');

  const stop = await runToolsPackJson<WinStopResult>('stop');
  expect(stop.status).not.toBe('partial');
  expect(stop.remainingPids).toEqual([]);
  const start = await runToolsPackJson<WinStartResult>('start');
  expect(start.source).toBe('installed');
  const coldInspect = await waitForHealthyDesktopVersion(targetVersion, identity.pid);
  const coldHealth = assertHealthEvalValue(coldInspect.eval?.value);
  expectWindowsPackagedAppUrl(coldHealth.href);
  expect(coldHealth.status).toBe(200);
  expect(coldHealth.health.ok).toBe(true);
  expect(coldHealth.health.version).toBe(targetVersion);
  const coldGeneration = settledLauncherGeneration(coldInspect.launcher, targetVersion);
  if (coldGeneration == null) throw new Error('cold-start launcher did not settle on the target version');
  expect(coldGeneration).toBeGreaterThanOrEqual(confirmedGeneration);
  assertLauncherPointer(coldInspect.launcher.active, targetVersion, coldGeneration, 'cold-start active');
  assertLauncherPointer(
    coldInspect.launcher.lastSuccessful,
    targetVersion,
    coldGeneration,
    'cold-start lastSuccessful',
  );
  expect(coldInspect.launcher.attempt).toBeNull();
  assertSettledDesktopHandoff(coldInspect.launcher.handoff);
  const coldIdentity = await readDesktopIdentityMarker();
  await assertPayloadDesktopIdentity(
    coldIdentity,
    coldInspect.launcher,
    targetVersion,
    options.legacyInstalledExecutablePath,
  );
  expect(coldIdentity.pid).not.toBe(identity.pid);
>>>>>>> upstream/main
  return {
    downloaded: downloadedInspect.update,
    health,
    launcherAfterConfirm: postUpdateInspect.launcher,
    popup,
    terminal: terminal.update,
    targetVersion,
  };
}

<<<<<<< HEAD
=======
async function runInstallerFallbackAcceptance(options: {
  expectedCurrentVersion?: string;
  expectedVersion: string | null;
  fixture: ToolsServeUpdaterFixture | null;
  installDir: string;
  persistedProjectId: string | null;
}): Promise<InstallerFallbackSummary> {
  if (options.fixture == null) throw new Error('installer fallback requires a tools-serve fixture');
  if (options.fixture.info.artifactPath == null) throw new Error('installer fallback fixture did not expose its artifact path');
  const downloadedInspect = await waitForDownloadedUpdater(
    options.expectedVersion,
    'installer',
    120_000,
    options.expectedCurrentVersion,
  );
  if (downloadedInspect.update == null) throw new Error('installer update download did not return update status');
  const targetVersion = downloadedInspect.update.availableVersion;
  const downloadPath = downloadedInspect.update.downloadPath;
  if (targetVersion == null || targetVersion.length === 0 || downloadPath == null || downloadPath.length === 0) {
    throw new Error(`installer update did not report target version and path: ${formatUnknown(downloadedInspect.update)}`);
  }
  expectPathInside(downloadPath, join(runtimeNamespaceRoot, 'updates'));
  const downloadedSha256 = await sha256File(downloadPath);
  expect(downloadedSha256).toBe(options.fixture.info.artifactSha256);

  const fixtureNamespaceRoot = dirname(dirname(options.fixture.info.artifactPath));
  const install = await runDirectInstaller(
    downloadPath,
    options.installDir,
    join(fixtureNamespaceRoot, 'logs', 'nsis.log'),
  );
  expect(install.code).toBe(0);
  assertTransactionalInPlaceInstallLog(install.nsisLogTail);
  process.env.OD_UPDATE_CURRENT_VERSION = targetVersion;

  const start = await runToolsPackJsonForVersion<WinStartResult>('start', targetVersion);
  expect(start.source).toBe('installed');
  expect(start.executablePath).toBe(join(options.installDir, 'Open Design.exe'));
  // The updater-owned installer may preserve the already-confirmed payload
  // desktop while replacing the physical outer. Verify continuity here; the
  // explicit full stop + installed-outer cold start below owns the stronger
  // process-generation assertion.
  const postInstallInspect = await waitForHealthyDesktopVersion(targetVersion, null, false);
  const health = assertHealthEvalValue(postInstallInspect.eval?.value);
  expect(health.status).toBe(200);
  expect(health.health.ok).toBe(true);
  expect(health.health.version).toBe(targetVersion);

  const list = await runToolsPackJsonForVersion<WinListResult>('list', targetVersion);
  expect(list.current.installedExeExists).toBe(true);
  expect(list.current.installedExePath).toBe(start.executablePath);
  expect(list.current.installDir).toBe(options.installDir);
  expect(list.current.registryEntries).toHaveLength(1);
  expect(list.current.registryResidues).toHaveLength(1);
  expect(list.current.registryEntries[0]?.displayName).toBe(installIdentity.displayName);
  expect(list.current.registryEntries[0]?.displayVersion).toBe(targetVersion);
  expect(list.current.registryEntries[0]?.installLocation).toBe(options.installDir);

  const pptxExpression = options.persistedProjectId == null
    ? pptxExportExpression
    : existingProjectPptxExportExpression(options.persistedProjectId);
  const pptxInspect = await runToolsPackJsonForVersion<WinInspectResult>('inspect', targetVersion, ['--expr', pptxExpression]);
  const pptx = assertPptxExportEvalValue(pptxInspect.eval?.value);
  if (options.persistedProjectId != null) expect(pptx.projectId).toBe(options.persistedProjectId);

  const stop = await runToolsPackJsonForVersion<WinStopResult>('stop', targetVersion);
  expect(stop.status).not.toBe('partial');
  expect(stop.remainingPids).toEqual([]);
  const coldStart = await runToolsPackJsonForVersion<WinStartResult>('start', targetVersion);
  const coldInspect = await waitForHealthyDesktopVersion(targetVersion, postInstallInspect.status?.pid, false);
  const coldHealth = assertHealthEvalValue(coldInspect.eval?.value);
  expect(coldHealth.status).toBe(200);
  expect(coldHealth.health.ok).toBe(true);
  expect(coldHealth.health.version).toBe(targetVersion);
  return {
    coldStart: { health: coldHealth, start: coldStart, stop },
    downloaded: downloadedInspect.update,
    downloadedSha256,
    fixtureSha256: options.fixture.info.artifactSha256,
    health,
    install,
    list,
    pptx,
    targetVersion,
  };
}

>>>>>>> upstream/main
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

function assertTransactionalInPlaceInstallLog(lines: string[]): void {
  const log = lines.join('\n');
  expect(log).toContain('existing installation found; silent install will overwrite it');
  // The installer closes running instances via pwsh.exe, falling back to
  // powershell.exe (#2799), before quarantining the old tree and atomically
  // committing the replacement. These lifecycle events are the stable
  // transaction contract; the older "running instances detected" prose is no
  // longer emitted by the current NSIS implementation.
  expect(log).toMatch(/running instances close via (?:pwsh|powershell)\.exe exit=0/);
  expect(log).toMatch(/event=install_dir_after_quarantine .* exists=1/);
  expect(log).toMatch(/event=install_dir_after_commit .* exists=1/);
  expect(log).toContain('install transaction cleanup exit=0');
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

<<<<<<< HEAD
async function resolveLocalPayloadUpdateFixture(): Promise<{ payloadPath: string; targetVersion: string }> {
  const fallbackBuildJsonPath = resolveFallbackUpdateBuildJsonPath();
=======
async function resolveLocalUpdateFixture(
  explicitBuildJsonPath?: string,
): Promise<{ installerPath: string; payloadPath: string; targetVersion: string }> {
  const fallbackBuildJsonPath = explicitBuildJsonPath == null
    ? resolveFallbackUpdateBuildJsonPath()
    : resolveFromWorkspace(explicitBuildJsonPath);
>>>>>>> upstream/main
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
    (explicitBuildJsonPath == null ? updateVersion : null) ??
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

<<<<<<< HEAD
async function waitForDownloadedUpdater(expectedVersion: string | null, timeoutMs = 120_000): Promise<WinInspectResult> {
=======
async function waitForDownloadedUpdater(
  expectedVersion: string | null,
  expectedArtifactType: UpdateFixtureMode,
  timeoutMs = 120_000,
  expectedCurrentVersion = updateScenario.expectedCurrentVersion,
): Promise<WinInspectResult> {
>>>>>>> upstream/main
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
        expect(inspect.update.currentVersion).toBe(expectedCurrentVersion);
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

<<<<<<< HEAD
=======
async function waitForPackagedOnboarding(
  predicate: (value: PackagedOnboardingEvalValue) => boolean,
  label: string,
  timeoutMs = 90_000,
): Promise<PackagedOnboardingEvalValue> {
  const startedAt = Date.now();
  let lastResult: unknown = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const inspect = await runToolsPackJson<WinInspectResult>('inspect', ['--expr', packagedOnboardingExpression]);
      lastResult = inspect;
      if (inspect.status?.state === 'running' && inspect.eval?.ok === true) {
        const value = asPackagedOnboardingEvalValue(inspect.eval.value);
        if (value != null && predicate(value)) return value;
      }
    } catch (error) {
      lastResult = error;
    }
    await delay(1000);
  }

  throw new Error(`${label}: packaged Windows onboarding timed out: ${formatUnknown(lastResult)}`);
}

async function clickPackagedOnboardingRuntime(runtime: OnboardingRuntime): Promise<void> {
  const inspect = await runToolsPackJson<WinInspectResult>('inspect', ['--expr', clickPackagedOnboardingRuntimeExpression(runtime)]);
  const value = inspect.eval?.value;
  if (!isRecord(value) || value.clicked !== true) {
    throw new Error(`failed to click packaged Windows onboarding ${runtime} runtime: ${formatUnknown(value)}`);
  }
}

async function clickPackagedOnboardingBack(): Promise<void> {
  const inspect = await runToolsPackJson<WinInspectResult>('inspect', ['--expr', clickPackagedOnboardingBackExpression()]);
  const value = inspect.eval?.value;
  if (!isRecord(value) || value.clicked !== true) {
    throw new Error(`failed to click packaged Windows onboarding back: ${formatUnknown(value)}`);
  }
}

async function repackWinPayloadFixture(
  payloadSevenZPath: string,
  workDir: string,
  outputName: string,
  sevenZipExe: string,
  mutate: (extractRoot: string, manifest: { entry?: { executable?: string }; version?: string }) => Promise<void>,
): Promise<string> {
  const extractRoot = join(workDir, `${outputName}-extract`);
  await rm(extractRoot, { force: true, recursive: true });
  await mkdir(extractRoot, { recursive: true });
  await execFileAsync(sevenZipExe, ['x', '-y', `-o${extractRoot}`, payloadSevenZPath]);
  const manifestPath = join(extractRoot, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    entry?: { executable?: string };
    version?: string;
  };
  await mutate(extractRoot, manifest);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const archivePath = join(workDir, `${outputName}.7z`);
  await rm(archivePath, { force: true });
  await execFileAsync(sevenZipExe, ['a', '-t7z', '-m0=LZMA2', '-mx=1', '-mf=off', archivePath, '.'], {
    cwd: extractRoot,
    maxBuffer: 64 * 1024 * 1024,
  });
  return archivePath;
}

/**
 * Build a checksum-valid payload archive whose desktop executable spawns and
 * exits before any launcher bookkeeping — the faithful shape of a broken
 * release that passes every integrity gate and then dies pre-main. A plain
 * script cannot stand in for the exe on Windows (CreateProcess would fail the
 * spawn outright, which is the other, already-covered failure path), so the
 * stub is a real executable that ignores its argv and exits immediately.
 */
async function buildCorruptedWinPayloadFixture(
  payloadSevenZPath: string,
  workDir: string,
  sevenZipExe: string,
): Promise<string> {
  return await repackWinPayloadFixture(payloadSevenZPath, workDir, 'corrupt-payload', sevenZipExe, async (extractRoot, manifest) => {
    const executableRelPath = manifest.entry?.executable;
    if (executableRelPath == null || executableRelPath.length === 0) {
      throw new Error(`payload manifest has no entry.executable: ${payloadSevenZPath}`);
    }
    const stubSource = join(process.env.SystemRoot ?? process.env.SYSTEMROOT ?? 'C:\\Windows', 'System32', 'where.exe');
    await copyFile(stubSource, join(extractRoot, executableRelPath));
  });
}

/**
 * Re-version a healthy payload archive to the next counted release. Real
 * recovery releases ship as version+1 (versioned artifacts are immutable), so
 * the self-heal update must arrive under a bumped version rather than
 * overwriting the broken pointer's version root. The desktop binary is
 * unchanged — the running version is config/manifest-driven.
 */
async function buildVersionBumpedWinPayloadFixture(
  payloadSevenZPath: string,
  workDir: string,
  sevenZipExe: string,
  bumpedVersion: string,
): Promise<string> {
  return await repackWinPayloadFixture(payloadSevenZPath, workDir, 'healed-payload', sevenZipExe, async (extractRoot, manifest) => {
    manifest.version = bumpedVersion;
    const executableRelPath = manifest.entry?.executable;
    if (executableRelPath == null || executableRelPath.length === 0) {
      throw new Error(`payload manifest has no entry.executable: ${payloadSevenZPath}`);
    }
    // <payload dir>/<binary>.exe → <payload dir>/resources/open-design-config.json
    const configPath = join(extractRoot, dirname(executableRelPath), 'resources', 'open-design-config.json');
    const config = JSON.parse(await readFile(configPath, 'utf8')) as { appVersion?: string };
    config.appVersion = bumpedVersion;
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  });
}

function bumpCountedVersion(version: string): string {
  const match = /^(.*[.-](?:beta|betas|prerelease|preview))\.(\d+)$/.exec(version);
  if (match?.[1] == null || match[2] == null) {
    throw new Error(`rollback acceptance requires a counted version to bump: ${version}`);
  }
  return `${match[1]}.${Number(match[2]) + 1}`;
}

async function waitForDesktopGone(label: string, timeoutMs = 120_000): Promise<void> {
  const startedAt = Date.now();
  let lastResult: unknown = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const inspect = await runToolsPackJson<WinInspectResult>('inspect');
      lastResult = inspect;
      if (inspect.status == null || inspect.status.state !== 'running') return;
    } catch {
      // A dead desktop IPC socket is exactly the expected terminal state.
      return;
    }
    await delay(1000);
  }
  throw new Error(`${label}: desktop still running: ${formatUnknown(lastResult)}`);
}

>>>>>>> upstream/main
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
  const runtimePath = join(launcherNamespaceRoot, 'runtime.json');
  const content = await readFile(runtimePath, 'utf8').catch(() => null);
  console.error(`[launcher-runtime] ${runtimePath}`);
  console.error(content?.trim() ?? '(missing)');
}

<<<<<<< HEAD
=======
async function readDesktopIdentityMarker(): Promise<DesktopIdentityMarker> {
  const markerPath = join(runtimeNamespaceRoot, 'runtime', 'desktop-root.json');
  const value = JSON.parse(await readFile(markerPath, 'utf8')) as unknown;
  if (
    !isRecord(value) ||
    typeof value.appPath !== 'string' ||
    typeof value.executablePath !== 'string' ||
    typeof value.pid !== 'number' ||
    value.version !== 1
  ) {
    throw new Error(`invalid packaged desktop identity at ${markerPath}: ${formatUnknown(value)}`);
  }
  return value as DesktopIdentityMarker;
}

async function assertPayloadDesktopIdentity(
  identity: DesktopIdentityMarker,
  launcher: LauncherSnapshot,
  version: string,
  legacyInstalledExecutablePath?: string,
): Promise<void> {
  const payloadRoot = join(launcher.versionsRoot, version, 'payload');
  expect(identity.pid).toBeGreaterThan(0);
  if (isPathInside(identity.executablePath, payloadRoot)) return;

  if (legacyInstalledExecutablePath == null) {
    expectPathInside(identity.executablePath, payloadRoot);
    return;
  }

  expect(normalizePathForComparison(resolve(identity.executablePath))).toBe(
    normalizePathForComparison(resolve(legacyInstalledExecutablePath)),
  );
  const resourceRoot = await readDesktopStartupResourceRoot(identity.pid);
  expectPathInside(resourceRoot, join(payloadRoot, 'resources', 'open-design'));
}

async function readDesktopStartupResourceRoot(pid: number): Promise<string> {
  const logPath = join(runtimeNamespaceRoot, 'logs', 'desktop', 'latest.log');
  const lines = (await readFile(logPath, 'utf8')).split(/\r?\n/u).reverse();
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const entry = JSON.parse(line) as unknown;
    if (!isRecord(entry) || entry.message !== 'packaged desktop starting' || !isRecord(entry.meta)) continue;
    if (entry.meta.pid === pid && typeof entry.meta.resourceRoot === 'string') return entry.meta.resourceRoot;
  }
  throw new Error(`packaged desktop startup resource root not found for pid ${pid} in ${logPath}`);
}

function assertPptxExportEvalValue(value: unknown): PptxExportEvalValue {
  if (
    !isRecord(value) ||
    typeof value.byteLength !== 'number' ||
    (value.contentType != null && typeof value.contentType !== 'string') ||
    typeof value.magic !== 'string' ||
    typeof value.projectId !== 'string' ||
    typeof value.status !== 'number'
  ) {
    throw new Error(`unexpected PPTX export eval value: ${formatUnknown(value)}`);
  }
  expect(value.status).toBe(200);
  expect(value.contentType).toContain(
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  );
  expect(value.byteLength).toBeGreaterThan(0);
  expect(value.magic).toBe('PK');
  return value as PptxExportEvalValue;
}

function assertUpgradePersistenceSeed(value: unknown): UpgradePersistenceSeed {
  if (
    !isRecord(value) ||
    typeof value.createdOk !== 'boolean' ||
    typeof value.createdStatus !== 'number' ||
    typeof value.projectId !== 'string' ||
    typeof value.writtenOk !== 'boolean' ||
    (value.writtenStatus != null && typeof value.writtenStatus !== 'number')
  ) {
    throw new Error(`unexpected upgrade persistence seed value: ${formatUnknown(value)}`);
  }
  expect(value.createdOk).toBe(true);
  expect(value.writtenOk).toBe(true);
  return value as UpgradePersistenceSeed;
}

function assertSettledDesktopHandoff(value: unknown | null): void {
  if (value == null) return;
  if (!isRecord(value)) throw new Error(`invalid launcher desktop handoff: ${formatUnknown(value)}`);
  expect(value.state).toBe('confirmed');
}

>>>>>>> upstream/main
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
  if (typeof value.reinstallLinkVisible !== 'boolean') return null;
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

async function seedPackagedOnboardingComplete(installDir: string): Promise<void> {
  const configPath = join(await resolveExpectedDataRoot(installDir), 'app-config.json');
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify({ onboardingCompleted: true }, null, 2)}\n`, 'utf8');
}

async function resolveExpectedDataRoot(installDir: string): Promise<string> {
  return join(await resolveExpectedNamespaceRoot(installDir), 'data');
}

async function resolveExpectedNamespaceRoot(installDir: string): Promise<string> {
  const installedConfig = JSON.parse(
    await readFile(await resolveInstalledPackagedConfigPath(installDir), 'utf8'),
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
    await readFile(
      join(await resolveInstalledPayloadRoot(installDir), 'resources', 'app', 'package.json'),
      'utf8',
    ),
  ) as InstalledAppPackage;
  if (typeof appPackage.productName === 'string' && appPackage.productName.length > 0) return appPackage.productName;
  if (typeof appPackage.name === 'string' && appPackage.name.length > 0) return appPackage.name;
  return 'Open Design';
}

async function resolveInstalledPackagedConfigPath(installDir: string): Promise<string> {
  return join(await resolveInstalledPayloadRoot(installDir), 'resources', 'open-design-config.json');
}

async function resolveInstalledPayloadRoot(installDir: string): Promise<string> {
  const runtimePath = join(installDir, 'runtime.json');
  const runtimeRaw = await readFile(runtimePath, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (runtimeRaw == null) return installDir;

  const runtime = JSON.parse(runtimeRaw) as InstalledRuntimeConfig;
  const activeRoot = safeLauncherRelativePath(runtime.active?.root);
  const activeCwd = safeLauncherRelativePath(runtime.active?.entry?.cwd);
  if (activeRoot == null || activeCwd == null) {
    throw new Error(`installed runtime.json does not describe an active payload root: ${runtimePath}`);
  }

  const payloadRoot = resolve(installDir, activeRoot, activeCwd);
  if (!isPathInside(payloadRoot, installDir)) {
    throw new Error(`installed runtime active payload root escapes install dir: ${payloadRoot}`);
  }
  return payloadRoot;
}

function safeLauncherRelativePath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || isAbsolute(value)) return null;
  const segments = value.split(/[\\/]+/);
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) return null;
  return join(...segments);
}

function defaultWindowsAppDataRoot(appName: string): string {
  return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), appName);
}

function isPathInside(filePath: string, expectedRoot: string): boolean {
  const normalizedPath = normalizePathForComparison(resolve(filePath));
  const normalizedRoot = normalizePathForComparison(resolve(expectedRoot));
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}${sep}`);
}

function normalizePathForComparison(filePath: string): string {
  return process.platform === 'win32' ? filePath.toLowerCase() : filePath;
}

<<<<<<< HEAD
=======
async function resetPackagedRuntimeNamespaceRoot(namespaceRoot: string): Promise<void> {
  await rm(namespaceRoot, { force: true, recursive: true });
}

async function resetPackagedUpdaterNamespaceRoots(): Promise<void> {
  await Promise.all([
    resetPackagedRuntimeNamespaceRoot(runtimeNamespaceRoot),
    resetPackagedRuntimeNamespaceRoot(launcherNamespaceRoot),
  ]);
}

// Reset every per-namespace runtime state directory before a fresh-onboarding
// start, EXCEPT the installed app payload (`install/`). On Windows the install
// lives UNDER the runtime namespace root, so — unlike the macOS smoke, which
// installs to /Applications and can `rm` the whole namespace root
// (resetPackagedMacRuntimeData) — we must preserve `install/` while wiping
// everything else.
//
// Wiping only `data/` is not enough. The packaged web frontend persists its
// config — including `onboardingCompleted` — to `localStorage`, which Electron
// stores under the SEPARATE `user-data/` partition, not the daemon's `data/`
// dir (see the `daemonDataRoot` vs `electronUserDataRoot` split logged on
// boot). When `<data>/app-config.json` is absent the daemon OMITS
// `onboardingCompleted`, so `mergeDaemonConfig` keeps the localStorage value;
// a leftover `onboardingCompleted: true` from an earlier run (e.g. the [P2]
// smoke that ran first in this file) then boots the app straight to Home
// instead of onboarding, and this test times out waiting for the cloud
// sign-in landing. Clearing `user-data/` alongside `data/` gives the same
// true-first-run guarantee the mac smoke gets from removing the entire root.
async function resetPackagedRuntimeDataRoot(): Promise<void> {
  // A missing root means the namespace has no runtime state yet — already a
  // fresh first-run, nothing to wipe. Any OTHER readdir failure (permissions,
  // I/O) is a real problem that must surface loudly: swallowing it would turn
  // the reset into a silent no-op and let stale state through, defeating the
  // very guarantee this helper exists to make.
  const entries = await readdir(runtimeNamespaceRoot).catch((error: NodeJS.ErrnoException) => {
    if (error?.code === 'ENOENT') return [] as string[];
    throw error;
  });
  await Promise.all(
    entries
      .filter((entry) => entry !== 'install')
      .map((entry) => rm(join(runtimeNamespaceRoot, entry), { force: true, recursive: true })),
  );
}

>>>>>>> upstream/main
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
<<<<<<< HEAD
=======

function resolveOptionalFixturePort(value: string | undefined): number | null {
  const normalized = normalizeOptionalEnv(value);
  if (normalized == null) return null;
  const port = Number(normalized);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      `OD_PACKAGED_E2E_WIN_UPDATE_FIXTURE_PORT must be an integer between 1 and 65535, received ${JSON.stringify(normalized)}`,
    );
  }
  return port;
}

function resolveUpdateFixtureMode(value: string | undefined): UpdateFixtureMode {
  const normalized = normalizeOptionalEnv(value) ?? 'payload';
  if (normalized === 'installer' || normalized === 'payload') return normalized;
  throw new Error(`OD_PACKAGED_E2E_WIN_UPDATE_MODE must be installer or payload, received ${JSON.stringify(normalized)}`);
}
>>>>>>> upstream/main
