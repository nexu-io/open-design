// @vitest-environment node

import { readFile } from 'node:fs/promises';
import { dirname,join } from 'node:path';

import { expect } from 'vitest';

import { packagedDebugChannelArgs } from '@/vitest/packaged-debug-channel';
import { releaseAppVersionArgs } from '@/vitest/packaged-win-identity';
import { missingWorkingWinInstallerOverwriteMarkers } from '@/vitest/win-installer-log';


import type { DirectInstallerResult,LauncherPointer,LauncherSnapshot,UpdateFixtureMode,WinInspectResult } from './context.js';
import { delay,execFileAsync,formatUnknown,isExecError,isRecord,maxToolsPackActionDurationMs,namespace,nativeRuntimeNamespaceBaseRoot,normalizeOptionalEnv,outputNamespaceRoot,releaseChannel,releaseVersion,requireMigrationInput,resolveFromWorkspace,toolsPackBin,toolsPackDir,updateBuildJsonPath,updateScenario,updateVersion,verifyPublicImmutableArtifacts,workspaceRoot } from './context.js';

export async function runToolsPackJson<T>(action: string, extraArgs: string[] = []): Promise<T> {
  return runToolsPackJsonForVersion(action, releaseVersion, extraArgs);
}

export async function runToolsPackJsonForVersion<T>(
  action: string,
  appVersion: string | null | undefined,
  extraArgs: string[] = [],
): Promise<T> {
  const runtimeBaseArgs = verifyPublicImmutableArtifacts
    && ['inspect', 'install', 'logs', 'start', 'stop', 'wait'].includes(action)
    ? ['--runtime-base-root', nativeRuntimeNamespaceBaseRoot]
    : [];
  const args = [
    toolsPackBin,
    'win',
    action,
    '--dir',
    toolsPackDir,
    '--namespace',
    namespace,
    ...packagedDebugChannelArgs(releaseChannel),
    ...releaseAppVersionArgs(appVersion),
    '--json',
    ...runtimeBaseArgs,
    ...extraArgs,
  ];
  const startedAt = Date.now();
  console.info(`[windows tools-pack] action:start action=${action}`);
  const result = await execFileAsync(process.execPath, args, {
    cwd: workspaceRoot,
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
    timeout: maxToolsPackActionDurationMs,
  }).then((value) => {
    console.info(`[windows tools-pack] action:done action=${action} durationMs=${Date.now() - startedAt}`);
    return value;
  }).catch((error: unknown) => {
    if (isExecError(error)) {
      throw new Error(
        [
          `tools-pack win ${action} failed after ${Date.now() - startedAt}ms`,
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

export function assertWorkingWinInstallerOverwriteLog(lines: string[]): void {
  // The custom installer stages and validates the successor before moving the
  // old install aside, then rolls back both filesystem and launcher state on
  // any failure. Keep real packaged smoke aligned with those transaction
  // boundaries instead of accepting a successful process exit alone.
  expect(missingWorkingWinInstallerOverwriteMarkers(lines)).toEqual([]);
}

export async function runDirectInstaller(
  installerPath: string,
  installDir: string,
  nsisLogPath = join(outputNamespaceRoot, 'logs', 'nsis.log'),
  extraArgs: string[] = [],
): Promise<DirectInstallerResult> {
  const previousLogLines = await readNsisLogLines(nsisLogPath);
  const command = process.platform === 'win32'
    ? execFileAsync(
        'powershell.exe',
        [
          '-NoLogo',
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          [
            `$launchArgs = @('/S')`,
            'if (-not [string]::IsNullOrWhiteSpace($env:OD_TEST_INSTALLER_EXTRA_ARGS)) { $launchArgs += @($env:OD_TEST_INSTALLER_EXTRA_ARGS) }',
            `$launchArgs += @('/D=' + $env:OD_TEST_INSTALL_DIR)`,
            '$process = Start-Process -FilePath $env:OD_TEST_INSTALLER_PATH -ArgumentList $launchArgs -Wait -PassThru -WindowStyle Hidden',
            'exit $process.ExitCode',
          ].join('\n'),
        ],
        {
          cwd: dirname(installerPath),
          env: {
            ...process.env,
            OD_TEST_INSTALLER_EXTRA_ARGS: extraArgs.join(' '),
            OD_TEST_INSTALLER_PATH: installerPath,
            OD_TEST_INSTALL_DIR: installDir,
          },
          maxBuffer: 20 * 1024 * 1024,
        },
      )
    : execFileAsync(installerPath, ['/S', ...extraArgs, `/D=${installDir}`], {
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

export async function runHiddenWindowsExecutable(executablePath: string, args: string[]): Promise<number | null> {
  const command = process.platform === 'win32'
    ? execFileAsync(
        'powershell.exe',
        [
          '-NoLogo',
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          [
            '$process = Start-Process -FilePath $env:OD_TEST_EXECUTABLE_PATH -ArgumentList $env:OD_TEST_EXECUTABLE_ARGUMENT_LINE -Wait -PassThru -WindowStyle Hidden',
            'exit $process.ExitCode',
          ].join('\n'),
        ],
        {
          cwd: workspaceRoot,
          env: {
            ...process.env,
            OD_TEST_EXECUTABLE_ARGUMENT_LINE: args
              .map((arg) => /\s|"/u.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg)
              .join(' '),
            OD_TEST_EXECUTABLE_PATH: executablePath,
          },
          maxBuffer: 20 * 1024 * 1024,
        },
      )
    : execFileAsync(executablePath, args, {
        cwd: workspaceRoot,
        env: process.env,
        maxBuffer: 20 * 1024 * 1024,
      });
  const error = await command.then(
    () => null,
    (caught: unknown) => caught,
  );
  return isExecError(error) ? Number(error.code) : error == null ? 0 : null;
}

export async function readNsisLogLines(nsisLogPath = join(outputNamespaceRoot, 'logs', 'nsis.log')): Promise<string[]> {
  const raw = await readFile(nsisLogPath, 'utf8').catch(() => '');
  return raw.split(/\r?\n/).filter((line) => line.length > 0);
}

export async function resolveLocalUpdateFixture(
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

export async function resolveMainBuildInstallerPath(): Promise<string> {
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

export async function waitForDownloadedUpdater(
  expectedVersion: string | null,
  expectedArtifactType: UpdateFixtureMode,
  timeoutMs = 120_000,
  expectedCurrentVersion = updateScenario.expectedCurrentVersion,
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

export function resolveFallbackUpdateBuildJsonPath(): string | null {
  if (updateBuildJsonPath != null && updateBuildJsonPath !== '') return resolveFromWorkspace(updateBuildJsonPath);
  const mainBuildJsonPath = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_BUILD_JSON_PATH);
  if (mainBuildJsonPath == null || mainBuildJsonPath === '') return null;
  return join(dirname(resolveFromWorkspace(mainBuildJsonPath)), 'windows-tools-pack-update-build.json');
}

export function assertToolsServeFixtureEnabled(platformName: string, value: string | null): void {
  if (value === 'tools-serve') return;
  throw new Error(
    `full packaged ${platformName} payload smoke requires explicit tools-serve fixture; set OD_PACKAGED_E2E_WIN_UPDATE_FIXTURE=tools-serve or provide OD_PACKAGED_E2E_WIN_UPDATE_METADATA_URL`,
  );
}

export function assertUpdateVersionPresent(platformName: string, value: string | null): asserts value is string {
  if (value != null && value.length > 0) return;
  throw new Error(`full packaged ${platformName} payload smoke requires an explicit update target version with external update metadata`);
}

export async function readLatestYmlVersion(latestYmlPath: string): Promise<string | null> {
  const latestYml = await readFile(resolveFromWorkspace(latestYmlPath), 'utf8').catch(() => null);
  if (latestYml == null) return null;
  const match = /^version:\s+"?([^\r\n"]+)"?/m.exec(stripUtf8Bom(latestYml));
  return match?.[1] ?? null;
}

export function stripUtf8Bom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

export const UPDATE_ENV_KEYS = [
  'OD_UPDATE_AUTO_CHECK',
  'OD_UPDATE_ENABLED',
  'OD_UPDATE_METADATA_URL',
  'OD_STANDALONE_METADATA_URL',
  'OD_UPDATE_CURRENT_VERSION',
  'OD_UPDATE_OPEN_DRY_RUN',
] as const;

export function captureUpdateEnv(): Partial<Record<(typeof UPDATE_ENV_KEYS)[number], string>> {
  return Object.fromEntries(
    UPDATE_ENV_KEYS
      .map((key) => [key, process.env[key]] as const)
      .filter((entry): entry is readonly [(typeof UPDATE_ENV_KEYS)[number], string] => entry[1] != null),
  );
}

export function restoreUpdateEnv(previous: Partial<Record<(typeof UPDATE_ENV_KEYS)[number], string>>): void {
  for (const key of UPDATE_ENV_KEYS) {
    if (previous[key] == null) delete process.env[key];
    else process.env[key] = previous[key];
  }
}
