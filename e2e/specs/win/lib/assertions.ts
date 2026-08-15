// @vitest-environment node

import { readdir,readFile } from 'node:fs/promises';
import { join,resolve,sep } from 'node:path';

import { expect } from 'vitest';

import {
	packagedAppRouteUrl
} from '@/vitest/packaged-app-shell';


import { runToolsPackJson } from './actions.js';
import type { DesktopIdentityMarker,HealthEvalValue,LauncherSnapshot,LogsResult,PackagedOnboardingEvalValue,PptxExportEvalValue,UpgradePersistenceSeed } from './context.js';
import { activeRuntimeNamespaceRoot,formatUnknown,isPathInside,isRecord,launcherNamespaceRoot,namespace,nativeProductUserDataRoot,nativeRuntimeNamespaceRoot,normalizePathForComparison,runtimeNamespaceRoot,updateScenario,verifyPublicImmutableArtifacts } from './context.js';

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
  const unexpectedStandaloneExits = combined
    .split(/\r?\n/)
    .filter((line) => /standalone Next\.js server exited/i.test(line) && !/signal=SIGTERM/i.test(line));
  expect(combined).not.toMatch(/ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING/);
  expect(combined).not.toMatch(/packaged runtime failed/i);
  expect(unexpectedStandaloneExits).toEqual([]);
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
  const nativeDesktopLogPath = join(nativeRuntimeNamespaceRoot, 'logs', 'desktop', 'latest.log');
  const nativeDesktopLog = await readFile(nativeDesktopLogPath, 'utf8').catch(() => '');
  console.error(`[native-desktop] ${nativeDesktopLogPath}`);
  console.error(nativeDesktopLog.trim().split(/\r?\n/).slice(-200).join('\n') || '(no log lines)');
  await printUpdaterHelperLogs();
  await printLauncherRuntimeSnapshot();
}

export async function printUpdaterHelperLogs(): Promise<void> {
  const helpersRoot = join(activeRuntimeNamespaceRoot, 'updates', 'helpers');
  const entries = await readdir(helpersRoot).catch(() => []);
  for (const entry of entries.filter((name) => name.endsWith('.log')).sort()) {
    const logPath = join(helpersRoot, entry);
    const content = await readFile(logPath, 'utf8').catch(() => '');
    console.error(`[updater-helper] ${logPath}`);
    console.error(content.trim() || '(no log lines)');
  }
}

export async function printLauncherRuntimeSnapshot(): Promise<void> {
  const runtimePath = verifyPublicImmutableArtifacts
    ? join(nativeProductUserDataRoot, 'launcher', 'channels', updateScenario.channel, 'namespaces', namespace, 'runtime.json')
    : join(launcherNamespaceRoot, 'runtime.json');
  const content = await readFile(runtimePath, 'utf8').catch(() => null);
  console.error(`[launcher-runtime] ${runtimePath}`);
  console.error(content?.trim() ?? '(missing)');
}

export async function readDesktopIdentityMarker(): Promise<DesktopIdentityMarker> {
  const markerPath = join(activeRuntimeNamespaceRoot, 'runtime', 'desktop-root.json');
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

export async function assertPayloadDesktopIdentity(
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

export async function readDesktopStartupResourceRoot(pid: number): Promise<string> {
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
  expect(value.status).toBe(200);
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

export function assertHealthEvalValue(value: unknown): HealthEvalValue {
  const normalized = asHealthEvalValue(value);
  if (normalized == null) {
    throw new Error(`unexpected health eval value: ${formatUnknown(value)}`);
  }
  return normalized;
}

export function asHealthEvalValue(value: unknown): HealthEvalValue | null {
  if (!isRecord(value)) return null;
  if (typeof value.href !== 'string' || typeof value.status !== 'number' || typeof value.title !== 'string') return null;
  if (!isRecord(value.health)) return null;
  return value as HealthEvalValue;
}

export function asPackagedOnboardingEvalValue(value: unknown): PackagedOnboardingEvalValue | null {
  if (!isRecord(value)) return null;
  if (typeof value.cloudSignInVisible !== 'boolean') return null;
  if (typeof value.href !== 'string') return null;
  if (typeof value.onboardingVisible !== 'boolean') return null;
  if (value.text != null && typeof value.text !== 'string') return null;
  if (typeof value.title !== 'string') return null;
  return value as PackagedOnboardingEvalValue;
}

export function expectPathInside(filePath: string, expectedRoot: string): void {
  const normalizedPath = resolve(filePath);
  const normalizedRoot = resolve(expectedRoot);
  expect(
    normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}${sep}`),
    `${normalizedPath} should be inside ${normalizedRoot}`,
  ).toBe(true);
}

export function expectWindowsPackagedAppUrl(value: string | null | undefined): void {
  // The health probe races the SPA's first-run redirect. Both the app root and
  // its dedicated onboarding route are Shell-owned `od://` surfaces; pinning
  // only the pre-redirect root makes a healthy cold start nondeterministic.
  expect(value).toEqual(expect.stringMatching(/^od:\/\/app\/(?:onboarding)?$/));
}

export function expectWindowsPackagedRouteUrl(value: string | null | undefined): void {
  expect(packagedAppRouteUrl(value), `${String(value)} should be an od://app/* packaged renderer URL`).toBe(true);
}

export function expectWindowsHealthyRendererUrl(value: string | null | undefined): void {
  expect(value).toEqual(expect.stringMatching(/^od:\/\/app\/(?:onboarding)?$/));
}

export function expectWindowsFallbackWebUrl(value: string | null | undefined): void {
  expect(value).toEqual(expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/?$/));
}

export function expectWindowsDaemonUrl(value: string | null | undefined): void {
  expect(value).toEqual(expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/?$/));
}
