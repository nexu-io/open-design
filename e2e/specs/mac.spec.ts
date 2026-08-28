// @vitest-environment node

import { execFile } from 'node:child_process';
import { access, chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { createFakeAgentRuntimes } from '@/fake-agents';
import { T } from '@/timeouts';
import {
  assertPackagedHomeFirstRunResult,
  PACKAGED_HOME_FIRST_RUN_OUTPUT,
  PACKAGED_HOME_FIRST_RUN_PROMPT,
  packagedHomeFirstRunExpression,
  packagedHomeFirstRunSnapshotExpression,
  packagedHomeFirstRunSubmitExpression,
  type PackagedHomeFirstRunResult,
} from '@/vitest/packaged-home-first-run';
import { createPackagedSmokeReport } from '@/vitest/packaged-report';
import {
  assertPackagedPtySmokeResult,
  packagedPtySmokeExpression,
} from '@/vitest/packaged-pty-smoke';
import { releaseAppVersionArgs } from '@/vitest/packaged-release-version';
import {
  applyPackagedUpdateEnv,
  resolvePackagedUpdateScenario,
} from '@/vitest/packaged-update-scenario';
import { resolvePackagedSmokeNamespace } from '@/vitest/suite';
import { startToolsServeUpdaterFixture, type ToolsServeUpdaterFixture } from '@/vitest/tools-serve-updater-fixture';
import { createDesktopHarness, STORAGE_KEY, waitFor } from '../lib/desktop/desktop-test-helpers.ts';

const execFileAsync = promisify(execFile);
const e2eRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = dirname(e2eRoot);
const toolsPackDir = resolveFromWorkspace(process.env.OD_PACKAGED_E2E_TOOLS_PACK_DIR ?? '.tmp/tools-pack');
const namespace = resolvePackagedSmokeNamespace('mac');
const releaseChannel = process.env.OD_PACKAGED_E2E_RELEASE_CHANNEL;
const releaseVersion = process.env.OD_PACKAGED_E2E_RELEASE_VERSION;
const updateScenario = resolvePackagedUpdateScenario({ releaseChannel, releaseVersion });
const toolsPackReleaseVersionArgs = releaseAppVersionArgs(releaseVersion);
const pnpmCommand = process.env.OD_E2E_PNPM_COMMAND ?? 'pnpm';
const screenshotPath = join(toolsPackDir, 'screenshots', `${namespace}.png`);
const smokeProfile = process.env.OD_PACKAGED_E2E_MAC_SMOKE_PROFILE ?? 'core';
const verifyCoreOnly = smokeProfile === 'core';
const updateMetadataUrl = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_MAC_UPDATE_METADATA_URL);
const updateVersion = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_MAC_UPDATE_VERSION);
const updateBuildJsonPath = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_MAC_UPDATE_BUILD_JSON_PATH);
const updateFixture = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_MAC_UPDATE_FIXTURE);
const packagedInviteDeeplink =
  'opendesign://workspace/invite/continue?workspace_id=packaged-smoke-workspace&member_id=packaged-smoke-member&invite_id=packaged-smoke-invite&nonce=packaged-smoke-nonce';

const outputNamespaceRoot = join(toolsPackDir, 'out', 'mac', 'namespaces', namespace);
const runtimeNamespaceRoot = join(toolsPackDir, 'runtime', 'mac', 'namespaces', namespace);
const healthExpression = `
  (async () => {
    const response = await fetch('/api/health');
    return {
      health: await response.json(),
      href: location.href,
      status: response.status,
      title: document.title,
    };
  })()
`;
const pptxArchiveInspectionSource = `
  async function inspectPptxArchive(bytes, expectedText) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
      if (view.getUint32(offset, true) === 0x06054b50) { eocd = offset; break; }
    }
    if (eocd < 0) throw new Error('PPTX end-of-central-directory record not found');
    const entries = new Map();
    const entryCount = view.getUint16(eocd + 10, true);
    let offset = view.getUint32(eocd + 16, true);
    const decoder = new TextDecoder();
    for (let index = 0; index < entryCount; index += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('invalid PPTX central-directory entry');
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
      entries.set(name, {
        compressedSize: view.getUint32(offset + 20, true),
        localOffset: view.getUint32(offset + 42, true),
        method: view.getUint16(offset + 10, true),
      });
      offset += 46 + nameLength + extraLength + commentLength;
    }
    async function readText(name) {
      const entry = entries.get(name);
      if (!entry) throw new Error('missing PPTX entry: ' + name);
      const nameLength = view.getUint16(entry.localOffset + 26, true);
      const extraLength = view.getUint16(entry.localOffset + 28, true);
      const start = entry.localOffset + 30 + nameLength + extraLength;
      const compressed = bytes.slice(start, start + entry.compressedSize);
      if (entry.method === 0) return decoder.decode(compressed);
      if (entry.method !== 8) throw new Error('unsupported PPTX compression method: ' + entry.method);
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return decoder.decode(await new Response(stream).arrayBuffer());
    }
    const slideNames = Array.from(entries.keys())
      .filter((name) => /^ppt\\/slides\\/slide\\d+\\.xml$/.test(name))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    const slides = await Promise.all(slideNames.map(readText));
    return {
      hasContentTypes: entries.has('[Content_Types].xml'),
      hasPresentation: entries.has('ppt/presentation.xml'),
      slideCount: slideNames.length,
      textMatches: expectedText.map((text, index) => slides[index]?.includes(text) === true),
    };
  }
`;
const upgradePersistenceProjectId = `packaged-upgrade-persistence-${Date.now().toString(36)}`;
const upgradePersistenceSeedExpression = `
  (async () => {
    const projectId = ${JSON.stringify(upgradePersistenceProjectId)};
    const html = '<!doctype html><html><head><style>' +
      'html,body{margin:0}.slide{width:1920px;height:1080px;display:flex;align-items:center;justify-content:center;font:96px sans-serif;color:white}' +
      '.slide:first-child{background:#17324d}.slide:last-child{background:#8b3a2b}' +
      '</style></head><body><section class="slide">Upgrade From Outer</section><section class="slide">Persistence Check</section></body></html>';
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
    ${pptxArchiveInspectionSource}
    const projectId = ${JSON.stringify(projectId)};
    const exported = await fetch('/api/projects/' + encodeURIComponent(projectId) + '/export/pptx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'deck.html', editable: true }),
    });
    const bytes = new Uint8Array(await exported.arrayBuffer());
    const archive = await inspectPptxArchive(bytes, ['Upgrade From Outer', 'Persistence Check']);
    return {
      archive,
      byteLength: bytes.length,
      contentType: exported.headers.get('content-type'),
      magic: String.fromCharCode(...bytes.slice(0, 2)),
      projectId,
      status: exported.status,
    };
  })()
  `;
}
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
  (() => {
    const button = document.querySelector('[data-testid="entry-nav-updater"]');
    if (!(button instanceof HTMLButtonElement)) return { clicked: false, reason: 'missing-updater-rail' };
    if (button.getAttribute('aria-disabled') === 'true') return { clicked: false, reason: 'updater-rail-disabled' };
    button.click();
    return { clicked: true };
  })()
