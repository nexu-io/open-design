// @vitest-environment node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, test } from 'vitest';

import {
  packagedAppShellExpression,
  packagedAppRouteUrl,
  PackagedOnboardingConfigError,
  packagedOnboardingCompletedFromProbe,
  packagedOnboardingConfigExpression,
  runPackagedAppShellPhase,
  type PackagedAppShellState,
} from '@/vitest/packaged-app-shell';
import { createPackagedSmokeReport } from '@/vitest/packaged-report';
import {
  hasPackagedSmokeLane,
  resolvePackagedSmokeLanes,
  WIN_PACKAGED_SMOKE_SCENARIOS,
} from '@/vitest/packaged-smoke-plan';
import { resolvePackagedSmokeProfile } from '@/vitest/packaged-smoke-profile';
import {
  assertPackagedPtySmokeResult,
  packagedPtySmokeExpression,
} from '@/vitest/packaged-pty-smoke';
import {
  applyPackagedUpdateEnv,
  resolvePackagedUpdateScenario,
} from '@/vitest/packaged-update-scenario';
import {
  activateBrokenClosureSuccessor,
  readCommittedPackagedClosureFixture,
  readPackagedClosureBuildFixture,
  readPackagedClosureFixtureRuntime,
  resetPackagedClosureFixture,
  seedPackagedClosureFixture,
  type PackagedClosureFixture,
} from '@/vitest/packaged-closure-fixture';
import { releaseAppVersionArgs, resolvePackagedWinInstallIdentity } from '@/vitest/packaged-win-identity';
import { resolvePackagedSmokeNamespace } from '@/vitest/suite';
import { startToolsServeUpdaterFixture, type ToolsServeUpdaterFixture } from '@/vitest/tools-serve-updater-fixture';
import { missingWorkingWinInstallerOverwriteMarkers } from '@/vitest/win-installer-log';

const execFileAsync = promisify(execFile);
const e2eRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = dirname(e2eRoot);
const toolsPackDir = resolveFromWorkspace(process.env.OD_PACKAGED_E2E_TOOLS_PACK_DIR ?? '.tmp/tools-pack');
const namespace = resolvePackagedSmokeNamespace('win');
const toolsPackBin = join(workspaceRoot, 'tools', 'pack', 'bin', 'tools-pack.mjs');
const maxInstallDurationMs = Number.parseInt(process.env.OD_PACKAGED_E2E_WIN_MAX_INSTALL_MS ?? '120000', 10);
const maxStartDurationMs = Number.parseInt(process.env.OD_PACKAGED_E2E_WIN_MAX_START_MS ?? '300000', 10);
// `??` would keep an EMPTY value, and the release workflows can hand one down
// — see `resolvePackagedSmokeProfile` for why all three layers have to agree
// that empty means unset. An empty value surviving here reads as "not core"
// and silently selects the updater path.
const smokeProfile = resolvePackagedSmokeProfile(process.env.OD_PACKAGED_E2E_WIN_SMOKE_PROFILE);
const smokeLanes = resolvePackagedSmokeLanes(
  smokeProfile,
  process.env.OD_PACKAGED_E2E_WIN_SMOKE_LANES,
);
const verifyCoreOnly = smokeProfile === 'core';
const verifyUpgradePersistence =
  !verifyCoreOnly && process.env.OD_PACKAGED_E2E_WIN_VERIFY_UPGRADE_PERSISTENCE === '1';
const updateMetadataUrl = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_WIN_UPDATE_METADATA_URL);
const updateVersion = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_WIN_UPDATE_VERSION);
const updateBuildJsonPath = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_WIN_UPDATE_BUILD_JSON_PATH);
const intermediateUpdateBuildJsonPath = normalizeOptionalEnv(
  process.env.OD_PACKAGED_E2E_WIN_INTERMEDIATE_UPDATE_BUILD_JSON_PATH,
);
const updateFixture = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_WIN_UPDATE_FIXTURE);
const closureBuildJsonPath = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_CLOSURE_BUILD_JSON_PATH);
const legacyInstallerPath = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_WIN_LEGACY_INSTALLER_PATH);
const legacyVersion = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_WIN_LEGACY_VERSION);
const minimumShellVersion = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_WIN_MIN_SHELL_VERSION);
const updateFixturePort = resolveOptionalFixturePort(process.env.OD_PACKAGED_E2E_WIN_UPDATE_FIXTURE_PORT);
const updateFixtureMode = resolveUpdateFixtureMode(process.env.OD_PACKAGED_E2E_WIN_UPDATE_MODE);
const releaseChannel = process.env.OD_PACKAGED_E2E_RELEASE_CHANNEL;
const releaseVersion = process.env.OD_PACKAGED_E2E_RELEASE_VERSION;
const shellVersion = process.env.OD_PACKAGED_E2E_SHELL_VERSION;
const packagedInviteDeeplink =
  'opendesign://workspace/invite/continue?workspace_id=packaged-smoke-workspace&member_id=packaged-smoke-member&invite_id=packaged-smoke-invite&nonce=packaged-smoke-nonce';
const updateScenario = resolvePackagedUpdateScenario({ releaseChannel, releaseVersion, shellVersion });
const installIdentity = resolvePackagedWinInstallIdentity({ namespace, releaseVersion });

const outputNamespaceRoot = join(toolsPackDir, 'out', 'win', 'namespaces', namespace);
const runtimeNamespaceRoot = join(toolsPackDir, 'runtime', 'win', 'namespaces', namespace);
const portableNsisLogPath = join(
  tmpdir(),
  'Open Design',
  'installer-logs',
  'namespaces',
  namespace.replace(/[^A-Za-z0-9._-]+/g, '-'),
  'nsis.log',
);
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
const readinessExpression = `
  (() => ({
    href: location.href,
    mounted: document.documentElement.getAttribute('data-od-app-mounted'),
    readyState: document.readyState,
    title: document.title,
  }))()
`;
const healthExpression = `
  (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch('/api/health', { signal: controller.signal });
      return {
        health: await response.json(),
        href: location.href,
        status: response.status,
        title: document.title,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        href: location.href,
        name: error instanceof Error ? error.name : null,
        title: document.title,
      };
    } finally {
      clearTimeout(timeout);
    }
  })()
`;
const pptxExportExpression = `
  (async () => {
    const projectId = 'packaged-payload-pptx-' + Date.now().toString(36);
    const html = '<!doctype html><html><head><style>' +
      'html,body{margin:0}.slide{width:1920px;height:1080px;display:flex;align-items:center;justify-content:center;font:96px sans-serif;color:white}' +
      '.slide:first-child{background:#17324d}.slide:last-child{background:#8b3a2b}' +
      '</style></head><body><section class="slide">Payload One</section><section class="slide">Payload Two</section></body></html>';
    const created = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'Packaged payload PPTX' }),
    });
    if (!created.ok) throw new Error('project create failed: ' + created.status);
    const written = await fetch('/api/projects/' + encodeURIComponent(projectId) + '/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'deck.html', content: html }),
    });
    if (!written.ok) throw new Error('deck write failed: ' + written.status);
    const exported = await fetch('/api/projects/' + encodeURIComponent(projectId) + '/export/pptx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'deck.html' }),
    });
    const bytes = new Uint8Array(await exported.arrayBuffer());
    return {
      byteLength: bytes.length,
      contentType: exported.headers.get('content-type'),
      magic: String.fromCharCode(...bytes.slice(0, 2)),
      projectId,
      status: exported.status,
    };
  })()
`;
const upgradePersistenceProjectId = `packaged-upgrade-persistence-${Date.now().toString(36)}`;
const upgradePersistenceSeedExpression = `
  (async () => {
    const projectId = ${JSON.stringify(upgradePersistenceProjectId)};
    const html = '<!doctype html><html><head><style>' +
      'html,body{margin:0}.slide{width:1920px;height:1080px;display:flex;align-items:center;justify-content:center;font:96px sans-serif;color:white}' +
      '.slide:first-child{background:#17324d}.slide:last-child{background:#8b3a2b}' +
      '</style></head><body><section class="slide">Upgrade From 0.12</section><section class="slide">Persistence Check</section></body></html>';
    const created = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'Packaged upgrade persistence' }),
    });
    const written = created.ok
      ? await fetch('/api/projects/' + encodeURIComponent(projectId) + '/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'deck.html', content: html }),
        })
      : null;
    return {
      createdOk: created.ok,
      createdStatus: created.status,
      projectId,
      writtenOk: written?.ok ?? false,
      writtenStatus: written?.status ?? null,
    };
  })()
`;

