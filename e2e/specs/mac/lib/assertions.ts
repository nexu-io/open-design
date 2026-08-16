// @vitest-environment node

import { access,mkdir,readFile,rm,stat,writeFile } from 'node:fs/promises';
import { basename,join,resolve,sep } from 'node:path';

import { resolveClosureStorePaths } from '@open-design/closure/store';
import { expect } from 'vitest';

import {
	seedPackagedClosureFixture
} from '@/vitest/packaged-closure-fixture';
import {
	seedPackagedOnboardingComplete as seedSyntheticOnboardingComplete
} from '@/vitest/packaged-initial-state';
import {
	createPackagedSmokeReport
} from '@/vitest/packaged-report';
import {
	commitPackagedStandaloneDistributionFixture,
	damagePackagedStandaloneDistributionFixture,
	readPackagedStandaloneDistributionFixture,
	type PackagedStandaloneDistributionFixture,
} from '@/vitest/standalone-distribution-fixture';


import type { HealthEvalValue,MacInstallResult,MacLaunchServicesWitness,MacStartResult,MacStopResult,MacUninstallResult,PackagedOnboardingEvalValue } from './context.js';
import { closureBlobRoots,closureBuildJsonPath,closureDistributionManifestPath,delay,execFileAsync,formatUnknown,isRecord,namespace,packagedHeadless,packagedInviteDeeplink,packagedMacClosureTarget,releaseChannel,releaseVersion,runtimeNamespaceRoot,shellVersion,standaloneSeedEmbedded,toolsPackDir,updateScenario,verifyPublicImmutableArtifacts,workspaceRoot } from './context.js';
import { assertClosureDesktopIdentity,assertPackagedVelaRuntime,readDesktopIdentityMarker,resetPackagedRuntimeState,waitForHealthyDesktop } from './runtime.js';
import { capturePackagedCheckpoint,runToolsPackJson } from './tools.js';

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