`;
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

type MacInstallResult = {
  detached: boolean;
  dmgPath: string;
  installedAppPath: string;
  mountPoint: string;
  namespace: string;
};

type MacStartResult = {
  appPath: string;
  executablePath: string;
  logPath: string;
  namespace: string;
  pid: number;
  source: string;
  status: DesktopStatus | null;
};

type MacStopResult = {
  namespace: string;
  remainingPids: number[];
  status: string;
};

type MacUninstallResult = {
  installedAppPath: string;
  namespace: string;
  removed: boolean;
  stop: MacStopResult;
};

type MacInspectResult = {
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

type NativeChromeActionProbe = {
  clickCount: number;
  targetMatches: boolean;
  x: number;
  y: number;
};

type LauncherPointer = {
  generation: number;
  version: string;
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

type PptxExportEvalValue = {
  archive: {
    hasContentTypes: boolean;
    hasPresentation: boolean;
    slideCount: number;
    textMatches: boolean[];
  };
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
  version: number;
};

type PayloadRuntimeAcceptance = {
  coldStart: {
    health: HealthEvalValue;
    identity: DesktopIdentityMarker;
    launcher: LauncherSnapshot;
    pptx: PptxExportEvalValue;
    start: MacStartResult;
  };
  identity: DesktopIdentityMarker;
  pptx: PptxExportEvalValue;
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

type UpdaterRecoverySummary = {
  cleared: NonNullable<MacInspectResult['update']>;
  downloadedBeforeClear: NonNullable<MacInspectResult['update']>;
  dryRunInstall: MacInspectResult['update'] | null;
  popup: UpdaterPopupEvalValue;
  recovered: NonNullable<MacInspectResult['update']>;
};

type PackagedOnboardingEvalValue = {
  cloudSignInVisible: boolean;
  href: string;
  onboardingVisible: boolean;
  text: string | null;
  title: string;
};

const shouldRunPackagedMacSmoke = process.platform === 'darwin' && process.env.OD_PACKAGED_E2E_MAC === '1';
const macDescribe = shouldRunPackagedMacSmoke ? describe : describe.skip;
const shouldRunPackagedMacOnboardingSmoke =
  shouldRunPackagedMacSmoke && process.env.OD_PACKAGED_E2E_MAC_ONBOARDING_SMOKE === '1';
const macOnboardingDescribe = shouldRunPackagedMacOnboardingSmoke ? describe : describe.skip;
const shouldRunDesktopMacSmoke = process.platform === 'darwin' && process.env.OD_DESKTOP_SMOKE === '1';
const desktopMacDescribe = shouldRunDesktopMacSmoke ? describe : describe.skip;

macDescribe('packaged mac runtime smoke', () => {
  let installedAppPath: string | null = null;
  let started = false;

  test('[P0] @electron-smoke cold first Home run renders assistant output without refresh or workspace-tab switching', async () => {
    const fakeAgentRoot = join(toolsPackDir, 'fixtures', `home-first-run-${namespace}`);
    let firstRunInstalledAppPath: string | null = null;
    let firstRunStarted = false;
    try {
      await resetPackagedRuntimeState();
      const fakeAgents = await createFakeAgentRuntimes({
        root: fakeAgentRoot,
        runtimeIds: ['codex'],
      });
      const install = await runToolsPackJson<MacInstallResult>('install');
      firstRunInstalledAppPath = install.installedAppPath;
      await seedPackagedHomeFirstRunConfig(fakeAgents.codex.env);

      const start = await runToolsPackJson<MacStartResult>('start');
      firstRunStarted = true;
      expect(start.source).toBe('installed');
      await waitForHealthyDesktop();
      await assertFirstNativeChromeActionClick();

      const setup = await runToolsPackJson<MacInspectResult>('inspect', [
        '--expr',
        packagedHomeFirstRunExpression(),
      ]);
      if (setup.eval?.ok !== true) {
        throw new Error(`packaged first Home run setup failed: ${formatUnknown(setup.eval)}`);
      }
      expect(setup.eval.value).toMatchObject({
        inputTextBeforeSubmit: PACKAGED_HOME_FIRST_RUN_PROMPT,
        submitClicked: false,
      });

      await waitForPackagedHomeFirstRunSubmit();
      const firstRun = await waitForPackagedHomeFirstRunOutput();
      expect(firstRun.submitClicked).toBe(true);
      expect(firstRun.projectId).toEqual(expect.any(String));
      expect(firstRun.hrefBefore).toMatch(/^(od:\/\/app\/|http:\/\/127\.0\.0\.1:\d+\/$)/);
      expect(firstRun.hrefAfter).toContain(`/projects/${firstRun.projectId}`);
      expect(firstRun.injectedAuthorityOutageCount).toBe(1);
      expect(firstRun.createRunRequestCount).toBeGreaterThanOrEqual(2);
      expect(firstRun.createRunResponseStatuses[0]).toBe(503);
      expect(firstRun.createRunResponseStatuses.at(-1)).toBeGreaterThanOrEqual(200);
      expect(firstRun.createRunResponseStatuses.at(-1)).toBeLessThan(300);
      expect(firstRun.runEventRequestCount).toBeGreaterThan(0);
      expect(firstRun.runEventResponseStatuses).toContain(200);
      expect(firstRun.runEventsContainExpectedOutput).toBe(true);
      expect(firstRun.daemonAssistantText).toContain(PACKAGED_HOME_FIRST_RUN_OUTPUT);
      expect(firstRun.assistantText).toContain(PACKAGED_HOME_FIRST_RUN_OUTPUT);
      expect(firstRun.workspaceTabClicksBeforeOutput).toBe(0);
      expect(firstRun.navigationEntryCountAfter).toBe(firstRun.navigationEntryCountBefore);
      expect(firstRun.performanceTimeOriginAfter).toBe(firstRun.performanceTimeOriginBefore);
    } finally {
      if (firstRunStarted || firstRunInstalledAppPath != null) {
        await runToolsPackJson<MacUninstallResult>('uninstall').catch((error: unknown) => {
          console.error('failed to uninstall packaged first-Home-run app during cleanup', error);
        });
      }
      await rm(fakeAgentRoot, { force: true, recursive: true }).catch(() => undefined);
    }
  }, 180_000);

  test('installs, starts, inspects, stops, and uninstalls the built mac artifact', async () => {
    const report = await createPackagedSmokeReport('mac');
    const updateEnv = captureUpdateEnv();
    let payloadFixture: ToolsServeUpdaterFixture | null = null;
    let recoveryFixture: ToolsServeUpdaterFixture | null = null;
    let recoveryPayloadPath: string | null = null;
    let logs: LogsResult | { skipped: true } = { skipped: true };
    let popup: UpdaterPopupEvalValue | { skipped: true } = { skipped: true };
    let updateInstall: NonNullable<MacInspectResult['update']> | { skipped: true } = { skipped: true };
    let updateStatus: NonNullable<MacInspectResult['update']> | { skipped: true } = { skipped: true };
    let payloadRuntime: PayloadRuntimeAcceptance | { skipped: true } = { skipped: true };
    let updaterRecovery: UpdaterRecoverySummary | { skipped: true } = { skipped: true };
    let upgradePersistence: UpgradePersistenceSeed | { skipped: true } = { skipped: true };
    let passed = false;
    try {
      await resetPackagedRuntimeState();
      const install = await runToolsPackJson<MacInstallResult>('install');
      installedAppPath = install.installedAppPath;

      expect(install.namespace).toBe(namespace);
      expect(install.detached).toBe(true);
      expectPathInside(install.dmgPath, join(outputNamespaceRoot, 'dmg'));
      expectPathInside(install.installedAppPath, join(outputNamespaceRoot, 'install', 'Applications'));
      await assertMacInviteProtocolRegistration(install.installedAppPath);

      await seedPackagedOnboardingComplete();

      let expectedPayloadUpdateVersion: string | null = updateVersion;
      if (!verifyCoreOnly) {
        if (updateMetadataUrl != null && updateMetadataUrl !== '') {
          assertUpdateVersionPresent('mac', updateVersion);
          applyPackagedUpdateEnv(process.env, updateScenario, updateMetadataUrl, { openDryRun: false });
        } else {
          assertToolsServeFixtureEnabled('mac', updateFixture);
          const localPayload = await resolveLocalPayloadUpdateFixture();
          expectedPayloadUpdateVersion = localPayload.targetVersion;
          recoveryPayloadPath = localPayload.payloadPath;
          payloadFixture = await startToolsServeUpdaterFixture({
            channel: updateScenario.channel,
            payloadPath: localPayload.payloadPath,
            platform: 'mac',
            version: localPayload.targetVersion,
            workspaceRoot,
          });
          applyPackagedUpdateEnv(process.env, updateScenario, payloadFixture.info.metadataUrl, { openDryRun: false });
        }
      }

      const start = await runToolsPackJson<MacStartResult>('start');
      started = true;

      expect(start.namespace).toBe(namespace);
      expect(start.source).toBe('installed');
      expect(start.appPath).toBe(install.installedAppPath);
      expectPathInside(start.logPath, join(runtimeNamespaceRoot, 'logs', 'desktop'));
      expect(start.pid).toBeGreaterThan(0);
      // `tools-pack mac start` performs a best-effort status probe before
      // returning, but GitHub's macOS runners can take longer than that probe
      // window to make the packaged desktop IPC-ready. Keep validating a
      // non-null immediate status when available, then use the longer health
      // polling below as the authoritative startup check.
      if (start.status != null) {
        expect(start.status.state).toBe('running');
      }

      const inspect = await waitForHealthyDesktop();
      expect(inspect.status?.state).toBe('running');
      expect(inspect.status?.url).toMatch(/^(od:\/\/app\/|http:\/\/127\.0\.0\.1:\d+\/)/);

      const value = assertHealthEvalValue(inspect.eval?.value);
      expect(value.href).toMatch(/^(od:\/\/app\/|http:\/\/127\.0\.0\.1:\d+\/)/);
      expect(value.status).toBe(200);
      expect(value.health.ok).toBe(true);
      if (updateScenario.currentVersionOverride == null) {
        expect(value.health.version).toBe(updateScenario.expectedCurrentVersion);
      } else {
        expect(value.health.version).toEqual(expect.any(String));
      }
      const ptyInspect = await runToolsPackJson<MacInspectResult>('inspect', [
        '--expr',
        packagedPtySmokeExpression('darwin'),
      ]);
      const pty = assertPackagedPtySmokeResult(ptyInspect.eval?.value);
      expect(pty.projectCreateStatus).toBe(200);
      expect(pty.projectSeedStatus).toBe(200);
      expect(pty.terminalCreateStatus).toBe(200);
      expect(pty.stdinStatus).toBe(200);
      expect(pty.output).toContain(pty.marker);
      expect(pty.exitCode, JSON.stringify(pty, null, 2)).toBe(0);
      expect(pty.cleanup.terminalStatus).toBe(200);
      expect(pty.cleanup.projectStatus).toBe(200);
      assertLauncherPointer(inspect.launcher.active, updateScenario.expectedCurrentVersion, 0, 'initial active');
      assertLauncherPointer(inspect.launcher.lastSuccessful, updateScenario.expectedCurrentVersion, 0, 'initial lastSuccessful');

      const protocolHotPid = inspect.status?.pid ?? start.pid;
      await invokeMacInviteDeeplink(install.installedAppPath);
      const protocolHotInspect = await waitForHealthyDesktop();
      expect(protocolHotInspect.status?.pid).toBe(protocolHotPid);

      if (verifyCoreOnly) {
        const protocolStop = await runToolsPackJson<MacStopResult>('stop');
        started = false;
        expect(protocolStop.status).not.toBe('partial');
        expect(protocolStop.remainingPids).toEqual([]);

        await invokeMacInviteDeeplink(install.installedAppPath);
        started = true;
        const protocolColdInspect = await waitForHealthyDesktop();
        expect(protocolColdInspect.status?.state).toBe('running');
        expect(protocolColdInspect.status?.pid).not.toBe(protocolHotPid);
      }

      if (!verifyCoreOnly) {
        const updaterVersion = expectedPayloadUpdateVersion;
        if (updaterVersion == null || updaterVersion.length === 0) {
          throw new Error('full packaged mac payload smoke requires an update target version');
        }
        const persistenceInspect = await runToolsPackJson<MacInspectResult>('inspect', [
          '--expr',
          upgradePersistenceSeedExpression,
        ]);
        const persistence = assertUpgradePersistenceSeed(persistenceInspect.eval?.value);
        upgradePersistence = persistence;
        const readyUpdate = await waitForUpdaterStatus(
          (status) =>
            status.update?.state === 'downloaded' &&
            status.update.availableVersion === updaterVersion &&
            status.update.artifact?.type === 'payload' &&
            typeof status.update.downloadPath === 'string',
          'ready updater prompt update downloaded',
        );
        expect(readyUpdate.update?.downloadPath).toEqual(expect.any(String));
        expectPathInside(readyUpdate.update?.downloadPath ?? '', join(runtimeNamespaceRoot, 'updates'));

        popup = await openReadyUpdaterPrompt(updaterVersion);
        expect(popup.visible).toBe(true);
        expect(popup.title).toEqual(expect.any(String));
        expect(popup.title?.trim().length).toBeGreaterThan(0);
        expect(popup.installButtonVisible).toBe(true);
        expect(popup.text ?? '').toContain(updaterVersion);
        expect(popup.text ?? '').not.toMatch(/installer|安装器/i);

        const updateInspect = await runToolsPackJson<MacInspectResult>('inspect', ['--update-action', 'status']);
        expect(updateInspect.update?.state).toBe('downloaded');
        expect(updateInspect.update?.artifact?.type).toBe('payload');
        expect(updateInspect.update?.channel).toBe(updateScenario.channel);
        expect(updateInspect.update?.currentVersion).toBe(updateScenario.expectedCurrentVersion);
        expect(updateInspect.update?.availableVersion).toBe(updaterVersion);
        expectPathInside(updateInspect.update?.downloadPath ?? '', join(runtimeNamespaceRoot, 'updates'));
        if (updateInspect.update == null) throw new Error('mac update status is missing');
        updateStatus = updateInspect.update;

        const clickInstall = await runToolsPackJson<MacInspectResult>('inspect', ['--expr', clickUpdaterInstallExpression]);
        const clickValue = assertUpdaterClickEvalValue(clickInstall.eval?.value);
        expect(clickValue.clicked).toBe(true);
        const postUpdateInspect = await waitForHealthyDesktopVersion(updaterVersion, start.pid);
        started = true;
        const postUpdateHealth = assertHealthEvalValue(postUpdateInspect.eval?.value);
        expect(postUpdateHealth.status).toBe(200);
        expect(postUpdateHealth.health.ok).toBe(true);
        expect(postUpdateHealth.health.version).toBe(updaterVersion);
        const confirmedGeneration = settledLauncherGeneration(postUpdateInspect.launcher, updaterVersion);
        if (confirmedGeneration == null) throw new Error('post-update launcher did not settle on the target version');
        assertLauncherPointer(
          postUpdateInspect.launcher.active,
          updaterVersion,
          confirmedGeneration,
          'post-relaunch active',
        );
        assertLauncherPointer(
          postUpdateInspect.launcher.lastSuccessful,
          updaterVersion,
          confirmedGeneration,
          'post-relaunch lastSuccessful',
        );
        const terminalUpdate = await waitForUpdaterStatus(
          (status) => status.update?.state === 'not-available' && status.update.currentVersion === updaterVersion,
          'post-relaunch updater terminal state',
        );
        if (terminalUpdate.update == null) throw new Error('mac terminal update status is missing');
        updateInstall = terminalUpdate.update;

        const identity = await readDesktopIdentityMarker();
        assertPayloadDesktopIdentity(identity, postUpdateInspect.launcher, updaterVersion);
        expect(postUpdateInspect.launcher.attempt).toBeNull();
        assertSettledDesktopHandoff(postUpdateInspect.launcher.handoff);

        const persistedPptxExpression = existingProjectPptxExportExpression(persistence.projectId);
        const pptxInspect = await runToolsPackJson<MacInspectResult>('inspect', ['--expr', persistedPptxExpression]);
        const pptx = assertPptxExportEvalValue(pptxInspect.eval?.value);
        expect(pptx.projectId).toBe(persistence.projectId);

        const coldStop = await runToolsPackJson<MacStopResult>('stop');
        started = false;
        expect(coldStop.status).not.toBe('partial');
        expect(coldStop.remainingPids).toEqual([]);

        const coldStart = await runToolsPackJson<MacStartResult>('start');
        started = true;
        expect(coldStart.source).toBe('installed');
        expect(coldStart.appPath).toBe(install.installedAppPath);
        const coldInspect = await waitForHealthyDesktopVersion(updaterVersion, identity.pid);
        const coldHealth = assertHealthEvalValue(coldInspect.eval?.value);
        expect(coldHealth.status).toBe(200);
        expect(coldHealth.health.ok).toBe(true);
        expect(coldHealth.health.version).toBe(updaterVersion);
        const coldGeneration = settledLauncherGeneration(coldInspect.launcher, updaterVersion);
        if (coldGeneration == null) throw new Error('cold-start launcher did not settle on the target version');
        expect(coldGeneration).toBeGreaterThanOrEqual(confirmedGeneration);
        assertLauncherPointer(coldInspect.launcher.active, updaterVersion, coldGeneration, 'cold-start active');
        assertLauncherPointer(
          coldInspect.launcher.lastSuccessful,
          updaterVersion,
          coldGeneration,
          'cold-start lastSuccessful',
        );
        expect(coldInspect.launcher.attempt).toBeNull();
        assertSettledDesktopHandoff(coldInspect.launcher.handoff);
        const coldIdentity = await readDesktopIdentityMarker();
        assertPayloadDesktopIdentity(coldIdentity, coldInspect.launcher, updaterVersion);
        expect(coldIdentity.pid).not.toBe(identity.pid);
        const coldPptxInspect = await runToolsPackJson<MacInspectResult>('inspect', ['--expr', persistedPptxExpression]);
        const coldPptx = assertPptxExportEvalValue(coldPptxInspect.eval?.value);
        expect(coldPptx.projectId).toBe(persistence.projectId);
        payloadRuntime = {
          coldStart: {
            health: coldHealth,
            identity: coldIdentity,
            launcher: coldInspect.launcher,
            pptx: coldPptx,
            start: coldStart,
          },
          identity,
          pptx,
        };

        // Same-version reinstall + clear-cache recovery (mirrors the Windows
        // lane's runSameVersionUpdaterRecoveryAcceptance): the physical outer
        // is still the base install while the running payload is already at
        // the target version, so only an installed-outer-aware floor can
        // offer this installer reinstall. macOS has no silent DMG install to
        // execute, so the installer open is asserted in dry-run mode instead
        // of the Windows NSIS transaction.
        if (recoveryPayloadPath != null) {
          await payloadFixture?.close().catch((error: unknown) => {
            console.error('failed to close payload update fixture before recovery', error);
          });
          payloadFixture = null;
          recoveryFixture = await startToolsServeUpdaterFixture({
            channel: updateScenario.channel,
            controlLauncherVersionMin: updaterVersion,
            controlLauncherVersionUrl: 'https://example.test/updater-recovery',
            payloadPath: recoveryPayloadPath,
            platform: 'mac',
            version: updaterVersion,
            workspaceRoot,
          });
          applyPackagedUpdateEnv(process.env, updateScenario, recoveryFixture.info.metadataUrl, { openDryRun: true });

          const recoveryStop = await runToolsPackJson<MacStopResult>('stop');
          started = false;
          expect(recoveryStop.status).not.toBe('partial');
          const recoveryStart = await runToolsPackJson<MacStartResult>('start');
          started = true;
          expect(recoveryStart.source).toBe('installed');
          await waitForHealthyDesktopVersion(updaterVersion, coldIdentity.pid);

          const reinstallReady = await waitForUpdaterStatus(
            (inspect) =>
              inspect.update?.state === 'downloaded' &&
              inspect.update.artifact?.type === 'dmg' &&
              inspect.update.availableVersion === updaterVersion,
            'same-version reinstall downloaded',
          );
          if (reinstallReady.update == null) throw new Error('same-version reinstall did not return updater status');
          expect(reinstallReady.update.currentVersion).toBe(updaterVersion);
          expect(reinstallReady.update.reinstall).toEqual({
            installedVersion: updateScenario.expectedCurrentVersion,
            minVersion: updaterVersion,
            reason: 'outer-below-min',
            url: 'https://example.test/updater-recovery',
          });

          const reinstallPopup = await openReadyUpdaterPrompt(updaterVersion);
          expect(reinstallPopup.visible).toBe(true);
          expect(reinstallPopup.installButtonVisible).toBe(true);
          expect(reinstallPopup.reinstallLinkVisible).toBe(true);

          const clearedInspect = await runToolsPackJson<MacInspectResult>('inspect', ['--update-action', 'clear-cache']);
          if (clearedInspect.update == null) throw new Error('clear-cache did not return updater status');
          expect(clearedInspect.update.state).toBe('idle');
          expect(clearedInspect.update.downloadPath).toBeUndefined();
          expect(clearedInspect.update.installResult).toBeUndefined();
          expect(clearedInspect.update.reinstall).toBeUndefined();
          // Retained launcher versions must survive a manual clear.
          expect(clearedInspect.launcher.active).toEqual(reinstallReady.launcher.active);
          expect(clearedInspect.launcher.lastSuccessful).toEqual(reinstallReady.launcher.lastSuccessful);

          // Recovery: an explicit re-check re-derives the reinstall offer and
          // re-downloads the installer artifact from the clean slate.
          await runToolsPackJson<MacInspectResult>('inspect', ['--update-action', 'check']);
          const recovered = await waitForUpdaterStatus(
            (inspect) =>
              inspect.update?.state === 'downloaded' &&
              inspect.update.artifact?.type === 'dmg' &&
              inspect.update.reinstall != null,
            'post-clear reinstall recovery',
          );
          if (recovered.update == null) throw new Error('post-clear recovery did not return updater status');

          const dryRunInstall = await runToolsPackJson<MacInspectResult>('inspect', ['--update-action', 'install']);
          expect(dryRunInstall.update?.installResult?.dryRun).toBe(true);

          // Leave a pristine updater behind for the final stop/uninstall.
          const resetInspect = await runToolsPackJson<MacInspectResult>('inspect', ['--update-action', 'clear-cache']);
          expect(resetInspect.update?.state).toBe('idle');

          updaterRecovery = {
            cleared: clearedInspect.update,
            downloadedBeforeClear: reinstallReady.update,
            dryRunInstall: dryRunInstall.update ?? null,
            popup: reinstallPopup,
            recovered: recovered.update,
          };
        }
      }

      await mkdir(dirname(screenshotPath), { recursive: true });
      const screenshot = await runToolsPackJson<MacInspectResult>('inspect', ['--path', screenshotPath]);
      expect(screenshot.screenshot?.path).toBe(screenshotPath);
      expect(await fileSizeBytes(screenshotPath)).toBeGreaterThan(0);
      await report.saveScreenshot(screenshotPath);

      if (!verifyCoreOnly) {
        logs = await runToolsPackJson<LogsResult>('logs');
        assertLogPathsAndContent(logs);
      }

      const stop = await runToolsPackJson<MacStopResult>('stop');
      started = false;
      expect(stop.namespace).toBe(namespace);
      expect(stop.status).not.toBe('partial');
      expect(stop.remainingPids).toEqual([]);

      const uninstall = await runToolsPackJson<MacUninstallResult>('uninstall');
      installedAppPath = null;
      expect(uninstall.namespace).toBe(namespace);
      expect(uninstall.installedAppPath).toBe(install.installedAppPath);
      expect(uninstall.removed).toBe(true);
      expect(await pathExists(install.installedAppPath)).toBe(false);
      await report.saveSummary({
        health: value,
        install: {
          detached: install.detached,
          dmgPath: install.dmgPath,
          installedAppPath: install.installedAppPath,
          mountPoint: install.mountPoint,
        },
        logs: 'skipped' in logs ? logs : summarizeLogs(logs),
        namespace,
        payloadRuntime,
        pty,
        screenshot: report.screenshotRelpath,
        start: {
          appPath: start.appPath,
          executablePath: start.executablePath,
          logPath: start.logPath,
          pid: start.pid,
          source: start.source,
          status: start.status,
        },
        stop,
        uninstall,
        update: {
          popup,
          status: updateStatus,
          install: updateInstall,
        },
        updaterRecovery,
        upgradePersistence,
      });
      passed = true;
    } finally {
      restoreUpdateEnv(updateEnv);
      await payloadFixture?.close().catch((error: unknown) => {
        console.error('failed to close payload update fixture', error);
      });
      await recoveryFixture?.close().catch((error: unknown) => {
        console.error('failed to close updater recovery fixture', error);
      });
      if (!passed) {
        await printPackagedLogs().catch((error: unknown) => {
          console.error('failed to read packaged mac logs after failure', error);
        });
      }

      if (started || installedAppPath != null) {
        await runToolsPackJson<MacUninstallResult>('uninstall').catch((error: unknown) => {
          console.error('failed to uninstall packaged mac app during cleanup', error);
        });
        started = false;
        installedAppPath = null;
      }
    }
  }, 360_000);

  // Silent startup update acceptance: with the daemon-owned allowSilentUpdates
  // preference on, a payload downloaded in a previous session must apply on
  // the next cold start's first scheduler tick — install, quit, and relaunch —
  // without any user-facing updater action.
  const silentUpdateTest = !verifyCoreOnly && updateFixture === 'tools-serve' ? test : test.skip;
  silentUpdateTest('applies a downloaded payload silently on the next cold start', async () => {
    const updateEnv = captureUpdateEnv();
    let payloadFixtureLocal: ToolsServeUpdaterFixture | null = null;
    let cleanupStarted = false;
    let cleanupInstalled = false;
    try {
      const localPayload = await resolveLocalPayloadUpdateFixture();
      const targetVersion = localPayload.targetVersion;

      await resetPackagedRuntimeState();
      await runToolsPackJson<MacInstallResult>('install');
      cleanupInstalled = true;
      await seedPackagedOnboardingComplete();

      payloadFixtureLocal = await startToolsServeUpdaterFixture({
        channel: updateScenario.channel,
        payloadPath: localPayload.payloadPath,
        platform: 'mac',
        version: targetVersion,
        workspaceRoot,
      });
      applyPackagedUpdateEnv(process.env, updateScenario, payloadFixtureLocal.info.metadataUrl, { openDryRun: false });

      const start = await runToolsPackJson<MacStartResult>('start');
      cleanupStarted = true;
      expect(start.source).toBe('installed');
      await waitForUpdaterStatus(
        (status) =>
          status.update?.state === 'downloaded' &&
          status.update.availableVersion === targetVersion &&
          status.update.artifact?.type === 'payload',
        'payload downloaded before silent restart',
      );

      // Enable the daemon-owned preference through the production HTTP path
      // (the same GET + merged PUT the web settings surface performs).
      const enableSilent = await runToolsPackJson<MacInspectResult>('inspect', ['--expr', `
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

      const stop = await runToolsPackJson<MacStopResult>('stop');
      cleanupStarted = false;
      expect(stop.status).not.toBe('partial');

      // Cold start: the first scheduler tick applies the already-downloaded
      // payload silently and relaunches; no updater action is issued here.
      const coldStart = await runToolsPackJson<MacStartResult>('start');
      cleanupStarted = true;
      expect(coldStart.source).toBe('installed');
      const silent = await waitForHealthyDesktopVersion(targetVersion, start.pid);
      const silentHealth = assertHealthEvalValue(silent.eval?.value);
      expect(silentHealth.health.version).toBe(targetVersion);
      const silentGeneration = settledLauncherGeneration(silent.launcher, targetVersion);
      expect(silentGeneration).not.toBeNull();
      expect(silent.launcher.active?.version).toBe(targetVersion);
      expect(silent.launcher.lastSuccessful?.version).toBe(targetVersion);
      expect(silent.launcher.attempt).toBeNull();

      const terminal = await waitForUpdaterStatus(
        (status) => status.update?.state === 'not-available' && status.update.currentVersion === targetVersion,
        'silent update terminal state',
      );
      expect(terminal.update?.currentVersion).toBe(targetVersion);
    } finally {
      restoreUpdateEnv(updateEnv);
      await payloadFixtureLocal?.close().catch((error: unknown) => {
        console.error('failed to close silent update fixture', error);
      });
      if (cleanupStarted) {
        await runToolsPackJson<MacStopResult>('stop').catch((error: unknown) => {
          console.error('failed to stop packaged mac app during silent-update cleanup', error);
        });
      }
      if (cleanupInstalled) {
        await runToolsPackJson<MacUninstallResult>('uninstall').catch((error: unknown) => {
          console.error('failed to uninstall packaged mac app during silent-update cleanup', error);
        });
      }
    }
  }, 360_000);

  // Crash-rollback acceptance: a payload that spawns but dies before its own
  // bookkeeping must leave the pre-armed attempt behind, and the next cold
  // start must roll back to the last successful version instead of retrying
  // the broken payload forever. A follow-up update with a healthy payload
  // then self-heals to the target version.
  const rollbackTest = !verifyCoreOnly && updateFixture === 'tools-serve' ? test : test.skip;
  rollbackTest('rolls back a crashing payload and self-heals on the next good update', async () => {
    const updateEnv = captureUpdateEnv();
    let corruptFixture: ToolsServeUpdaterFixture | null = null;
    let goodFixture: ToolsServeUpdaterFixture | null = null;
    const corruptWorkDir = join(toolsPackDir, 'corrupt-payload-fixture');
    let cleanupStarted = false;
    let cleanupInstalled = false;
    try {
      const localPayload = await resolveLocalPayloadUpdateFixture();
      const targetVersion = localPayload.targetVersion;
      const corruptPayloadPath = await buildCorruptedMacPayloadFixture(localPayload.payloadPath, corruptWorkDir);

      await resetPackagedRuntimeState();
      const install = await runToolsPackJson<MacInstallResult>('install');
      cleanupInstalled = true;
      await seedPackagedOnboardingComplete();

      corruptFixture = await startToolsServeUpdaterFixture({
        channel: updateScenario.channel,
        payloadPath: corruptPayloadPath,
        platform: 'mac',
        version: targetVersion,
        workspaceRoot,
      });
      applyPackagedUpdateEnv(process.env, updateScenario, corruptFixture.info.metadataUrl, { openDryRun: false });

      const start = await runToolsPackJson<MacStartResult>('start');
      cleanupStarted = true;
      expect(start.source).toBe('installed');

      const readyUpdate = await waitForUpdaterStatus(
        (status) =>
          status.update?.state === 'downloaded' &&
          status.update.availableVersion === targetVersion &&
          status.update.artifact?.type === 'payload',
        'corrupt payload downloaded',
      );
      const launcherRuntimePath = readyUpdate.launcher.runtimePath;
      const launcherAttemptsPath = readyUpdate.launcher.attemptsPath;

      const popup = await openReadyUpdaterPrompt(targetVersion);
      expect(popup.installButtonVisible).toBe(true);
      const clickInstall = await runToolsPackJson<MacInspectResult>('inspect', ['--expr', clickUpdaterInstallExpression]);
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
      const rollbackStart = await runToolsPackJson<MacStartResult>('start');
      cleanupStarted = true;
      expect(rollbackStart.source).toBe('installed');
      const rolledBack = await waitForHealthyDesktopVersion(updateScenario.expectedCurrentVersion, start.pid, false);
      const rolledBackHealth = assertHealthEvalValue(rolledBack.eval?.value);
      expect(rolledBackHealth.health.version).toBe(updateScenario.expectedCurrentVersion);
      expect(rolledBack.launcher.lastSuccessful?.version).toBe(updateScenario.expectedCurrentVersion);
      // Degraded steady state: the broken pointer stays active with its
      // attempt as evidence until a healthy release replaces it.
      expect(rolledBack.launcher.active?.version).toBe(targetVersion);
      expect(rolledBack.launcher.attempt?.version).toBe(targetVersion);

      // Self-heal: real recovery releases ship as version+1 (versioned
      // artifacts are immutable), so the next update arrives under a bumped
      // version with a healthy payload and converges.
      const healedVersion = bumpCountedVersion(targetVersion);
      const healedPayloadPath = await buildVersionBumpedMacPayloadFixture(
        localPayload.payloadPath,
        corruptWorkDir,
        healedVersion,
      );
      await corruptFixture.close();
      corruptFixture = null;
      goodFixture = await startToolsServeUpdaterFixture({
        channel: updateScenario.channel,
        payloadPath: healedPayloadPath,
        platform: 'mac',
        version: healedVersion,
        workspaceRoot,
      });
      applyPackagedUpdateEnv(process.env, updateScenario, goodFixture.info.metadataUrl, { openDryRun: false });
      const healStop = await runToolsPackJson<MacStopResult>('stop');
      cleanupStarted = false;
      expect(healStop.status).not.toBe('partial');
      const healStart = await runToolsPackJson<MacStartResult>('start');
      cleanupStarted = true;
      expect(healStart.source).toBe('installed');
      await waitForUpdaterStatus(
        (status) =>
          status.update?.state === 'downloaded' &&
          status.update.availableVersion === healedVersion &&
          status.update.artifact?.type === 'payload',
        'healthy payload downloaded after rollback',
      );
      await openReadyUpdaterPrompt(healedVersion);
      const healClick = await runToolsPackJson<MacInspectResult>('inspect', ['--expr', clickUpdaterInstallExpression]);
      expect(assertUpdaterClickEvalValue(healClick.eval?.value).clicked).toBe(true);
      const healed = await waitForHealthyDesktopVersion(healedVersion, rollbackStart.pid);
      const healedHealth = assertHealthEvalValue(healed.eval?.value);
      expect(healedHealth.health.version).toBe(healedVersion);
      const healedGeneration = settledLauncherGeneration(healed.launcher, healedVersion);
      expect(healedGeneration).not.toBeNull();
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
        await runToolsPackJson<MacStopResult>('stop').catch((error: unknown) => {
          console.error('failed to stop packaged mac app during rollback cleanup', error);
        });
      }
      if (cleanupInstalled) {
        await runToolsPackJson<MacUninstallResult>('uninstall').catch((error: unknown) => {
          console.error('failed to uninstall packaged mac app during rollback cleanup', error);
        });
      }
    }
  }, 360_000);
});