function existingProjectPptxExportExpression(projectId: string): string {
  return `
    (async () => {
      const projectId = ${JSON.stringify(projectId)};
      const exported = await fetch('/api/projects/' + encodeURIComponent(projectId) + '/export/pptx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: 'deck.html' }),
      });
      const bytes = new Uint8Array(await exported.arrayBuffer());
      return {
        byteLength: bytes.length,
        contentType: exported.headers.get('content-type'),
        magic: String.fromCharCode(...bytes.slice(0, 2)),
        projectId,
        status: exported.status,
      };
    })()
  `;
}
const packagedOnboardingExpression = `
  (() => {
    const onboardingShell = document.querySelector('.entry-shell--onboarding');
    const onboardingModal = document.querySelector('.entry-onboarding-modal');
    // Identity is the first gate; runtime selection follows Cloud sign-in.
    const cloudSignIn = document.querySelector('.onboarding-cloud__primary');

    return {
      cloudSignInVisible: cloudSignIn instanceof HTMLElement,
      href: location.href,
      onboardingVisible: onboardingShell instanceof HTMLElement && onboardingModal instanceof HTMLElement,
      text: onboardingModal?.textContent?.trim().slice(0, 2000) ?? null,
      title: document.title,
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

type WinListResult = {
  current: {
    installDir: string;
    installedExeExists: boolean;
    installedExePath: string;
    registryEntries: Array<{
      displayName: string | null;
      displayVersion: string | null;
      installLocation: string | null;
      keyPath: string;
    }>;
    registryResidues: string[];
  };
};

type WinInspectResult = {
  daemonStatus: DesktopStatus | null;
  daemonStatusError?: string;
  desktopIpcUnavailable?: boolean;
  eval?: {
    error?: string;
    ok: boolean;
    value?: unknown;
  };
  screenshot?: {
    path: string;
  };
  status: DesktopStatus | null;
  statusError?: string;
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
  webStatus: DesktopStatus | null;
  webStatusError?: string;
  launcher: LauncherSnapshot;
};

type LauncherSnapshot = {
  active: LauncherPointer | null;
  attempt: (LauncherPointer & { channel?: string; namespace?: string }) | null;
  attemptsPath: string;
  channel: string;
  error?: string;
  exists: boolean;
  handoff: unknown | null;
  handoffPath: string;
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

type PptxExportEvalValue = {
  byteLength: number;
  contentType: string | null;
  magic: string;
  projectId: string;
  status: number;
};

type UpgradePersistenceSeed = {
  createdOk: boolean;
  createdStatus: number;
  projectId: string;
  writtenOk: boolean;
  writtenStatus: number | null;
};

type DesktopIdentityMarker = {
  appPath: string;
  executablePath: string;
  pid: number;
  runtime?: {
    descriptor?: {
      release?: { version?: string };
      shell?: { digest?: string; type?: string; version?: string };
      standalone?: { digest?: string; protocolVersion?: number; version?: string };
    };
    descriptorDigest?: string;
    generation?: number;
    scope?: { channel?: string; generation?: number; namespace?: string };
    standalonePid?: number;
  };
  stamp?: {
    app?: string;
    mode?: string;
    namespace?: string;
    source?: string;
  };
  version: number;
};

type PackagedOnboardingEvalValue = {
  cloudSignInVisible: boolean;
  href: string;
  onboardingVisible: boolean;
  text: string | null;
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

type UpdateFixtureMode = 'installer' | 'payload';

const shouldRunPackagedWinSmoke = process.platform === 'win32' && process.env.OD_PACKAGED_E2E_WIN === '1';
const winDescribe = shouldRunPackagedWinSmoke && hasPackagedSmokeLane(smokeLanes, 'shell')
  ? describe
  : describe.skip;
const shellAbsorbsStandaloneAcceptance = hasPackagedSmokeLane(smokeLanes, 'shell')
  && hasPackagedSmokeLane(smokeLanes, 'standalone')
  && !verifyCoreOnly
  && updateFixture === 'tools-serve'
  && closureBuildJsonPath != null;
const winClosureDescribe = shouldRunPackagedWinSmoke
  && hasPackagedSmokeLane(smokeLanes, 'standalone')
  && closureBuildJsonPath != null
  && !shellAbsorbsStandaloneAcceptance
  ? describe
  : describe.skip;
const winLegacyMigrationDescribe = shouldRunPackagedWinSmoke
  && hasPackagedSmokeLane(smokeLanes, 'migration')
  && !verifyCoreOnly
  ? describe
  : describe.skip;
const shouldRunPackagedWinOnboardingSmoke =
  shouldRunPackagedWinSmoke && process.env.OD_PACKAGED_E2E_WIN_ONBOARDING_SMOKE === '1';
const winOnboardingDescribe = shouldRunPackagedWinOnboardingSmoke ? describe : describe.skip;

winDescribe('packaged windows runtime smoke', () => {
  let installed = false;
  let started = false;

  test(WIN_PACKAGED_SMOKE_SCENARIOS.shellLifecycle.title, async () => {
    const report = await createPackagedSmokeReport('win');
    let passed = false;
    const timings: SmokeTiming[] = [];
    let appShell: PackagedAppShellState | 'skipped' = 'skipped';
    let firstRunAppShell: PackagedAppShellState | 'skipped' = 'skipped';
    let seededOnboardingCompleted: boolean | 'skipped' = 'skipped';
    let onboardingCompleted: boolean | 'skipped' = 'skipped';
    let intermediatePayloadUpdate: PayloadUpdateSummary | { skipped: true } = { skipped: true };
    let payloadUpdate: InstallerFallbackSummary | PayloadUpdateSummary | { skipped: true } = { skipped: true };
    let updaterRecovery: UpdaterRecoverySummary | { skipped: true } = { skipped: true };
    let logs: LogsResult | { skipped: true } = { skipped: true };
    let stop: WinStopResult | { skipped: true } = { skipped: true };
    let postUpdateHealth: HealthEvalValue | { skipped: true } = { skipped: true };
    let upgradePersistence: UpgradePersistenceSeed | { skipped: true } = { skipped: true };
    let payloadFixture: ToolsServeUpdaterFixture | null = null;
    let closureAcceptance: PackagedClosureFixture | null = null;
    let expectedClosureReleaseVersion = updateScenario.expectedCurrentVersion;
    let expectedStandaloneVersion = updateScenario.expectedCurrentVersion;
    let intermediateUpdateFixture: Awaited<ReturnType<typeof resolveLocalUpdateFixture>> | null = null;
    let localUpdateFixture: Awaited<ReturnType<typeof resolveLocalUpdateFixture>> | null = null;
    const updateEnv = captureUpdateEnv();
    try {
      if (!verifyCoreOnly && updateScenario.channel === 'beta') {
        expect(namespace).toBe('release-beta-win');
      }
      await measureSmokeStep(timings, 'pre-clean uninstall', async () => {
        await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch(() => null);
        await resetPackagedUpdaterNamespaceRoots();
        await resetPackagedClosureFixture({
          channel: updateScenario.channel,
          installationRoot: join(toolsPackDir, 'runtime', 'win'),
          namespace,
        });
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
      await assertWindowsInviteProtocolRegistration(install.installDir);
      if (!shellAbsorbsStandaloneAcceptance) await seedConfiguredPackagedClosure();
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

      // Phase 1 — the genuine first run. A packaged install nobody has signed
      // into is real product behaviour, not a broken state: since
      // `shouldRouteToFirstRunOnboarding` keys purely on `onboardingCompleted`,
      // the cloud sign-in landing is its correct terminal surface, and it is
      // accepted only when it actually rendered its sign-in CTA and both runtime
      // links. Core-only on purpose — every release workflow defaults there, and
      // the full profile needs its controlled updater environment from first
      // launch, which a plain start before the fixture is wired would bypass.
      if (verifyCoreOnly) {
        await resetPackagedRuntimeDataRoot();
        const firstRunStart = await measureSmokeStep(timings, 'start unseeded first run', async () =>
          runToolsPackJson<WinStartResult>('start'),
        );
        started = true;
        expect(firstRunStart.source).toBe('installed');
        const firstRunInspect = await measureSmokeStep(timings, 'wait healthy unseeded first run', async () =>
          waitForHealthyDesktop(),
        );
        expect(firstRunInspect.status?.state).toBe('running');
        if (!firstRunInspect.desktopIpcUnavailable) {
          const firstRunPhase = await measureSmokeStep(timings, 'ensure first-run app shell', async () =>
            runPackagedAppShellPhase({
              coreProfile: verifyCoreOnly,
              describeLast: formatUnknown,
              observe: observePackagedAppShell,
              readOnboardingConfig: readPackagedOnboardingConfig,
              scenario: 'first-run',
            }),
          );
          expect(firstRunPhase.onboardingCompleted).toBe(false);
          expect(firstRunPhase.appShell).toBe('onboarding-landing');
          firstRunAppShell = firstRunPhase.appShell;
        }
        const firstRunStop = await measureSmokeStep(timings, 'stop unseeded first run', async () =>
          runToolsPackJson<WinStopResult>('stop'),
        );
        started = false;
        expect(firstRunStop.status).not.toBe('partial');
        expect(firstRunStop.remainingPids).toEqual([]);
        // Clear both the daemon data root and the Electron user-data partition
        // so phase 2's seed lands on a true clean slate and no localStorage
        // residue from this phase can ratchet into it.
        await resetPackagedRuntimeDataRoot();
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
          assertUpdateVersionPresent('Windows', updateVersion);
          applyPackagedUpdateEnv(process.env, updateScenario, updateMetadataUrl, { openDryRun: false });
        } else {
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
          const closureBuild = shellAbsorbsStandaloneAcceptance
            ? await readPackagedClosureBuildFixture({
                buildJsonPath: closureBuildJsonPath!,
                channel: updateScenario.channel,
                expectedPlatform: 'win32-x64',
                workspaceRoot,
              })
            : null;
          payloadFixture = await startToolsServeUpdaterFixture({
            artifactPath: initialUpdateFixture.installerPath,
            channel: updateScenario.channel,
            ...(closureBuild == null ? {} : { closureManifestPath: closureBuild.manifestPath }),
            ...(updateFixtureMode === 'payload' ? { payloadPath: initialUpdateFixture.payloadPath } : {}),
            platform: 'win',
            ...(closureBuild == null ? {} : { rebaseClosureUrl: true }),
            ...(updateFixturePort == null ? {} : { port: updateFixturePort }),
            version: initialUpdateFixture.targetVersion,
            workspaceRoot,
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

      if (shellAbsorbsStandaloneAcceptance) {
        closureAcceptance = await measureSmokeStep(timings, 'wait online Closure commit', async () =>
          waitForCommittedPackagedClosureFixture({
            buildJsonPath: closureBuildJsonPath!,
            channel: updateScenario.channel,
            expectedPlatform: 'win32-x64',
            installationRoot: join(toolsPackDir, 'runtime', 'win'),
            namespace,
            workspaceRoot,
          }),
        );
      }

      const inspect = await measureSmokeStep(timings, 'wait healthy inspect eval', async () => waitForHealthyDesktop());
      expect(inspect.status?.state).toBe('running');
      if (inspect.desktopIpcUnavailable) expectWindowsFallbackWebUrl(inspect.status?.url);
      else expectWindowsPackagedRouteUrl(inspect.status?.url);

      const value = assertHealthEvalValue(inspect.eval?.value);
      if (inspect.desktopIpcUnavailable) expectWindowsDaemonUrl(value.href);
      else expectWindowsPackagedRouteUrl(value.href);
      expect(value.status).toBe(200);
      expect(value.health.ok).toBe(true);
      if (releaseVersion != null && releaseVersion !== '') expect(value.health.version).toBe(releaseVersion);
      else expect(value.health.version).toEqual(expect.any(String));

      // Establish the data-root postcondition before probing unrelated runtime
      // capabilities. A healthy auth-first renderer may already be on
      // od://app/onboarding, but it must still read the completed seed written
      // into this tools-pack namespace.
      if (!inspect.desktopIpcUnavailable) {
        seededOnboardingCompleted = await measureSmokeStep(timings, 'verify seeded onboarding config', async () =>
          packagedOnboardingCompletedFromProbe(await readPackagedOnboardingConfig()),
        );
        expect(
          seededOnboardingCompleted,
          'daemon did not read the seeded onboardingCompleted config; check that the packaged data root still resolves to the tools-pack runtime namespace root',
        ).toBe(true);
      }

      if (shellAbsorbsStandaloneAcceptance) {
        if (closureAcceptance == null) throw new Error('Windows Shell did not commit the expected Closure fixture');
        const closureRuntime = await readPackagedClosureFixtureRuntime(closureAcceptance);
        expectedStandaloneVersion = closureAcceptance.manifest.identity.version;
        const committedClosureReleaseVersion = closureRuntime.committed?.releaseVersion;
        if (committedClosureReleaseVersion == null) {
          throw new Error('Windows Shell did not commit a Closure release version');
        }
        expectedClosureReleaseVersion = committedClosureReleaseVersion;
        assertClosureDesktopIdentity(
          await readDesktopIdentityMarker(),
          expectedStandaloneVersion,
          expectedClosureReleaseVersion,
        );
      }
      const ptyInspect = await measureSmokeStep(timings, 'packaged PTY capability', async () =>
        runToolsPackJson<WinInspectResult>('inspect', [
          '--expr',
          packagedPtySmokeExpression('win32'),
        ]),
      );
      const pty = assertPackagedPtySmokeResult(ptyInspect.eval?.value);
      expect(pty.projectCreateStatus).toBe(200);
      expect(pty.projectSeedStatus).toBe(200);
      expect(pty.terminalCreateStatus).toBe(200);
      expect(pty.stdinStatus).toBe(200);
      expect(pty.output).toContain(pty.marker);
      expect(pty.exitCode, JSON.stringify(pty, null, 2)).toBe(0);
      expect(pty.cleanup.terminalStatus).toBe(200);
      expect(pty.cleanup.projectStatus).toBe(200);
      assertLauncherPointer(inspect.launcher.active, updateScenario.expectedInstalledShellVersion, 0, 'initial active');
      assertLauncherPointer(inspect.launcher.lastSuccessful, updateScenario.expectedInstalledShellVersion, 0, 'initial lastSuccessful');

      // Runtime registration must preserve the stable installed outer path;
      // pointing at a versioned payload would break the scheme after cleanup.
      await assertWindowsInviteProtocolRegistration(install.installDir);
      const protocolHotPid = inspect.status?.pid ?? start.pid;
      const protocolHotContinuationCount = await countInviteContinuationResults();
      await invokeWindowsInviteDeeplink();
      const [protocolHotInspect, protocolHotContinuation] = await measureSmokeStep(
        timings,
        'invite protocol hot delivery',
        async () => Promise.all([
          waitForHealthyDesktop(),
          waitForInviteContinuationResult(protocolHotContinuationCount),
        ]),
      );
      expect(protocolHotInspect.status?.pid).toBe(protocolHotPid);
      expect(protocolHotContinuation.reason).not.toBe('daemon_unavailable');
      expect(protocolHotContinuation.reason).not.toBe('unreachable');

      if (verifyCoreOnly) {
        const protocolStop = await measureSmokeStep(
          timings,
          'stop before invite protocol cold delivery',
          async () => runToolsPackJson<WinStopResult>('stop'),
        );
        started = false;
        expect(protocolStop.status).not.toBe('partial');
        expect(protocolStop.remainingPids).toEqual([]);

        await invokeWindowsInviteDeeplink();
        started = true;
        const protocolColdInspect = await measureSmokeStep(
          timings,
          'invite protocol cold delivery',
          async () => waitForHealthyDesktop(),
        );
        expect(protocolColdInspect.status?.state).toBe('running');
        expect(protocolColdInspect.status?.pid).not.toBe(protocolHotPid);
        await assertWindowsInviteProtocolRegistration(install.installDir);
      }

      if (!inspect.desktopIpcUnavailable) {
        // Re-read rather than reusing the value from the seeded start: the core
        // profile stopped the app above and relaunched it through the OS
        // protocol handler, and that cold start carries none of this process's
        // environment — so it is a different daemon, and only it can say what
        // config the surface being asserted on is actually running under.
        // Phase 2 — the completed user. The seed must have been confirmed before
        // this point; the core auth-first profile may legitimately stop at the
        // cloud sign-in landing, while the full updater profile still needs
        // Home. Either way, a cold launch that lost the seed fails first.
        if (seededOnboardingCompleted !== true) {
          throw new Error('reached the completed-user app-shell check without a confirmed seeded onboarding state');
        }
        const completedUser = await measureSmokeStep(timings, 'ensure completed-user identity surface', async () =>
          runPackagedAppShellPhase({
            coreProfile: verifyCoreOnly,
            describeLast: formatUnknown,
            observe: observePackagedAppShell,
            readOnboardingConfig: readPackagedOnboardingConfig,
            scenario: 'completed-user',
          }),
        );
        onboardingCompleted = completedUser.onboardingCompleted;
        appShell = completedUser.appShell;
        if (!verifyCoreOnly) expect(appShell).toBe('home');

        if (verifyUpgradePersistence) {
          const seedInspect = await measureSmokeStep(timings, 'seed pre-update persistence project', async () =>
            runToolsPackJson<WinInspectResult>('inspect', ['--expr', upgradePersistenceSeedExpression]),
          );
          upgradePersistence = assertUpgradePersistenceSeed(seedInspect.eval?.value);
        }

        await mkdir(dirname(preUpdateScreenshotPath), { recursive: true });
        const preUpdateScreenshot = await measureSmokeStep(timings, 'inspect screenshot before update', async () =>
          runToolsPackJson<WinInspectResult>('inspect', ['--path', preUpdateScreenshotPath]),
        );
        expect(preUpdateScreenshot.screenshot?.path).toBe(preUpdateScreenshotPath);
        expect(await fileSizeBytes(preUpdateScreenshotPath)).toBeGreaterThan(0);
        await report.report.save('screenshots/open-design-win-before-update.png', await readFile(preUpdateScreenshotPath));
      } else if (verifyUpgradePersistence) {
        throw new Error('upgrade persistence validation requires desktop IPC eval support');
      }

      if (!verifyCoreOnly) {
        const persistedProjectId = 'skipped' in upgradePersistence ? null : upgradePersistence.projectId;
        payloadUpdate = await measureSmokeStep(timings, `${updateFixtureMode} update acceptance`, async () =>
          updateFixtureMode === 'installer'
            ? runInstallerFallbackAcceptance({
                expectedStandaloneVersion,
                expectedVersion: expectedPayloadUpdateVersion,
                fixture: payloadFixture,
                installDir: install.installDir,
                persistedProjectId,
              })
            : runPayloadUpdateAcceptance({
                expectedClosureReleaseVersion,
                expectedStandaloneVersion,
                expectedVersion: expectedPayloadUpdateVersion,
                ...(intermediateUpdateFixture == null
                  ? {}
                  : { legacyInstalledExecutablePath: join(install.installDir, 'Open Design.exe') }),
                persistedProjectId,
                verifyPptx: intermediateUpdateFixture == null,
              }),
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
            waitForHealthyDesktopShellVersion(intermediateVersion, expectedStandaloneVersion, intermediateIdentityPid),
          );
          expectedPayloadUpdateVersion = targetVersion;
          payloadUpdate = await measureSmokeStep(timings, 'target payload update acceptance', async () =>
            runPayloadUpdateAcceptance({
              expectedClosureReleaseVersion,
              expectedCurrentVersion: intermediateVersion,
              expectedStandaloneVersion,
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
              expectedInstalledVersion: updateScenario.expectedInstalledShellVersion,
              expectedStandaloneVersion,
              fixture: recoveryFixture,
              installDir: install.installDir,
              persistedProjectId,
              targetVersion: recoveryTargetVersion,
            }),
          );
          postUpdateHealth = updaterRecovery.installer.health;
        }
      }

      if (!inspect.desktopIpcUnavailable) {
        await mkdir(dirname(screenshotPath), { recursive: true });
        const screenshot = await measureSmokeStep(timings, 'inspect screenshot', async () =>
          runToolsPackJson<WinInspectResult>('inspect', ['--path', screenshotPath]),
        );
        expect(screenshot.screenshot?.path).toBe(screenshotPath);
        expect(await fileSizeBytes(screenshotPath)).toBeGreaterThan(0);
        await report.saveScreenshot(screenshotPath);
      }

      if (!verifyCoreOnly) {
        logs = await measureSmokeStep(timings, 'logs', async () => runToolsPackJson<LogsResult>('logs'));
        assertLogPathsAndContent(logs);

        stop = await measureSmokeStep(timings, 'stop', async () => runToolsPackJson<WinStopResult>('stop'));
        started = false;
        expect(stop.namespace).toBe(namespace);
        expect(stop.status).not.toBe('partial');
        expect(stop.remainingPids).toEqual([]);
      }

      // Bind the public acceptance proof to the exact Closure committed by
      // the installed Shell before uninstall removes the namespace state.
      // Local release smoke records the same fact, so this is evidence rather
      // than a workflow-only behavior branch.
      const closureBinding = await readPackagedClosureBinding();

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
      await assertWindowsInviteProtocolRemoved();
      await report.saveSummary({
        appShell,
        closureBinding,
        onboarding: {
          afterSeed: seededOnboardingCompleted,
          atAppShell: onboardingCompleted,
          firstRunAppShell,
        },
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
        pty,
        updaterRecovery,
        screenshot: inspect.desktopIpcUnavailable ? null : report.screenshotRelpath,
        screenshots: inspect.desktopIpcUnavailable
          ? { afterUpdate: null, beforeUpdate: null }
          : {
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
        upgradePersistence,
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
  silentUpdateTest(WIN_PACKAGED_SMOKE_SCENARIOS.shellSilentUpdate.title, async () => {
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
      await seedConfiguredPackagedClosure();

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
      const silent = await waitForHealthyDesktopShellVersion(
        targetVersion,
        updateScenario.expectedCurrentVersion,
        start.pid,
      );
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
  rollbackTest(WIN_PACKAGED_SMOKE_SCENARIOS.shellRollback.title, async () => {
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
      await seedConfiguredPackagedClosure();

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

      const installControl = await runToolsPackJson<WinInspectResult>('inspect', ['--update-action', 'install']);
      expect(installControl.update?.state).toBe('downloaded');
      expect(installControl.update?.installResult?.dryRun).toBe(false);

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
      expect(strandedRuntime.lastSuccessful?.version).toBe(updateScenario.expectedInstalledShellVersion);
      expect(strandedAttempt.generation).toBe(strandedRuntime.active?.generation);

      // Cold start rolls back: the installed outer sees the unconfirmed
      // attempt, selects lastSuccessful, and serves the base version again.
      const rollbackStart = await runToolsPackJson<WinStartResult>('start');
      cleanupStarted = true;
      expect(rollbackStart.source).toBe('installed');
      const rolledBack = await waitForHealthyDesktopShellVersion(
        updateScenario.expectedInstalledShellVersion,
        updateScenario.expectedCurrentVersion,
        start.pid,
        false,
      );
      expect(rolledBack.launcher.lastSuccessful?.version).toBe(updateScenario.expectedInstalledShellVersion);
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
      await waitForDownloadedUpdater(healedVersion, 'payload', 120_000, updateScenario.expectedInstalledShellVersion);
      const healControl = await runToolsPackJson<WinInspectResult>('inspect', ['--update-action', 'install']);
      expect(healControl.update?.state).toBe('downloaded');
      expect(healControl.update?.installResult?.dryRun).toBe(false);
      const healed = await waitForHealthyDesktopShellVersion(
        healedVersion,
        updateScenario.expectedCurrentVersion,
        rollbackStart.pid,
      );
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

winClosureDescribe('packaged Windows Standalone Closure release acceptance', () => {
  test(WIN_PACKAGED_SMOKE_SCENARIOS.standaloneClosure.title, async () => {
    const installationRoot = join(toolsPackDir, 'runtime', 'win');
    let installed = false;
    let started = false;
    try {
      await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch(() => null);
      await resetPackagedUpdaterNamespaceRoots();
      await resetPackagedClosureFixture({
        channel: updateScenario.channel,
        installationRoot,
        namespace,
      });
      await runToolsPackJson<WinInstallResult>('install');
      installed = true;
      await seedPackagedOnboardingComplete();
      const fixture = await seedPackagedClosureFixture({
        buildJsonPath: closureBuildJsonPath!,
        channel: updateScenario.channel,
        expectedPlatform: 'win32-x64',
        installationRoot,
        namespace,
        workspaceRoot,
      });

      const firstStart = await runToolsPackJson<WinStartResult>('start');
      started = true;
      const firstInspect = await waitForHealthyDesktop();
      expect(assertHealthEvalValue(firstInspect.eval?.value).health.ok).toBe(true);
      assertClosureDesktopIdentity(await readDesktopIdentityMarker(), fixture.manifest.identity.version);

      const reinstallStop = await runToolsPackJson<WinStopResult>('stop');
      started = false;
      expect(reinstallStop.remainingPids).toEqual([]);
      await runToolsPackJson<WinInstallResult>('install');
      const reinstallStart = await runToolsPackJson<WinStartResult>('start');
      started = true;
      expect(reinstallStart.pid).not.toBe(firstStart.pid);
      await waitForHealthyDesktop();
      assertClosureDesktopIdentity(await readDesktopIdentityMarker(), fixture.manifest.identity.version);

      const faultStop = await runToolsPackJson<WinStopResult>('stop');
      started = false;
      expect(faultStop.remainingPids).toEqual([]);
      const broken = await activateBrokenClosureSuccessor(fixture);
      // Windows `tools-pack start` has a bounded best-effort status probe and
      // returns `status:null` when the spawned app exits during that window;
      // unlike the macOS launch command it does not surface the child exit as
      // a rejected command. Prove the actual fail-closed postconditions: no
      // healthy desktop, no identity confirmation, an exited process, and the
      // immutable-verification failure in the Shell log.
      const brokenStart = await runToolsPackJson<WinStartResult>('start');
      expect(brokenStart.status).toBeNull();
      await waitForDesktopGone('damaged Closure never became the desktop');
      await expect(readDesktopIdentityMarker()).rejects.toThrow();
      const brokenDesktopLog = await readFile(join(runtimeNamespaceRoot, 'logs', 'desktop', 'latest.log'), 'utf8');
      expect(brokenDesktopLog).toContain('Committed Standalone failed immutable Store verification');
      expect(brokenDesktopLog).toContain('"code":1');
      expect((await readPackagedClosureFixtureRuntime(fixture)).committed?.standalone).toEqual(broken.pointer);

      await resetPackagedClosureFixture({
        channel: updateScenario.channel,
        installationRoot,
        namespace,
      });
      const recovered = await seedPackagedClosureFixture({
        buildJsonPath: closureBuildJsonPath!,
        channel: updateScenario.channel,
        expectedPlatform: 'win32-x64',
        installationRoot,
        namespace,
        workspaceRoot,
      });
      await runToolsPackJson<WinStartResult>('start');
      started = true;
      await waitForHealthyDesktop();
      assertClosureDesktopIdentity(await readDesktopIdentityMarker(), recovered.manifest.identity.version);
      expect((await readPackagedClosureFixtureRuntime(recovered)).committed?.standalone).toEqual(recovered.pointer);
    } finally {
      if (started) await runToolsPackJson<WinStopResult>('stop').catch(() => undefined);
      if (installed) {
        await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch(() => undefined);
      }
      await resetPackagedClosureFixture({
        channel: updateScenario.channel,
        installationRoot,
        namespace,
      }).catch(() => undefined);
    }
  }, 720_000);
});

winLegacyMigrationDescribe('packaged Windows historical outer migration acceptance', () => {
  test(WIN_PACKAGED_SMOKE_SCENARIOS.legacyMigration.title, async () => {
    const report = await createPackagedSmokeReport('win');
    const updateEnv = captureUpdateEnv();
    const legacyFixturePath = requireMigrationInput(
      'OD_PACKAGED_E2E_WIN_LEGACY_INSTALLER_PATH',
      legacyInstallerPath,
    );
    const legacyFixtureVersion = requireMigrationInput(
      'OD_PACKAGED_E2E_WIN_LEGACY_VERSION',
      legacyVersion,
    );
    const requiredShellVersion = requireMigrationInput(
      'OD_PACKAGED_E2E_WIN_MIN_SHELL_VERSION',
      minimumShellVersion,
    );
    const targetReleaseVersion = requireMigrationInput(
      'OD_PACKAGED_E2E_RELEASE_VERSION',
      releaseVersion,
    );
    const buildJsonPath = requireMigrationInput(
      'OD_PACKAGED_E2E_CLOSURE_BUILD_JSON_PATH',
      closureBuildJsonPath,
    );
    const installationRoot = join(toolsPackDir, 'runtime', 'win');
    const installDir = join(runtimeNamespaceRoot, 'install', 'Open Design');
    let installed = false;
    let started = false;
    let migrationFixture: ToolsServeUpdaterFixture | null = null;

    try {
      await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch(() => null);
      await resetPackagedUpdaterNamespaceRoots();
      await resetPackagedClosureFixture({
        channel: updateScenario.channel,
        installationRoot,
        namespace,
      });

      const legacyInstall = await runDirectInstaller(resolveFromWorkspace(legacyFixturePath), installDir);
      expect(legacyInstall.code).toBe(0);
      installed = true;
      expect(await fileSizeBytes(join(installDir, 'Open Design.exe'))).toBeGreaterThan(0);
      await seedPackagedOnboardingComplete();

      const currentInstallerPath = await resolveMainBuildInstallerPath();
      const closureBuild = await readPackagedClosureBuildFixture({
        buildJsonPath,
        channel: updateScenario.channel,
        expectedPlatform: 'win32-x64',
        workspaceRoot,
      });
      migrationFixture = await startToolsServeUpdaterFixture({
        artifactPath: currentInstallerPath,
        channel: updateScenario.channel,
        closureManifestPath: closureBuild.manifestPath,
        controlLauncherVersionMin: requiredShellVersion,
        controlLauncherVersionUrl: 'https://open-design.ai/download',
        platform: 'win',
        rebaseClosureUrl: true,
        version: targetReleaseVersion,
        workspaceRoot,
      });
      applyPackagedUpdateEnv(
        process.env,
        resolvePackagedUpdateScenario({
          releaseChannel: updateScenario.channel,
          releaseVersion: legacyFixtureVersion,
          shellVersion: legacyFixtureVersion,
        }),
        migrationFixture.info.metadataUrl,
      );

      const legacyStart = await runToolsPackJsonForVersion<WinStartResult>('start', legacyFixtureVersion);
      started = true;
      expect(legacyStart.source).toBe('installed');
      const legacyInspect = await waitForHealthyDesktopVersion(legacyFixtureVersion, null, false);
      const legacyHealth = assertHealthEvalValue(legacyInspect.eval?.value);
      expect(legacyHealth.health.version).toBe(legacyFixtureVersion);
      const seedInspect = await runToolsPackJsonForVersion<WinInspectResult>(
        'inspect',
        legacyFixtureVersion,
        ['--expr', upgradePersistenceSeedExpression],
      );
      if (seedInspect.eval?.ok !== true) {
        throw new Error(`legacy Windows project seed eval failed: ${formatUnknown(seedInspect)}`);
      }
      const seeded = assertUpgradePersistenceSeed(seedInspect.eval.value);

      const migration = await runInstallerFallbackAcceptance({
        expectedCurrentVersion: legacyFixtureVersion,
        expectedVersion: targetReleaseVersion,
        fixture: migrationFixture,
        installDir,
        nsisLogPath: portableNsisLogPath,
        persistedProjectId: seeded.projectId,
      });
      expect(migration.downloaded.reinstall).toEqual({
        installedVersion: legacyFixtureVersion,
        minVersion: requiredShellVersion,
        reason: 'outer-below-min',
        url: 'https://open-design.ai/download',
      });
      expect(migration.coldStart.start.pid).not.toBe(legacyStart.pid);
      await assertWindowsInviteProtocolRegistration(installDir);

      const committedClosure = await readCommittedPackagedClosureFixture({
        buildJsonPath,
        channel: updateScenario.channel,
        expectedPlatform: 'win32-x64',
        installationRoot,
        namespace,
        workspaceRoot,
      });
      assertClosureDesktopIdentity(
        await readDesktopIdentityMarker(),
        committedClosure.manifest.identity.version,
      );
      const coldPptx = assertPptxExportEvalValue((await runToolsPackJson<WinInspectResult>(
        'inspect',
        ['--expr', existingProjectPptxExportExpression(seeded.projectId)],
      )).eval?.value);
      expect(coldPptx.projectId).toBe(seeded.projectId);

      await report.report.json('historical-outer-migration.json', {
        closure: committedClosure.pointer,
        coldPptx,
        legacyHealth,
        migration,
        versions: {
          legacy: legacyFixtureVersion,
          minimumShell: requiredShellVersion,
          release: targetReleaseVersion,
        },
      });
    } finally {
      restoreUpdateEnv(updateEnv);
      await migrationFixture?.close().catch(() => undefined);
      if (started) {
        await runToolsPackJson<WinStopResult>('stop').catch(() => undefined);
        await runToolsPackJsonForVersion<WinStopResult>('stop', legacyVersion).catch(() => undefined);
      }
      if (installed) {
        await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch(() => undefined);
      }
      await resetPackagedClosureFixture({
        channel: updateScenario.channel,
        installationRoot,
        namespace,
      }).catch(() => undefined);
    }
  }, 720_000);
});

winOnboardingDescribe('packaged windows onboarding AMR smoke', () => {
  let installed = false;
  let started = false;

  test('[P0] @electron-smoke starts a fresh packaged Windows app on the Cloud identity gate', async () => {
    const report = await createPackagedSmokeReport('win');
    const timings: SmokeTiming[] = [];
    let install: WinInstallResult | null = null;
    let installedNamespaceRoot: string | null = null;
    let passed = false;
    try {
      await measureSmokeStep(timings, 'pre-clean uninstall', async () => {
        await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch(() => null);
      });

      install = await measureSmokeStep(timings, 'install', async () => runToolsPackJson<WinInstallResult>('install'));
      installed = true;
      expect(install.namespace).toBe(namespace);
      expectPathInside(install.installDir, join(runtimeNamespaceRoot, 'install'));
      installedNamespaceRoot = runtimeNamespaceRoot;
      await resetPackagedRuntimeDataRoot();
      await seedConfiguredPackagedClosure();

      const start = await measureSmokeStep(timings, 'start fresh onboarding', async () => runToolsPackJson<WinStartResult>('start'));
      started = true;
      expect(start.namespace).toBe(namespace);
      expect(start.source).toBe('installed');
      expectPathInside(start.executablePath, install.installDir);

      const inspect = await measureSmokeStep(timings, 'wait healthy inspect eval', async () => waitForHealthyDesktop());
      expect(inspect.status?.state).toBe('running');
      // A fresh install boots at `od://app/` and the SPA immediately redirects to the dedicated
      // onboarding route (`od://app/onboarding`, since the #4513 cloud sign-in redesign). Whether
      // the desktop is reported healthy just before or just after that redirect is a race, so the
      // healthy URL/href may be either — match the prefix leniently exactly as the mac smoke and
      // the onboarding-landing assertion below do, instead of pinning the bare root (which flaked
      // ~3 of 4 nightly Windows builds when the redirect won the race).
      expect(inspect.status?.url).toMatch(/^(od:\/\/app\/|http:\/\/127\.0\.0\.1:\d+\/)/);
      const health = assertHealthEvalValue(inspect.eval?.value);
      expect(health.href).toMatch(/^(od:\/\/app\/|http:\/\/127\.0\.0\.1:\d+\/)/);
      expect(health.status).toBe(200);
      expect(health.health.ok).toBe(true);

      const initial = await waitForPackagedOnboarding((snapshot) =>
        snapshot.onboardingVisible && snapshot.cloudSignInVisible,
        'fresh packaged Windows onboarding Cloud identity gate',
      );
      // Onboarding lives on a dedicated route since the #4513 cloud sign-in
      // redesign, so the href is `od://app/onboarding` (packaged) — not the
      // bare app root. Match the prefix the same lenient way the mac smoke
      // does instead of pinning the exact root path. Before the user-data
      // reset fix the app booted to Home and never reached this line, which
      // is why the stale exact-match assertion went unnoticed.
      expect(initial.href).toMatch(/^(od:\/\/app\/|http:\/\/127\.0\.0\.1:\d+\/)/);
      expect(initial.cloudSignInVisible).toBe(true);

      const onboardingScreenshotPath = join(toolsPackDir, 'screenshots', `${namespace}-onboarding.png`);
      await mkdir(dirname(onboardingScreenshotPath), { recursive: true });
      const screenshot = await runToolsPackJson<WinInspectResult>('inspect', ['--path', onboardingScreenshotPath]);
      expect(screenshot.screenshot?.path).toBe(onboardingScreenshotPath);
      expect(await fileSizeBytes(onboardingScreenshotPath)).toBeGreaterThan(0);
      await report.report.save('screenshots/open-design-win-onboarding-smoke.png', await readFile(onboardingScreenshotPath));
      await report.report.json('onboarding-summary.json', {
        health,
        initial,
        namespace,
        screenshot: 'screenshots/open-design-win-onboarding-smoke.png',
        start: {
          executablePath: start.executablePath,
          logPath: start.logPath,
          pid: start.pid,
          source: start.source,
          status: start.status,
        },
        timings,
      });

      const stop = await measureSmokeStep(timings, 'stop', async () => runToolsPackJson<WinStopResult>('stop'));
      started = false;
      expect(stop.namespace).toBe(namespace);
      expect(stop.status).not.toBe('partial');

      const uninstall = await measureSmokeStep(timings, 'uninstall remove data', async () =>
        runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']),
      );
      installed = false;
      expect(uninstall.namespace).toBe(namespace);
      expect(uninstall.residueObservation?.productNamespaceRootExists).toBe(false);
      passed = true;
    } finally {
      if (!passed) {
        await printPackagedLogs().catch((error: unknown) => {
          console.error('failed to read packaged windows onboarding logs after failure', error);
        });
      }

      if (started) {
        await runToolsPackJson<WinStopResult>('stop').catch((error: unknown) => {
          console.error('failed to stop packaged windows onboarding app during cleanup', error);
        });
        started = false;
      }

      if (installed) {
        await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch((error: unknown) => {
          console.error('failed to uninstall packaged windows onboarding app during cleanup', error);
        });
        installed = false;
      }

      if (installedNamespaceRoot != null) {
        await resetPackagedRuntimeNamespaceRoot(installedNamespaceRoot).catch((error: unknown) => {
          console.error('failed to reset packaged windows onboarding runtime data during cleanup', error);
        });
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
  coldStart: {
    health: HealthEvalValue;
    identity: DesktopIdentityMarker;
    launcher: LauncherSnapshot;
    start: WinStartResult;
    stop: WinStopResult;
  };
  downloaded: NonNullable<WinInspectResult['update']>;
  health: HealthEvalValue;
  identity: DesktopIdentityMarker;
  installControl: NonNullable<WinInspectResult['update']>;
  launcherAfterConfirm: LauncherSnapshot;
  pptx: PptxExportEvalValue | { skipped: true };
  terminal: NonNullable<WinInspectResult['update']>;
  targetVersion: string;
};

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
  terminal: NonNullable<WinInspectResult['update']>;
};

