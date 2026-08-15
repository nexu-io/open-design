// @vitest-environment node

import { copyFile,mkdir,readFile,rm } from 'node:fs/promises';
import { join } from 'node:path';

import { bindClosureCandidateIdentity } from '@open-design/closure/protocol';
import {
	activatePreparedClosureBinding,
	authorizePreparedClosureActivation,
	confirmClosureBindingAttempt,
	prepareVerifiedStoredClosureCandidate,
	resolveClosureStorePaths,
	resolveClosureStoreVersionPaths,
	verifyStoredClosureCandidate,
	type StoredClosureVerification,
} from '@open-design/closure/store';
import extractZip from 'extract-zip';
import { expect } from 'vitest';

import {
	readPackagedClosureBuildFixture,
	resetPackagedClosureFixture,
	seedPackagedClosureFixture
} from '@/vitest/packaged-closure-fixture';
import { seedPackagedOnboardingComplete as seedSyntheticOnboardingComplete } from '@/vitest/packaged-initial-state';
import {
	commitPackagedStandaloneDistributionFixture,
	damagePackagedStandaloneDistributionFixture,
	readPackagedStandaloneDistributionBinding,
	type PackagedStandaloneDistributionFixture,
} from '@/vitest/standalone-distribution-fixture';


import { runToolsPackJson } from './actions.js';
import { assertClosureDesktopIdentity,readDesktopIdentityMarker } from './assertions.js';
import type { ReusableWinPackagedClosureFixture,SmokeTiming,WinInstallResult,WinStartResult,WinStopResult,WinUninstallResult } from './context.js';
import { closureBlobRoots,closureBuildJsonPath,closureDistributionManifestPath,namespace,nativeRuntimeNamespaceRoot,releaseVersion,resetPackagedUpdaterNamespaceRoots,runtimeNamespaceRoot,shellVersion,toolsPackDir,updateScenario,workspaceRoot } from './context.js';
import { waitForHealthyDesktop } from './runtime.js';
import { measureSmokeStep } from './timing.js';

export async function seedPackagedOnboardingComplete(): Promise<void> {
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
  await seedSyntheticOnboardingComplete(join(runtimeNamespaceRoot, 'data'));
}

export async function seedNativePackagedOnboardingComplete(): Promise<void> {
  await seedSyntheticOnboardingComplete(join(nativeRuntimeNamespaceRoot, 'data'));
}

export async function resetNativePackagedExperienceState(): Promise<void> {
  const removalOptions = {
    force: true,
    maxRetries: 10,
    recursive: true,
    retryDelay: 100,
  } as const;
  await Promise.all([
    rm(join(nativeRuntimeNamespaceRoot, 'data'), removalOptions),
    rm(join(nativeRuntimeNamespaceRoot, 'user-data'), removalOptions),
  ]);
}

export async function seedReusableWinPackagedClosureFixture(input: {
  buildJsonPath: string;
  channel: string;
  expectedPlatform: string;
  installationRoot: string;
  namespace: string;
  timings: SmokeTiming[];
  workspaceRoot: string;
}): Promise<ReusableWinPackagedClosureFixture> {
  const source = await measureSmokeStep(input.timings, 'closure fixture read build report', async () =>
    readPackagedClosureBuildFixture(input),
  );
  const storePaths = resolveClosureStorePaths({
    channel: input.channel,
    namespace: input.namespace,
    root: input.installationRoot,
  });
  const binding = bindClosureCandidateIdentity(source.manifest.identity, input.namespace);
  const versionPaths = resolveClosureStoreVersionPaths(storePaths, binding);
  await measureSmokeStep(input.timings, 'closure fixture reset candidate', async () => {
    await rm(versionPaths.versionRoot, { force: true, recursive: true });
    await mkdir(versionPaths.versionRoot, { recursive: true });
  });
  await measureSmokeStep(input.timings, 'closure fixture copy release artifacts', async () => {
    await Promise.all([
      copyFile(source.archivePath, versionPaths.archivePath),
      copyFile(source.inventoryPath, versionPaths.inventoryPath),
      copyFile(source.manifestPath, versionPaths.manifestPath),
    ]);
  });
  await measureSmokeStep(input.timings, 'closure fixture extract archive', async () => {
    await extractZip(versionPaths.archivePath, { dir: versionPaths.payloadRoot });
  });
  const verification = await measureSmokeStep(input.timings, 'closure fixture verify immutable bytes', async () =>
    verifyStoredClosureCandidate(storePaths, binding),
  );
  const active = await measureSmokeStep(input.timings, 'closure fixture activate verified binding', async () =>
    activateVerifiedFixture(storePaths, verification, source.manifest.identity.version),
  );
  return {
    manifest: source.manifest,
    pointer: active.standalone,
    storePaths,
    verification,
    versionPaths,
  };
}