macOnboardingDescribe('packaged mac onboarding AMR smoke', () => {
  let installedAppPath: string | null = null;
  let started = false;

  test('[P0] @electron-smoke starts a fresh packaged app on the Cloud identity gate', async () => {
    const report = await createPackagedSmokeReport('mac');
    let passed = false;
    try {
      await runToolsPackJson<MacUninstallResult>('uninstall').catch((error: unknown) => {
        console.error('failed to uninstall stale packaged mac app before onboarding smoke', error);
      });
      await resetPackagedMacRuntimeData();

      const install = await runToolsPackJson<MacInstallResult>('install');
      installedAppPath = install.installedAppPath;
      expect(install.namespace).toBe(namespace);
      expect(install.detached).toBe(true);

      const start = await runToolsPackJson<MacStartResult>('start');
      started = true;
      expect(start.namespace).toBe(namespace);
      expect(start.source).toBe('installed');
      expect(start.appPath).toBe(install.installedAppPath);

      const inspect = await waitForHealthyDesktop();
      const health = assertHealthEvalValue(inspect.eval?.value);
      expect(health.status).toBe(200);
      expect(health.health.ok).toBe(true);

      const initial = await waitForPackagedOnboarding((snapshot) =>
        snapshot.onboardingVisible && snapshot.cloudSignInVisible,
        'fresh packaged onboarding Cloud identity gate',
      );
      expect(initial.href).toMatch(/^(od:\/\/app\/|http:\/\/127\.0\.0\.1:\d+\/)/);
      expect(initial.cloudSignInVisible).toBe(true);

      const onboardingScreenshotPath = join(toolsPackDir, 'screenshots', `${namespace}-onboarding.png`);
      await mkdir(dirname(onboardingScreenshotPath), { recursive: true });
      const screenshot = await runToolsPackJson<MacInspectResult>('inspect', ['--path', onboardingScreenshotPath]);
      expect(screenshot.screenshot?.path).toBe(onboardingScreenshotPath);
      expect(await fileSizeBytes(onboardingScreenshotPath)).toBeGreaterThan(0);
      await report.report.save('screenshots/open-design-mac-onboarding-smoke.png', await readFile(onboardingScreenshotPath));
      await report.report.json('onboarding-summary.json', {
        health,
        initial,
        namespace,
        screenshot: 'screenshots/open-design-mac-onboarding-smoke.png',
        start: {
          appPath: start.appPath,
          executablePath: start.executablePath,
          logPath: start.logPath,
          pid: start.pid,
          source: start.source,
          status: start.status,
        },
      });

      const stop = await runToolsPackJson<MacStopResult>('stop');
      started = false;
      expect(stop.namespace).toBe(namespace);
      expect(stop.status).not.toBe('partial');

      const uninstall = await runToolsPackJson<MacUninstallResult>('uninstall');
      installedAppPath = null;
      expect(uninstall.namespace).toBe(namespace);
      expect(uninstall.installedAppPath).toBe(install.installedAppPath);
      expect(uninstall.removed).toBe(true);
      await resetPackagedMacRuntimeData();
      passed = true;
    } finally {
      if (!passed) {
        await printPackagedLogs().catch((error: unknown) => {
          console.error('failed to read packaged mac onboarding logs after failure', error);
        });
      }

      if (started || installedAppPath != null) {
        await runToolsPackJson<MacUninstallResult>('uninstall').catch((error: unknown) => {
          console.error('failed to uninstall packaged mac onboarding app during cleanup', error);
        });
        started = false;
        installedAppPath = null;
      }
      await resetPackagedMacRuntimeData().catch((error: unknown) => {
        console.error('failed to reset packaged mac onboarding runtime data during cleanup', error);
      });
    }
  }, 180_000);
});

