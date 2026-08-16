// @vitest-environment node

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect } from 'vitest';

import {
	packagedOnboardingCompletedFromProbe
} from '@/vitest/packaged-app-shell';
import { type ToolsServeUpdaterFixture } from '@/vitest/tools-serve-updater-fixture';


import { assertLauncherPointer,assertWorkingWinInstallerOverwriteLog,runDirectInstaller,runToolsPackJson,runToolsPackJsonForVersion,settledLauncherGeneration,waitForDownloadedUpdater } from './actions.js';
import { assertHealthEvalValue,assertPayloadDesktopIdentity,assertPptxExportEvalValue,assertSettledDesktopHandoff,expectPathInside,expectWindowsHealthyRendererUrl,expectWindowsPackagedAppUrl,readDesktopIdentityMarker } from './assertions.js';
import type { DesktopIdentityMarker,DirectInstallerResult,HealthEvalValue,LauncherSnapshot,PptxExportEvalValue,SmokeTiming,WinInspectResult,WinListResult,WinStartResult,WinStopResult } from './context.js';
import { existingProjectPptxExportExpression,formatUnknown,installIdentity,namespace,portableNsisLogPath,pptxExportExpression,runtimeNamespaceRoot,sha256File } from './context.js';
import { readPackagedOnboardingConfig,waitForHealthyDesktopShellVersion,waitForTerminalUpdateState } from './runtime.js';

export async function measureSmokeStep<T>(timings: SmokeTiming[], step: string, run: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    return await run();
  } finally {
    timings.push({ durationMs: Date.now() - startedAt, step });
  }
}

export function printSmokeTimings(timings: SmokeTiming[]): void {
  const totalMs = timings.reduce((sum, timing) => sum + timing.durationMs, 0);
  console.info(
    [
      '[windows smoke timings]',
      ...timings.map((timing) => `${timing.step}: ${Math.round(timing.durationMs / 100) / 10}s`),
      `measured total: ${Math.round(totalMs / 100) / 10}s`,
    ].join('\n'),
  );
}

export function printLifecycleTimings(title: string, timings: SmokeTiming[] | undefined): void {
  if (timings == null || timings.length === 0) return;
  console.info(
    [
      `[windows ${title}]`,
      ...timings.map((timing) => `${timing.step}: ${Math.round(timing.durationMs / 100) / 10}s`),
    ].join('\n'),
  );
}

export type PayloadUpdateSummary = {
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

export type InstallerFallbackSummary = {
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

export type UpdaterRecoverySummary = {
  cleared: NonNullable<WinInspectResult['update']>;
  downloadedBeforeClear: NonNullable<WinInspectResult['update']>;
  installer: InstallerFallbackSummary;
  terminal: NonNullable<WinInspectResult['update']>;
};

export async function runSameVersionUpdaterRecoveryAcceptance(options: {
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
  const running = await waitForHealthyDesktopShellVersion(
    options.targetVersion,
    options.targetVersion,
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
    expectedStandaloneVersion: options.targetVersion,
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

export async function runPayloadUpdateAcceptance(options: {
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
  const terminal = await waitForTerminalUpdateState(options.expectedStandaloneVersion);
  if (terminal.update == null) throw new Error('payload update terminal state did not return update status');

  const stop = await runToolsPackJson<WinStopResult>('stop');
  expect(stop.status).not.toBe('partial');
  expect(stop.remainingPids).toEqual([]);
  const start = await runToolsPackJson<WinStartResult>('start');
  expect(start.source).toBe('installed');
  const coldInspect = await waitForHealthyDesktopShellVersion(
    targetVersion,
    targetVersion,
    identity.pid,
  );
  const coldHealth = assertHealthEvalValue(coldInspect.eval?.value);
  expectWindowsHealthyRendererUrl(coldHealth.href);
  expect(coldHealth.status).toBe(200);
  expect(coldHealth.health.ok).toBe(true);
  expect(coldHealth.health.version).toBe(targetVersion);
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
    targetVersion,
    targetVersion,
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

export async function runInstallerFallbackAcceptance(options: {
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

  const install = await runDirectInstaller(
    downloadPath,
    options.installDir,
    options.nsisLogPath ?? portableNsisLogPath,
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
