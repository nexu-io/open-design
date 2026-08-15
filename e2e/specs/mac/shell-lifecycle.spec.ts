// @vitest-environment node

import { mkdir } from 'node:fs/promises';
import { dirname,join } from 'node:path';

import { describe,expect,test } from 'vitest';

import {
	packagedAppShellExpression,
	packagedOnboardingConfigExpression,
	runPackagedAppShellPhase,
} from '@/vitest/packaged-app-shell';
import { assertPackagedStandaloneStatus,readPackagedClosureBinding } from '@/vitest/packaged-closure-binding';
import {
	activateBrokenClosureSuccessor,
	readCommittedPackagedClosureFixture,
	readPackagedClosureBuildFixture,
	readPackagedClosureFixtureRuntime,
	type PackagedClosureFixture
} from '@/vitest/packaged-closure-fixture';
import {
	createPackagedColdStartObservation,
	type PackagedColdStartObservation,
} from '@/vitest/packaged-cold-start';
import {
	installPackagedIsolatedAmrState,
	type PackagedIsolatedAmrState
} from '@/vitest/packaged-initial-state';
import {
	assertPackagedPtySmokeResult,
	packagedPtySmokeExpression,
} from '@/vitest/packaged-pty-smoke';
import {
	createPackagedSmokeReport
} from '@/vitest/packaged-report';
import {
	hasPackagedSmokeLane
} from '@/vitest/packaged-smoke-contract';
import { MAC_PACKAGED_SMOKE_SCENARIOS } from '@/vitest/packaged-smoke-plan-mac';
import {
	applyPackagedUpdateEnv
} from '@/vitest/packaged-update-scenario';
import { startToolsServeUpdaterFixture,type ToolsServeUpdaterFixture } from '@/vitest/tools-serve-updater-fixture';
import { shouldRunPackagedMacSmoke } from './lib/context.js';


import type { LogsResult,MacInspectResult,MacInstallResult,MacStartResult,MacStopResult,MacUninstallResult,PayloadRuntimeAcceptance,UpdaterRecoverySummary,UpgradePersistenceSeed } from './lib/index.js';
import { assertClosureDesktopIdentity,assertHealthEvalValue,assertLauncherPointer,assertLogPathsAndContent,assertMacInviteProtocolRegistration,assertPayloadDesktopIdentity,assertPptxExportEvalValue,assertSettledDesktopHandoff,assertToolsServeFixtureEnabled,assertUpdateVersionPresent,assertUpgradePersistenceSeed,bundledPluginInventoryExpression,capturePackagedCheckpoint,captureUpdateEnv,closureBuildJsonPath,existingProjectPptxExportExpression,expectPathInside,fileSizeBytes,formatUnknown,invokeMacInviteDeeplink,launchMacAppWithLaunchServices,macFocusWitness,maxStartDurationMs,namespace,outputNamespaceRoot,packagedMacClosureTarget,packagedMacUpdaterPlatform,pathExists,printPackagedLogs,readDesktopIdentityMarker,releaseChannel,releaseVersion,resetPackagedRuntimeState,resolveLocalPayloadUpdateFixture,restoreUpdateEnv,runtimeNamespaceRoot,runToolsPackJson,screenshotPath,seedConfiguredPackagedClosure,seedPackagedOnboardingComplete,settledLauncherGeneration,shellVersion,smokeLanes,standaloneSeedEmbedded,summarizeLogs,toolsPackDir,updateFixture,updateMetadataUrl,updateScenario,updateVersion,upgradePersistenceSeedExpression,verifyCoreOnly,verifyStandaloneRuntimeBinding,waitForHealthyDesktop,waitForHealthyDesktopShellVersion,waitForUpdaterStatus,workspaceRoot } from './lib/index.js';