desktopMacDescribe('mac desktop settings smoke', () => {
  const desktop = createDesktopHarness('mac-settings-smoke');

  beforeAll(async () => {
    await desktop.start();
  }, T.xlong + T.long + T.medium);

  afterAll(async () => {
    await desktop.stop();
  }, 30_000);

  test('opens the current API configuration from the desktop shell', async () => {
    await seedDesktopConfig(desktop, {
      mode: 'api',
      apiKey: 'sk-test',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-5',
      apiProtocol: 'anthropic',
      apiProviderBaseUrl: 'https://api.anthropic.com',
      agentId: null,
      skillId: null,
      designSystemId: null,
      onboardingCompleted: true,
      mediaProviders: {},
      agentModels: {},
      theme: 'system',
    }, 'model');

    await desktop.openSettings();
    await openDesktopSettingsSection(desktop, 'Execution mode');

    await waitFor(async () => {
      const snapshot = await readDesktopSettingsSnapshot(desktop);
      expect(snapshot.dialogOpen).toBe(true);
      expect(snapshot.heading).toBe('Execution mode');
      expect(snapshot.selectedProtocol).toBe('Anthropic API');
      expect(snapshot.quickFillProvider).toBe('Anthropic (Claude)');
      expect(snapshot.baseUrl).toBe('https://api.anthropic.com');
      expect(snapshot.model).toBe('claude-sonnet-4-5');
    });
  }, 45_000);

  test('keeps legacy provider tracking coherent when switching API protocols', async () => {
    await seedDesktopConfig(desktop, {
      mode: 'api',
      apiKey: 'sk-test',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      agentId: null,
      skillId: null,
      designSystemId: null,
      onboardingCompleted: true,
      mediaProviders: {},
      agentModels: {},
    }, 'baseUrl');

    await desktop.openSettings();
    await openDesktopSettingsSection(desktop, 'Execution mode');

    await waitFor(async () => {
      const snapshot = await readDesktopSettingsSnapshot(desktop);
      expect(snapshot.dialogOpen).toBe(true);
      expect(snapshot.selectedProtocol).toBe('OpenAI API');
      expect(snapshot.quickFillProvider).toBe('DeepSeek — OpenAI');
      expect(snapshot.baseUrl).toBe('https://api.deepseek.com');
    });

    await clickDesktopProtocolTab(desktop, 'Anthropic');

    await waitFor(async () => {
      const snapshot = await readDesktopSettingsSnapshot(desktop);
      expect(snapshot.selectedProtocol).toBe('Anthropic API');
      expect(snapshot.quickFillProvider).toBe('DeepSeek — Anthropic');
      expect(snapshot.baseUrl).toBe('https://api.deepseek.com/anthropic');
      expect(snapshot.model).toBe('deepseek-v4-flash');
    });
  }, 45_000);

  // #5517 removed the theme segmented control from Settings, so the packaged
  // "preview then save" appearance loop is now driven by the accent swatches —
  // the only appearance control the section still owns. The invariants under
  // test are the same ones the theme leg used to prove: the edit previews
  // immediately on the live document, and it survives the dialog closing via
  // Save. The seeded `theme` is a LEGACY dark value: the theme setting is gone
  // and the app ships light-only, so the packaged runtime must coerce it to
  // light on read rather than carry it into the document.
  test('previews and saves the desktop appearance preference', async () => {
    await seedDesktopConfig(desktop, {
      mode: 'api',
      apiKey: 'sk-test',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-5',
      apiProtocol: 'anthropic',
      apiProviderBaseUrl: 'https://api.anthropic.com',
      agentId: null,
      skillId: null,
      designSystemId: null,
      onboardingCompleted: true,
      mediaProviders: {},
      agentModels: {},
      theme: 'dark',
    }, 'theme');

    await desktop.openSettings();
    await openDesktopSettingsSection(desktop, 'Appearance');
    await clickDesktopAccentSwatch(desktop, '#87ea5c');

    await waitFor(async () => {
      const snapshot = await readDesktopAppearanceSnapshot(desktop);
      expect(snapshot.dialogOpen).toBe(true);
      // Live preview lands on the document before anything is saved.
      expect(snapshot.documentAccent).toBe('#87ea5c');
      // The seeded legacy `dark` never reaches the document, and the coerced
      // value is written back so the dark preference stops existing on disk.
      expect(snapshot.documentTheme).toBe('light');
      expect(snapshot.savedTheme).toBe('light');
    });

    await clickDesktopSettingsFooterButton(desktop, 'primary');

    await waitFor(async () => {
      const snapshot = await readDesktopAppearanceSnapshot(desktop);
      expect(snapshot.dialogOpen).toBe(false);
      expect(snapshot.documentAccent).toBe('#87ea5c');
      expect(snapshot.savedAccent).toBe('#87ea5c');
      expect(snapshot.savedTheme).toBe('light');
    });
  }, 45_000);

  test('opens Local CLI settings and exposes Codex path fields from the desktop shell', async () => {
    await seedDesktopConfig(desktop, {
      mode: 'daemon',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProtocol: 'openai',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
      agentId: 'codex',
      skillId: null,
      designSystemId: null,
      onboardingCompleted: true,
      mediaProviders: {},
      agentModels: {},
      agentCliEnv: {
        codex: {
          CODEX_HOME: '~/.codex-team',
          CODEX_BIN: '~/bin/codex-next',
        },
      },
      theme: 'system',
    }, 'agentId');

    await desktop.openSettings();
    await openDesktopSettingsSection(desktop, 'Execution mode');
    await clickDesktopExecutionModeTab(desktop, 'Local CLI');

    await waitFor(async () => {
      const snapshot = await readDesktopLocalCliSnapshot(desktop);
      expect(snapshot.dialogOpen).toBe(true);
      expect(snapshot.heading).toBe('Execution mode');
      expect(snapshot.localCliTabSelected).toBe(true);
      expect(snapshot.selectedAgent).toBe('Codex CLI');
      expect(snapshot.codexHome).toBe('~/.codex-team');
      expect(snapshot.codexExecutablePath).toBe('~/bin/codex-next');
    });
  }, 45_000);

  test('switches between BYOK and Local CLI without losing the saved field previews', async () => {
    await seedDesktopConfig(desktop, {
      mode: 'daemon',
      apiKey: 'sk-test',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      apiProtocol: 'openai',
      apiProviderBaseUrl: 'https://api.deepseek.com',
      agentId: 'codex',
      skillId: null,
      designSystemId: null,
      onboardingCompleted: true,
      mediaProviders: {},
      agentModels: {},
      agentCliEnv: {
        codex: {
          CODEX_HOME: '~/.codex-switch',
          CODEX_BIN: '~/bin/codex-switch',
        },
      },
      theme: 'system',
    }, 'baseUrl');

    await desktop.openSettings();
    await openDesktopSettingsSection(desktop, 'Execution mode');

    await waitFor(async () => {
      const snapshot = await readDesktopSettingsSnapshot(desktop);
      expect(snapshot.selectedProtocol).toBe('OpenAI API');
      expect(snapshot.quickFillProvider).toBe('DeepSeek — OpenAI');
      expect(snapshot.baseUrl).toBe('https://api.deepseek.com');
      expect(snapshot.model).toBe('deepseek-v4-flash');
    });

    await clickDesktopExecutionModeTab(desktop, 'Local CLI');

    await waitFor(async () => {
      const snapshot = await readDesktopLocalCliSnapshot(desktop);
      expect(snapshot.localCliTabSelected).toBe(true);
      expect(snapshot.selectedAgent).toBe('Codex CLI');
      expect(snapshot.codexHome).toBe('~/.codex-switch');
      expect(snapshot.codexExecutablePath).toBe('~/bin/codex-switch');
    });

    await clickDesktopExecutionModeTab(desktop, 'BYOK');

    await waitFor(async () => {
      const snapshot = await readDesktopSettingsSnapshot(desktop);
      expect(snapshot.selectedProtocol).toBe('OpenAI API');
      expect(snapshot.quickFillProvider).toBe('DeepSeek — OpenAI');
      expect(snapshot.baseUrl).toBe('https://api.deepseek.com');
      expect(snapshot.model).toBe('deepseek-v4-flash');
    });
  }, 45_000);

  test('opens the Connectors section from the desktop shell and shows the catalog surface', async () => {
    await seedDesktopConfig(desktop, {
      mode: 'api',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProtocol: 'openai',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
      agentId: null,
      skillId: null,
      designSystemId: null,
      composio: { apiKeyConfigured: true },
      onboardingCompleted: true,
      mediaProviders: {},
      agentModels: {},
      theme: 'system',
    }, 'model');

    await desktop.openSettings();
    await openDesktopSettingsSection(desktop, 'Connectors');

    await waitFor(async () => {
      const snapshot = await readDesktopConnectorsSnapshot(desktop);
      expect(snapshot.dialogOpen).toBe(true);
      expect(snapshot.heading).toBe('Connectors');
      expect(snapshot.sectionTitle).toBe('Connectors');
      expect(snapshot.apiKeyLabelVisible).toBe(true);
      expect(snapshot.gateVisible || snapshot.gridVisible).toBe(true);
    });
  }, 45_000);

  test('opens and closes a connector detail drawer from the desktop shell', async () => {
    await seedDesktopConfig(desktop, {
      mode: 'api',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProtocol: 'openai',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
      agentId: null,
      skillId: null,
      designSystemId: null,
      composio: { apiKeyConfigured: true },
      onboardingCompleted: true,
      mediaProviders: {},
      agentModels: {},
      theme: 'system',
    }, 'model');

    await desktop.openSettings();
    await openDesktopSettingsSection(desktop, 'Connectors');

    await waitFor(async () => {
      const snapshot = await readDesktopConnectorsSnapshot(desktop);
      expect(snapshot.gridVisible).toBe(true);
    });

    const opened = await desktop.eval<boolean>(`
      (() => {
        const card = document.querySelector('.connector-card');
        if (!(card instanceof HTMLElement)) return false;
        card.click();
        return true;
      })()
    `);
    expect(opened).toBe(true);

    await waitFor(async () => {
      const snapshot = await readDesktopConnectorsSnapshot(desktop);
      expect(snapshot.drawerVisible).toBe(true);
      expect(snapshot.drawerTitle).toBeTruthy();
    });

    const closed = await desktop.eval<boolean>(`
      (() => {
        const closeButton = document.querySelector('[data-testid="connector-drawer-close"]');
        if (!(closeButton instanceof HTMLElement)) return false;
        closeButton.click();
        return true;
      })()
    `);
    expect(closed).toBe(true);

    await waitFor(async () => {
      const snapshot = await readDesktopConnectorsSnapshot(desktop);
      expect(snapshot.drawerVisible).toBe(false);
      expect(snapshot.gridVisible).toBe(true);
    });
  }, 45_000);

  test('[P0] keeps the desktop artifact preview loaded and stable after its file route opens', async () => {
    await seedDesktopConfig(desktop, {
      mode: 'api',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProtocol: 'openai',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
      agentId: null,
      skillId: null,
      designSystemId: null,
      onboardingCompleted: true,
      mediaProviders: {},
      agentModels: {},
      theme: 'system',
    }, 'model');

    await desktop.eval<{ projectId: string }>(`
      (async () => {
        const projectId = 'desktop-open-smoke-' + Date.now().toString(36);
        const projectResp = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: projectId,
            name: 'Desktop artifact open smoke',
          }),
        });
        if (!projectResp.ok) {
          throw new Error('failed to create project: ' + projectResp.status);
        }

        const fileResp = await fetch('/api/projects/' + encodeURIComponent(projectId) + '/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'desktop-open.html',
            content: '<!doctype html><html><body><main><h1>Desktop Open Smoke</h1></main></body></html>',
            artifactManifest: {
              version: 1,
              kind: 'html',
              title: 'Desktop Open Smoke',
              entry: 'desktop-open.html',
              renderer: 'html',
              exports: ['html'],
            },
          }),
        });
        if (!fileResp.ok) {
          throw new Error('failed to seed project file: ' + fileResp.status);
        }

        window.location.assign('/projects/' + encodeURIComponent(projectId) + '/files/desktop-open.html');
        return { projectId };
      })()
    `);

    await waitFor(async () => {
      const snapshot = await readDesktopArtifactPreviewSnapshot(desktop);
      expect(snapshot.fileWorkspaceVisible).toBe(true);
      expect(snapshot.selectedTab).toBe('desktop-open.html');
      expect(snapshot.artifactPreviewVisible).toBe(true);
      expect(snapshot.artifactPreviewActive).toBe(true);
      expect(snapshot.artifactPreviewLoadedEpoch).toBeTruthy();
      expect(snapshot.artifactPreviewLoadingVisible).toBe(false);
    });

    const stablePreview = await observeDesktopArtifactPreviewStability(desktop);
    expect(stablePreview).toEqual({
      activeThroughout: true,
      loadedThroughout: true,
      loadingSurfaceSeen: false,
      sameFrameThroughout: true,
      visibleThroughout: true,
    });

  }, T.xlong);

  test('opens the Media providers section from the desktop shell and shows provider controls', async () => {
    await seedDesktopConfig(desktop, {
      mode: 'api',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProtocol: 'openai',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
      agentId: null,
      skillId: null,
      designSystemId: null,
      onboardingCompleted: true,
      mediaProviders: {},
      agentModels: {},
      theme: 'system',
    }, 'model');

    await desktop.openSettings();
    await openDesktopSettingsSection(desktop, 'Media providers');

    await waitFor(async () => {
      const snapshot = await readDesktopMediaSnapshot(desktop);
      expect(snapshot.dialogOpen).toBe(true);
      expect(snapshot.heading).toBe('Media providers');
      expect(snapshot.sectionTitle).toBe('Media providers');
      expect(snapshot.providerCardCount).toBeGreaterThan(0);
      expect(snapshot.reloadVisible).toBe(true);
    });
  }, 45_000);

  test('opens the About section from the desktop shell and renders version details or the offline placeholder', async () => {
    await seedDesktopConfig(desktop, {
      mode: 'api',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProtocol: 'openai',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
      agentId: null,
      skillId: null,
      designSystemId: null,
      onboardingCompleted: true,
      mediaProviders: {},
      agentModels: {},
      theme: 'system',
    }, 'model');

    await desktop.openSettings();
    await openDesktopSettingsSection(desktop, 'About');

    await waitFor(async () => {
      const snapshot = await readDesktopAboutSnapshot(desktop);
      expect(snapshot.dialogOpen).toBe(true);
      expect(snapshot.heading).toBe('About');
      expect(snapshot.sectionTitle).toBe('About');
      expect(snapshot.aboutListVisible || snapshot.versionUnavailableVisible).toBe(true);
    });
  }, 45_000);

  // #5517 (product confirmed 2026-07-20) removed the 系统/浅色/深色 segmented
  // control from Appearance; the theme now moves only through the account
  // menu's 切换主题 row. The point of this test is unchanged — the packaged
  // desktop shell can reach the Appearance section and render its controls —
  // so it now asserts on the accent swatches, the section's surviving control,
  // and guards that the theme segmented control has not come back.
  test('opens the Appearance section from the desktop shell and shows the accent controls', async () => {
    await seedDesktopConfig(desktop, {
      mode: 'api',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProtocol: 'openai',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
      agentId: null,
      skillId: null,
      designSystemId: null,
      onboardingCompleted: true,
      mediaProviders: {},
      agentModels: {},
      theme: 'system',
    }, 'theme');

    await desktop.openSettings();
    await openDesktopSettingsSection(desktop, 'Appearance');

    await waitFor(async () => {
      const snapshot = await readDesktopAppearanceSectionSnapshot(desktop);
      expect(snapshot.dialogOpen).toBe(true);
      expect(snapshot.heading).toBe('Appearance');
      expect(snapshot.sectionTitle).toBe('Appearance');
      expect(snapshot.accentSwatchesVisible).toBe(true);
      expect(snapshot.defaultAccentVisible).toBe(true);
      expect(snapshot.themeSegControlVisible).toBe(false);
    });
  }, 45_000);
});

