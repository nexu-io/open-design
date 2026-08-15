// @vitest-environment node

import { mkdir,readFile } from 'node:fs/promises';
import { basename,dirname,join } from 'node:path';

import { describe,expect,test } from 'vitest';

import {
	packagedOnboardingCompletedFromProbe,
	runPackagedAppShellPhase,
	type PackagedAppShellState
} from '@/vitest/packaged-app-shell';
import { assertPackagedStandaloneStatus,readPackagedClosureBinding } from '@/vitest/packaged-closure-binding';
import {
	readPackagedClosureBuildFixture,
	readPackagedClosureFixtureRuntime,
	resetPackagedClosureFixture,
	type PackagedClosureFixture
} from '@/vitest/packaged-closure-fixture';
import {
	createPackagedColdStartObservation,
	type PackagedColdStartObservation,
} from '@/vitest/packaged-cold-start';
import {
	assertPackagedPtySmokeResult,
	packagedPtySmokeExpression,
} from '@/vitest/packaged-pty-smoke';
import { createPackagedSmokeReport } from '@/vitest/packaged-report';
import {
	hasPackagedSmokeLane
} from '@/vitest/packaged-smoke-contract';
import { WIN_PACKAGED_SMOKE_SCENARIOS } from '@/vitest/packaged-smoke-plan-win';
import {
	applyPackagedUpdateEnv
} from '@/vitest/packaged-update-scenario';
import { startToolsServeUpdaterFixture,type ToolsServeUpdaterFixture } from '@/vitest/tools-serve-updater-fixture';
import { shouldRunPackagedWinSmoke,winProtocolDebugCase } from './lib/context.js';


import type { HealthEvalValue,InstallerFallbackSummary,LogsResult,PayloadUpdateSummary,SmokeTiming,UpdaterRecoverySummary,UpgradePersistenceSeed,WinInspectResult,WinInstallResult,WinStartResult,WinStopResult,WinUninstallResult } from './lib/index.js';
import { activeRuntimeNamespaceRoot,assertClosureDesktopIdentity,assertHealthEvalValue,assertLauncherPointer,assertLogPathsAndContent,assertToolsServeFixtureEnabled,assertUpdateVersionPresent,assertUpgradePersistenceSeed,assertWindowsInviteProtocolRegistration,assertWindowsInviteProtocolRemoved,bundledPluginInventoryExpression,captureUpdateEnv,closureBuildJsonPath,countInviteContinuationResults,expectPathInside,expectWindowsDaemonUrl,expectWindowsFallbackWebUrl,expectWindowsPackagedRouteUrl,fileSizeBytes,formatUnknown,installIdentity,intermediateUpdateBuildJsonPath,invokeWindowsInviteDeeplink,launchNativeWindowsAcceptance,maxInstallDurationMs,maxStartDurationMs,measureSmokeStep,namespace,nativeProductUserDataRoot,nativeRuntimeNamespaceRoot,observePackagedAppShell,outputNamespaceRoot,preUpdateScreenshotPath,printLifecycleTimings,printPackagedLogs,printSmokeTimings,readDesktopIdentityMarker,readPackagedOnboardingConfig,readTiming,releaseChannel,releaseVersion,resetNativePackagedExperienceState,resetPackagedRuntimeDataRoot,resetPackagedUpdaterNamespaceRoots,resolveLocalUpdateFixture,resolveNativeAcceptanceUpdateMetadataUrl,restoreUpdateEnv,runInstallerFallbackAcceptance,runPayloadUpdateAcceptance,runSameVersionUpdaterRecoveryAcceptance,runtimeNamespaceRoot,runToolsPackJson,screenshotPath,seedConfiguredPackagedClosure,seedNativePackagedOnboardingComplete,seedPackagedOnboardingComplete,shellVersion,smokeLanes,startWindowsDesktopOrThrow,summarizeLogs,toolsPackDir,updateFixture,updateFixtureMode,updateFixturePort,updateMetadataUrl,updateScenario,updateVersion,upgradePersistenceSeedExpression,verifyCoreOnly,verifyPublicImmutableArtifacts,verifyUpgradePersistence,waitForCommittedPackagedClosureFixture,waitForDesktopStopped,waitForHealthyDesktop,waitForHealthyDesktopShellVersion,waitForInviteContinuationResult,workspaceRoot } from './lib/index.js';

const winDescribe = shouldRunPackagedWinSmoke && hasPackagedSmokeLane(smokeLanes, 'shell') && winProtocolDebugCase === 'off' ? describe : describe.skip;
const shellAbsorbsStandaloneAcceptance = hasPackagedSmokeLane(smokeLanes, 'shell')
  && hasPackagedSmokeLane(smokeLanes, 'standalone')
  && !verifyCoreOnly
  && updateFixture === 'tools-serve'
  && closureBuildJsonPath != null;