async function runSameVersionUpdaterRecoveryAcceptance(options: {
  expectedInstalledVersion: string;
  expectedStandaloneVersion: string;
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
  const running = await waitForHealthyDesktopShellVersion(
    options.targetVersion,
    options.expectedStandaloneVersion,
    null,
  );

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
    expectedStandaloneVersion: options.expectedStandaloneVersion,
    expectedVersion: options.targetVersion,
    fixture: options.fixture,
    installDir: options.installDir,
    persistedProjectId: options.persistedProjectId,
  });
  const installedConfig = JSON.parse(
    await readFile(join(options.installDir, 'resources', 'open-design-config.json'), 'utf8'),
  ) as { shellVersion?: unknown };
  expect(installedConfig.shellVersion).toBe(options.targetVersion);

  const terminalInspect = await waitForTerminalUpdateState(options.targetVersion);
  if (terminalInspect.update == null) throw new Error('reinstalled outer did not return terminal updater status');
  expect(terminalInspect.update.reinstall).toBeUndefined();

  return {
    cleared: clearedInspect.update,
    downloadedBeforeClear: downloadedInspect.update,
    installer,
    terminal: terminalInspect.update,
  };
}

async function runPayloadUpdateAcceptance(options: {
  expectedClosureReleaseVersion: string;
  expectedCurrentVersion?: string;
  expectedStandaloneVersion: string;
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
  if (downloadedInspect.update == null) throw new Error('payload update download did not return update status');
  const targetVersion = downloadedInspect.update.availableVersion;
  if (targetVersion == null || targetVersion.length === 0) {
    throw new Error(`payload update did not report availableVersion: ${formatUnknown(downloadedInspect.update)}`);
  }
  expect(downloadedInspect.update.artifact?.type).toBe('payload');
  expectPathInside(downloadedInspect.update.downloadPath ?? '', join(runtimeNamespaceRoot, 'updates'));

  const previousPid = downloadedInspect.status?.pid;
  // The updater belongs to the immutable Electron Shell. Exercise its IPC
  // capability directly so Cloud identity state and the selected Closure route
  // cannot become prerequisites for a Shell update.
  const installInspect = await runToolsPackJson<WinInspectResult>('inspect', ['--update-action', 'install']);
  if (installInspect.update == null) throw new Error('payload update install control result is missing');
  expect(installInspect.update.state).toBe('downloaded');
  expect(installInspect.update.installResult?.dryRun).toBe(false);

  const postUpdateInspect = await waitForHealthyDesktopShellVersion(
    targetVersion,
    options.expectedStandaloneVersion,
    previousPid,
  );
  expect(postUpdateInspect.status?.state).toBe('running');
  expectWindowsPackagedAppUrl(postUpdateInspect.status?.url);
  const health = assertHealthEvalValue(postUpdateInspect.eval?.value);
  expectWindowsHealthyRendererUrl(health.href);
  expect(health.status).toBe(200);
  expect(health.health.ok).toBe(true);
  expect(health.health.version).toBe(options.expectedStandaloneVersion);
  expect(packagedOnboardingCompletedFromProbe(await readPackagedOnboardingConfig())).toBe(true);
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
  expect(identity.stamp).toMatchObject({
    app: 'desktop',
    mode: 'runtime',
    namespace,
    source: 'packaged',
  });
  await assertPayloadDesktopIdentity(
    identity,
    postUpdateInspect.launcher,
    targetVersion,
    options.expectedStandaloneVersion,
    options.expectedClosureReleaseVersion,
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
  const coldInspect = await waitForHealthyDesktopShellVersion(
    targetVersion,
    options.expectedStandaloneVersion,
    identity.pid,
  );
  const coldHealth = assertHealthEvalValue(coldInspect.eval?.value);
  expectWindowsHealthyRendererUrl(coldHealth.href);
  expect(coldHealth.status).toBe(200);
  expect(coldHealth.health.ok).toBe(true);
  expect(coldHealth.health.version).toBe(options.expectedStandaloneVersion);
  expect(packagedOnboardingCompletedFromProbe(await readPackagedOnboardingConfig())).toBe(true);
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
  expect(coldIdentity.stamp).toMatchObject({
    app: 'desktop',
    mode: 'runtime',
    namespace,
    source: 'tools-pack',
  });
  await assertPayloadDesktopIdentity(
    coldIdentity,
    coldInspect.launcher,
    targetVersion,
    options.expectedStandaloneVersion,
    options.expectedClosureReleaseVersion,
    options.legacyInstalledExecutablePath,
  );
  expect(coldIdentity.pid).not.toBe(identity.pid);
  return {
    coldStart: {
      health: coldHealth,
      identity: coldIdentity,
      launcher: coldInspect.launcher,
      start,
      stop,
    },
    downloaded: downloadedInspect.update,
    health,
    identity,
    installControl: installInspect.update,
    launcherAfterConfirm: postUpdateInspect.launcher,
    pptx,
    terminal: terminal.update,
    targetVersion,
  };
}

async function runInstallerFallbackAcceptance(options: {
  expectedCurrentVersion?: string;
  expectedStandaloneVersion?: string;
  expectedVersion: string | null;
  fixture: ToolsServeUpdaterFixture | null;
  installDir: string;
  nsisLogPath?: string;
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
    options.nsisLogPath ?? join(fixtureNamespaceRoot, 'logs', 'nsis.log'),
  );
  expect(install.code).toBe(0);
  assertWorkingWinInstallerOverwriteLog(install.nsisLogTail);
  process.env.OD_UPDATE_CURRENT_VERSION = targetVersion;

  const start = await runToolsPackJsonForVersion<WinStartResult>('start', targetVersion);
  expect(start.source).toBe('installed');
  expect(start.executablePath).toBe(join(options.installDir, 'Open Design.exe'));
  // The updater-owned installer may preserve the already-confirmed payload
  // desktop while replacing the physical outer. Verify continuity here; the
  // explicit full stop + installed-outer cold start below owns the stronger
  // process-generation assertion.
  const standaloneVersion = options.expectedStandaloneVersion ?? targetVersion;
  const postInstallInspect = await waitForHealthyDesktopShellVersion(
    targetVersion,
    standaloneVersion,
    null,
    false,
  );
  const health = assertHealthEvalValue(postInstallInspect.eval?.value);
  expect(health.status).toBe(200);
  expect(health.health.ok).toBe(true);
  expect(health.health.version).toBe(standaloneVersion);

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
  const coldInspect = await waitForHealthyDesktopShellVersion(
    targetVersion,
    standaloneVersion,
    postInstallInspect.status?.pid,
    false,
  );
  const coldHealth = assertHealthEvalValue(coldInspect.eval?.value);
  expect(coldHealth.status).toBe(200);
  expect(coldHealth.health.ok).toBe(true);
  expect(coldHealth.health.version).toBe(standaloneVersion);
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

async function runToolsPackJson<T>(action: string, extraArgs: string[] = []): Promise<T> {
  return runToolsPackJsonForVersion(action, releaseVersion, extraArgs);
}

async function runToolsPackJsonForVersion<T>(
  action: string,
  appVersion: string | null | undefined,
  extraArgs: string[] = [],
): Promise<T> {
  const args = [
    toolsPackBin,
    'win',
    action,
    '--dir',
    toolsPackDir,
    '--namespace',
    namespace,
    ...releaseAppVersionArgs(appVersion),
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

function assertWorkingWinInstallerOverwriteLog(lines: string[]): void {
  // The custom installer stages and validates the successor before moving the
  // old install aside, then rolls back both filesystem and launcher state on
  // any failure. Keep real packaged smoke aligned with those transaction
  // boundaries instead of accepting a successful process exit alone.
  expect(missingWorkingWinInstallerOverwriteMarkers(lines)).toEqual([]);
}

async function runDirectInstaller(
  installerPath: string,
  installDir: string,
  nsisLogPath = join(outputNamespaceRoot, 'logs', 'nsis.log'),
): Promise<DirectInstallerResult> {
  const previousLogLines = await readNsisLogLines(nsisLogPath);
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
            "& { $process = Start-Process -FilePath $env:OD_TEST_INSTALLER_PATH -ArgumentList '/S', $env:OD_TEST_INSTALL_DIR_ARG -Wait -PassThru -WindowStyle Hidden; exit $process.ExitCode }",
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
    nsisLogTail: (await readNsisLogLines(nsisLogPath)).slice(previousLogLines.length),
  };
}

async function readNsisLogLines(nsisLogPath = join(outputNamespaceRoot, 'logs', 'nsis.log')): Promise<string[]> {
  const raw = await readFile(nsisLogPath, 'utf8').catch(() => '');
  return raw.split(/\r?\n/).filter((line) => line.length > 0);
}

async function resolveLocalUpdateFixture(
  explicitBuildJsonPath?: string,
): Promise<{ installerPath: string; payloadPath: string; targetVersion: string }> {
  const fallbackBuildJsonPath = explicitBuildJsonPath == null
    ? resolveFallbackUpdateBuildJsonPath()
    : resolveFromWorkspace(explicitBuildJsonPath);
  if (fallbackBuildJsonPath == null) {
    throw new Error(
      'full packaged windows payload smoke requires update payload metadata; set OD_PACKAGED_E2E_WIN_UPDATE_METADATA_URL or provide windows-tools-pack-update-build.json next to OD_PACKAGED_E2E_BUILD_JSON_PATH',
    );
  }
  const updateBuild = JSON.parse(stripUtf8Bom(await readFile(fallbackBuildJsonPath, 'utf8'))) as {
    installerPath?: unknown;
    latestYmlPath?: unknown;
    payloadPath?: unknown;
  };
  if (typeof updateBuild.installerPath !== 'string' || updateBuild.installerPath.length === 0) {
    throw new Error(`upgrade build metadata missing installerPath: ${fallbackBuildJsonPath}`);
  }
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
    installerPath: resolveFromWorkspace(updateBuild.installerPath),
    payloadPath: resolveFromWorkspace(updateBuild.payloadPath),
    targetVersion,
  };
}

async function resolveMainBuildInstallerPath(): Promise<string> {
  const buildJsonPath = requireMigrationInput(
    'OD_PACKAGED_E2E_BUILD_JSON_PATH',
    normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_BUILD_JSON_PATH),
  );
  const build = JSON.parse(stripUtf8Bom(await readFile(resolveFromWorkspace(buildJsonPath), 'utf8'))) as {
    installerPath?: unknown;
  };
  if (typeof build.installerPath !== 'string' || build.installerPath.length === 0) {
    throw new Error(`Windows build metadata missing installerPath: ${buildJsonPath}`);
  }
  return resolveFromWorkspace(build.installerPath);
}

async function waitForDownloadedUpdater(
  expectedVersion: string | null,
  expectedArtifactType: UpdateFixtureMode,
  timeoutMs = 120_000,
  expectedCurrentVersion = updateScenario.expectedInstalledShellVersion,
): Promise<WinInspectResult> {
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
        expect(inspect.update.artifact?.type).toBe(expectedArtifactType);
        expect(inspect.update.channel).toBe(updateScenario.channel);
        expect(inspect.update.currentVersion).toBe(expectedCurrentVersion);
        return inspect;
      }
    } catch (error) {
      lastResult = error;
    }
    await delay(1000);
  }
  throw new Error(`external Windows updater did not download ${expectedArtifactType}: ${formatUnknown(lastResult)}`);
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

