// @vitest-environment node

import { mkdir,readdir,readFile } from 'node:fs/promises';
import { dirname,join } from 'node:path';

import { expect } from 'vitest';

import { packagedDebugChannelArgs } from '@/vitest/packaged-debug-channel';
import { releaseAppVersionArgs } from '@/vitest/packaged-release-version';
import {
	type PackagedSmokeReport
} from '@/vitest/packaged-report';


import { fileSizeBytes } from './assertions.js';
import type { LogsResult,MacInspectResult,MacStartResult } from './context.js';
import { execFileAsync,formatUnknown,isExecError,macFocusWitness,namespace,normalizeOptionalEnv,outputNamespaceRoot,packagedHeadless,pnpmCommand,releaseChannel,releaseVersion,resolveFromWorkspace,toolsPackDir,updateBuildJsonPath,updateVersion,workspaceRoot } from './context.js';
import { readDesktopIdentityMarker } from './runtime.js';

export async function runToolsPackJson<T>(
  action: string,
  extraArgs: string[] = [],
  releaseVersionOverride: string | null | undefined = releaseVersion,
): Promise<T> {
  const startSourceArgs = action === 'start' ? ['--start-source', 'installed'] : [];
  const args = [
    'exec',
    'tools-pack',
    'mac',
    action,
    '--dir',
    toolsPackDir,
    '--namespace',
    namespace,
    ...packagedDebugChannelArgs(releaseChannel),
    ...releaseAppVersionArgs(releaseVersionOverride),
    '--json',
    ...startSourceArgs,
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
    const parsed = JSON.parse(result.stdout) as T;
    if (action === 'start' && macFocusWitness != null) {
      const start = parsed as MacStartResult;
      await macFocusWitness.track({ appPath: start.appPath, pid: start.pid });
    } else if (action === 'inspect' && macFocusWitness != null) {
      const inspect = parsed as MacInspectResult;
      if (inspect.status?.pid != null) {
        await macFocusWitness.track({
          appPath: await resolveRunningMacAppPath(),
          pid: inspect.status.pid,
        });
      }
    }
    return parsed;
  } catch (error) {
    throw new Error(`tools-pack mac ${action} did not print JSON: ${String(error)}\n${result.stdout}`);
  }
}

export async function resolveRunningMacAppPath(): Promise<string> {
  try {
    return (await readDesktopIdentityMarker()).appPath;
  } catch (error) {
    const applicationsRoot = join(outputNamespaceRoot, 'install', 'Applications');
    const appNames = (await readdir(applicationsRoot)).filter((name) => name.endsWith('.app'));
    if (appNames.length === 1) return join(applicationsRoot, appNames[0]!);
    throw new Error(
      `cannot resolve running packaged app after identity-root transition: ${formatUnknown(error)}; candidates=${JSON.stringify(appNames)}`,
    );
  }
}

export async function capturePackagedCheckpoint(
  report: PackagedSmokeReport,
  name: string,
  observed: MacInspectResult,
): Promise<void> {
  const checkpointPath = join(
    toolsPackDir,
    'screenshots',
    'checkpoints',
    `${name.replace(/[^a-zA-Z0-9_-]+/g, '-')}.png`,
  );
  await mkdir(dirname(checkpointPath), { recursive: true });
  const capture = await runToolsPackJson<MacInspectResult>('inspect', ['--path', checkpointPath]);
  expect(capture.screenshot?.path).toBe(checkpointPath);
  expect(await fileSizeBytes(checkpointPath)).toBeGreaterThan(0);
  if (packagedHeadless) {
    expect(observed.status?.windowVisible, `${name} must remain hidden in headless smoke`).toBe(false);
    expect(capture.status?.windowVisible, `${name} capture must not reveal the window`).toBe(false);
  }
  const focusWitness = macFocusWitness;
  if (focusWitness != null) {
    const identity = await readDesktopIdentityMarker();
    await focusWitness.track({ appPath: identity.appPath, pid: identity.pid });
  }
  const logs = await runToolsPackJson<LogsResult>('logs').catch((error: unknown) => ({
    error: formatUnknown(error),
  }));
  const checkpoint = await report.saveCheckpoint({
    logs,
    name,
    screenshotPath: checkpointPath,
    snapshot: {
      capture,
      focus: macFocusWitness?.snapshot() ?? null,
      observed,
    },
  });
  console.info(`[packaged evidence] ${checkpoint.name}: ${checkpoint.snapshot}`);
}

export async function resolveLocalPayloadUpdateFixture(): Promise<{ payloadPath: string; targetVersion: string }> {
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

export function resolveFallbackUpdateBuildJsonPath(): string | null {
  if (updateBuildJsonPath != null && updateBuildJsonPath !== '') return resolveFromWorkspace(updateBuildJsonPath);
  const mainBuildJsonPath = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_BUILD_JSON_PATH);
  if (mainBuildJsonPath == null || mainBuildJsonPath === '') return null;
  return join(dirname(resolveFromWorkspace(mainBuildJsonPath)), 'mac-tools-pack-update-build.json');
}

export function assertToolsServeFixtureEnabled(platformName: string, value: string | null): void {
  if (value === 'tools-serve') return;
  throw new Error(
    `full packaged ${platformName} payload smoke requires explicit tools-serve fixture; set OD_PACKAGED_E2E_MAC_UPDATE_FIXTURE=tools-serve or provide OD_PACKAGED_E2E_MAC_UPDATE_METADATA_URL`,
  );
}

export function assertUpdateVersionPresent(platformName: string, value: string | null): asserts value is string {
  if (value != null && value.length > 0) return;
  throw new Error(`full packaged ${platformName} payload smoke requires an explicit update target version with external update metadata`);
}

export async function readLatestMacYmlVersion(latestMacYmlPath: string): Promise<string | null> {
  const latestMacYml = await readFile(resolveFromWorkspace(latestMacYmlPath), 'utf8').catch(() => null);
  if (latestMacYml == null) return null;
  const match = /^version:\s+"?([^\r\n"]+)"?/m.exec(stripUtf8Bom(latestMacYml));
  return match?.[1] ?? null;
}

export function stripUtf8Bom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

export const UPDATE_ENV_KEYS = [
  'OD_UPDATE_AUTO_CHECK',
  'OD_UPDATE_ENABLED',
  'OD_UPDATE_METADATA_URL',
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