const macShellDescribe = shouldRunPackagedMacSmoke && hasPackagedSmokeLane(smokeLanes, 'shell') ? describe : describe.skip;
const shellAbsorbsStandaloneAcceptance = hasPackagedSmokeLane(smokeLanes, 'shell')
  && hasPackagedSmokeLane(smokeLanes, 'standalone')
  && !verifyCoreOnly
  && updateFixture === 'tools-serve'
  && closureBuildJsonPath != null;

macShellDescribe('packaged mac Shell runtime smoke', () => {
  let installedAppPath: string | null = null;
  let started = false;

  test(MAC_PACKAGED_SMOKE_SCENARIOS.shellLifecycle.title, async () => {
    const report = await createPackagedSmokeReport('mac');
    const updateEnv = captureUpdateEnv();
    let payloadFixture: ToolsServeUpdaterFixture | null = null;
    let recoveryFixture: ToolsServeUpdaterFixture | null = null;
    let recoveryPayloadPath: string | null = null;
    let logs: LogsResult | { skipped: true } = { skipped: true };
    let installControl: NonNullable<MacInspectResult['update']> | { skipped: true } = { skipped: true };
    let updateInstall: NonNullable<MacInspectResult['update']> | { skipped: true } = { skipped: true };
    let updateStatus: NonNullable<MacInspectResult['update']> | { skipped: true } = { skipped: true };
    let payloadRuntime: PayloadRuntimeAcceptance | { skipped: true } = { skipped: true };
    let updaterRecovery: UpdaterRecoverySummary | { skipped: true } = { skipped: true };
    let upgradePersistence: UpgradePersistenceSeed | { skipped: true } = { skipped: true };
    let closureAcceptance: PackagedClosureFixture | null = null;
    let coldStart: PackagedColdStartObservation | null = null;
    let isolatedAmrState: PackagedIsolatedAmrState | null = null;
    let passed = false;
    try {
      await resetPackagedRuntimeState();
      const install = await runToolsPackJson<MacInstallResult>('install');
      installedAppPath = install.installedAppPath;

      expect(install.namespace).toBe(namespace);
      expect(install.detached).toBe(true);
      expectPathInside(install.dmgPath, join(outputNamespaceRoot, 'dmg'));
      expectPathInside(install.installedAppPath, join(outputNamespaceRoot, 'install', 'Applications'));
      await assertMacInviteProtocolRegistration(install.installedAppPath);

      await seedPackagedOnboardingComplete();
      isolatedAmrState = await installPackagedIsolatedAmrState(
        join(runtimeNamespaceRoot, 'synthetic', 'amr'),
      );
      if (!standaloneSeedEmbedded && !shellAbsorbsStandaloneAcceptance) await seedConfiguredPackagedClosure();

      let expectedPayloadUpdateVersion: string | null = updateVersion;
      if (!verifyCoreOnly) {
        if (updateMetadataUrl != null && updateMetadataUrl !== '') {
          assertUpdateVersionPresent('mac', updateVersion);
          applyPackagedUpdateEnv(process.env, updateScenario, updateMetadataUrl, { openDryRun: false });
        } else {
          assertToolsServeFixtureEnabled('mac', updateFixture);
          const localPayload = await resolveLocalPayloadUpdateFixture();
          expectedPayloadUpdateVersion = localPayload.targetVersion;
          recoveryPayloadPath = localPayload.payloadPath;
          const closureBuild = shellAbsorbsStandaloneAcceptance
            ? await readPackagedClosureBuildFixture({
                buildJsonPath: closureBuildJsonPath!,
                channel: updateScenario.channel,
                expectedPlatform: packagedMacClosureTarget,
                workspaceRoot,
              })
            : null;
          payloadFixture = await startToolsServeUpdaterFixture({
            channel: updateScenario.channel,
            ...(closureBuild == null ? {} : { closureManifestPath: closureBuild.manifestPath }),
            payloadPath: localPayload.payloadPath,
            platform: packagedMacUpdaterPlatform,
            rebaseClosureUrl: closureBuild != null,
            version: localPayload.targetVersion,
            workspaceRoot,
          });
          applyPackagedUpdateEnv(process.env, updateScenario, payloadFixture.info.metadataUrl, { openDryRun: false });
        }
      }

      const coldLaunchStartedAt = Date.now();
      const start = await runToolsPackJson<MacStartResult>('start');
      const coldLaunchFinishedAt = Date.now();
      started = true;

      expect(start.namespace).toBe(namespace);
      expect(start.source).toBe('installed');
      expect(start.appPath).toBe(install.installedAppPath);
      expectPathInside(start.logPath, join(runtimeNamespaceRoot, 'logs', 'desktop'));
      expect(start.pid).toBeGreaterThan(0);
      // `tools-pack mac start` performs a best-effort status probe before
      // returning, but GitHub's macOS runners can take longer than that probe
      // window to make the packaged desktop IPC-ready. Keep validating a
      // non-null immediate status when available, then use the longer health
      // polling below as the authoritative startup check.
      if (start.status != null) {
        expect(start.status.state).toBe('running');
      }

      const inspect = await waitForHealthyDesktop();
      if (verifyStandaloneRuntimeBinding) {
        coldStart = createPackagedColdStartObservation({
          launchFinishedAt: coldLaunchFinishedAt,
          launchStartedAt: coldLaunchStartedAt,
          readinessBudgetMs: maxStartDurationMs,
          readyAt: Date.now(),
        });
      }
      expect(inspect.status?.state).toBe('running');
      expect(inspect.status?.url).toMatch(/^(od:\/\/app\/|http:\/\/127\.0\.0\.1:\d+\/)/);
      await capturePackagedCheckpoint(report, 'shell-initial-ready', inspect);

      const value = assertHealthEvalValue(inspect.eval?.value);
      expect(value.href).toMatch(/^(od:\/\/app\/|http:\/\/127\.0\.0\.1:\d+\/)/);
      expect(value.status).toBe(200);
      expect(value.health.ok).toBe(true);
      const appShell = await runPackagedAppShellPhase({
        coreProfile: verifyCoreOnly,
        describeLast: formatUnknown,
        observe: async () => (await runToolsPackJson<MacInspectResult>('inspect', [
          '--expr',
          packagedAppShellExpression,
        ])).eval?.value,
        readOnboardingConfig: async () => (await runToolsPackJson<MacInspectResult>('inspect', [
          '--expr',
          packagedOnboardingConfigExpression,
        ])).eval?.value,
        scenario: 'completed-user',
      });
      expect(appShell.onboardingCompleted).toBe(true);
      expect(appShell.appShell).toBe('home');
      if (updateScenario.currentVersionOverride == null) {
        expect(value.health.version).toBe(updateScenario.expectedCurrentVersion);
      } else {
        expect(value.health.version).toEqual(expect.any(String));
      }
      const pluginInspect = await runToolsPackJson<MacInspectResult>('inspect', [
        '--expr',
        bundledPluginInventoryExpression,
      ]);
      expect(pluginInspect.eval?.ok).toBe(true);
      const pluginInventory = pluginInspect.eval?.value as { ids?: unknown; status?: unknown } | undefined;
      expect(pluginInventory?.status).toBe(200);
      expect(pluginInventory?.ids).toEqual(expect.arrayContaining(['od-new-generation']));
      if (shellAbsorbsStandaloneAcceptance) {
        closureAcceptance = await readCommittedPackagedClosureFixture({
          buildJsonPath: closureBuildJsonPath!,
          channel: updateScenario.channel,
          expectedPlatform: packagedMacClosureTarget,
          installationRoot: join(toolsPackDir, 'runtime', 'mac'),
          namespace,
          workspaceRoot,
        });
        assertClosureDesktopIdentity(
          await readDesktopIdentityMarker(),
          closureAcceptance.manifest.identity.version,
          expectedPayloadUpdateVersion!,
        );
      }
      const ptyInspect = await runToolsPackJson<MacInspectResult>('inspect', [
        '--expr',
        packagedPtySmokeExpression('darwin'),
      ]);
      const pty = assertPackagedPtySmokeResult(ptyInspect.eval?.value);
      expect(pty.projectCreateStatus).toBe(200);
      expect(pty.projectSeedStatus).toBe(200);
      expect(pty.terminalCreateStatus).toBe(200);
      expect(pty.stdinStatus).toBe(200);
      expect(pty.output).toContain(pty.marker);
      expect(pty.exitCode, JSON.stringify(pty, null, 2)).toBe(0);
      expect(pty.cleanup.terminalStatus, JSON.stringify(pty.cleanup, null, 2)).toBe(200);
      expect(pty.cleanup.projectStatus, JSON.stringify(pty.cleanup, null, 2)).toBe(200);
      if (verifyStandaloneRuntimeBinding) {
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

      let protocolBaseInspect = inspect;
      if (closureAcceptance != null) {
        const reinstallStop = await runToolsPackJson<MacStopResult>('stop');
        started = false;
        expect(reinstallStop.remainingPids).toEqual([]);
        const reinstall = await runToolsPackJson<MacInstallResult>('install');
        expect(reinstall.installedAppPath).toBe(install.installedAppPath);
        const reinstallStart = await runToolsPackJson<MacStartResult>('start');
        started = true;
        expect(reinstallStart.pid).not.toBe(start.pid);
        protocolBaseInspect = await waitForHealthyDesktop();
        assertClosureDesktopIdentity(
          await readDesktopIdentityMarker(),
          closureAcceptance.manifest.identity.version,
          expectedPayloadUpdateVersion!,
        );
      }

      const protocolHotPid = protocolBaseInspect.status?.pid ?? start.pid;
      await invokeMacInviteDeeplink(install.installedAppPath);
      const protocolHotInspect = await waitForHealthyDesktop();
      expect(protocolHotInspect.status?.pid).toBe(protocolHotPid);

      if (verifyCoreOnly) {
        const protocolStop = await runToolsPackJson<MacStopResult>('stop', ['--keep-debug-session']);
        started = false;
        expect(protocolStop.status).not.toBe('partial');
        expect(protocolStop.remainingPids).toEqual([]);

        await launchMacAppWithLaunchServices(install.installedAppPath);
        started = true;
        const protocolColdStarted = await waitForHealthyDesktop();
        expect(protocolColdStarted.status?.state).toBe('running');
        expect(protocolColdStarted.status?.pid).not.toBe(protocolHotPid);
        if (releaseChannel === 'local') {
          expect(protocolColdStarted.update?.supported).toBe(false);
        }
        const coldAppShell = await runPackagedAppShellPhase({
          coreProfile: true,
          describeLast: formatUnknown,
          observe: async () => (await runToolsPackJson<MacInspectResult>('inspect', [
            '--expr',
            packagedAppShellExpression,
          ])).eval?.value,
          readOnboardingConfig: async () => (await runToolsPackJson<MacInspectResult>('inspect', [
            '--expr',
            packagedOnboardingConfigExpression,
          ])).eval?.value,
          scenario: 'completed-user',
        });
        expect(coldAppShell).toEqual({ appShell: 'home', onboardingCompleted: true });
        await capturePackagedCheckpoint(report, 'shell-launch-services-ready', protocolColdStarted);
        if (macFocusWitness != null && protocolColdStarted.status?.pid != null) {
          await macFocusWitness.track({
            appPath: install.installedAppPath,
            pid: protocolColdStarted.status.pid,
          });
        }

        await invokeMacInviteDeeplink(install.installedAppPath);
        const protocolColdInspect = await waitForHealthyDesktop();
        expect(protocolColdInspect.status?.pid).toBe(protocolColdStarted.status?.pid);
      }

      if (!verifyCoreOnly) {
        const updaterVersion = expectedPayloadUpdateVersion;
        if (updaterVersion == null || updaterVersion.length === 0) {
          throw new Error('full packaged mac payload smoke requires an update target version');
        }
        const persistenceInspect = await runToolsPackJson<MacInspectResult>('inspect', [
          '--expr',
          upgradePersistenceSeedExpression,
        ]);
        const persistence = assertUpgradePersistenceSeed(persistenceInspect.eval?.value);
        upgradePersistence = persistence;
        const readyUpdate = await waitForUpdaterStatus(
          (status) =>
            status.update?.state === 'downloaded' &&
            status.update.availableVersion === updaterVersion &&
            status.update.artifact?.type === 'payload' &&
            typeof status.update.downloadPath === 'string',
          'ready updater prompt update downloaded',
        );
        expect(readyUpdate.update?.downloadPath).toEqual(expect.any(String));
        expectPathInside(readyUpdate.update?.downloadPath ?? '', join(runtimeNamespaceRoot, 'updates'));

        const updateInspect = await runToolsPackJson<MacInspectResult>('inspect', ['--update-action', 'status']);
        expect(updateInspect.update?.state).toBe('downloaded');
        expect(updateInspect.update?.artifact?.type).toBe('payload');
        expect(updateInspect.update?.channel).toBe(updateScenario.channel);
        expect(updateInspect.update?.currentVersion).toBe(updateScenario.expectedCurrentVersion);
        expect(updateInspect.update?.availableVersion).toBe(updaterVersion);
        expectPathInside(updateInspect.update?.downloadPath ?? '', join(runtimeNamespaceRoot, 'updates'));
        if (updateInspect.update == null) throw new Error('mac update status is missing');
        updateStatus = updateInspect.update;

        // Shell update acceptance is anchored to the Shell-owned IPC control
        // plane. Closure pages may project this state, but their route/layout
        // must never be a prerequisite for applying a launcher payload.
        const installInspect = await runToolsPackJson<MacInspectResult>('inspect', ['--update-action', 'install']);
        if (installInspect.update == null) throw new Error('mac update install control result is missing');
        expect(installInspect.update.state).toBe('downloaded');
        expect(installInspect.update.installResult?.dryRun).toBe(false);
        installControl = installInspect.update;
        const postUpdateInspect = await waitForHealthyDesktopShellVersion(
          updaterVersion,
          updateScenario.expectedCurrentVersion,
          start.pid,
        );
        started = true;
        await capturePackagedCheckpoint(report, 'shell-payload-activated', postUpdateInspect);
        const postUpdateHealth = assertHealthEvalValue(postUpdateInspect.eval?.value);
        expect(postUpdateHealth.status).toBe(200);
        expect(postUpdateHealth.health.ok).toBe(true);
        expect(postUpdateHealth.health.version).toBe(updateScenario.expectedCurrentVersion);
        const confirmedGeneration = settledLauncherGeneration(postUpdateInspect.launcher, updaterVersion);
        if (confirmedGeneration == null) throw new Error('post-update launcher did not settle on the target version');
        assertLauncherPointer(
          postUpdateInspect.launcher.active,
          updaterVersion,
          confirmedGeneration,
          'post-relaunch active',
        );
        assertLauncherPointer(
          postUpdateInspect.launcher.lastSuccessful,
          updaterVersion,
          confirmedGeneration,
          'post-relaunch lastSuccessful',
        );
        const terminalUpdate = await waitForUpdaterStatus(
          (status) => status.update?.state === 'not-available' && status.update.currentVersion === updaterVersion,
          'post-relaunch updater terminal state',
        );
        if (terminalUpdate.update == null) throw new Error('mac terminal update status is missing');
        updateInstall = terminalUpdate.update;

        const identity = await readDesktopIdentityMarker();
        assertPayloadDesktopIdentity(
          identity,
          postUpdateInspect.launcher,
          updaterVersion,
          updateScenario.expectedCurrentVersion,
          updateScenario.expectedCurrentVersion,
        );
        expect(postUpdateInspect.launcher.attempt).toBeNull();
        assertSettledDesktopHandoff(postUpdateInspect.launcher.handoff);

        const persistedPptxExpression = existingProjectPptxExportExpression(persistence.projectId);
        const pptxInspect = await runToolsPackJson<MacInspectResult>('inspect', ['--expr', persistedPptxExpression]);
        const pptx = assertPptxExportEvalValue(pptxInspect.eval?.value);
        expect(pptx.projectId).toBe(persistence.projectId);

        const coldStop = await runToolsPackJson<MacStopResult>('stop');
        started = false;
        expect(coldStop.status).not.toBe('partial');
        expect(coldStop.remainingPids).toEqual([]);

        const coldStart = await runToolsPackJson<MacStartResult>('start');
        started = true;
        expect(coldStart.source).toBe('installed');
        expect(coldStart.appPath).toBe(install.installedAppPath);
        const coldInspect = await waitForHealthyDesktopShellVersion(
          updaterVersion,
          updateScenario.expectedCurrentVersion,
          identity.pid,
        );
        const coldHealth = assertHealthEvalValue(coldInspect.eval?.value);
        await capturePackagedCheckpoint(report, 'shell-payload-cold-start', coldInspect);
        expect(coldHealth.status).toBe(200);
        expect(coldHealth.health.ok).toBe(true);
        expect(coldHealth.health.version).toBe(updateScenario.expectedCurrentVersion);
        const coldGeneration = settledLauncherGeneration(coldInspect.launcher, updaterVersion);
        if (coldGeneration == null) throw new Error('cold-start launcher did not settle on the target version');
        expect(coldGeneration).toBeGreaterThanOrEqual(confirmedGeneration);
        assertLauncherPointer(coldInspect.launcher.active, updaterVersion, coldGeneration, 'cold-start active');
        assertLauncherPointer(
          coldInspect.launcher.lastSuccessful,
          updaterVersion,
          coldGeneration,
          'cold-start lastSuccessful',
        );
        expect(coldInspect.launcher.attempt).toBeNull();
        assertSettledDesktopHandoff(coldInspect.launcher.handoff);
        const coldIdentity = await readDesktopIdentityMarker();
        assertPayloadDesktopIdentity(
          coldIdentity,
          coldInspect.launcher,
          updaterVersion,
          updateScenario.expectedCurrentVersion,
          updateScenario.expectedCurrentVersion,
        );
        expect(coldIdentity.pid).not.toBe(identity.pid);
        const coldPptxInspect = await runToolsPackJson<MacInspectResult>('inspect', ['--expr', persistedPptxExpression]);
        const coldPptx = assertPptxExportEvalValue(coldPptxInspect.eval?.value);
        expect(coldPptx.projectId).toBe(persistence.projectId);
        payloadRuntime = {
          coldStart: {
            health: coldHealth,
            identity: coldIdentity,
            launcher: coldInspect.launcher,
            pptx: coldPptx,
            start: coldStart,
          },
          identity,
          pptx,
        };

        // Same-version reinstall + clear-cache recovery (mirrors the Windows
        // lane's runSameVersionUpdaterRecoveryAcceptance): the physical outer
        // is still the base install while the running payload is already at
        // the target version, so only an installed-outer-aware floor can
        // offer this installer reinstall. macOS has no silent DMG install to
        // execute, so the installer open is asserted in dry-run mode instead
        // of the Windows NSIS transaction.
        if (recoveryPayloadPath != null) {
          await payloadFixture?.close().catch((error: unknown) => {
            console.error('failed to close payload update fixture before recovery', error);
          });
          payloadFixture = null;
          recoveryFixture = await startToolsServeUpdaterFixture({
            channel: updateScenario.channel,
            controlInstallationVersionMin: updaterVersion,
            controlInstallationVersionUrl: 'https://example.test/updater-recovery',
            payloadPath: recoveryPayloadPath,
            platform: packagedMacUpdaterPlatform,
            version: updaterVersion,
            workspaceRoot,
          });
          applyPackagedUpdateEnv(process.env, updateScenario, recoveryFixture.info.metadataUrl, { openDryRun: true });

          const recoveryStop = await runToolsPackJson<MacStopResult>('stop');
          started = false;
          expect(recoveryStop.status).not.toBe('partial');
          const recoveryStart = await runToolsPackJson<MacStartResult>('start');
          started = true;
          expect(recoveryStart.source).toBe('installed');
          await waitForHealthyDesktopShellVersion(
            updaterVersion,
            updateScenario.expectedCurrentVersion,
            coldIdentity.pid,
          );

          const reinstallReady = await waitForUpdaterStatus(
            (inspect) =>
              inspect.update?.state === 'downloaded' &&
              inspect.update.artifact?.type === 'dmg' &&
              inspect.update.availableVersion === updaterVersion,
            'same-version reinstall downloaded',
          );
          if (reinstallReady.update == null) throw new Error('same-version reinstall did not return updater status');
          expect(reinstallReady.update.currentVersion).toBe(updaterVersion);
          expect(reinstallReady.update.reinstall).toEqual({
            installedVersion: updateScenario.expectedInstalledShellVersion,
            minVersion: updaterVersion,
            reason: 'outer-below-min',
            url: 'https://example.test/updater-recovery',
          });

          const clearedInspect = await runToolsPackJson<MacInspectResult>('inspect', ['--update-action', 'clear-cache']);
          if (clearedInspect.update == null) throw new Error('clear-cache did not return updater status');
          expect(clearedInspect.update.state).toBe('idle');
          expect(clearedInspect.update.downloadPath).toBeUndefined();
          expect(clearedInspect.update.installResult).toBeUndefined();
          expect(clearedInspect.update.reinstall).toBeUndefined();
          // Retained launcher versions must survive a manual clear.
          expect(clearedInspect.launcher.active).toEqual(reinstallReady.launcher.active);
          expect(clearedInspect.launcher.lastSuccessful).toEqual(reinstallReady.launcher.lastSuccessful);

          // Recovery: an explicit re-check re-derives the reinstall offer and
          // re-downloads the installer artifact from the clean slate.
          await runToolsPackJson<MacInspectResult>('inspect', ['--update-action', 'check']);
          const recovered = await waitForUpdaterStatus(
            (inspect) =>
              inspect.update?.state === 'downloaded' &&
              inspect.update.artifact?.type === 'dmg' &&
              inspect.update.reinstall != null,
            'post-clear reinstall recovery',
          );
          if (recovered.update == null) throw new Error('post-clear recovery did not return updater status');

          const dryRunInstall = await runToolsPackJson<MacInspectResult>('inspect', ['--update-action', 'install']);
          expect(dryRunInstall.update?.installResult?.dryRun).toBe(true);

          // Leave a pristine updater behind for the final stop/uninstall.
          const resetInspect = await runToolsPackJson<MacInspectResult>('inspect', ['--update-action', 'clear-cache']);
          expect(resetInspect.update?.state).toBe('idle');

          updaterRecovery = {
            cleared: clearedInspect.update,
            downloadedBeforeClear: reinstallReady.update,
            dryRunInstall: dryRunInstall.update ?? null,
            recovered: recovered.update,
          };
        }
      }

      await mkdir(dirname(screenshotPath), { recursive: true });
      const screenshot = await runToolsPackJson<MacInspectResult>('inspect', ['--path', screenshotPath]);
      expect(screenshot.screenshot?.path).toBe(screenshotPath);
      expect(await fileSizeBytes(screenshotPath)).toBeGreaterThan(0);
      await report.saveScreenshot(screenshotPath);

      if (!verifyCoreOnly) {
        logs = await runToolsPackJson<LogsResult>('logs');
        assertLogPathsAndContent(logs);
      }

      if (closureAcceptance != null) {
        const closureFaultStop = await runToolsPackJson<MacStopResult>('stop');
        started = false;
        expect(closureFaultStop.remainingPids).toEqual([]);
        const broken = await activateBrokenClosureSuccessor(closureAcceptance);
        expect((await readPackagedClosureFixtureRuntime(closureAcceptance)).attempt?.standalone)
          .toEqual(broken.pointer);
        await runToolsPackJson<MacStartResult>('start');
        started = true;
        const rollbackInspect = await waitForHealthyDesktop();
        await capturePackagedCheckpoint(report, 'shell-closure-rollback', rollbackInspect);
        assertClosureDesktopIdentity(
          await readDesktopIdentityMarker(),
          closureAcceptance.manifest.identity.version,
        );
        const recovered = await readPackagedClosureFixtureRuntime(closureAcceptance);
        expect(recovered.active?.standalone).toEqual(closureAcceptance.pointer);
        expect(recovered.attempt).toBeNull();
      }

      const closureBinding = verifyStandaloneRuntimeBinding
        ? await readPackagedClosureBinding({
            channel: updateScenario.channel,
            label: 'packaged macOS',
            namespace,
            root: join(toolsPackDir, 'runtime', 'mac'),
            expected: {
              channel: updateScenario.channel,
              namespace,
              releaseVersion: releaseVersion!,
              target: packagedMacClosureTarget,
              version: releaseVersion!,
            },
          })
        : null;

      const stop = await runToolsPackJson<MacStopResult>('stop');
      started = false;
      expect(stop.namespace).toBe(namespace);
      expect(stop.status).not.toBe('partial');
      expect(stop.remainingPids).toEqual([]);

      const uninstall = await runToolsPackJson<MacUninstallResult>('uninstall');
      installedAppPath = null;
      expect(uninstall.namespace).toBe(namespace);
      expect(uninstall.installedAppPath).toBe(install.installedAppPath);
      expect(uninstall.removed).toBe(true);
      expect(await pathExists(install.installedAppPath)).toBe(false);
      await report.saveSummary({
        ...(closureBinding == null ? {} : { closureBinding }),
        ...(coldStart == null ? {} : { coldStart }),
        health: value,
        install: {
          detached: install.detached,
          dmgPath: install.dmgPath,
          installedAppPath: install.installedAppPath,
          mountPoint: install.mountPoint,
        },
        logs: 'skipped' in logs ? logs : summarizeLogs(logs),
        namespace,
        standalone: closureAcceptance == null
          ? { absorbed: false }
          : {
              absorbed: true,
              digest: closureAcceptance.manifest.identity.digest,
              version: closureAcceptance.manifest.identity.version,
            },
        payloadRuntime,
        pty,
        screenshot: report.screenshotRelpath,
        start: {
          appPath: start.appPath,
          executablePath: start.executablePath,
          logPath: start.logPath,
          pid: start.pid,
          source: start.source,
          status: start.status,
        },
        stop,
        uninstall,
        update: {
          control: installControl,
          status: updateStatus,
          install: updateInstall,
        },
        updaterRecovery,
        upgradePersistence,
      });
      passed = true;
    } finally {
      isolatedAmrState?.restore();
      restoreUpdateEnv(updateEnv);
      await payloadFixture?.close().catch((error: unknown) => {
        console.error('failed to close payload update fixture', error);
      });
      await recoveryFixture?.close().catch((error: unknown) => {
        console.error('failed to close updater recovery fixture', error);
      });
      if (!passed) {
        await printPackagedLogs().catch((error: unknown) => {
          console.error('failed to read packaged mac logs after failure', error);
        });
      }

      if (started || installedAppPath != null) {
        await runToolsPackJson<MacUninstallResult>('uninstall').catch((error: unknown) => {
          console.error('failed to uninstall packaged mac app during cleanup', error);
        });
        started = false;
        installedAppPath = null;
      }
    }
  }, 360_000);


});