function settledLauncherGeneration(launcher: LauncherSnapshot, expectedVersion: string): number | null {
  const active = launcher.active;
  const lastSuccessful = launcher.lastSuccessful;
  if (
    active == null ||
    lastSuccessful == null ||
    active.version !== expectedVersion ||
    lastSuccessful.version !== expectedVersion ||
    active.generation !== lastSuccessful.generation ||
    launcher.attempt != null
  ) {
    return null;
  }
  if (launcher.handoff != null && (!isRecord(launcher.handoff) || launcher.handoff.state !== 'confirmed')) {
    return null;
  }
  return active.generation;
}

function resolveFallbackUpdateBuildJsonPath(): string | null {
  if (updateBuildJsonPath != null && updateBuildJsonPath !== '') return resolveFromWorkspace(updateBuildJsonPath);
  const mainBuildJsonPath = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_BUILD_JSON_PATH);
  if (mainBuildJsonPath == null || mainBuildJsonPath === '') return null;
  return join(dirname(resolveFromWorkspace(mainBuildJsonPath)), 'windows-tools-pack-update-build.json');
}

function assertToolsServeFixtureEnabled(platformName: string, value: string | null): void {
  if (value === 'tools-serve') return;
  throw new Error(
    `full packaged ${platformName} payload smoke requires explicit tools-serve fixture; set OD_PACKAGED_E2E_WIN_UPDATE_FIXTURE=tools-serve or provide OD_PACKAGED_E2E_WIN_UPDATE_METADATA_URL`,
  );
}