export async function assertMacInviteProtocolRegistration(installedAppPath: string): Promise<void> {
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

export async function invokeMacInviteDeeplink(installedAppPath: string): Promise<void> {
  // `-a` pins delivery to this namespace's installed test bundle instead of a
  // developer's stable Open Design app that may own the same global scheme.
  // `-g` preserves protocol delivery without asking macOS to foreground the
  // package-level background agent used by local saturation.
  await execFileAsync('/usr/bin/open', [
    ...(packagedHeadless ? ['-g'] : []),
    '-a',
    installedAppPath,
    packagedInviteDeeplink,
  ]);
}

export async function launchMacAppWithLaunchServices(installedAppPath: string): Promise<void> {
  // LaunchServices on CI can retain a terminated record for a temporary test
  // bundle and accept a URL without spawning it. Prove cold activation first;
  // once healthy, the caller separately proves protocol delivery to that PID.
  const logsRoot = join(runtimeNamespaceRoot, 'logs', 'desktop');
  const stdoutPath = join(logsRoot, 'launch-services.stdout.log');
  const stderrPath = join(logsRoot, 'launch-services.stderr.log');
  const witnessPath = join(logsRoot, 'launch-services-witness.json');
  const plist = await readMacBundlePlist(installedAppPath);
  const executableName = typeof plist.CFBundleExecutable === 'string'
    ? plist.CFBundleExecutable
    : basename(installedAppPath, '.app');
  const executablePath = join(installedAppPath, 'Contents', 'MacOS', executableName);
  const bundleId = typeof plist.CFBundleIdentifier === 'string' ? plist.CFBundleIdentifier : null;
  const embeddedConfigPath = join(installedAppPath, 'Contents', 'Resources', 'open-design-config.json');
  const launchConfigPath = join(runtimeNamespaceRoot, 'runtime', 'open-design-config.json');
  const startedAt = new Date().toISOString();

  await mkdir(logsRoot, { recursive: true });
  await Promise.all([
    writeFile(stdoutPath, '', 'utf8'),
    writeFile(stderrPath, '', 'utf8'),
    rm(witnessPath, { force: true }),
  ]);
  await execFileAsync('/usr/bin/open', [
    ...(packagedHeadless ? ['-g'] : []),
    '-n',
    '--stdout', stdoutPath,
    '--stderr', stderrPath,
    installedAppPath,
  ]);
  const openCompletedAt = new Date().toISOString();
  const observations = await observeMacLaunchProcesses(executablePath);
  const witness: MacLaunchServicesWitness = {
    appPath: installedAppPath,
    bundleId,
    embeddedConfig: projectPackagedConfig(await readJsonRecordIfExists(embeddedConfigPath)),
    executablePath,
    inheritedLaunchEnv: {
      OD_PACKAGED_CONFIG_PATH: process.env.OD_PACKAGED_CONFIG_PATH ?? null,
      OD_PACKAGED_NAMESPACE: process.env.OD_PACKAGED_NAMESPACE ?? null,
      OD_PACKAGED_NAMESPACE_BASE_ROOT: process.env.OD_PACKAGED_NAMESPACE_BASE_ROOT ?? null,
      OD_PROCESS_STAMP: process.env.OD_PROCESS_STAMP ?? null,
    },
    launchConfig: projectPackagedConfig(await readJsonRecordIfExists(launchConfigPath)),
    observations,
    openCompletedAt,
    systemLog: await collectMacLaunchServicesLog({ bundleId, executableName }),
    startedAt,
    stderrPath,
    stdoutPath,
    witnessPath,
  };
  if (verifyPublicImmutableArtifacts) {
    expect(witness.embeddedConfig?.updateMetadataUrl).toBe(
      `${process.env.RELEASE_PUBLIC_ORIGIN}/${updateScenario.channel}/latest/metadata.json`,
    );
    expect(witness.embeddedConfig?.updateEnabled).toBeUndefined();
  }
  if (releaseChannel === 'local') {
    expect(witness.embeddedConfig?.updateEnabled).toBe(false);
  }
  await writeFile(witnessPath, `${JSON.stringify(witness, null, 2)}\n`, 'utf8');
  console.info(`[mac launch-services witness] ${JSON.stringify(witness)}`);
}

export async function readMacBundlePlist(installedAppPath: string): Promise<Record<string, unknown>> {
  const { stdout } = await execFileAsync('/usr/bin/plutil', [
    '-convert',
    'json',
    '-o',
    '-',
    join(installedAppPath, 'Contents', 'Info.plist'),
  ]);
  const value = JSON.parse(stdout) as unknown;
  return isRecord(value) ? value : {};
}

export async function readJsonRecordIfExists(filePath: string): Promise<Record<string, unknown> | null> {
  if (!(await pathExists(filePath))) return null;
  try {
    const value = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

export function projectPackagedConfig(config: Record<string, unknown> | null): Record<string, unknown> | null {
  if (config == null) return null;
  return Object.fromEntries([
    'namespace',
    'namespaceBaseRoot',
    'releaseVersion',
    'resourceRoot',
    'shellVersion',
    'updateEnabled',
    'updateMetadataUrl',
    'webOutputMode',
  ].filter((key) => key in config).map((key) => [key, config[key]]));
}

export async function listMacLaunchProcesses(executablePath: string): Promise<string[]> {
  const { stdout } = await execFileAsync('/bin/ps', ['-axo', 'pid=,ppid=,state=,etime=,command='], {
    maxBuffer: 2 * 1024 * 1024,
  });
  return stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.includes(executablePath));
}

export async function observeMacLaunchProcesses(
  executablePath: string,
): Promise<Array<{ elapsedMs: number; processes: string[] }>> {
  const startedAt = Date.now();
  const observations: Array<{ elapsedMs: number; processes: string[] }> = [];
  let lastProjection = '';
  let firstObservedAt: number | null = null;
  while (Date.now() - startedAt < 12_000) {
    const processes = await listMacLaunchProcesses(executablePath);
    const projection = JSON.stringify(processes);
    if (projection !== lastProjection || observations.length === 0) {
      observations.push({ elapsedMs: Date.now() - startedAt, processes });
      lastProjection = projection;
    }
    if (processes.length > 0 && firstObservedAt == null) firstObservedAt = Date.now();
    if (firstObservedAt != null && Date.now() - firstObservedAt >= 3_000) break;
    await delay(250);
  }
  const finalProcesses = await listMacLaunchProcesses(executablePath);
  if (JSON.stringify(finalProcesses) !== lastProjection) {
    observations.push({ elapsedMs: Date.now() - startedAt, processes: finalProcesses });
  }
  return observations;
}

export async function collectMacLaunchServicesLog(input: {
  bundleId: string | null;
  executableName: string;
}): Promise<string[]> {
  const terms = [
    `process == ${JSON.stringify(input.executableName)}`,
    `eventMessage CONTAINS[c] ${JSON.stringify(input.executableName)}`,
    ...(input.bundleId == null ? [] : [`eventMessage CONTAINS[c] ${JSON.stringify(input.bundleId)}`]),
  ];
  try {
    const { stdout, stderr } = await execFileAsync('/usr/bin/log', [
      'show',
      '--style', 'compact',
      '--last', '2m',
      '--predicate', terms.join(' OR '),
    ], { maxBuffer: 4 * 1024 * 1024 });
    return `${stdout}\n${stderr}`.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(-120);
  } catch (error) {
    return [`log show failed: ${formatUnknown(error)}`];
  }
}

export async function describeMacLaunchServicesWitness(): Promise<string> {
  const logsRoot = join(runtimeNamespaceRoot, 'logs', 'desktop');
  const witnessPath = join(logsRoot, 'launch-services-witness.json');
  const sections: string[] = ['mac LaunchServices cold-launch diagnostics:'];
  for (const [label, filePath] of [
    ['witness', witnessPath],
    ['stdout', join(logsRoot, 'launch-services.stdout.log')],
    ['stderr', join(logsRoot, 'launch-services.stderr.log')],
    ['desktop', join(logsRoot, 'latest.log')],
  ] as const) {
    if (!(await pathExists(filePath))) {
      sections.push(`[${label}] missing: ${filePath}`);
      continue;
    }
    const lines = (await readFile(filePath, 'utf8')).split(/\r?\n/).filter(Boolean).slice(-160);
    sections.push(`[${label}] ${filePath}`, ...(lines.length === 0 ? ['(empty)'] : lines));
  }
  return sections.join('\n');
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function fileSizeBytes(filePath: string): Promise<number> {
  return (await stat(filePath)).size;
}

export async function seedPackagedOnboardingComplete(): Promise<void> {
  await seedSyntheticOnboardingComplete(join(runtimeNamespaceRoot, 'data'));
}

/**
 * `publish=false` release acceptance cannot discover the Closure it has just
 * built through remote channel metadata. Commit those exact workflow bytes to
 * the local Store before the first Shell boot; every later restart/update in
 * the scenario must reuse the committed binding without further test help.
 */
export async function seedConfiguredPackagedClosure(): Promise<PackagedStandaloneDistributionFixture | null> {
  if (closureDistributionManifestPath != null) {
    if (standaloneSeedEmbedded) return null;
    const version = releaseVersion ?? shellVersion;
    if (version == null) throw new Error('Standalone distribution fixture requires a release version');
    return await commitPackagedStandaloneDistributionFixture({
      blobRoots: closureBlobRoots,
      channel: updateScenario.channel,
      installationRoot: join(toolsPackDir, 'runtime', 'mac'),
      manifestPath: closureDistributionManifestPath,
      namespace,
      releaseVersion: version,
      shellType: 'electron',
      shellVersion: shellVersion ?? version,
      target: packagedMacClosureTarget,
      workspaceRoot,
    });
  }
  if (closureBuildJsonPath == null) return null;
  await seedPackagedClosureFixture({
    buildJsonPath: closureBuildJsonPath,
    channel: updateScenario.channel,
    expectedPlatform: packagedMacClosureTarget,
    installationRoot: join(toolsPackDir, 'runtime', 'mac'),
    namespace,
    workspaceRoot,
  });
  return null;
}

export async function runMacStandaloneDistributionAcceptance(): Promise<void> {
  const installationRoot = join(toolsPackDir, 'runtime', 'mac');
  const report = await createPackagedSmokeReport('mac');
  let installed = false;
  let started = false;
  try {
    await resetPackagedRuntimeState();
    await runToolsPackJson<MacInstallResult>('install');
    installed = true;
    await seedPackagedOnboardingComplete();
    let fixture = standaloneSeedEmbedded ? null : await seedConfiguredPackagedClosure();
    if (!standaloneSeedEmbedded && fixture == null) {
      throw new Error('Standalone distribution fixture was not configured');
    }
    const first = await runToolsPackJson<MacStartResult>('start');
    started = true;
    const firstInspect = await waitForHealthyDesktop();
    await assertPackagedVelaRuntime();
    await capturePackagedCheckpoint(report, 'closure-first-start', firstInspect);
    fixture ??= await readConfiguredPackagedStandaloneDistribution();
    assertClosureDesktopIdentity(await readDesktopIdentityMarker(), fixture.manifest.identity.version);

    await runToolsPackJson<MacStopResult>('stop');
    started = false;
    await runToolsPackJson<MacInstallResult>('install');
    const restarted = await runToolsPackJson<MacStartResult>('start');
    started = true;
    expect(restarted.pid).not.toBe(first.pid);
    const restartedInspect = await waitForHealthyDesktop();
    await capturePackagedCheckpoint(report, 'closure-reinstall', restartedInspect);
    assertClosureDesktopIdentity(await readDesktopIdentityMarker(), fixture.manifest.identity.version);

    await runToolsPackJson<MacStopResult>('stop');
    started = false;
    await damagePackagedStandaloneDistributionFixture(fixture);
    await runToolsPackJson<MacStartResult>('start');
    started = true;
    const repairedInspect = await waitForHealthyDesktop();
    await capturePackagedCheckpoint(report, 'closure-repaired', repairedInspect);
    const repaired = await readConfiguredPackagedStandaloneDistribution();
    expect(repaired.pointer).toMatchObject({
      digest: fixture.pointer.digest,
      target: fixture.pointer.target,
      version: fixture.pointer.version,
    });
    expect(repaired.pointer.generation).toBeGreaterThan(fixture.pointer.generation);
    assertClosureDesktopIdentity(await readDesktopIdentityMarker(), repaired.manifest.identity.version);

    await runToolsPackJson<MacStopResult>('stop');
    started = false;

    await rm(fixture.storePaths.namespaceRoot, { force: true, recursive: true });
    const recoveredFixture = standaloneSeedEmbedded ? null : await seedConfiguredPackagedClosure();
    if (!standaloneSeedEmbedded && recoveredFixture == null) {
      throw new Error('Standalone distribution recovery fixture was not configured');
    }
    await runToolsPackJson<MacStartResult>('start');
    started = true;
    const recoveredInspect = await waitForHealthyDesktop();
    await capturePackagedCheckpoint(report, 'closure-store-recovered', recoveredInspect);
    const recovered = recoveredFixture ?? await readConfiguredPackagedStandaloneDistribution();
    assertClosureDesktopIdentity(await readDesktopIdentityMarker(), recovered.manifest.identity.version);
  } finally {
    if (started) await runToolsPackJson<MacStopResult>('stop').catch(() => undefined);
    if (installed) await runToolsPackJson<MacUninstallResult>('uninstall').catch(() => undefined);
    await rm(resolveClosureStorePaths({
      channel: updateScenario.channel,
      namespace,
      root: installationRoot,
    }).namespaceRoot, {
      force: true,
      recursive: true,
    }).catch(() => undefined);
  }
}

export async function readConfiguredPackagedStandaloneDistribution(): Promise<PackagedStandaloneDistributionFixture> {
  if (closureDistributionManifestPath == null) {
    throw new Error('Standalone distribution manifest was not configured');
  }
  const version = releaseVersion ?? shellVersion;
  if (version == null) throw new Error('Standalone distribution fixture requires a release version');
  return await readPackagedStandaloneDistributionFixture({
    blobRoots: closureBlobRoots,
    channel: updateScenario.channel,
    installationRoot: join(toolsPackDir, 'runtime', 'mac'),
    manifestPath: closureDistributionManifestPath,
    namespace,
    releaseVersion: version,
    target: packagedMacClosureTarget,
    workspaceRoot,
  });
}