async function runToolsPackJson<T>(action: string, extraArgs: string[] = []): Promise<T> {
  const args = [
    'exec',
    'tools-pack',
    'mac',
    action,
    '--dir',
    toolsPackDir,
    '--namespace',
    namespace,
    ...toolsPackReleaseVersionArgs,
    '--json',
    ...extraArgs,
  ];
  const result = await execFileAsync(pnpmCommand, args, {
    cwd: workspaceRoot,
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  }).catch((error: unknown) => {
    if (isExecError(error)) {
      throw new Error(
        [
          `tools-pack mac ${action} failed`,
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
    throw new Error(`tools-pack mac ${action} did not print JSON: ${String(error)}\n${result.stdout}`);
  }
}

async function resolveLocalPayloadUpdateFixture(): Promise<{ payloadPath: string; targetVersion: string }> {
  const fallbackBuildJsonPath = resolveFallbackUpdateBuildJsonPath();
  if (fallbackBuildJsonPath == null) {
    throw new Error(
      'full packaged mac payload smoke requires update payload metadata; set OD_PACKAGED_E2E_MAC_UPDATE_METADATA_URL or provide mac-tools-pack-update-build.json next to OD_PACKAGED_E2E_BUILD_JSON_PATH',
    );
  }
  const updateBuild = JSON.parse(stripUtf8Bom(await readFile(fallbackBuildJsonPath, 'utf8'))) as {
    latestMacYmlPath?: unknown;
    payloadPath?: unknown;
  };
  if (typeof updateBuild.payloadPath !== 'string' || updateBuild.payloadPath.length === 0) {
    throw new Error(`upgrade build metadata missing payloadPath: ${fallbackBuildJsonPath}`);
  }
  const targetVersion =
    updateVersion ??
    (typeof updateBuild.latestMacYmlPath === 'string' && updateBuild.latestMacYmlPath.length > 0
      ? await readLatestMacYmlVersion(updateBuild.latestMacYmlPath)
      : null);
  if (targetVersion == null || targetVersion.length === 0) {
    throw new Error(`upgrade build metadata missing version: ${fallbackBuildJsonPath}`);
  }
  return {
    payloadPath: resolveFromWorkspace(updateBuild.payloadPath),
    targetVersion,
  };
}

function resolveFallbackUpdateBuildJsonPath(): string | null {
  if (updateBuildJsonPath != null && updateBuildJsonPath !== '') return resolveFromWorkspace(updateBuildJsonPath);
  const mainBuildJsonPath = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_BUILD_JSON_PATH);
  if (mainBuildJsonPath == null || mainBuildJsonPath === '') return null;
  return join(dirname(resolveFromWorkspace(mainBuildJsonPath)), 'mac-tools-pack-update-build.json');
}

function assertToolsServeFixtureEnabled(platformName: string, value: string | null): void {
  if (value === 'tools-serve') return;
  throw new Error(
    `full packaged ${platformName} payload smoke requires explicit tools-serve fixture; set OD_PACKAGED_E2E_MAC_UPDATE_FIXTURE=tools-serve or provide OD_PACKAGED_E2E_MAC_UPDATE_METADATA_URL`,
  );
}

function assertUpdateVersionPresent(platformName: string, value: string | null): asserts value is string {
  if (value != null && value.length > 0) return;
  throw new Error(`full packaged ${platformName} payload smoke requires an explicit update target version with external update metadata`);
}

async function readLatestMacYmlVersion(latestMacYmlPath: string): Promise<string | null> {
  const latestMacYml = await readFile(resolveFromWorkspace(latestMacYmlPath), 'utf8').catch(() => null);
  if (latestMacYml == null) return null;
  const match = /^version:\s+"?([^\r\n"]+)"?/m.exec(stripUtf8Bom(latestMacYml));
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

type DesktopHarness = ReturnType<typeof createDesktopHarness>;

type DesktopSettingsSnapshot = {
  baseUrl: string | null;
  dialogOpen: boolean;
  heading: string | null;
  model: string | null;
  quickFillProvider: string | null;
  selectedProtocol: string | null;
};

type DesktopLocalCliSnapshot = {
  codexExecutablePath: string | null;
  codexHome: string | null;
  dialogOpen: boolean;
  heading: string | null;
  localCliTabSelected: boolean;
  selectedAgent: string | null;
};

type DesktopAppearanceSnapshot = {
  dialogOpen: boolean;
  documentAccent: string | null;
  documentTheme: string | null;
  savedAccent: string | null;
  savedTheme: string | null;
};

type DesktopConnectorsSnapshot = {
  apiKeyLabelVisible: boolean;
  dialogOpen: boolean;
  drawerTitle: string | null;
  drawerVisible: boolean;
  gateVisible: boolean;
  gridVisible: boolean;
  heading: string | null;
  sectionTitle: string | null;
};

type DesktopMediaSnapshot = {
  dialogOpen: boolean;
  heading: string | null;
  providerCardCount: number;
  reloadVisible: boolean;
  sectionTitle: string | null;
};

type DesktopAboutSnapshot = {
  aboutListVisible: boolean;
  dialogOpen: boolean;
  heading: string | null;
  sectionTitle: string | null;
  versionUnavailableVisible: boolean;
};

type DesktopAppearanceSectionSnapshot = {
  accentSwatchesVisible: boolean;
  defaultAccentVisible: boolean;
  dialogOpen: boolean;
  heading: string | null;
  sectionTitle: string | null;
  /** #5517 removed it; kept as a negative assertion so it cannot creep back. */
  themeSegControlVisible: boolean;
};

type DesktopArtifactPreviewSnapshot = {
  artifactPreviewActive: boolean;
  artifactPreviewLoadedEpoch: string | null;
  artifactPreviewLoadingVisible: boolean;
  artifactPreviewVisible: boolean;
  fileWorkspaceVisible: boolean;
  selectedTab: string | null;
};

async function seedDesktopConfig(
  desktop: DesktopHarness,
  config: Record<string, unknown>,
  stableField: string,
): Promise<void> {
  await desktop.seedConfigAndReload(config, stableField);
}

async function openDesktopSettingsSection(
  desktop: DesktopHarness,
  label: string,
): Promise<void> {
  const clicked = await desktop.eval<boolean>(`
    (() => {
      const section = Array.from(document.querySelectorAll('[role="dialog"] button'))
        .find((node) => node.textContent?.includes(${JSON.stringify(label)}));
      if (!(section instanceof HTMLElement)) return false;
      section.click();
      return true;
    })()
  `);
  expect(clicked).toBe(true);
}

async function clickDesktopProtocolTab(
  desktop: DesktopHarness,
  label: 'Anthropic' | 'OpenAI',
): Promise<void> {
  const clicked = await desktop.eval<boolean>(`
    (() => {
      const protocolTabs = Array.from(document.querySelectorAll('[role="tablist"]'))
        .find((node) => node.getAttribute('aria-label') === 'API protocol');
      const tab = Array.from(protocolTabs?.querySelectorAll('[role="tab"]') ?? [])
        .find((node) => node.textContent?.trim() === ${JSON.stringify(label)});
      if (!(tab instanceof HTMLElement)) return false;
      tab.click();
      return true;
    })()
  `);
  expect(clicked).toBe(true);
}

async function clickDesktopExecutionModeTab(
  desktop: DesktopHarness,
  label: 'BYOK' | 'Local CLI',
): Promise<void> {
  const clicked = await desktop.eval<boolean>(`
    (() => {
      const modeTabs = Array.from(document.querySelectorAll('[role="tablist"]'))
        .find((node) => {
          const labels = Array.from(node.querySelectorAll('[role="tab"]'))
            .map((tab) => tab.textContent?.trim() ?? '');
          return labels.some((text) => text.startsWith('BYOK')) &&
            labels.some((text) => text.startsWith('Local CLI'));
        });
      const tab = Array.from(modeTabs?.querySelectorAll('[role="tab"]') ?? [])
        .find((node) => node.textContent?.trim().startsWith(${JSON.stringify(label)}));
      if (!(tab instanceof HTMLElement)) return false;
      tab.click();
      return true;
    })()
  `);
  expect(clicked).toBe(true);
}

/**
 * Click an accent swatch in the Settings › Appearance section.
 *
 * Replaces the old `clickDesktopSegmentButton` theme helper: the
 * 系统/浅色/深色 segmented control is gone (#5517 hid it, and the theme setting
 * was removed outright because the app ships light-only), leaving the accent
 * swatches as the only appearance control Settings still owns. Swatches carry
 * the hex as their aria-label (the default swatch is "Default accent color").
 */
async function clickDesktopAccentSwatch(
  desktop: DesktopHarness,
  label: string,
): Promise<void> {
  const clicked = await desktop.eval<boolean>(`
    (() => {
      const swatch = document.querySelector(
        '[role="dialog"] .pet-swatches [role="radio"][aria-label=' + ${JSON.stringify(JSON.stringify(label))} + ']',
      );
      if (!(swatch instanceof HTMLElement)) return false;
      swatch.click();
      return true;
    })()
  `);
  expect(clicked).toBe(true);
}

async function clickDesktopSettingsFooterButton(
  desktop: DesktopHarness,
  className: 'ghost' | 'primary',
): Promise<void> {
  const clicked = await desktop.eval<boolean>(`
    (() => {
      const footerButton = document.querySelector('.modal-foot button.${className}');
      if (!(footerButton instanceof HTMLElement)) return false;
      footerButton.click();
      return true;
    })()
  `);
  expect(clicked).toBe(true);
}

async function readDesktopSettingsSnapshot(
  desktop: DesktopHarness,
): Promise<DesktopSettingsSnapshot> {
  return await desktop.eval<DesktopSettingsSnapshot>(`
    (() => {
      const labelFields = Array.from(document.querySelectorAll('[role="dialog"] label.field'));
      const getField = (label) => {
        const field = labelFields.find((node) =>
          node.querySelector('.field-label')?.textContent?.trim() === label,
        );
        if (!field) return null;
        const control = field.querySelector('input, select, textarea');
        if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) {
          return null;
        }
        if (control instanceof HTMLSelectElement) {
          return control.selectedOptions.item(0)?.textContent?.trim() ?? control.value;
        }
        return control.value;
      };
      const activeProtocol = Array.from(document.querySelectorAll('[role="tablist"][aria-label="API protocol"] [role="tab"]'))
        .find((node) => node.getAttribute('aria-selected') === 'true');
      const protocolText = activeProtocol?.textContent?.trim() ?? null;

      return {
        baseUrl: getField('Base URL'),
        dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
        heading: document.querySelector('[role="dialog"] h2')?.textContent?.trim() ?? null,
        model: getField('Model'),
        quickFillProvider: getField('Quick fill provider'),
        selectedProtocol: protocolText === 'OpenAI' || protocolText === 'Anthropic'
          ? protocolText + ' API'
          : protocolText,
      };
    })()
  `);
}

async function readDesktopAppearanceSnapshot(
  desktop: DesktopHarness,
): Promise<DesktopAppearanceSnapshot> {
  return await desktop.eval<DesktopAppearanceSnapshot>(`
    (() => {
      const raw = window.localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
      const config = raw ? JSON.parse(raw) : {};
      return {
        dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
        documentAccent: document.documentElement.style.getPropertyValue('--accent').trim() || null,
        documentTheme: document.documentElement.getAttribute('data-theme'),
        savedAccent: typeof config.accentColor === 'string' ? config.accentColor : null,
        savedTheme: typeof config.theme === 'string' ? config.theme : null,
      };
    })()
  `);
}

async function readDesktopConnectorsSnapshot(
  desktop: DesktopHarness,
): Promise<DesktopConnectorsSnapshot> {
  return await desktop.eval<DesktopConnectorsSnapshot>(`
    (() => {
      const fieldLabels = Array.from(document.querySelectorAll('[role="dialog"] .field-label'))
        .map((node) => node.textContent?.trim() ?? '');
      const sectionTitle = document.querySelector('.settings-section-connectors .section-head h3')
        ?.textContent?.trim() ?? null;
      const drawerTitle = document.querySelector('[data-testid="connector-drawer"] h2')
        ?.textContent?.trim() ?? null;
      return {
        apiKeyLabelVisible: fieldLabels.includes('Composio API Key'),
        dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
        drawerTitle,
        drawerVisible: Boolean(document.querySelector('[data-testid="connector-drawer"]')),
        gateVisible: Boolean(document.querySelector('[data-testid="connector-gate"]')),
        gridVisible: Boolean(document.querySelector('[data-testid="connector-grid-wrap"]')),
        heading: document.querySelector('[role="dialog"] h2')?.textContent?.trim() ?? null,
        sectionTitle,
      };
    })()
  `);
}

async function readDesktopMediaSnapshot(
  desktop: DesktopHarness,
): Promise<DesktopMediaSnapshot> {
  return await desktop.eval<DesktopMediaSnapshot>(`
    (() => {
      const sectionTitle = document.querySelector('.settings-section .section-head h3')
        ?.textContent?.trim() ?? null;
      return {
        dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
        heading: document.querySelector('[role="dialog"] h2')?.textContent?.trim() ?? null,
        providerCardCount: document.querySelectorAll('.settings-provider-card').length,
        reloadVisible: Boolean(Array.from(document.querySelectorAll('button'))
          .find((node) => node.textContent?.trim() === 'Reload from daemon')),
        sectionTitle,
      };
    })()
  `);
}

async function readDesktopAboutSnapshot(
  desktop: DesktopHarness,
): Promise<DesktopAboutSnapshot> {
  return await desktop.eval<DesktopAboutSnapshot>(`
    (() => {
      const sectionTitle = document.querySelector('.settings-section .section-head h3')
        ?.textContent?.trim() ?? null;
      const emptyCards = Array.from(document.querySelectorAll('.settings-section .empty-card'))
        .map((node) => node.textContent?.trim() ?? '');
      return {
        aboutListVisible: Boolean(document.querySelector('.settings-about-list')),
        dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
        heading: document.querySelector('[role="dialog"] h2')?.textContent?.trim() ?? null,
        sectionTitle,
        versionUnavailableVisible: emptyCards.includes('Version details are unavailable while the daemon is offline.'),
      };
    })()
  `);
}

async function readDesktopAppearanceSectionSnapshot(
  desktop: DesktopHarness,
): Promise<DesktopAppearanceSectionSnapshot> {
  return await desktop.eval<DesktopAppearanceSectionSnapshot>(`
    (() => {
      const sectionTitle = document.querySelector('.settings-section .section-head h3')
        ?.textContent?.trim() ?? null;
      const accentGroup = document.querySelector('.settings-section .pet-swatches[role="radiogroup"]');
      const accentSwatches = accentGroup
        ? Array.from(accentGroup.querySelectorAll('[role="radio"]'))
        : [];
      return {
        accentSwatchesVisible: accentSwatches.length > 0,
        defaultAccentVisible: accentSwatches.some(
          (node) => node.getAttribute('aria-label') === 'Default accent color',
        ),
        dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
        heading: document.querySelector('[role="dialog"] h2')?.textContent?.trim() ?? null,
        sectionTitle,
        // Scoped by aria-label: the Notifications controls in the same dialog
        // are seg-controls too, and they are not what #5517 removed.
        themeSegControlVisible: Boolean(
          document.querySelector('.seg-control[aria-label="Appearance"]'),
        ),
      };
    })()
  `);
}

async function readDesktopArtifactPreviewSnapshot(
  desktop: DesktopHarness,
): Promise<DesktopArtifactPreviewSnapshot> {
  return await desktop.eval<DesktopArtifactPreviewSnapshot>(`
    (() => {
      const preview = document.querySelector('[data-testid="artifact-preview-frame"]');
      const loadingSurface = document.querySelector('[data-testid="artifact-preview-first-load"]');
      const elementIsVisible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity) !== 0
          && rect.width > 0
          && rect.height > 0;
      };
      const fileWorkspace = document.querySelector('[data-testid="file-workspace"]');
      const activeTab = fileWorkspace?.querySelector('[role="tab"][aria-selected="true"]');
      const activeTabLabel = activeTab?.querySelector('.ws-tab-label')?.textContent?.trim()
        ?? activeTab?.textContent?.trim()
        ?? null;
      return {
        artifactPreviewActive: preview?.getAttribute('data-od-active') === 'true',
        artifactPreviewLoadedEpoch: preview instanceof HTMLIFrameElement
          ? preview.dataset.odLoadedPreviewEpoch ?? null
          : null,
        artifactPreviewLoadingVisible: elementIsVisible(loadingSurface),
        artifactPreviewVisible: elementIsVisible(preview),
        fileWorkspaceVisible: Boolean(fileWorkspace),
        selectedTab: activeTabLabel,
      };
    })()
  `);
}

async function observeDesktopArtifactPreviewStability(
  desktop: DesktopHarness,
): Promise<{
  activeThroughout: boolean;
  loadedThroughout: boolean;
  loadingSurfaceSeen: boolean;
  sameFrameThroughout: boolean;
  visibleThroughout: boolean;
}> {
  return await desktop.eval(`
    (async () => {
      const selector = '[data-testid="artifact-preview-frame"]';
      const firstFrame = document.querySelector(selector);
      const visible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return element.isConnected
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity) !== 0
          && rect.width > 0
          && rect.height > 0;
      };
      let activeThroughout = true;
      let loadedThroughout = true;
      let loadingSurfaceSeen = false;
      let sameFrameThroughout = firstFrame instanceof HTMLIFrameElement;
      let visibleThroughout = visible(firstFrame);

      for (let sample = 0; sample < 16; sample += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 100));
        const current = document.querySelector(selector);
        sameFrameThroughout &&= current === firstFrame;
        visibleThroughout &&= visible(current);
        activeThroughout &&= current?.getAttribute('data-od-active') === 'true';
        loadedThroughout &&= current instanceof HTMLIFrameElement
          && Boolean(current.dataset.odLoadedPreviewEpoch);
        loadingSurfaceSeen ||= Array.from(
          document.querySelectorAll('[data-testid="artifact-preview-first-load"]'),
        ).some(visible);
      }

      return {
        activeThroughout,
        loadedThroughout,
        loadingSurfaceSeen,
        sameFrameThroughout,
        visibleThroughout,
      };
    })()
  `);
}

async function readDesktopLocalCliSnapshot(
  desktop: DesktopHarness,
): Promise<DesktopLocalCliSnapshot> {
  return await desktop.eval<DesktopLocalCliSnapshot>(`
    (() => {
      const labelFields = Array.from(document.querySelectorAll('[role="dialog"] label.field'));
      const getField = (label) => {
        const field = labelFields.find((node) =>
          node.querySelector('.field-label')?.textContent?.trim() === label,
        );
        if (!field) return null;
        const control = field.querySelector('input');
        return control instanceof HTMLInputElement ? control.value : null;
      };
      const localCliTab = Array.from(document.querySelectorAll('[role="tab"]'))
        .find((node) => node.textContent?.trim().startsWith('Local CLI'));
      const selectedAgent = Array.from(document.querySelectorAll('.agent-card.active .agent-card-name'))
        .map((node) => node.textContent?.trim())
        .find((value) => typeof value === 'string') ?? null;

      return {
        codexExecutablePath: getField('Codex executable path'),
        codexHome: getField('Codex home'),
        dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
        heading: document.querySelector('[role="dialog"] h2')?.textContent?.trim() ?? null,
        localCliTabSelected: localCliTab?.getAttribute('aria-selected') === 'true',
        selectedAgent,
      };
    })()
  `);
}

async function waitForHealthyDesktop(): Promise<MacInspectResult> {
  const timeoutMs = 90_000;
  const startedAt = Date.now();
  let lastResult: unknown = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const inspect = await runToolsPackJson<MacInspectResult>('inspect', ['--expr', healthExpression]);
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

  throw new Error(`packaged mac runtime did not become healthy: ${formatUnknown(lastResult)}`);
}

async function assertFirstNativeChromeActionClick(): Promise<void> {
  const probeKey = '__odPackagedNativeChromeActionProbe';
  const setup = await runToolsPackJson<MacInspectResult>('inspect', [
    '--expr',
    `(() => {
      const target = document.querySelector('[data-testid="entry-top-right-github"]');
      if (!(target instanceof HTMLElement)) {
        throw new Error('first-render GitHub chrome action is missing');
      }
      window[${JSON.stringify(probeKey)}]?.cleanup?.();
      const probe = { clickCount: 0 };
      const onClick = (event) => {
        probe.clickCount += 1;
        event.preventDefault();
      };
      target.addEventListener('click', onClick, true);
      window[${JSON.stringify(probeKey)}] = {
        cleanup: () => target.removeEventListener('click', onClick, true),
        probe,
      };
      const rect = target.getBoundingClientRect();
      const clientX = rect.left + rect.width / 2;
      const clientY = rect.top + rect.height / 2;
      const hitTarget = document.elementFromPoint(clientX, clientY);
      return {
        clickCount: 0,
        targetMatches: hitTarget != null && target.contains(hitTarget),
        x: window.screenX + clientX,
        y: window.screenY + clientY,
      };
    })()`,
  ]);
  if (setup.eval?.ok !== true) {
    throw new Error(`native chrome action setup failed: ${formatUnknown(setup.eval)}`);
  }
  const probe = setup.eval.value as NativeChromeActionProbe;
  expect(probe.targetMatches).toBe(true);
  expect(Number.isFinite(probe.x)).toBe(true);
  expect(Number.isFinite(probe.y)).toBe(true);

  try {
    const swiftSource = `
      import CoreGraphics
      import Darwin
      let point = CGPoint(x: ${probe.x}, y: ${probe.y})
      let source = CGEventSource(stateID: .hidSystemState)
      CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
      CGEvent(mouseEventSource: source, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
      usleep(50_000)
      CGEvent(mouseEventSource: source, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
    `;
    await execFileAsync('/usr/bin/xcrun', ['swift', '-e', swiftSource], { timeout: 30_000 });
    await waitFor(async () => {
      const snapshot = await runToolsPackJson<MacInspectResult>('inspect', [
        '--expr',
        `(() => {
          const state = window[${JSON.stringify(probeKey)}];
          return { clickCount: Number(state?.probe?.clickCount || '0') };
        })()`,
      ]);
      expect((snapshot.eval?.value as { clickCount?: number } | undefined)?.clickCount).toBe(1);
    }, 5_000);
  } finally {
    await runToolsPackJson<MacInspectResult>('inspect', [
      '--expr',
      `(() => {
        const state = window[${JSON.stringify(probeKey)}];
        state?.cleanup?.();
        delete window[${JSON.stringify(probeKey)}];
        return true;
      })()`,
    ]).catch(() => undefined);
  }
}

async function waitForPackagedHomeFirstRunOutput(): Promise<PackagedHomeFirstRunResult> {
  const timeoutMs = 15_000;
  const startedAt = Date.now();
  let lastResult: unknown = null;

  while (Date.now() - startedAt < timeoutMs) {
    const inspect = await runToolsPackJson<MacInspectResult>('inspect', [
      '--expr',
      packagedHomeFirstRunSnapshotExpression(),
    ]);
    lastResult = inspect;
    if (inspect.eval?.ok === true) {
      const snapshot = assertPackagedHomeFirstRunResult(inspect.eval.value);
      lastResult = snapshot;
      if (
        snapshot.assistantText.includes(PACKAGED_HOME_FIRST_RUN_OUTPUT)
        && snapshot.daemonAssistantText.includes(PACKAGED_HOME_FIRST_RUN_OUTPUT)
        && snapshot.runEventsContainExpectedOutput
      ) {
        return snapshot;
      }
    }
    await delay(750);
  }

  throw new Error(
    `packaged first Home run did not render assistant output without recovery: ${formatUnknown(lastResult)}`,
  );
}

async function waitForPackagedHomeFirstRunSubmit(): Promise<void> {
  const timeoutMs = 15_000;
  const startedAt = Date.now();
  let lastResult: unknown = null;

  while (Date.now() - startedAt < timeoutMs) {
    const inspect = await runToolsPackJson<MacInspectResult>('inspect', [
      '--expr',
      packagedHomeFirstRunSubmitExpression(),
    ]);
    lastResult = inspect;
    if (
      inspect.eval?.ok === true
      && isRecord(inspect.eval.value)
      && inspect.eval.value.submitClicked === true
    ) {
      return;
    }
    await delay(250);
  }

  throw new Error(
    `packaged first Home run submit never became ready: ${formatUnknown(lastResult)}`,
  );
}

async function waitForHealthyDesktopVersion(
  expectedVersion: string,
  previousPid: number | null | undefined,
  // The rollback degraded steady state deliberately keeps the broken pointer
  // active (with its attempt as evidence), so callers waiting on a rolled-back
  // desktop must not require settled launcher pointers.
  requireSettledLauncher = true,
): Promise<MacInspectResult> {
  const timeoutMs = 120_000;
  const startedAt = Date.now();
  let lastResult: unknown = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const inspect = await runToolsPackJson<MacInspectResult>('inspect', ['--expr', healthExpression]);
      lastResult = inspect;
      if (inspect.status?.state === 'running' && inspect.eval?.ok === true) {
        const value = asHealthEvalValue(inspect.eval.value);
        if (
          value?.status === 200 &&
          value.health.ok === true &&
          value.health.version === expectedVersion &&
          (previousPid == null || inspect.status.pid !== previousPid) &&
          (!requireSettledLauncher || settledLauncherGeneration(inspect.launcher, expectedVersion) != null)
        ) {
          return inspect;
        }
      }
    } catch (error) {
      lastResult = error;
    }
    await delay(1000);
  }

  throw new Error(`packaged mac runtime did not relaunch healthy on ${expectedVersion}: ${formatUnknown(lastResult)}`);
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
      const inspect = await runToolsPackJson<MacInspectResult>('inspect', ['--expr', packagedOnboardingExpression]);
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

  throw new Error(`${label}: packaged onboarding timed out: ${formatUnknown(lastResult)}`);
}