function assertUpdateVersionPresent(platformName: string, value: string | null): asserts value is string {
  if (value != null && value.length > 0) return;
  throw new Error(`full packaged ${platformName} payload smoke requires an explicit update target version with external update metadata`);
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
      const statusInspect = await runToolsPackJson<WinInspectResult>('inspect');
      lastResult = { inspect: statusInspect, step: 'status' };
      const fallback = await maybeCoreHealthFallback(statusInspect);
      if (fallback != null) return fallback;
      if (statusInspect.status?.state !== 'running') {
        await delay(1000);
        continue;
      }

      const readinessInspect = await runToolsPackJson<WinInspectResult>('inspect', ['--expr', readinessExpression]);
      lastResult = { inspect: readinessInspect, step: 'readiness' };
      if (readinessInspect.eval?.ok !== true) {
        await delay(1000);
        continue;
      }

      const inspect = await runToolsPackJson<WinInspectResult>('inspect', ['--expr', healthExpression]);
      lastResult = { inspect, step: 'health' };
      if (inspect.eval?.ok === true) {
        const value = asHealthEvalValue(inspect.eval.value);
        if (value?.status === 200 && value.health.ok === true && typeof value.health.version === 'string') return inspect;
      }
    } catch (error) {
      lastResult = error;
    }
    await delay(1000);
  }

  throw new Error(`packaged windows runtime did not become healthy: ${formatUnknown(lastResult)}`);
}

