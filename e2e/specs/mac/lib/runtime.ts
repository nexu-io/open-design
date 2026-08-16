// @vitest-environment node

import { chmod,copyFile,mkdir,readFile,rename,rm,writeFile } from 'node:fs/promises';
import { dirname,join } from 'node:path';

import { expect } from 'vitest';

import {
	resetPackagedClosureFixture
} from '@/vitest/packaged-closure-fixture';
import {
	assertPackagedVelaRuntimeStatus,
	packagedVelaStatusExpression,
} from '@/vitest/packaged-vela-runtime';


import { asHealthEvalValue,asPackagedOnboardingEvalValue,describeMacLaunchServicesWitness,expectPathInside,pathExists } from './assertions.js';
import type { DesktopIdentityMarker,LauncherPointer,LauncherSnapshot,LogsResult,MacInspectResult,MacInstallResult,MacStopResult,MacUninstallResult,PackagedOnboardingEvalValue,PptxExportEvalValue,UpgradePersistenceSeed } from './context.js';
import { delay,execFileAsync,formatUnknown,healthExpression,isRecord,maxStartDurationMs,namespace,normalizeOptionalEnv,packagedOnboardingExpression,releaseVersion,resolveFromWorkspace,runtimeNamespaceRoot,toolsPackDir,updateScenario } from './context.js';
import { runToolsPackJson,stripUtf8Bom } from './tools.js';

export async function waitForHealthyDesktop(
  releaseVersionOverride: string | null | undefined = releaseVersion,
): Promise<MacInspectResult> {
  const timeoutMs = maxStartDurationMs;
  const startedAt = Date.now();
  let lastResult: unknown = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const inspect = await runToolsPackJson<MacInspectResult>('inspect', [
        '--expr',
        healthExpression,
        '--update-action',
        'status',
      ], releaseVersionOverride);
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

  throw new Error([
    `packaged mac runtime did not become healthy: ${formatUnknown(lastResult)}`,
    await describeMacLaunchServicesWitness(),
  ].join('\n'));
}

export async function assertPackagedVelaRuntime(): Promise<void> {
  const inspect = await runToolsPackJson<MacInspectResult>('inspect', [
    '--expr',
    packagedVelaStatusExpression,
  ]);
  assertPackagedVelaRuntimeStatus(inspect.eval?.value);
}

export async function waitForHealthyDesktopShellVersion(
  expectedShellVersion: string,
  expectedStandaloneVersion: string,
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
      const inspect = await runToolsPackJson<MacInspectResult>('inspect', [
        '--expr',
        healthExpression,
        '--update-action',
        'status',
      ]);
      lastResult = inspect;
      if (inspect.status?.state === 'running' && inspect.eval?.ok === true) {
        const value = asHealthEvalValue(inspect.eval.value);
        if (
          value?.status === 200 &&
          value.health.ok === true &&
          value.health.version === expectedStandaloneVersion &&
          inspect.update?.currentVersion === expectedStandaloneVersion &&
          (previousPid == null || inspect.status.pid !== previousPid) &&
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
    `packaged mac Shell ${expectedShellVersion} did not relaunch with Standalone ${expectedStandaloneVersion}: ${formatUnknown(lastResult)}`,
  );
}

export async function waitForPackagedOnboarding(
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

export async function waitForUpdaterStatus(
  predicate: (inspect: MacInspectResult) => boolean,
  label: string,
  timeoutMs = 120_000,
  releaseVersionOverride: string | null | undefined = releaseVersion,
): Promise<MacInspectResult> {
  const startedAt = Date.now();
  let lastResult: unknown = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const inspect = await runToolsPackJson<MacInspectResult>(
        'inspect',
        ['--update-action', 'status'],
        releaseVersionOverride,
      );
      lastResult = inspect;
      if (predicate(inspect)) return inspect;
    } catch (error) {
      lastResult = error;
    }
    await delay(750);
  }
  throw new Error(`${label}: updater status timed out: ${formatUnknown(lastResult)}`);
}

export async function repackMacPayloadFixture(
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
export async function buildCorruptedMacPayloadFixture(payloadZipPath: string, workDir: string): Promise<string> {
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
export async function buildVersionBumpedMacPayloadFixture(
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
    const config = JSON.parse(await readFile(configPath, 'utf8')) as { shellVersion?: string };
    config.shellVersion = bumpedVersion;
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  });
}

