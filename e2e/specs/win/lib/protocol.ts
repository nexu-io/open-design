// @vitest-environment node

import { readFile,stat } from 'node:fs/promises';
import { join } from 'node:path';

import { expect } from 'vitest';



import { runToolsPackJsonForVersion,stripUtf8Bom } from './actions.js';
import type { TimingResult,WinListResult } from './context.js';
import { activeRuntimeNamespaceRoot,delay,execFileAsync,installIdentity,isExecError,isRecord,normalizeOptionalEnv,packagedInviteDeeplink,releaseVersion,updateScenario } from './context.js';

export async function assertWindowsInviteProtocolRegistration(installDir: string): Promise<void> {
  const { stdout } = await execFileAsync('reg.exe', [
    'query',
    'HKCU\\Software\\Classes\\opendesign\\shell\\open\\command',
    '/ve',
  ]);
  const command = stdout.match(/REG_SZ\s+(.+)$/mi)?.[1]?.trim();
  expect(command).toBe(`"${join(installDir, 'Open Design.exe')}" "%1"`);
  expect(command?.toLowerCase()).not.toContain('\\versions\\');
}

export async function readWindowsInviteProtocolCommand(): Promise<string | null> {
  const result = await execFileAsync('reg.exe', [
    'query',
    'HKCU\\Software\\Classes\\opendesign\\shell\\open\\command',
    '/ve',
  ]).catch((error: unknown) => {
    if (isExecError(error) && Number(error.code) === 1) return null;
    throw error;
  });
  if (result == null) return null;
  return result.stdout.match(/REG_SZ\s+(.+)$/mi)?.[1]?.trim() ?? null;
}

export async function writeWindowsInviteProtocolCommand(command: string): Promise<void> {
  await execFileAsync('reg.exe', [
    'add',
    'HKCU\\Software\\Classes\\opendesign\\shell\\open\\command',
    '/ve',
    '/t',
    'REG_SZ',
    '/d',
    command,
    '/f',
  ]);
}

export async function deleteWindowsInviteProtocolRegistration(): Promise<void> {
  await execFileAsync('reg.exe', [
    'delete',
    'HKCU\\Software\\Classes\\opendesign',
    '/f',
  ]).catch((error: unknown) => {
    if (!isExecError(error) || Number(error.code) !== 1) throw error;
  });
}

export async function readInstalledWindowsShellVersion(installDir: string): Promise<string | null> {
  const packageJson = JSON.parse(
    stripUtf8Bom(await readFile(join(installDir, 'resources', 'app', 'package.json'), 'utf8')),
  ) as { version?: unknown };
  return typeof packageJson.version === 'string' ? packageJson.version : null;
}

export async function readRegisteredWindowsShellVersion(appVersion: string): Promise<string | null> {
  const list = await runToolsPackJsonForVersion<WinListResult>('list', appVersion);
  return list.current.registryEntries[0]?.displayVersion ?? null;
}

export async function fileExists(filePath: string): Promise<boolean> {
  return await stat(filePath).then(() => true, () => false);
}

export async function waitForWindowsNativeUninstall(paths: {
  installDir: string;
  startMenuShortcutPath: string;
  userDesktopShortcutPath: string;
}, timeoutMs = 15_000): Promise<void> {
  const uninstallRegistryKey = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Open Design-${installIdentity.namespaceToken}`;
  const startedAt = Date.now();
  let pending: string[] = [];
  do {
    const [installDirExists, startMenuExists, desktopExists, registryExists] = await Promise.all([
      fileExists(paths.installDir),
      fileExists(paths.startMenuShortcutPath),
      fileExists(paths.userDesktopShortcutPath),
      execFileAsync('reg.exe', ['query', uninstallRegistryKey]).then(() => true, () => false),
    ]);
    pending = [
      ...(installDirExists ? [paths.installDir] : []),
      ...(startMenuExists ? [paths.startMenuShortcutPath] : []),
      ...(desktopExists ? [paths.userDesktopShortcutPath] : []),
      ...(registryExists ? [uninstallRegistryKey] : []),
    ];
    if (pending.length === 0) return;
    await delay(100);
  } while (Date.now() - startedAt < timeoutMs);
  throw new Error(`native Windows uninstall did not settle: ${pending.join(', ')}`);
}

export async function invokeWindowsInviteDeeplink(): Promise<void> {
  await invokeWindowsProtocolProcess(packagedInviteDeeplink);
}

export async function invokeWindowsInviteDeeplinkDirect(installDir: string): Promise<void> {
  await invokeWindowsProtocolProcess(join(installDir, 'Open Design.exe'), packagedInviteDeeplink);
}

export type WindowsProtocolLaunchObservation = {
  exited: boolean;
  exitCode: number | null;
  pid: number;
};

export async function launchNativeWindowsAcceptance(installDir: string): Promise<WindowsProtocolLaunchObservation> {
  return await invokeWindowsProtocolProcess(join(installDir, 'Open Design.exe'), undefined, {
    OD_STANDALONE_METADATA_URL: resolveNativeAcceptanceStandaloneMetadataUrl(),
    OD_UPDATE_METADATA_URL: resolveNativeAcceptanceUpdateMetadataUrl(),
  });
}

export function resolveNativeAcceptanceUpdateMetadataUrl(): string {
  const version = normalizeOptionalEnv(releaseVersion);
  if (version == null) throw new Error('native Windows acceptance requires OD_PACKAGED_E2E_RELEASE_VERSION');
  const channel = updateScenario.channel;
  const expectedPath = `/${channel}/versions/${encodeURIComponent(version)}/metadata.json`;
  const candidate = normalizeOptionalEnv(process.env.OD_UPDATE_METADATA_URL)
    ?? `https://releases.open-design.ai${expectedPath}`;
  const parsed = new URL(candidate);
  if (!parsed.pathname.endsWith(expectedPath)) {
    throw new Error(
      `native Windows acceptance requires exact version metadata ${expectedPath}, got ${candidate}`,
    );
  }
  return candidate;
}