async function waitForCommittedPackagedClosureFixture(
  input: Parameters<typeof readCommittedPackagedClosureFixture>[0],
): Promise<PackagedClosureFixture> {
  const startedAt = Date.now();
  let lastError: unknown = null;

  while (Date.now() - startedAt < maxStartDurationMs) {
    try {
      return await readCommittedPackagedClosureFixture(input);
    } catch (error) {
      lastError = error;
      await delay(1000);
    }
  }

  throw new Error(`packaged windows runtime did not commit Closure: ${formatUnknown(lastError)}`);
}

async function maybeCoreHealthFallback(inspect: WinInspectResult): Promise<WinInspectResult | null> {
  if (!verifyCoreOnly) return null;
  if (inspect.status != null) return null;
  if (inspect.statusError == null || !inspect.statusError.includes('IPC request timed out')) return null;
  if (inspect.daemonStatus?.state !== 'running' || inspect.daemonStatus.url == null) return null;
  if (inspect.webStatus?.state !== 'running' || inspect.webStatus.url == null) return null;

  const health = await fetchPackagedHealth(inspect.daemonStatus.url);
  if (health.status !== 200 || health.health.ok !== true) return null;
  return {
    ...inspect,
    desktopIpcUnavailable: true,
    eval: {
      ok: true,
      value: health,
    },
    status: {
      ...(inspect.daemonStatus.pid == null ? {} : { pid: inspect.daemonStatus.pid }),
      state: 'running',
      title: null,
      url: inspect.webStatus.url,
      windowVisible: false,
    },
  };
}