export function bumpCountedVersion(version: string): string {
  const match = /^(\d+\.\d+\.\d+-[a-z0-9]{1,12})\.(\d+)$/.exec(version);
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
export async function resetPackagedRuntimeState(): Promise<void> {
  const stop = await runToolsPackJson<MacStopResult>('stop');
  if (stop.status === 'partial' || stop.remainingPids.length > 0) {
    throw new Error(`cannot establish pristine mac smoke state: ${formatUnknown(stop)}`);
  }
  const uninstall = await runToolsPackJson<MacUninstallResult>('uninstall');
  if (await pathExists(uninstall.installedAppPath)) {
    throw new Error(`cannot establish pristine mac smoke state: app remains at ${uninstall.installedAppPath}`);
  }
  const launcherNamespaceRoot = join(
    toolsPackDir,
    'runtime',
    'mac',
    'launcher',
    'channels',
    updateScenario.channel,
    'namespaces',
    namespace,
  );
  await rm(runtimeNamespaceRoot, { force: true, recursive: true });
  await rm(launcherNamespaceRoot, { force: true, recursive: true });
  await resetPackagedClosureFixture({
    channel: updateScenario.channel,
    installationRoot: join(toolsPackDir, 'runtime', 'mac'),
    namespace,
  });
  if (await pathExists(runtimeNamespaceRoot) || await pathExists(launcherNamespaceRoot)) {
    throw new Error('cannot establish pristine mac smoke state: runtime roots remain after reset');
  }
}

export async function resolveMainBuildDmgPath(): Promise<string> {
  const buildJsonPath = requireMigrationInput(
    'OD_PACKAGED_E2E_BUILD_JSON_PATH',
    normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_BUILD_JSON_PATH),
  );
  const build = JSON.parse(stripUtf8Bom(await readFile(resolveFromWorkspace(buildJsonPath), 'utf8'))) as {
    dmgPath?: unknown;
  };
  if (typeof build.dmgPath !== 'string' || build.dmgPath.length === 0) {
    throw new Error(`packaged build metadata is missing dmgPath: ${buildJsonPath}`);
  }
  return resolveFromWorkspace(build.dmgPath);
}

export async function installLegacyMacDmg(input: {
  currentDmgPath: string;
  legacyDmgPath: string;
  legacyVersion: string;
}): Promise<MacInstallResult> {
  const backupPath = `${input.currentDmgPath}.current-${process.pid}`;
  if (await pathExists(backupPath)) {
    throw new Error(`refusing to overwrite an existing current DMG backup: ${backupPath}`);
  }
  await rename(input.currentDmgPath, backupPath);
  try {
    await copyFile(resolveFromWorkspace(input.legacyDmgPath), input.currentDmgPath);
    return await runToolsPackJson<MacInstallResult>('install', [], input.legacyVersion);
  } finally {
    await rm(input.currentDmgPath, { force: true });
    await rename(backupPath, input.currentDmgPath);
  }
}

export function requireMigrationInput(name: string, value: string | null | undefined): string {
  if (value != null && value.length > 0) return value;
  throw new Error(`full historical migration acceptance requires ${name}`);
}

export async function waitForDesktopGone(label: string, timeoutMs = 120_000): Promise<void> {
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

export async function waitForProcessExit(pid: number, label: string, timeoutMs = 30_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await delay(100);
  }
  throw new Error(`${label}: process ${pid} is still alive`);
}

export async function readDesktopIdentityMarker(): Promise<DesktopIdentityMarker> {
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

export function assertClosureDesktopIdentity(
  identity: DesktopIdentityMarker,
  standaloneVersion: string,
  releaseVersion: string = standaloneVersion,
): void {
  if (identity.runtime?.descriptor?.standalone?.version !== standaloneVersion) {
    throw new Error(`packaged mac did not attach the seeded Closure: ${formatUnknown(identity.runtime)}`);
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

export function assertPayloadDesktopIdentity(
  identity: DesktopIdentityMarker,
  launcher: LauncherSnapshot,
  shellVersion: string,
  standaloneVersion: string,
  releaseVersion: string = standaloneVersion,
): void {
  const payloadRoot = join(launcher.versionsRoot, shellVersion, 'payload');
  expect(identity.pid).toBeGreaterThan(0);
  expectPathInside(identity.appPath, payloadRoot);
  expectPathInside(identity.executablePath, payloadRoot);
  expect(identity.runtime?.descriptor).toMatchObject({
    release: { version: releaseVersion },
    standalone: { protocolVersion: 1, version: standaloneVersion },
  });
  expect(identity.runtime?.descriptor).not.toHaveProperty('shell');
}

export function assertPptxExportEvalValue(value: unknown): PptxExportEvalValue {
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
  if (value.status !== 200) {
    throw new Error(`PPTX export returned a non-success response: ${formatUnknown(value)}`);
  }
  expect(value.contentType).toContain(
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  );
  expect(value.byteLength).toBeGreaterThan(0);
  expect(value.magic).toBe('PK');
  return value as PptxExportEvalValue;
}

export function assertUpgradePersistenceSeed(value: unknown): UpgradePersistenceSeed {
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

export function assertSettledDesktopHandoff(value: unknown | null): void {
  if (value == null) return;
  if (!isRecord(value)) throw new Error(`invalid launcher desktop handoff: ${formatUnknown(value)}`);
  expect(value.state).toBe('confirmed');
}

export function assertLauncherPointer(
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

export function settledLauncherGeneration(launcher: LauncherSnapshot, expectedVersion: string): number | null {
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

export function assertLogPathsAndContent(result: LogsResult): void {
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

export function summarizeLogs(result: LogsResult): Record<string, { lineCount: number; logPath: string }> {
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

export async function printPackagedLogs(): Promise<void> {
  const result = await runToolsPackJson<LogsResult>('logs');
  for (const [app, entry] of Object.entries(result.logs)) {
    console.error(`[${app}] ${entry.logPath}`);
    console.error(entry.lines.join('\n') || '(no log lines)');
  }
}