export async function activateVerifiedFixture(
  storePaths: ReturnType<typeof resolveClosureStorePaths>,
  verification: StoredClosureVerification,
  releaseVersion: string,
) {
  const prepared = await prepareVerifiedStoredClosureCandidate(storePaths, verification, releaseVersion);
  await authorizePreparedClosureActivation(storePaths, prepared.prepared, 'initial-bootstrap');
  await activatePreparedClosureBinding(storePaths, prepared.prepared, {
    digest: prepared.prepared.standalone.digest,
    type: 'e2e-fixture',
    version: releaseVersion,
  });
  return await confirmClosureBindingAttempt(storePaths, prepared.prepared);
}

/**
 * `publish=false` release acceptance cannot discover the Closure it has just
 * built through remote channel metadata. Commit those exact workflow bytes to
 * the local Store before the first Shell boot; every later restart/update in
 * the scenario must reuse the active binding without further test help.
 */
export async function seedConfiguredPackagedClosure(): Promise<PackagedStandaloneDistributionFixture | null> {
  if (closureDistributionManifestPath != null) {
    const version = releaseVersion ?? shellVersion;
    if (version == null) throw new Error('Standalone distribution fixture requires a release version');
    return await commitPackagedStandaloneDistributionFixture({
      blobRoots: closureBlobRoots,
      channel: updateScenario.channel,
      installationRoot: join(toolsPackDir, 'runtime', 'win'),
      manifestPath: closureDistributionManifestPath,
      namespace,
      releaseVersion: version,
      shellType: 'electron',
      shellVersion: shellVersion ?? version,
      target: 'win32-x64',
      workspaceRoot,
    });
  }
  if (closureBuildJsonPath == null) return null;
  await seedPackagedClosureFixture({
    buildJsonPath: closureBuildJsonPath,
    channel: updateScenario.channel,
    expectedPlatform: 'win32-x64',
    installationRoot: join(toolsPackDir, 'runtime', 'win'),
    namespace,
    workspaceRoot,
  });
  return null;
}

export async function runWinStandaloneDistributionAcceptance(): Promise<void> {
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
    const fixture = await seedConfiguredPackagedClosure();
    if (fixture == null) throw new Error('Standalone distribution fixture was not configured');
    const first = await startWindowsDesktopOrThrow('first distribution start');
    started = true;
    await waitForHealthyDesktop();
    assertClosureDesktopIdentity(await readDesktopIdentityMarker(), fixture.manifest.identity.version);

    await runToolsPackJson<WinStopResult>('stop');
    started = false;
    await runToolsPackJson<WinInstallResult>('install');
    const restarted = await startWindowsDesktopOrThrow('distribution reinstall start');
    started = true;
    expect(restarted.pid).not.toBe(first.pid);
    await waitForHealthyDesktop();
    assertClosureDesktopIdentity(await readDesktopIdentityMarker(), fixture.manifest.identity.version);

    await runToolsPackJson<WinStopResult>('stop');
    started = false;
    await damagePackagedStandaloneDistributionFixture(fixture);
    await startWindowsDesktopOrThrow('exact-version repair start');
    started = true;
    await waitForHealthyDesktop();
    const repaired = (await readPackagedStandaloneDistributionBinding(fixture)).active?.standalone;
    expect(repaired).toMatchObject({
      digest: fixture.pointer.digest,
      target: fixture.pointer.target,
      version: fixture.pointer.version,
    });
    expect(repaired?.generation).toBeGreaterThan(fixture.pointer.generation);
    assertClosureDesktopIdentity(await readDesktopIdentityMarker(), fixture.manifest.identity.version);

    await runToolsPackJson<WinStopResult>('stop');
    started = false;

    await rm(fixture.storePaths.namespaceRoot, { force: true, recursive: true });
    const recovered = await seedConfiguredPackagedClosure();
    if (recovered == null) throw new Error('Standalone distribution recovery fixture was not configured');
    await startWindowsDesktopOrThrow('recovered distribution start');
    started = true;
    await waitForHealthyDesktop();
    assertClosureDesktopIdentity(await readDesktopIdentityMarker(), recovered.manifest.identity.version);
  } finally {
    if (started) await runToolsPackJson<WinStopResult>('stop').catch(() => undefined);
    if (installed) {
      await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch(() => undefined);
    }
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

export async function startWindowsDesktopOrThrow(step: string): Promise<WinStartResult> {
  const start = await runToolsPackJson<WinStartResult>('start');
  if (!start.processExitedBeforeStatus) return start;
  const logTail = await readFile(start.logPath, 'utf8').catch(() => '');
  throw new Error(`packaged Windows desktop exited before status during ${step}:\n${logTail}`);
}
