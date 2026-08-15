// @vitest-environment node

import { copyFile,mkdir,readFile,rm,writeFile } from 'node:fs/promises';
import { dirname,join } from 'node:path';


import {
	packagedAppShellExpression,
	PackagedOnboardingConfigError,
	packagedOnboardingConfigExpression
} from '@/vitest/packaged-app-shell';
import {
	readCommittedPackagedClosureFixture,
	type PackagedClosureFixture
} from '@/vitest/packaged-closure-fixture';


import { runToolsPackJson,settledLauncherGeneration } from './actions.js';
import { asHealthEvalValue,asPackagedOnboardingEvalValue } from './assertions.js';
import type { PackagedOnboardingEvalValue,WinInspectResult } from './context.js';
import { delay,execFileAsync,formatUnknown,healthExpression,maxStartDurationMs,packagedOnboardingExpression,readinessExpression,verifyCoreOnly } from './context.js';

export async function waitForHealthyDesktop(timeoutMs = 90_000): Promise<WinInspectResult> {
  const inspect = await runToolsPackJson<WinInspectResult>('wait', [
    '--timeout-ms',
    String(timeoutMs),
    '--status-poll-interval-ms',
    '1000',
    ...(verifyCoreOnly ? ['--allow-daemon-fallback'] : []),
  ]);
  if (inspect.wait != null) {
    console.info(
      `[windows healthy wait] attempts=${inspect.wait.attempts} durationMs=${inspect.wait.durationMs} intervalMs=${inspect.wait.intervalMs}`,
    );
  }
  if (inspect.eval?.ok === true) {
    const value = asHealthEvalValue(inspect.eval.value);
    if (value?.status === 200 && value.health.ok === true && typeof value.health.version === 'string') return inspect;
  }
  throw new Error(`packaged windows runtime wait returned without healthy state: ${formatUnknown(inspect)}`);
}

export async function waitForDesktopStopped(timeoutMs = 15_000): Promise<void> {
  const startedAt = Date.now();
  let lastResult: unknown = null;
  while (Date.now() - startedAt < timeoutMs) {
    const inspect = await runToolsPackJson<WinInspectResult>('inspect').catch((error: unknown) => {
      lastResult = error;
      return null;
    });
    if (inspect == null) {
      await delay(150);
      continue;
    }
    lastResult = inspect;
    if (inspect.status == null && inspect.statusError?.includes('ENOENT')) return;
    await delay(150);
  }
  throw new Error(`packaged windows Desktop IPC remained available after stop: ${formatUnknown(lastResult)}`);
}

export async function waitForCommittedPackagedClosureFixture(
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
export async function readPackagedOnboardingConfig(): Promise<unknown> {
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
export async function observePackagedAppShell(): Promise<unknown> {
  const inspect = await runToolsPackJson<WinInspectResult>('inspect', ['--expr', packagedAppShellExpression]);
  if (inspect.eval?.ok !== true) {
    throw new Error(`packaged windows renderer could not evaluate the app-shell probe: ${formatUnknown(inspect)}`);
  }
  return inspect.eval.value;
}

export async function waitForHealthyDesktopVersion(
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

export async function waitForHealthyDesktopShellVersion(
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

export async function waitForPackagedOnboarding(
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

export async function repackWinPayloadFixture(
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
export async function buildCorruptedWinPayloadFixture(
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
export async function buildVersionBumpedWinPayloadFixture(
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

export function bumpCountedVersion(version: string): string {
  const match = /^(\d+\.\d+\.\d+-[a-z0-9]{1,12})\.(\d+)$/.exec(version);
  if (match?.[1] == null || match[2] == null) {
    throw new Error(`rollback acceptance requires a counted version to bump: ${version}`);
  }
  return `${match[1]}.${Number(match[2]) + 1}`;
}

export async function waitForDesktopGone(label: string, timeoutMs = 120_000): Promise<void> {
  const startedAt = Date.now();
  let lastResult: unknown = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const inspect = await runToolsPackJson<WinInspectResult>('inspect', ['--include-managed-processes']);
      lastResult = inspect;
      if (
        (inspect.status == null || inspect.status.state !== 'running')
        && inspect.managedProcessPids?.length === 0
      ) return;
    } catch (error) {
      // An inspect failure does not prove process death; retain it as timeout
      // evidence and keep polling the read-only process oracle.
      lastResult = error;
    }
    await delay(1000);
  }
  throw new Error(`${label}: desktop still running: ${formatUnknown(lastResult)}`);
}

export async function waitForTerminalUpdateState(expectedVersion: string): Promise<WinInspectResult> {
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