async function waitForUpdaterStatus(
  predicate: (inspect: MacInspectResult) => boolean,
  label: string,
  timeoutMs = 120_000,
): Promise<MacInspectResult> {
  const startedAt = Date.now();
  let lastResult: unknown = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const inspect = await runToolsPackJson<MacInspectResult>('inspect', ['--update-action', 'status']);
      lastResult = inspect;
      if (predicate(inspect)) return inspect;
    } catch (error) {
      lastResult = error;
    }
    await delay(750);
  }
  throw new Error(`${label}: updater status timed out: ${formatUnknown(lastResult)}`);
}

async function repackMacPayloadFixture(
  payloadZipPath: string,
  workDir: string,
  outputName: string,
  mutate: (extractRoot: string, manifest: { entry?: { executable?: string }; version?: string }) => Promise<void>,
): Promise<string> {
  const extractRoot = join(workDir, `${outputName}-extract`);
  await rm(extractRoot, { force: true, recursive: true });
  await mkdir(extractRoot, { recursive: true });
  await execFileAsync('ditto', ['-x', '-k', payloadZipPath, extractRoot]);
  const manifestPath = join(extractRoot, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    entry?: { executable?: string };
    version?: string;
  };
  await mutate(extractRoot, manifest);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const zipPath = join(workDir, `${outputName}.zip`);
  await rm(zipPath, { force: true });
  await execFileAsync('ditto', ['-c', '-k', '--sequesterRsrc', '--rsrc', extractRoot, zipPath]);
  return zipPath;
}

