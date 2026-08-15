// @vitest-environment node


import { describe,expect,test } from 'vitest';

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


import type { MacInspectResult,MacInstallResult,MacStartResult,MacStopResult,MacUninstallResult } from './lib/index.js';
import { assertHealthEvalValue,capturePackagedCheckpoint,captureUpdateEnv,closureBuildJsonPath,packagedMacUpdaterPlatform,resetPackagedRuntimeState,resolveLocalPayloadUpdateFixture,restoreUpdateEnv,runToolsPackJson,seedConfiguredPackagedClosure,seedPackagedOnboardingComplete,settledLauncherGeneration,smokeLanes,updateFixture,updateScenario,verifyCoreOnly,waitForHealthyDesktopShellVersion,waitForUpdaterStatus,workspaceRoot } from './lib/index.js';

const macShellDescribe = shouldRunPackagedMacSmoke && hasPackagedSmokeLane(smokeLanes, 'shell') ? describe : describe.skip;
const shellAbsorbsStandaloneAcceptance = hasPackagedSmokeLane(smokeLanes, 'shell')
  && hasPackagedSmokeLane(smokeLanes, 'standalone')
  && !verifyCoreOnly
  && updateFixture === 'tools-serve'
  && closureBuildJsonPath != null;

macShellDescribe('packaged mac Shell silent update', () => {
  // Silent startup update acceptance: with the daemon-owned allowSilentUpdates
  // preference on, a payload downloaded in a previous session must apply on
  // the next cold start's first scheduler tick — install, quit, and relaunch —
  // without any user-facing updater action.
  const silentUpdateTest = !verifyCoreOnly && updateFixture === 'tools-serve' ? test : test.skip;
  silentUpdateTest(MAC_PACKAGED_SMOKE_SCENARIOS.shellSilentUpdate.title, async () => {
    const report = await createPackagedSmokeReport('mac');
    const updateEnv = captureUpdateEnv();
    let payloadFixtureLocal: ToolsServeUpdaterFixture | null = null;
    let cleanupStarted = false;
    let cleanupInstalled = false;
    try {
      const localPayload = await resolveLocalPayloadUpdateFixture();
      const targetVersion = localPayload.targetVersion;

      await resetPackagedRuntimeState();
      await runToolsPackJson<MacInstallResult>('install');
      cleanupInstalled = true;
      await seedPackagedOnboardingComplete();
      await seedConfiguredPackagedClosure();

      payloadFixtureLocal = await startToolsServeUpdaterFixture({
        channel: updateScenario.channel,
        payloadPath: localPayload.payloadPath,
        platform: packagedMacUpdaterPlatform,
        version: targetVersion,
        workspaceRoot,
      });
      applyPackagedUpdateEnv(process.env, updateScenario, payloadFixtureLocal.info.metadataUrl, { openDryRun: false });

      const start = await runToolsPackJson<MacStartResult>('start');
      cleanupStarted = true;
      expect(start.source).toBe('installed');
      await waitForUpdaterStatus(
        (status) =>
          status.update?.state === 'downloaded' &&
          status.update.availableVersion === targetVersion &&
          status.update.artifact?.type === 'payload',
        'payload downloaded before silent restart',
      );

      // Enable the daemon-owned preference through the production HTTP path
      // (the same GET + merged PUT the web settings surface performs).
      const enableSilent = await runToolsPackJson<MacInspectResult>('inspect', ['--expr', `
        (async () => {
          const current = await (await fetch('/api/app-config')).json();
          const response = await fetch('/api/app-config', {
            headers: { 'content-type': 'application/json' },
            method: 'PUT',
            body: JSON.stringify({ ...(current.config ?? {}), allowSilentUpdates: true }),
          });
          const written = await response.json();
          return {
            allowSilentUpdates: written.config?.allowSilentUpdates,
            currentError: current.error ?? null,
            ok: response.ok,
            responseError: written.error ?? null,
            status: response.status,
          };
        })()
      `]);
      expect(enableSilent.eval?.value).toMatchObject({ allowSilentUpdates: true, ok: true, status: 200 });

      const stop = await runToolsPackJson<MacStopResult>('stop');
      cleanupStarted = false;
      expect(stop.status).not.toBe('partial');

      // Cold start: the first scheduler tick applies the already-downloaded
      // payload silently and relaunches; no updater action is issued here.
      const coldStart = await runToolsPackJson<MacStartResult>('start');
      cleanupStarted = true;
      expect(coldStart.source).toBe('installed');
      const silent = await waitForHealthyDesktopShellVersion(
        targetVersion,
        updateScenario.expectedCurrentVersion,
        start.pid,
      );
      const silentHealth = assertHealthEvalValue(silent.eval?.value);
      await capturePackagedCheckpoint(report, 'silent-update-cold-start', silent);
      expect(silentHealth.health.version).toBe(updateScenario.expectedCurrentVersion);
      const silentGeneration = settledLauncherGeneration(silent.launcher, targetVersion);
      expect(silentGeneration).not.toBeNull();
      expect(silent.launcher.active?.version).toBe(targetVersion);
      expect(silent.launcher.lastSuccessful?.version).toBe(targetVersion);
      expect(silent.launcher.attempt).toBeNull();

      const terminal = await waitForUpdaterStatus(
        (status) => status.update?.state === 'not-available' && status.update.currentVersion === targetVersion,
        'silent update terminal state',
      );
      expect(terminal.update?.currentVersion).toBe(targetVersion);
    } finally {
      restoreUpdateEnv(updateEnv);
      await payloadFixtureLocal?.close().catch((error: unknown) => {
        console.error('failed to close silent update fixture', error);
      });
      if (cleanupStarted) {
        await runToolsPackJson<MacStopResult>('stop').catch((error: unknown) => {
          console.error('failed to stop packaged mac app during silent-update cleanup', error);
        });
      }
      if (cleanupInstalled) {
        await runToolsPackJson<MacUninstallResult>('uninstall').catch((error: unknown) => {
          console.error('failed to uninstall packaged mac app during silent-update cleanup', error);
        });
      }
    }
  }, 360_000);


});