async function fetchPackagedHealth(daemonUrl: string): Promise<HealthEvalValue> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(new URL('/api/health', daemonUrl), { signal: controller.signal });
    return {
      health: await response.json() as HealthEvalValue['health'],
      href: daemonUrl,
      status: response.status,
      title: 'Open Design Beta',
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * What the running daemon reports for `onboardingCompleted`.
 *
 * This is the seed's actual postcondition. `seedPackagedOnboardingComplete`
 * writes `<runtimeNamespaceRoot>/data/app-config.json`, and on a
 * `tools-pack win start` the daemon resolves the same path — `tools-pack`
 * rewrites the launch config's `namespaceBaseRoot` to the tools-pack runtime
 * root (tools/pack/src/win/lifecycle.ts) and `shells/electron/src/paths.ts`
 * derives `join(namespaceBaseRoot, namespace, 'data')` from it. So a healthy
 * seeded start MUST report true, and anything else is a real data-root
 * regression rather than a test-fixture detail.
 */
async function readPackagedOnboardingConfig(): Promise<unknown> {
  const inspect = await runToolsPackJson<WinInspectResult>('inspect', [
    '--expr',
    packagedOnboardingConfigExpression,
  ]);
  if (inspect.eval?.ok !== true) {
    throw new PackagedOnboardingConfigError(`the renderer could not evaluate the probe: ${formatUnknown(inspect)}`);
  }
  // Returns the raw probe outcome. Interpretation belongs to the scenario, not
  // to the reader: an absent key means different things to a first run and to a
  // run that seeded completion.
  return inspect.eval.value;
}

/**
 * One reading of the packaged renderer's app shell.
 *
 * Throws on an eval that did not run, so the settle loop records the whole
 * inspect payload as the failure cause rather than an empty observation.
 */
async function observePackagedAppShell(): Promise<unknown> {
  const inspect = await runToolsPackJson<WinInspectResult>('inspect', ['--expr', packagedAppShellExpression]);
  if (inspect.eval?.ok !== true) {
    throw new Error(`packaged windows renderer could not evaluate the app-shell probe: ${formatUnknown(inspect)}`);
  }
  return inspect.eval.value;
}

async function waitForHealthyDesktopVersion(
  expectedVersion: string,
  previousPid: number | null | undefined,
  requireSettledLauncher = true,
): Promise<WinInspectResult> {
  return await waitForHealthyDesktopShellVersion(
    expectedVersion,
    expectedVersion,
    previousPid,
    requireSettledLauncher,
  );
}

async function waitForHealthyDesktopShellVersion(
  expectedShellVersion: string,
  expectedStandaloneVersion: string,
  previousPid: number | null | undefined,
  requireSettledLauncher = true,
): Promise<WinInspectResult> {
  const timeoutMs = maxStartDurationMs;
  const startedAt = Date.now();
  let lastResult: unknown = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const statusInspect = await runToolsPackJson<WinInspectResult>('inspect');
      lastResult = { inspect: statusInspect, step: 'status' };
      if (statusInspect.status?.state !== 'running') {
        await delay(1000);
        continue;
      }

      const readinessInspect = await runToolsPackJson<WinInspectResult>('inspect', ['--expr', readinessExpression]);
      lastResult = { inspect: readinessInspect, step: 'readiness' };
      if (readinessInspect.eval?.ok !== true) {
        await delay(1000);
        continue;
      }

      const inspect = await runToolsPackJson<WinInspectResult>('inspect', ['--expr', healthExpression]);
      lastResult = { inspect, step: 'health' };
      if (inspect.eval?.ok === true) {
        const value = asHealthEvalValue(inspect.eval.value);
        if (
          value?.status === 200 &&
          value.health.ok === true &&
          value.health.version === expectedStandaloneVersion &&
          (previousPid == null || inspect.status?.pid !== previousPid) &&
          (!requireSettledLauncher || settledLauncherGeneration(inspect.launcher, expectedShellVersion) != null)
        ) {
          return inspect;
        }
      }
    } catch (error) {
      lastResult = error;
    }
    await delay(1000);
  }

  throw new Error(
    `packaged Windows Shell ${expectedShellVersion} did not relaunch with Standalone ${expectedStandaloneVersion}: ${formatUnknown(lastResult)}`,
  );
}

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
    const config = JSON.parse(await readFile(configPath, 'utf8')) as { shellVersion?: string };
    config.shellVersion = bumpedVersion;
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

