// @vitest-environment node

import { readFile,rm,stat } from 'node:fs/promises';
import { join } from 'node:path';

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
import { buildCorruptedWinPayloadFixture,buildVersionBumpedWinPayloadFixture,bumpCountedVersion,captureUpdateEnv,packagedUpdaterClosureFixtureOptions,resetPackagedUpdaterNamespaceRoots,resolveLocalUpdateFixture,restoreUpdateEnv,runToolsPackJson,seedConfiguredPackagedClosure,seedPackagedOnboardingComplete,settledLauncherGeneration,smokeLanes,toolsPackDir,updateFixture,updateFixtureMode,updateScenario,verifyCoreOnly,waitForDesktopGone,waitForDownloadedUpdater,waitForHealthyDesktopShellVersion,workspaceRoot } from './lib/index.js';

const winDescribe = shouldRunPackagedWinSmoke && hasPackagedSmokeLane(smokeLanes, 'shell') && winProtocolDebugCase === 'off' ? describe : describe.skip;

winDescribe("packaged windows rollback recovery", () => {
// Crash-rollback acceptance (mirror of the mac lane): a payload that spawns
  // but dies before its own launcher bookkeeping must leave the pre-armed
  // attempt behind; the next cold start rolls back to the last successful
  // version, and a version-bumped healthy release self-heals.
  const rollbackTest =
    !verifyCoreOnly && updateFixture === 'tools-serve' && updateFixtureMode === 'payload' ? test : test.skip;
  rollbackTest(WIN_PACKAGED_SMOKE_SCENARIOS.shellRollback.title, async () => {
    const updateEnv = captureUpdateEnv();
    let corruptFixture: ToolsServeUpdaterFixture | null = null;
    let goodFixture: ToolsServeUpdaterFixture | null = null;
    const corruptWorkDir = join(toolsPackDir, 'corrupt-payload-fixture');
    let cleanupStarted = false;
    let cleanupInstalled = false;
    try {
      const localUpdate = await resolveLocalUpdateFixture();
      const targetVersion = localUpdate.targetVersion;

      await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch(() => null);
      await resetPackagedUpdaterNamespaceRoots();
      const install = await runToolsPackJson<WinInstallResult>('install');
      cleanupInstalled = true;
      await seedPackagedOnboardingComplete();
      await seedConfiguredPackagedClosure();

      const sevenZipExe = join(install.installDir, 'resources', 'open-design', 'bin', '7z.exe');
      expect((await stat(sevenZipExe)).isFile()).toBe(true);
      const corruptPayloadPath = await buildCorruptedWinPayloadFixture(
        localUpdate.payloadPath,
        corruptWorkDir,
        sevenZipExe,
      );

      corruptFixture = await startToolsServeUpdaterFixture({
        artifactPath: localUpdate.installerPath,
        channel: updateScenario.channel,
        ...packagedUpdaterClosureFixtureOptions(),
        closureShellVersionMin: targetVersion,
        payloadPath: corruptPayloadPath,
        platform: 'win',
        version: targetVersion,
        workspaceRoot,
      });
      applyPackagedUpdateEnv(process.env, updateScenario, corruptFixture.info.metadataUrl, { openDryRun: false });

      const start = await runToolsPackJson<WinStartResult>('start');
      cleanupStarted = true;
      expect(start.source).toBe('installed');
      const readyUpdate = await waitForDownloadedUpdater(targetVersion, 'payload');
      const launcherRuntimePath = readyUpdate.launcher.runtimePath;
      const launcherAttemptsPath = readyUpdate.launcher.attemptsPath;

      const installControl = await runToolsPackJson<WinInspectResult>('inspect', ['--update-action', 'install']);
      expect(installControl.update?.state).toBe('downloaded');
      expect(installControl.update?.installResult?.dryRun).toBe(false);

      // The app quits for the relaunch; the corrupted payload stub then exits
      // before any launcher bookkeeping. Wait for the desktop to disappear.
      await waitForDesktopGone('crashing payload never became the desktop');
      cleanupStarted = false;

      // The pre-armed attempt is the rollback evidence the crash left behind.
      const strandedAttempt = JSON.parse(await readFile(launcherAttemptsPath, 'utf8')) as {
        generation?: number;
        version?: string;
      };
      expect(strandedAttempt.version).toBe(targetVersion);
      const strandedRuntime = JSON.parse(await readFile(launcherRuntimePath, 'utf8')) as {
        active?: { generation?: number; version?: string };
        lastSuccessful?: { generation?: number; version?: string };
      };
      expect(strandedRuntime.active?.version).toBe(targetVersion);
      expect(strandedRuntime.lastSuccessful?.version).toBe(updateScenario.expectedCurrentVersion);
      expect(strandedAttempt.generation).toBe(strandedRuntime.active?.generation);

      // Cold start rolls back: the installed outer sees the unconfirmed
      // attempt, selects lastSuccessful, and serves the base version again.
      const rollbackStart = await runToolsPackJson<WinStartResult>('start');
      cleanupStarted = true;
      expect(rollbackStart.source).toBe('installed');
      const rolledBack = await waitForHealthyDesktopShellVersion(
        updateScenario.expectedCurrentVersion,
        updateScenario.expectedCurrentVersion,
        start.pid,
        false,
      );
      expect(rolledBack.launcher.lastSuccessful?.version).toBe(updateScenario.expectedCurrentVersion);
      // Degraded steady state: the broken pointer stays active with its
      // attempt as evidence until a healthy release replaces it.
      expect(rolledBack.launcher.active?.version).toBe(targetVersion);
      expect(rolledBack.launcher.attempt?.version).toBe(targetVersion);

      // Self-heal: real recovery releases ship as version+1 (versioned
      // artifacts are immutable), so the next update arrives under a bumped
      // version with a healthy payload and converges.
      const healedVersion = bumpCountedVersion(targetVersion);
      const healedPayloadPath = await buildVersionBumpedWinPayloadFixture(
        localUpdate.payloadPath,
        corruptWorkDir,
        sevenZipExe,
        healedVersion,
      );
      await corruptFixture.close();
      corruptFixture = null;
      goodFixture = await startToolsServeUpdaterFixture({
        artifactPath: localUpdate.installerPath,
        channel: updateScenario.channel,
        ...packagedUpdaterClosureFixtureOptions(),
        closureShellVersionMin: healedVersion,
        payloadPath: healedPayloadPath,
        platform: 'win',
        version: healedVersion,
        workspaceRoot,
      });
      applyPackagedUpdateEnv(process.env, updateScenario, goodFixture.info.metadataUrl, { openDryRun: false });
      const healStop = await runToolsPackJson<WinStopResult>('stop');
      cleanupStarted = false;
      expect(healStop.status).not.toBe('partial');
      const healStart = await runToolsPackJson<WinStartResult>('start');
      cleanupStarted = true;
      expect(healStart.source).toBe('installed');
      await waitForDownloadedUpdater(healedVersion, 'payload', 120_000, updateScenario.expectedCurrentVersion);
      const healControl = await runToolsPackJson<WinInspectResult>('inspect', ['--update-action', 'install']);
      expect(healControl.update?.state).toBe('downloaded');
      expect(healControl.update?.installResult?.dryRun).toBe(false);
      const healed = await waitForHealthyDesktopShellVersion(
        healedVersion,
        updateScenario.expectedCurrentVersion,
        rollbackStart.pid,
      );
      expect(settledLauncherGeneration(healed.launcher, healedVersion)).not.toBeNull();
      expect(healed.launcher.active?.version).toBe(healedVersion);
      expect(healed.launcher.lastSuccessful?.version).toBe(healedVersion);
      expect(healed.launcher.attempt).toBeNull();
    } finally {
      restoreUpdateEnv(updateEnv);
      await corruptFixture?.close().catch((error: unknown) => {
        console.error('failed to close corrupt payload fixture', error);
      });
      await goodFixture?.close().catch((error: unknown) => {
        console.error('failed to close healthy payload fixture', error);
      });
      await rm(corruptWorkDir, { force: true, recursive: true }).catch(() => undefined);
      if (cleanupStarted) {
        await runToolsPackJson<WinStopResult>('stop').catch((error: unknown) => {
          console.error('failed to stop packaged windows app during rollback cleanup', error);
        });
      }
      if (cleanupInstalled) {
        await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch((error: unknown) => {
          console.error('failed to uninstall packaged windows app during rollback cleanup', error);
        });
      }
    }
  }, 720_000);
});