winDescribe('packaged windows runtime smoke', () => {
  let installed = false;
  let started = false;

  test(WIN_PACKAGED_SMOKE_SCENARIOS.shellLifecycle.title, async () => {
    const report = await createPackagedSmokeReport('win');
    let passed = false;
    const timings: SmokeTiming[] = [];
    let appShell: PackagedAppShellState | 'skipped' = 'skipped';
    let firstRunAppShell: PackagedAppShellState | 'skipped' = 'skipped';
    let seededOnboardingCompleted: boolean | 'skipped' = 'skipped';
    let onboardingCompleted: boolean | 'skipped' = 'skipped';
    let intermediatePayloadUpdate: PayloadUpdateSummary | { skipped: true } = { skipped: true };
    let payloadUpdate: InstallerFallbackSummary | PayloadUpdateSummary | { skipped: true } = { skipped: true };
    let updaterRecovery: UpdaterRecoverySummary | { skipped: true } = { skipped: true };
    let logs: LogsResult | { skipped: true } = { skipped: true };
    let stop: WinStopResult | { skipped: true } = { skipped: true };
    let postUpdateHealth: HealthEvalValue | { skipped: true } = { skipped: true };
    let upgradePersistence: UpgradePersistenceSeed | { skipped: true } = { skipped: true };
    let payloadFixture: ToolsServeUpdaterFixture | null = null;
    let closureAcceptance: PackagedClosureFixture | null = null;
    let coldStart: PackagedColdStartObservation | null = null;
    let expectedClosureReleaseVersion = updateScenario.expectedCurrentVersion;
    let expectedStandaloneVersion = updateScenario.expectedCurrentVersion;
    let intermediateUpdateFixture: Awaited<ReturnType<typeof resolveLocalUpdateFixture>> | null = null;
    let localUpdateFixture: Awaited<ReturnType<typeof resolveLocalUpdateFixture>> | null = null;
    const updateEnv = captureUpdateEnv();
    try {
      if (verifyPublicImmutableArtifacts) {
        // Installer acceptance stays pinned to immutable staged metadata while
        // Standalone may discover the same release through the run-scoped
        // mutable feed. Keep those independently owned inputs separate.
        process.env.OD_UPDATE_METADATA_URL = resolveNativeAcceptanceUpdateMetadataUrl();
      }
      if (!verifyCoreOnly && updateScenario.channel === 'beta') {
        expect(namespace).toBe('release-beta-win');
      }
      await measureSmokeStep(timings, 'pre-clean uninstall', async () => {
        await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch(() => null);
        await resetPackagedUpdaterNamespaceRoots();
        await resetPackagedClosureFixture({
          channel: updateScenario.channel,
          installationRoot: join(toolsPackDir, 'runtime', 'win'),
          namespace,
        });
        if (verifyPublicImmutableArtifacts) {
          // Public acceptance owns one genuinely cold native first launch. A
          // stale AppData binding would turn that proof into an offline reuse
          // and could silently attach bytes from an older public release.
          await resetPackagedClosureFixture({
            channel: updateScenario.channel,
            installationRoot: nativeProductUserDataRoot,
            namespace,
          });
        }
      });

      const install = await measureSmokeStep(timings, 'install', async () => runToolsPackJson<WinInstallResult>('install'));
      installed = true;

      expect(install.namespace).toBe(namespace);
      expectPathInside(install.installerPath, join(outputNamespaceRoot, 'builder'));
      expectPathInside(install.installDir, join(runtimeNamespaceRoot, 'install'));
      expectPathInside(install.uninstallerPath, install.installDir);
      expect(basename(install.uninstallerPath)).toBe(`Uninstall ${installIdentity.displayName}.exe`);
      expect(install.desktopShortcutExists).toBe(true);
      expect(install.startMenuShortcutExists).toBe(true);
      expect(basename(install.desktopShortcutPath)).toBe(`${installIdentity.displayName}.lnk`);
      expect(basename(install.startMenuShortcutPath)).toBe(`${installIdentity.displayName}.lnk`);
      expect(install.registryEntries.length).toBeGreaterThan(0);
      expect(JSON.stringify(install.registryEntries)).toContain(installIdentity.displayName);
      expect(JSON.stringify(install.registryEntries)).toContain(`Open Design-${installIdentity.namespaceToken}`);
      await assertWindowsInviteProtocolRegistration(install.installDir);
      if (!shellAbsorbsStandaloneAcceptance) await seedConfiguredPackagedClosure();
      expect(install.installPayload.fileCount).toBeGreaterThan(0);
      expect(install.installPayload.totalBytes).toBeGreaterThan(0);
      expect(install.installPayload.topLevel.length).toBeGreaterThan(0);
      const installTiming = await readTiming(install.timingPath);
      expect(installTiming.action).toBe('install');
      expect(installTiming.status).toBe('success');
      if (installTiming.durationMs > maxInstallDurationMs) {
        throw new Error(
          [
            `windows installer exceeded ${maxInstallDurationMs}ms budget: ${installTiming.durationMs}ms`,
            `installed files=${install.installPayload.fileCount} bytes=${install.installPayload.totalBytes}`,
            `top-level payload=${JSON.stringify(install.installPayload.topLevel.slice(0, 8))}`,
          ].join('\n'),
        );
      }

      // Phase 1 — the genuine first run. A packaged install nobody has signed
      // into is real product behaviour, not a broken state: since
      // `shouldRouteToFirstRunOnboarding` keys purely on `onboardingCompleted`,
      // the cloud sign-in landing is its correct terminal surface, and it is
      // accepted only when it actually rendered its sign-in CTA and both runtime
      // links. Core-only on purpose — every release workflow defaults there, and
      // the full profile needs its controlled updater environment from first
      // launch, which a plain start before the fixture is wired would bypass.
      if (verifyCoreOnly) {
        await resetPackagedRuntimeDataRoot();
        // Public acceptance runs before `latest` activation. Prime the real
        // AppData-backed runtime with the exact staged metadata URL so the
        // later URL-protocol cold start exercises the same Closure Store a
        // normal Windows launch uses. A tools-pack launch injects an isolated
        // namespace base root and cannot prove that OS launch boundary.
        const coldLaunchStartedAt = Date.now();
        const firstRunStart = await measureSmokeStep(timings, 'start unseeded first run', async () => {
          if (!verifyPublicImmutableArtifacts) return runToolsPackJson<WinStartResult>('start');
          const launch = await launchNativeWindowsAcceptance(install.installDir);
          return {
            executablePath: join(install.installDir, 'Open Design.exe'),
            logPath: join(nativeRuntimeNamespaceRoot, 'logs', 'desktop', 'latest.log'),
            namespace,
            pid: launch.pid,
            source: 'installed' as const,
            status: null,
          };
        });
        const coldLaunchFinishedAt = Date.now();
        started = true;
        expect(firstRunStart.source).toBe('installed');
        const firstRunInspect = await measureSmokeStep(timings, 'wait healthy unseeded first run', async () =>
          // A public immutable Shell has no bundled Closure. Its genuine first
          // run must download, verify, extract, bind, and launch the Closure
          // before Desktop can become healthy, so use the cold-start budget
          // rather than the shorter steady-state health budget here.
          waitForHealthyDesktop(maxStartDurationMs),
        );
        if (verifyPublicImmutableArtifacts) {
          coldStart = createPackagedColdStartObservation({
            launchFinishedAt: coldLaunchFinishedAt,
            launchStartedAt: coldLaunchStartedAt,
            readinessBudgetMs: maxStartDurationMs,
            readyAt: Date.now(),
          });
        }
        expect(firstRunInspect.status?.state).toBe('running');
        if (!firstRunInspect.desktopIpcUnavailable) {
          const firstRunPhase = await measureSmokeStep(timings, 'ensure first-run app shell', async () =>
            runPackagedAppShellPhase({
              coreProfile: verifyCoreOnly,
              describeLast: formatUnknown,
              observe: observePackagedAppShell,
              readOnboardingConfig: readPackagedOnboardingConfig,
              scenario: 'first-run',
            }),
          );
          expect(firstRunPhase.onboardingCompleted).toBe(false);
          expect(firstRunPhase.appShell).toBe('onboarding-landing');
          firstRunAppShell = firstRunPhase.appShell;
        }
        const firstRunStop = await measureSmokeStep(timings, 'stop unseeded first run', async () =>
          runToolsPackJson<WinStopResult>('stop'),
        );
        started = false;
        expect(firstRunStop.status).not.toBe('partial');
        expect(firstRunStop.remainingPids).toEqual([]);
        if (verifyPublicImmutableArtifacts) await waitForDesktopStopped();
        // Phase 2 reuses the exact Closure committed by the genuine native
        // online first run. Clear only experience state before seeding the
        // completed-user profile; deleting the product Store here would force
        // a second download/extract/commit and duplicate the proof above.
        if (verifyPublicImmutableArtifacts) await resetNativePackagedExperienceState();
        else await resetPackagedRuntimeDataRoot();
      }

      if (verifyPublicImmutableArtifacts) await seedNativePackagedOnboardingComplete();
      else await seedPackagedOnboardingComplete();

      const startDesktop = async (step: string): Promise<WinStartResult> => {
        const nextStart = await measureSmokeStep(timings, step, async () => startWindowsDesktopOrThrow(step));
        started = true;
        return nextStart;
      };
      let expectedPayloadUpdateVersion: string | null = updateVersion;
      if (!verifyCoreOnly) {
        if (updateMetadataUrl != null && updateMetadataUrl !== '') {
          assertUpdateVersionPresent('Windows', updateVersion);
          applyPackagedUpdateEnv(process.env, updateScenario, updateMetadataUrl, { openDryRun: false });
        } else {
          assertToolsServeFixtureEnabled('Windows', updateFixture);
          localUpdateFixture = await resolveLocalUpdateFixture();
          if (intermediateUpdateBuildJsonPath != null) {
            if (updateFixtureMode !== 'payload') {
              throw new Error('Windows intermediate updater recovery requires payload fixture mode');
            }
            intermediateUpdateFixture = await resolveLocalUpdateFixture(intermediateUpdateBuildJsonPath);
          }
          const initialUpdateFixture = intermediateUpdateFixture ?? localUpdateFixture;
          expectedPayloadUpdateVersion = initialUpdateFixture.targetVersion;
          const closureBuild = shellAbsorbsStandaloneAcceptance
            ? await readPackagedClosureBuildFixture({
                buildJsonPath: closureBuildJsonPath!,
                channel: updateScenario.channel,
                expectedPlatform: 'win32-x64',
                workspaceRoot,
              })
            : null;
          payloadFixture = await startToolsServeUpdaterFixture({
            artifactPath: initialUpdateFixture.installerPath,
            channel: updateScenario.channel,
            ...(closureBuild == null ? {} : { closureManifestPath: closureBuild.manifestPath }),
            ...(updateFixtureMode === 'payload' ? { payloadPath: initialUpdateFixture.payloadPath } : {}),
            platform: 'win',
            ...(closureBuild == null ? {} : { rebaseClosureUrl: true }),
            ...(updateFixturePort == null ? {} : { port: updateFixturePort }),
            version: initialUpdateFixture.targetVersion,
            workspaceRoot,
          });
          applyPackagedUpdateEnv(process.env, updateScenario, payloadFixture.info.metadataUrl, { openDryRun: false });
        }
      }

      let start = await startDesktop('start');

      expect(start.namespace).toBe(namespace);
      expect(start.source).toBe('installed');
      expectPathInside(start.executablePath, install.installDir);
      expectPathInside(start.logPath, join(activeRuntimeNamespaceRoot, 'logs', 'desktop'));
      expect(start.pid).toBeGreaterThan(0);

      if (shellAbsorbsStandaloneAcceptance) {
        closureAcceptance = await measureSmokeStep(timings, 'wait online Closure commit', async () =>
          waitForCommittedPackagedClosureFixture({
            buildJsonPath: closureBuildJsonPath!,
            channel: updateScenario.channel,
            expectedPlatform: 'win32-x64',
            installationRoot: join(toolsPackDir, 'runtime', 'win'),
            namespace,
            workspaceRoot,
          }),
        );
      }

      const inspect = await measureSmokeStep(timings, 'wait healthy inspect eval', async () =>
        // Public immutable acceptance now primes the native AppData Store
        // first. The tools-pack Store reached here is therefore independently
        // cold and must receive the same bounded materialization budget; every
        // later restart in either Store remains on the 90-second steady-state
        // budget.
        waitForHealthyDesktop(verifyPublicImmutableArtifacts ? maxStartDurationMs : 90_000),
      );
      expect(inspect.status?.state).toBe('running');
      if (inspect.desktopIpcUnavailable) expectWindowsFallbackWebUrl(inspect.status?.url);
      else expectWindowsPackagedRouteUrl(inspect.status?.url);

      const value = assertHealthEvalValue(inspect.eval?.value);
      if (inspect.desktopIpcUnavailable) expectWindowsDaemonUrl(value.href);
      else expectWindowsPackagedRouteUrl(value.href);
      expect(value.status).toBe(200);
      expect(value.health.ok).toBe(true);
      if (releaseVersion != null && releaseVersion !== '') expect(value.health.version).toBe(releaseVersion);
      else expect(value.health.version).toEqual(expect.any(String));

      const pluginInspect = await measureSmokeStep(timings, 'verify bundled plugin cold-start compensation', async () =>
        runToolsPackJson<WinInspectResult>('inspect', ['--expr', bundledPluginInventoryExpression]),
      );
      expect(pluginInspect.eval?.ok).toBe(true);
      const pluginInventory = pluginInspect.eval?.value as { ids?: unknown; status?: unknown } | undefined;
      expect(pluginInventory?.status).toBe(200);
      expect(pluginInventory?.ids).toEqual(expect.arrayContaining(['od-new-generation']));

      // Establish the data-root postcondition before probing unrelated runtime
      // capabilities. A healthy auth-first renderer may already be on
      // od://app/onboarding, but it must still read the completed seed written
      // into this tools-pack namespace.
      if (!inspect.desktopIpcUnavailable) {
        seededOnboardingCompleted = await measureSmokeStep(timings, 'verify seeded onboarding config', async () =>
          packagedOnboardingCompletedFromProbe(await readPackagedOnboardingConfig()),
        );
        expect(
          seededOnboardingCompleted,
          'daemon did not read the seeded onboardingCompleted config; check that the packaged data root still resolves to the tools-pack runtime namespace root',
        ).toBe(true);
      }

      if (shellAbsorbsStandaloneAcceptance) {
        if (closureAcceptance == null) throw new Error('Windows Shell did not commit the expected Closure fixture');
        const closureRuntime = await readPackagedClosureFixtureRuntime(closureAcceptance);
        expectedStandaloneVersion = closureAcceptance.manifest.identity.version;
        const committedClosureReleaseVersion = closureRuntime.active?.releaseVersion;
        if (committedClosureReleaseVersion == null) {
          throw new Error('Windows Shell did not commit a Closure release version');
        }
        expectedClosureReleaseVersion = committedClosureReleaseVersion;
        assertClosureDesktopIdentity(
          await readDesktopIdentityMarker(),
          expectedStandaloneVersion,
          expectedClosureReleaseVersion,
        );
      }
      const ptyInspect = await measureSmokeStep(timings, 'packaged PTY capability', async () =>
        runToolsPackJson<WinInspectResult>('inspect', [
          '--expr',
          packagedPtySmokeExpression('win32'),
        ]),
      );
      const pty = assertPackagedPtySmokeResult(ptyInspect.eval?.value);
      expect(pty.projectCreateStatus).toBe(200);
      expect(pty.projectSeedStatus).toBe(200);
      expect(pty.terminalCreateStatus).toBe(200);
      expect(pty.stdinStatus).toBe(200);
      expect(pty.output).toContain(pty.marker);
      expect(pty.exitCode, JSON.stringify(pty, null, 2)).toBe(0);
      expect(pty.cleanup.terminalStatus, JSON.stringify(pty.cleanup, null, 2)).toBe(200);
      expect(pty.cleanup.projectStatus, JSON.stringify(pty.cleanup, null, 2)).toBe(200);
      if (verifyPublicImmutableArtifacts) {
        assertPackagedStandaloneStatus(inspect.status?.standalone, {
          namespace,
          releaseVersion: updateScenario.expectedCurrentVersion,
        });
      } else {
        const initialLauncherVersion = releaseChannel === 'local' && shellVersion != null
          ? shellVersion
          : updateScenario.expectedCurrentVersion;
        assertLauncherPointer(inspect.launcher.active, initialLauncherVersion, 0, 'initial active');
        assertLauncherPointer(inspect.launcher.lastSuccessful, initialLauncherVersion, 0, 'initial lastSuccessful');
      }

      // Runtime registration must preserve the stable installed outer path;
      // pointing at a versioned payload would break the scheme after cleanup.
      await assertWindowsInviteProtocolRegistration(install.installDir);
      const protocolHotPid = inspect.status?.pid ?? start.pid;
      const protocolHotContinuationCount = await countInviteContinuationResults();
      await invokeWindowsInviteDeeplink();
      const [protocolHotInspect, protocolHotContinuation] = await measureSmokeStep(
        timings,
        'invite protocol hot delivery',
        async () => Promise.all([
          waitForHealthyDesktop(),
          waitForInviteContinuationResult(protocolHotContinuationCount),
        ]),
      );
      // A visible desktop must absorb protocol delivery in place. Headless
      // acceptance deliberately has no visible owner, so the launcher follows
      // the production `standalone-owner` recovery path and replaces it.
      if (process.env.OD_PACKAGED_E2E_HEADLESS === '1') {
        expect(protocolHotInspect.status?.pid).not.toBe(protocolHotPid);
      } else {
        expect(protocolHotInspect.status?.pid).toBe(protocolHotPid);
      }
      expect(protocolHotContinuation.reason).not.toBe('daemon_unavailable');
      expect(protocolHotContinuation.reason).not.toBe('unreachable');

      if (verifyCoreOnly) {
        const protocolStop = await measureSmokeStep(
          timings,
          'stop before invite protocol cold delivery',
          async () => runToolsPackJson<WinStopResult>('stop', ['--keep-debug-session']),
        );
        started = false;
        expect(protocolStop.status).not.toBe('partial');
        expect(protocolStop.remainingPids).toEqual([]);

        await invokeWindowsInviteDeeplink();
        started = true;
        const protocolColdInspect = await measureSmokeStep(
          timings,
          'invite protocol cold delivery',
          async () => waitForHealthyDesktop(),
        );
        expect(protocolColdInspect.status?.state).toBe('running');
        expect(protocolColdInspect.status?.pid).not.toBe(protocolHotPid);
        await assertWindowsInviteProtocolRegistration(install.installDir);
      }

      if (!inspect.desktopIpcUnavailable) {
        // Re-read rather than reusing the value from the seeded start: the core
        // profile stopped the app above and relaunched it through the OS
        // protocol handler, and that cold start carries none of this process's
        // environment — so it is a different daemon, and only it can say what
        // config the surface being asserted on is actually running under.
        // Phase 2 — the completed user. The seed must have been confirmed before
        // this point. A signed-out completed user may legitimately stop at the
        // cloud identity gate under either smoke profile; the full updater is
        // driven through Shell IPC. Either way, a cold launch that lost the
        // seed fails first.
        if (seededOnboardingCompleted !== true) {
          throw new Error('reached the completed-user app-shell check without a confirmed seeded onboarding state');
        }
        const completedUser = await measureSmokeStep(timings, 'ensure completed-user identity surface', async () =>
          runPackagedAppShellPhase({
            coreProfile: verifyCoreOnly,
            describeLast: formatUnknown,
            observe: observePackagedAppShell,
            readOnboardingConfig: readPackagedOnboardingConfig,
            scenario: 'completed-user',
          }),
        );
        onboardingCompleted = completedUser.onboardingCompleted;
        appShell = completedUser.appShell;
        expect(['home', 'onboarding-landing']).toContain(appShell);

        if (verifyUpgradePersistence) {
          const seedInspect = await measureSmokeStep(timings, 'seed pre-update persistence project', async () =>
            runToolsPackJson<WinInspectResult>('inspect', ['--expr', upgradePersistenceSeedExpression]),
          );
          upgradePersistence = assertUpgradePersistenceSeed(seedInspect.eval?.value);
        }

        await mkdir(dirname(preUpdateScreenshotPath), { recursive: true });
        const preUpdateScreenshot = await measureSmokeStep(timings, 'inspect screenshot before update', async () =>
          runToolsPackJson<WinInspectResult>('inspect', ['--path', preUpdateScreenshotPath]),
        );
        expect(preUpdateScreenshot.screenshot?.path).toBe(preUpdateScreenshotPath);
        expect(await fileSizeBytes(preUpdateScreenshotPath)).toBeGreaterThan(0);
        await report.report.save('screenshots/open-design-win-before-update.png', await readFile(preUpdateScreenshotPath));
      } else if (verifyUpgradePersistence) {
        throw new Error('upgrade persistence validation requires desktop IPC eval support');
      }

      if (!verifyCoreOnly) {
        const persistedProjectId = 'skipped' in upgradePersistence ? null : upgradePersistence.projectId;
        payloadUpdate = await measureSmokeStep(timings, `${updateFixtureMode} update acceptance`, async () =>
          updateFixtureMode === 'installer'
            ? runInstallerFallbackAcceptance({
                expectedStandaloneVersion,
                expectedVersion: expectedPayloadUpdateVersion,
                fixture: payloadFixture,
                installDir: install.installDir,
                persistedProjectId,
              })
            : runPayloadUpdateAcceptance({
                expectedClosureReleaseVersion,
                expectedStandaloneVersion,
                expectedVersion: expectedPayloadUpdateVersion,
                ...(intermediateUpdateFixture == null
                  ? {}
                  : { legacyInstalledExecutablePath: join(install.installDir, 'Open Design.exe') }),
                persistedProjectId,
                verifyPptx: intermediateUpdateFixture == null,
              }),
        );
        postUpdateHealth = payloadUpdate.health;

        if (intermediateUpdateFixture != null && localUpdateFixture != null && payloadFixture != null) {
          if ('skipped' in payloadUpdate || !('launcherAfterConfirm' in payloadUpdate)) {
            throw new Error('Windows intermediate update did not complete through the payload path');
          }
          const intermediateIdentityPid = payloadUpdate.identity.pid;
          intermediatePayloadUpdate = payloadUpdate;
          await payloadFixture.close();
          payloadFixture = await startToolsServeUpdaterFixture({
            artifactPath: localUpdateFixture.installerPath,
            channel: updateScenario.channel,
            payloadPath: localUpdateFixture.payloadPath,
            platform: 'win',
            ...(updateFixturePort == null ? {} : { port: updateFixturePort }),
            version: localUpdateFixture.targetVersion,
            workspaceRoot,
          });
          applyPackagedUpdateEnv(process.env, updateScenario, payloadFixture.info.metadataUrl, { openDryRun: false });
          const intermediateVersion = intermediateUpdateFixture.targetVersion;
          const targetVersion = localUpdateFixture.targetVersion;
          process.env.OD_UPDATE_CURRENT_VERSION = intermediateVersion;
          const fixtureSwitchStop = await measureSmokeStep(timings, 'stop before target update fixture', async () =>
            runToolsPackJson<WinStopResult>('stop'),
          );
          started = false;
          expect(fixtureSwitchStop.status).not.toBe('partial');
          expect(fixtureSwitchStop.remainingPids).toEqual([]);
          start = await startDesktop('restart with target update fixture');
          expect(start.source).toBe('installed');
          await measureSmokeStep(timings, 'wait healthy after target fixture restart', async () =>
            waitForHealthyDesktopShellVersion(intermediateVersion, expectedStandaloneVersion, intermediateIdentityPid),
          );
          expectedPayloadUpdateVersion = targetVersion;
          payloadUpdate = await measureSmokeStep(timings, 'target payload update acceptance', async () =>
            runPayloadUpdateAcceptance({
              expectedClosureReleaseVersion,
              expectedCurrentVersion: intermediateVersion,
              expectedStandaloneVersion,
              expectedVersion: targetVersion,
              persistedProjectId,
            }),
          );
          postUpdateHealth = payloadUpdate.health;
        }

        // A local full payload fixture has both artifacts, so reuse the exact
        // target version with an installed-outer floor. The running payload is
        // already at targetVersion while the physical outer is still the base
        // install: only an outer-version-aware updater can offer this
        // same-version installer reinstall.
        if (
          updateFixtureMode === 'payload' &&
          localUpdateFixture != null &&
          payloadFixture != null &&
          expectedPayloadUpdateVersion != null
        ) {
          await payloadFixture.close();
          payloadFixture = await startToolsServeUpdaterFixture({
            artifactPath: localUpdateFixture.installerPath,
            channel: updateScenario.channel,
            controlInstallationVersionMin: expectedPayloadUpdateVersion,
            controlInstallationVersionUrl: 'https://example.test/updater-recovery',
            payloadPath: localUpdateFixture.payloadPath,
            platform: 'win',
            ...(updateFixturePort == null ? {} : { port: updateFixturePort }),
            version: expectedPayloadUpdateVersion,
            workspaceRoot,
          });
          applyPackagedUpdateEnv(process.env, updateScenario, payloadFixture.info.metadataUrl, { openDryRun: false });
          process.env.OD_UPDATE_CURRENT_VERSION = expectedPayloadUpdateVersion;
          const recoveryFixture = payloadFixture;
          const recoveryTargetVersion = expectedPayloadUpdateVersion;
          updaterRecovery = await measureSmokeStep(timings, 'same-version reinstall and clear-cache recovery', async () =>
            runSameVersionUpdaterRecoveryAcceptance({
              expectedInstalledVersion: updateScenario.expectedInstalledShellVersion,
              expectedStandaloneVersion,
              fixture: recoveryFixture,
              installDir: install.installDir,
              persistedProjectId,
              targetVersion: recoveryTargetVersion,
            }),
          );
          postUpdateHealth = updaterRecovery.installer.health;
        }
      }

      if (!inspect.desktopIpcUnavailable) {
        await mkdir(dirname(screenshotPath), { recursive: true });
        const screenshot = await measureSmokeStep(timings, 'inspect screenshot', async () =>
          runToolsPackJson<WinInspectResult>('inspect', ['--path', screenshotPath]),
        );
        expect(screenshot.screenshot?.path).toBe(screenshotPath);
        expect(await fileSizeBytes(screenshotPath)).toBeGreaterThan(0);
        await report.saveScreenshot(screenshotPath);
      }

      if (!verifyCoreOnly) {
        logs = await measureSmokeStep(timings, 'logs', async () => runToolsPackJson<LogsResult>('logs'));
        assertLogPathsAndContent(logs);

        stop = await measureSmokeStep(timings, 'stop', async () => runToolsPackJson<WinStopResult>('stop'));
        started = false;
        expect(stop.namespace).toBe(namespace);
        expect(stop.status).not.toBe('partial');
        expect(stop.remainingPids).toEqual([]);
      }

      // Bind the public acceptance proof to the exact Closure committed by
      // the installed Shell before uninstall removes the namespace state.
      // Local release smoke records the same fact, so this is evidence rather
      // than a workflow-only behavior branch.
      const closureBinding = await readPackagedClosureBinding({
        channel: updateScenario.channel,
        label: 'packaged Windows',
        namespace,
        root: verifyPublicImmutableArtifacts ? nativeProductUserDataRoot : join(toolsPackDir, 'runtime', 'win'),
        ...(verifyPublicImmutableArtifacts
          ? { expected: {
              channel: updateScenario.channel,
              namespace,
              releaseVersion: releaseVersion!,
              target: 'win32-x64',
              version: releaseVersion!,
            } }
          : {}),
      });

      const uninstall = await measureSmokeStep(timings, 'uninstall remove data', async () =>
        runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']),
      );
      installed = false;
      started = false;
      expect(uninstall.namespace).toBe(namespace);
      expect(uninstall.residueObservation?.managedProcessPids ?? []).toEqual([]);
      expect(uninstall.residueObservation?.productNamespaceRootExists).toBe(false);
      expect(uninstall.residueObservation?.registryResidues ?? []).toEqual([]);
      expect(uninstall.residueObservation?.installedExeExists).toBe(false);
      expect(uninstall.residueObservation?.uninstallerExists).toBe(false);
      expect(uninstall.residueObservation?.startMenuShortcutExists).toBe(false);
      expect(uninstall.residueObservation?.userDesktopShortcutExists).toBe(false);
      await assertWindowsInviteProtocolRemoved();
      await report.saveSummary({
        appShell,
        closureBinding,
        ...(coldStart == null ? {} : { coldStart }),
        onboarding: {
          afterSeed: seededOnboardingCompleted,
          atAppShell: onboardingCompleted,
          firstRunAppShell,
        },
        health: value,
        install: {
          desktopShortcutExists: install.desktopShortcutExists,
          installDir: install.installDir,
          installPayload: install.installPayload,
          installerPath: install.installerPath,
          lifecycleTimings: install.lifecycleTimings,
          registryEntryCount: install.registryEntries.length,
          startMenuShortcutExists: install.startMenuShortcutExists,
          timingPath: install.timingPath,
          uninstallerPath: install.uninstallerPath,
        },
        installTiming,
        intermediatePayloadUpdate,
        logs: 'skipped' in logs ? logs : summarizeLogs(logs),
        namespace,
        payloadUpdate,
        pty,
        updaterRecovery,
        screenshot: inspect.desktopIpcUnavailable ? null : report.screenshotRelpath,
        screenshots: inspect.desktopIpcUnavailable
          ? { afterUpdate: null, beforeUpdate: null }
          : {
              afterUpdate: report.screenshotRelpath,
              beforeUpdate: 'screenshots/open-design-win-before-update.png',
            },
        start: {
          executablePath: start.executablePath,
          logPath: start.logPath,
          pid: start.pid,
          processExitedBeforeStatus: start.processExitedBeforeStatus,
          source: start.source,
          status: start.status,
          statusPollCount: start.statusPollCount,
          statusWaitDurationMs: start.statusWaitDurationMs,
        },
        stop,
        timings,
        uninstall,
        update: {
          before: value,
          after: postUpdateHealth,
        },
        upgradePersistence,
      });
      printLifecycleTimings('install lifecycle timings', install.lifecycleTimings);
      printLifecycleTimings('uninstall lifecycle timings', uninstall.lifecycleTimings);
      passed = true;
    } finally {
      restoreUpdateEnv(updateEnv);
      await payloadFixture?.close().catch((error: unknown) => {
        console.error('failed to close payload update fixture', error);
      });
      if (!passed) {
        await printPackagedLogs().catch((error: unknown) => {
          console.error('failed to read packaged windows logs after failure', error);
        });
      }

      if (started) {
        await runToolsPackJson<WinStopResult>('stop').catch((error: unknown) => {
          console.error('failed to stop packaged windows app during cleanup', error);
        });
        started = false;
      }

      if (installed) {
        await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch((error: unknown) => {
          console.error('failed to uninstall packaged windows app during cleanup', error);
        });
        installed = false;
      }

      printSmokeTimings(timings);
    }
  }, 720_000);
});
