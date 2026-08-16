// @vitest-environment node


import { describe,expect,test } from 'vitest';

import {
	hasPackagedSmokeLane
} from '@/vitest/packaged-smoke-contract';
import { WIN_PACKAGED_SMOKE_SCENARIOS } from '@/vitest/packaged-smoke-plan-win';
import {
	applyPackagedUpdateEnv
} from '@/vitest/packaged-update-scenario';
import { startToolsServeUpdaterFixture,type ToolsServeUpdaterFixture } from '@/vitest/tools-serve-updater-fixture';
import { shouldRunPackagedWinSmoke,winProtocolDebugCase } from './lib/context.js';


import type { WinInspectResult,WinInstallResult,WinStartResult,WinStopResult,WinUninstallResult } from './lib/index.js';
import { captureUpdateEnv,packagedUpdaterClosureFixtureOptions,resetPackagedUpdaterNamespaceRoots,resolveLocalUpdateFixture,restoreUpdateEnv,runToolsPackJson,seedConfiguredPackagedClosure,seedPackagedOnboardingComplete,settledLauncherGeneration,smokeLanes,updateFixture,updateFixtureMode,updateScenario,verifyCoreOnly,waitForDownloadedUpdater,waitForHealthyDesktopShellVersion,waitForTerminalUpdateState,workspaceRoot } from './lib/index.js';

const winDescribe = shouldRunPackagedWinSmoke && hasPackagedSmokeLane(smokeLanes, 'shell') && winProtocolDebugCase === 'off' ? describe : describe.skip;

winDescribe("packaged windows silent update", () => {
// Silent startup update acceptance (mirror of the mac lane): with the
  // daemon-owned allowSilentUpdates preference on, a payload downloaded in a
  // previous session must apply on the next cold start's first scheduler tick
  // without any user-facing updater action.
  const silentUpdateTest =
    !verifyCoreOnly && updateFixture === 'tools-serve' && updateFixtureMode === 'payload' ? test : test.skip;
  silentUpdateTest(WIN_PACKAGED_SMOKE_SCENARIOS.shellSilentUpdate.title, async () => {
    const updateEnv = captureUpdateEnv();
    let payloadFixtureLocal: ToolsServeUpdaterFixture | null = null;
    let cleanupStarted = false;
    let cleanupInstalled = false;
    try {
      const localUpdate = await resolveLocalUpdateFixture();
      const targetVersion = localUpdate.targetVersion;

      await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch(() => null);
      await resetPackagedUpdaterNamespaceRoots();
      await runToolsPackJson<WinInstallResult>('install');
      cleanupInstalled = true;
      await seedPackagedOnboardingComplete();
      await seedConfiguredPackagedClosure();

      payloadFixtureLocal = await startToolsServeUpdaterFixture({
        artifactPath: localUpdate.installerPath,
        channel: updateScenario.channel,
        ...packagedUpdaterClosureFixtureOptions(),
        payloadPath: localUpdate.payloadPath,
        platform: 'win',
        version: targetVersion,
        workspaceRoot,
      });
      applyPackagedUpdateEnv(process.env, updateScenario, payloadFixtureLocal.info.metadataUrl, { openDryRun: false });

      const start = await runToolsPackJson<WinStartResult>('start');
      cleanupStarted = true;
      expect(start.source).toBe('installed');
      await waitForDownloadedUpdater(targetVersion, 'payload');

      // Enable the daemon-owned preference through the production HTTP path
      // (the same GET + merged PUT the web settings surface performs).
      const enableSilent = await runToolsPackJson<WinInspectResult>('inspect', ['--expr', `
        (async () => {
          const current = await (await fetch('/api/app-config')).json();
          const response = await fetch('/api/app-config', {
            headers: { 'content-type': 'application/json' },
            method: 'PUT',
            body: JSON.stringify({ ...(current.config ?? {}), allowSilentUpdates: true }),
          });
          const written = await response.json();
          return { ok: response.ok, allowSilentUpdates: written.config?.allowSilentUpdates };
        })()
      `]);
      expect(enableSilent.eval?.value).toEqual({ allowSilentUpdates: true, ok: true });

      const stop = await runToolsPackJson<WinStopResult>('stop');
      cleanupStarted = false;
      expect(stop.status).not.toBe('partial');

      // Cold start: the first scheduler tick applies the already-downloaded
      // payload silently and relaunches; no updater action is issued here.
      const coldStart = await runToolsPackJson<WinStartResult>('start');
      cleanupStarted = true;
      expect(coldStart.source).toBe('installed');
      const silent = await waitForHealthyDesktopShellVersion(
        targetVersion,
        updateScenario.expectedCurrentVersion,
        start.pid,
      );
      expect(settledLauncherGeneration(silent.launcher, targetVersion)).not.toBeNull();
      expect(silent.launcher.active?.version).toBe(targetVersion);
      expect(silent.launcher.lastSuccessful?.version).toBe(targetVersion);
      expect(silent.launcher.attempt).toBeNull();

      const terminal = await waitForTerminalUpdateState(targetVersion);
      expect(terminal.update?.currentVersion).toBe(targetVersion);
    } finally {
      restoreUpdateEnv(updateEnv);
      await payloadFixtureLocal?.close().catch((error: unknown) => {
        console.error('failed to close silent update fixture', error);
      });
      if (cleanupStarted) {
        await runToolsPackJson<WinStopResult>('stop').catch((error: unknown) => {
          console.error('failed to stop packaged windows app during silent-update cleanup', error);
        });
      }
      if (cleanupInstalled) {
        await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch((error: unknown) => {
          console.error('failed to uninstall packaged windows app during silent-update cleanup', error);
        });
      }
    }
  }, 720_000);
});