function assertClosureDesktopIdentity(
  identity: DesktopIdentityMarker,
  standaloneVersion: string,
  releaseVersion: string = standaloneVersion,
): void {
  if (identity.runtime?.descriptor?.standalone?.version !== standaloneVersion) {
    throw new Error(`packaged Windows did not attach the seeded Closure: ${formatUnknown(identity.runtime)}`);
  }
  expect(identity.runtime.descriptor).toMatchObject({
    release: { version: releaseVersion },
    standalone: { protocolVersion: 1, version: standaloneVersion },
  });
  expect(identity.runtime.descriptor).not.toHaveProperty('shell');
  expect(identity.runtime.descriptor.standalone?.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(identity.runtime.descriptorDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(identity.runtime.generation).toBeGreaterThanOrEqual(0);
  expect(identity.runtime.scope?.generation).toBe(identity.runtime.generation);
  expect(identity.runtime.standalonePid).toBeGreaterThan(0);
}

async function assertPayloadDesktopIdentity(
  identity: DesktopIdentityMarker,
  launcher: LauncherSnapshot,
  shellVersion: string,
  standaloneVersion: string,
  releaseVersion: string,
  legacyInstalledExecutablePath?: string,
): Promise<void> {
  const payloadRoot = join(launcher.versionsRoot, shellVersion, 'payload');
  expect(identity.pid).toBeGreaterThan(0);
  expect(identity.runtime?.descriptor).toMatchObject({
    release: { version: releaseVersion },
    standalone: { protocolVersion: 1, version: standaloneVersion },
  });
  expect(identity.runtime?.descriptor).not.toHaveProperty('shell');
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

function asPackagedOnboardingEvalValue(value: unknown): PackagedOnboardingEvalValue | null {
  if (!isRecord(value)) return null;
  if (typeof value.cloudSignInVisible !== 'boolean') return null;
  if (typeof value.href !== 'string') return null;
  if (typeof value.onboardingVisible !== 'boolean') return null;
  if (value.text != null && typeof value.text !== 'string') return null;
  if (typeof value.title !== 'string') return null;
  return value as PackagedOnboardingEvalValue;
}

function expectPathInside(filePath: string, expectedRoot: string): void {
  const normalizedPath = resolve(filePath);
  const normalizedRoot = resolve(expectedRoot);
  expect(
    normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}${sep}`),
    `${normalizedPath} should be inside ${normalizedRoot}`,
  ).toBe(true);
}

function expectWindowsPackagedAppUrl(value: string | null | undefined): void {
  // The health probe races the SPA's first-run redirect. Both the app root and
  // its dedicated onboarding route are Shell-owned `od://` surfaces; pinning
  // only the pre-redirect root makes a healthy cold start nondeterministic.
  expect(value).toEqual(expect.stringMatching(/^od:\/\/app\/(?:onboarding)?$/));
}

function expectWindowsPackagedRouteUrl(value: string | null | undefined): void {
  expect(packagedAppRouteUrl(value), `${String(value)} should be an od://app/* packaged renderer URL`).toBe(true);
}

function expectWindowsHealthyRendererUrl(value: string | null | undefined): void {
  expect(value).toEqual(expect.stringMatching(/^od:\/\/app\/(?:onboarding)?$/));
}

function expectWindowsFallbackWebUrl(value: string | null | undefined): void {
  expect(value).toEqual(expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/?$/));
}

function expectWindowsDaemonUrl(value: string | null | undefined): void {
  expect(value).toEqual(expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/?$/));
}

async function assertWindowsInviteProtocolRegistration(installDir: string): Promise<void> {
  const { stdout } = await execFileAsync('reg.exe', [
    'query',
    'HKCU\\Software\\Classes\\opendesign\\shell\\open\\command',
    '/ve',
  ]);
  const command = stdout.match(/REG_SZ\s+(.+)$/mi)?.[1]?.trim();
  expect(command).toBe(`"${join(installDir, 'Open Design.exe')}" "%1"`);
  expect(command?.toLowerCase()).not.toContain('\\versions\\');
}

async function invokeWindowsInviteDeeplink(): Promise<void> {
  const escaped = packagedInviteDeeplink.replaceAll("'", "''");
  await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Start-Process -FilePath '${escaped}'`,
  ]);
}

type InviteContinuationResult = {
  ok: boolean;
  reason?: string;
  status?: number;
};

async function countInviteContinuationResults(): Promise<number> {
  return (await readInviteContinuationResults()).length;
}

async function waitForInviteContinuationResult(
  priorCount: number,
  timeoutMs = 30_000,
): Promise<InviteContinuationResult> {
  const startedAt = Date.now();
  let lastCount = priorCount;
  while (Date.now() - startedAt < timeoutMs) {
    const results = await readInviteContinuationResults();
    lastCount = results.length;
    if (results.length > priorCount) return results.at(-1)!;
    await delay(250);
  }
  throw new Error(
    `invite deeplink did not produce a continuation result within ${timeoutMs}ms (before=${priorCount}, after=${lastCount})`,
  );
}

async function readInviteContinuationResults(): Promise<InviteContinuationResult[]> {
  const logPath = join(runtimeNamespaceRoot, 'logs', 'desktop', 'latest.log');
  const content = await readFile(logPath, 'utf8').catch(() => '');
  const results: InviteContinuationResult[] = [];
  for (const line of content.split(/\r?\n/u)) {
    if (line.trim().length === 0) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line) as unknown;
    } catch {
      continue;
    }
    if (!isRecord(entry) || entry.message !== 'console.info' || !isRecord(entry.meta)) continue;
    const args = entry.meta.args;
    if (!Array.isArray(args) || args[0] !== '[open-design desktop] invite deeplink continuation completed') continue;
    const outcome = args[1];
    if (!isRecord(outcome) || typeof outcome.ok !== 'boolean') continue;
    results.push({
      ok: outcome.ok,
      ...(typeof outcome.reason === 'string' ? { reason: outcome.reason } : {}),
      ...(typeof outcome.status === 'number' ? { status: outcome.status } : {}),
    });
  }
  return results;
}

async function assertWindowsInviteProtocolRemoved(): Promise<void> {
  await expect(
    execFileAsync('reg.exe', [
      'query',
      'HKCU\\Software\\Classes\\opendesign',
    ]),
  ).rejects.toMatchObject({ code: 1 });
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

/**
 * `publish=false` release acceptance cannot discover the Closure it has just
 * built through remote channel metadata. Commit those exact workflow bytes to
 * the local Store before the first Shell boot; every later restart/update in
 * the scenario must reuse the committed binding without further test help.
 */
async function seedConfiguredPackagedClosure(): Promise<void> {
  if (closureBuildJsonPath == null) return;
  await seedPackagedClosureFixture({
    buildJsonPath: closureBuildJsonPath,
    channel: updateScenario.channel,
    expectedPlatform: 'win32-x64',
    installationRoot: join(toolsPackDir, 'runtime', 'win'),
    namespace,
    workspaceRoot,
  });
}

async function readPackagedClosureBinding(): Promise<Record<string, unknown>> {
  const bindingPath = join(
    toolsPackDir,
    'runtime',
    'win',
    'closure',
    'channels',
    updateScenario.channel,
    'namespaces',
    namespace,
    'state',
    'binding.json',
  );
  const value = JSON.parse(stripUtf8Bom(await readFile(bindingPath, 'utf8'))) as unknown;
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`packaged Windows Closure binding is invalid: ${bindingPath}`);
  }
  return value as Record<string, unknown>;
}

function isPathInside(filePath: string, expectedRoot: string): boolean {
  const normalizedPath = normalizePathForComparison(resolve(filePath));
  const normalizedRoot = normalizePathForComparison(resolve(expectedRoot));
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}${sep}`);
}

function normalizePathForComparison(filePath: string): string {
  return process.platform === 'win32' ? filePath.toLowerCase() : filePath;
}

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

function resolveFromWorkspace(filePath: string): string {
  return isAbsolute(filePath) ? filePath : resolve(workspaceRoot, filePath);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(path);
  await new Promise<void>((resolveHash, rejectHash) => {
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', rejectHash);
    stream.once('end', resolveHash);
  });
  return hash.digest('hex');
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

function requireMigrationInput(name: string, value: string | null | undefined): string {
  if (value != null && value.length > 0) return value;
  throw new Error(`full historical migration acceptance requires ${name}`);
}

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