/**
 * Build a checksum-valid payload zip whose desktop executable dies before any
 * launcher bookkeeping — the faithful shape of a broken release that passes
 * every integrity gate (zip sha256, manifest validation, activation) and then
 * crashes pre-main.
 */
async function buildCorruptedMacPayloadFixture(payloadZipPath: string, workDir: string): Promise<string> {
  return await repackMacPayloadFixture(payloadZipPath, workDir, 'corrupt-payload', async (extractRoot, manifest) => {
    const executableRelPath = manifest.entry?.executable;
    if (executableRelPath == null || executableRelPath.length === 0) {
      throw new Error(`payload manifest has no entry.executable: ${payloadZipPath}`);
    }
    const executablePath = join(extractRoot, executableRelPath);
    await writeFile(executablePath, '#!/bin/sh\nexit 87\n', 'utf8');
    await chmod(executablePath, 0o755);
  });
}

/**
 * Re-version a healthy payload zip to the next counted release. Real recovery
 * releases ship as version+1 (versioned artifacts are immutable), so the
 * self-heal update must arrive under a bumped version rather than overwriting
 * the broken pointer's version root. The desktop binary is unchanged — the
 * running version is config/manifest-driven.
 */
async function buildVersionBumpedMacPayloadFixture(
  payloadZipPath: string,
  workDir: string,
  bumpedVersion: string,
): Promise<string> {
  return await repackMacPayloadFixture(payloadZipPath, workDir, 'healed-payload', async (extractRoot, manifest) => {
    manifest.version = bumpedVersion;
    const executableRelPath = manifest.entry?.executable;
    if (executableRelPath == null || executableRelPath.length === 0) {
      throw new Error(`payload manifest has no entry.executable: ${payloadZipPath}`);
    }
    // <bundle>.app/Contents/MacOS/<binary> → <bundle>.app/Contents/Resources
    const configPath = join(extractRoot, dirname(dirname(executableRelPath)), 'Resources', 'open-design-config.json');
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

/**
 * Reset the namespace to a pristine pre-install state. `uninstall` removes the
 * installed app but deliberately keeps runtime data; lifecycle tests must not
 * inherit the previous test's (or a previous local run's) launcher pointers,
 * update store, or daemon preferences, so each test starts from zero.
 */
async function resetPackagedRuntimeState(): Promise<void> {
  await runToolsPackJson<MacStopResult>('stop').catch(() => undefined);
  await runToolsPackJson<MacUninstallResult>('uninstall').catch(() => undefined);
  await rm(runtimeNamespaceRoot, { force: true, recursive: true }).catch(() => undefined);
  await rm(
    join(toolsPackDir, 'runtime', 'mac', 'launcher', 'channels', updateScenario.channel, 'namespaces', namespace),
    { force: true, recursive: true },
  ).catch(() => undefined);
}

async function waitForDesktopGone(label: string, timeoutMs = 120_000): Promise<void> {
  const startedAt = Date.now();
  let lastResult: unknown = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const inspect = await runToolsPackJson<MacInspectResult>('inspect');
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
      const click = await runToolsPackJson<MacInspectResult>('inspect', ['--expr', clickUpdaterRailExpression]);
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
      const inspect = await runToolsPackJson<MacInspectResult>('inspect', ['--expr', updaterPopupExpression]);
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

function assertPayloadDesktopIdentity(
  identity: DesktopIdentityMarker,
  launcher: LauncherSnapshot,
  version: string,
): void {
  const payloadRoot = join(launcher.versionsRoot, version, 'payload');
  expect(identity.pid).toBeGreaterThan(0);
  expectPathInside(identity.appPath, payloadRoot);
  expectPathInside(identity.executablePath, payloadRoot);
}

function assertPptxExportEvalValue(value: unknown): PptxExportEvalValue {
  if (
    !isRecord(value) ||
    !isRecord(value.archive) ||
    typeof value.archive.hasContentTypes !== 'boolean' ||
    typeof value.archive.hasPresentation !== 'boolean' ||
    typeof value.archive.slideCount !== 'number' ||
    !Array.isArray(value.archive.textMatches) ||
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
  expect(value.archive).toEqual({
    hasContentTypes: true,
    hasPresentation: true,
    slideCount: 2,
    textMatches: [true, true],
  });
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

function asPackagedOnboardingEvalValue(value: unknown): PackagedOnboardingEvalValue | null {
  if (!isRecord(value)) return null;
  if (typeof value.cloudSignInVisible !== 'boolean') return null;
  if (typeof value.href !== 'string') return null;
  if (typeof value.onboardingVisible !== 'boolean') return null;
  if (value.text != null && typeof value.text !== 'string') return null;
  if (typeof value.title !== 'string') return null;
  return value as PackagedOnboardingEvalValue;
}

function asUpdaterPopupEvalValue(value: unknown): UpdaterPopupEvalValue | null {
  if (!isRecord(value)) return null;
  if (typeof value.visible !== 'boolean') return null;
  if (typeof value.installButtonVisible !== 'boolean') return null;
  if (typeof value.reinstallLinkVisible !== 'boolean') return null;
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

async function assertMacInviteProtocolRegistration(installedAppPath: string): Promise<void> {
  const plistPath = join(installedAppPath, 'Contents', 'Info.plist');
  const { stdout } = await execFileAsync('/usr/bin/plutil', [
    '-convert',
    'json',
    '-o',
    '-',
    plistPath,
  ]);
  const plist = JSON.parse(stdout) as {
    CFBundleURLTypes?: Array<{ CFBundleURLSchemes?: string[] }>;
  };
  const schemes = (plist.CFBundleURLTypes ?? []).flatMap(
    (entry) => entry.CFBundleURLSchemes ?? [],
  );
  expect(schemes).toContain('opendesign');
}

async function invokeMacInviteDeeplink(installedAppPath: string): Promise<void> {
  // `-a` pins delivery to this namespace's installed test bundle instead of a
  // developer's stable OpenDesign app that may own the same global scheme.
  await execFileAsync('/usr/bin/open', ['-a', installedAppPath, packagedInviteDeeplink]);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fileSizeBytes(filePath: string): Promise<number> {
  return (await stat(filePath)).size;
}

async function seedPackagedOnboardingComplete(): Promise<void> {
  await seedPackagedAppConfig({ onboardingCompleted: true });
}

async function seedPackagedHomeFirstRunConfig(
  codexEnv: Record<string, string>,
): Promise<void> {
  await seedPackagedAppConfig({
    mode: 'daemon',
    apiKey: '',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    agentId: 'codex',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    mediaProviders: {},
    agentModels: { codex: { model: 'default', reasoning: 'default' } },
    agentCliEnv: { codex: codexEnv },
  });
}

async function seedPackagedAppConfig(config: Record<string, unknown>): Promise<void> {
  const configPath = join(runtimeNamespaceRoot, 'data', 'app-config.json');
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

async function resetPackagedMacRuntimeData(): Promise<void> {
  await rm(runtimeNamespaceRoot, { force: true, recursive: true });
}

function resolveFromWorkspace(filePath: string): string {
  return isAbsolute(filePath) ? filePath : resolve(workspaceRoot, filePath);
}

function normalizeOptionalEnv(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized == null || normalized.length === 0 ? null : normalized;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function isExecError(value: unknown): value is { stderr: string; stdout: string } {
  return isRecord(value) && typeof value.stdout === 'string' && typeof value.stderr === 'string';
}

function formatUnknown(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