export function resolveNativeAcceptanceStandaloneMetadataUrl(): string {
  const exactUrl = resolveNativeAcceptanceUpdateMetadataUrl();
  const candidate = normalizeOptionalEnv(process.env.OD_STANDALONE_METADATA_URL) ?? exactUrl;
  const parsed = new URL(candidate);
  const channel = updateScenario.channel;
  const exactPath = new URL(exactUrl).pathname;
  const mutablePath = new RegExp(`/${channel}/acceptance/runs/[0-9]+-[0-9]+/latest/metadata\\.json$`);
  if (parsed.pathname !== exactPath && !mutablePath.test(parsed.pathname)) {
    throw new Error(
      `native Windows Standalone acceptance requires exact metadata or a run-scoped mutable feed, got ${candidate}`,
    );
  }
  return candidate;
}

export async function invokeWindowsProtocolProcess(
  target: string,
  argument?: string,
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<WindowsProtocolLaunchObservation> {
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    [
      '$process = if ([string]::IsNullOrEmpty($env:OD_PROTOCOL_LAUNCH_ARGUMENT)) {',
      '  Start-Process -FilePath $env:OD_PROTOCOL_LAUNCH_TARGET -PassThru',
      '} else {',
      '  Start-Process -FilePath $env:OD_PROTOCOL_LAUNCH_TARGET -ArgumentList @($env:OD_PROTOCOL_LAUNCH_ARGUMENT) -PassThru',
      '}',
      '$exited = $process.WaitForExit(3000)',
      '$exitCode = if ($exited) { $process.ExitCode } else { $null }',
      '[pscustomobject]@{ pid = $process.Id; exited = $exited; exitCode = $exitCode } | ConvertTo-Json -Compress',
    ].join('\n'),
  ], {
    env: {
      ...process.env,
      ...extraEnv,
      OD_PROTOCOL_LAUNCH_ARGUMENT: argument ?? '',
      OD_PROTOCOL_LAUNCH_TARGET: target,
    },
  });
  const observation = JSON.parse(stdout) as Partial<WindowsProtocolLaunchObservation>;
  if (
    typeof observation.exited !== 'boolean'
    || (observation.exitCode !== null && typeof observation.exitCode !== 'number')
    || typeof observation.pid !== 'number'
  ) {
    throw new Error(`windows protocol launch returned an invalid process observation: ${stdout}`);
  }
  if (observation.exited === true && observation.exitCode !== 0) {
    throw new Error(
      `windows protocol launch process exited before Desktop startup: pid=${String(observation.pid)} exitCode=${String(observation.exitCode)}`,
    );
  }
  return observation as WindowsProtocolLaunchObservation;
}

export type InviteContinuationResult = {
  ok: boolean;
  reason?: string;
  status?: number;
};

export async function countInviteContinuationResults(): Promise<number> {
  return (await readInviteContinuationResults()).length;
}

export async function waitForInviteContinuationResult(
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

export async function readInviteContinuationResults(): Promise<InviteContinuationResult[]> {
  const logPath = join(activeRuntimeNamespaceRoot, 'logs', 'desktop', 'latest.log');
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

export async function assertWindowsInviteProtocolRemoved(): Promise<void> {
  await expect(
    execFileAsync('reg.exe', [
      'query',
      'HKCU\\Software\\Classes\\opendesign',
    ]),
  ).rejects.toMatchObject({ code: 1 });
}

export async function fileSizeBytes(filePath: string): Promise<number> {
  return (await stat(filePath)).size;
}

export async function readTiming(filePath: string): Promise<TimingResult> {
  return JSON.parse(await readFile(filePath, 'utf8')) as TimingResult;
}
