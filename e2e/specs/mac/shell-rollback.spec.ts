// @vitest-environment node

import { readFile,rm } from 'node:fs/promises';
import { join } from 'node:path';

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
import { assertHealthEvalValue,buildCorruptedMacPayloadFixture,buildVersionBumpedMacPayloadFixture,bumpCountedVersion,capturePackagedCheckpoint,captureUpdateEnv,closureBuildJsonPath,packagedMacUpdaterPlatform,resetPackagedRuntimeState,resolveLocalPayloadUpdateFixture,restoreUpdateEnv,runToolsPackJson,seedConfiguredPackagedClosure,seedPackagedOnboardingComplete,settledLauncherGeneration,smokeLanes,toolsPackDir,updateFixture,updateScenario,verifyCoreOnly,waitForDesktopGone,waitForHealthyDesktopShellVersion,waitForUpdaterStatus,workspaceRoot } from './lib/index.js';

const macShellDescribe = shouldRunPackagedMacSmoke && hasPackagedSmokeLane(smokeLanes, 'shell') ? describe : describe.skip;
const shellAbsorbsStandaloneAcceptance = hasPackagedSmokeLane(smokeLanes, 'shell')
  && hasPackagedSmokeLane(smokeLanes, 'standalone')
  && !verifyCoreOnly
  && updateFixture === 'tools-serve'
  && closureBuildJsonPath != null;

macShellDescribe('packaged mac Shell rollback recovery', () => {
  // Crash-rollback acceptance: a payload that spawns but dies before its own
  // bookkeeping must leave the pre-armed attempt behind, and the next cold
  // start must roll back to the last successful version instead of retrying
  // the broken payload forever. A follow-up update with a healthy payload
  // then self-heals to the target version.
  const rollbackTest = !verifyCoreOnly && updateFixture === 'tools-serve' ? test : test.skip;
  rollbackTest(MAC_PACKAGED_SMOKE_SCENARIOS.shellRollback.title, async () => {
    const report = await createPackagedSmokeReport('mac');
    const updateEnv = captureUpdateEnv();
    let corruptFixture: ToolsServeUpdaterFixture | null = null;
    let goodFixture: ToolsServeUpdaterFixture | null = null;
    const corruptWorkDir = join(toolsPackDir, 'corrupt-payload-fixture');
    let cleanupStarted = false;
    let cleanupInstalled = false;
    try {
      const localPayload = await resolveLocalPayloadUpdateFixture();
      const targetVersion = localPayload.targetVersion;
      const corruptPayloadPath = await buildCorruptedMacPayloadFixture(localPayload.payloadPath, corruptWorkDir);

      await resetPackagedRuntimeState();
      const install = await runToolsPackJson<MacInstallResult>('install');
      cleanupInstalled = true;
      await seedPackagedOnboardingComplete();
      await seedConfiguredPackagedClosure();

      corruptFixture = await startToolsServeUpdaterFixture({
        channel: updateScenario.channel,
        payloadPath: corruptPayloadPath,
        platform: packagedMacUpdaterPlatform,
        version: targetVersion,
        workspaceRoot,
      });
      applyPackagedUpdateEnv(process.env, updateScenario, corruptFixture.info.metadataUrl, { openDryRun: false });

      const start = await runToolsPackJson<MacStartResult>('start');
      cleanupStarted = true;
      expect(start.source).toBe('installed');

      const readyUpdate = await waitForUpdaterStatus(
        (status) =>
          status.update?.state === 'downloaded' &&
          status.update.availableVersion === targetVersion &&
          status.update.artifact?.type === 'payload',
        'corrupt payload downloaded',
      );
      const launcherRuntimePath = readyUpdate.launcher.runtimePath;
      const launcherAttemptsPath = readyUpdate.launcher.attemptsPath;

      const installCorrupt = await runToolsPackJson<MacInspectResult>('inspect', ['--update-action', 'install']);
      expect(installCorrupt.update?.state).toBe('downloaded');

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
      const rollbackStart = await runToolsPackJson<MacStartResult>('start');
      cleanupStarted = true;
      expect(rollbackStart.source).toBe('installed');
      const rolledBack = await waitForHealthyDesktopShellVersion(
        updateScenario.expectedCurrentVersion,
        updateScenario.expectedCurrentVersion,
        start.pid,
        false,
      );
      const rolledBackHealth = assertHealthEvalValue(rolledBack.eval?.value);
      await capturePackagedCheckpoint(report, 'rollback-base-recovered', rolledBack);
      expect(rolledBackHealth.health.version).toBe(updateScenario.expectedCurrentVersion);
      expect(rolledBack.launcher.lastSuccessful?.version).toBe(updateScenario.expectedCurrentVersion);
      // Degraded steady state: the broken pointer stays active with its
      // attempt as evidence until a healthy release replaces it.
      expect(rolledBack.launcher.active?.version).toBe(targetVersion);
      expect(rolledBack.launcher.attempt?.version).toBe(targetVersion);

      // Self-heal: real recovery releases ship as version+1 (versioned
      // artifacts are immutable), so the next update arrives under a bumped
      // version with a healthy payload and converges.
      const healedVersion = bumpCountedVersion(targetVersion);
      const healedPayloadPath = await buildVersionBumpedMacPayloadFixture(
        localPayload.payloadPath,
        corruptWorkDir,
        healedVersion,
      );
      await corruptFixture.close();
      corruptFixture = null;
      goodFixture = await startToolsServeUpdaterFixture({
        channel: updateScenario.channel,
        payloadPath: healedPayloadPath,
        platform: packagedMacUpdaterPlatform,
        version: healedVersion,
        workspaceRoot,
      });
      applyPackagedUpdateEnv(process.env, updateScenario, goodFixture.info.metadataUrl, { openDryRun: false });
      const healStop = await runToolsPackJson<MacStopResult>('stop');
      cleanupStarted = false;
      expect(healStop.status).not.toBe('partial');
      const healStart = await runToolsPackJson<MacStartResult>('start');
      cleanupStarted = true;
      expect(healStart.source).toBe('installed');
      await waitForUpdaterStatus(
        (status) =>
          status.update?.state === 'downloaded' &&
          status.update.availableVersion === healedVersion &&
          status.update.artifact?.type === 'payload',
        'healthy payload downloaded after rollback',
      );
      const installHealed = await runToolsPackJson<MacInspectResult>('inspect', ['--update-action', 'install']);
      expect(installHealed.update?.state).toBe('downloaded');
      const healed = await waitForHealthyDesktopShellVersion(
        healedVersion,
        updateScenario.expectedCurrentVersion,
        rollbackStart.pid,
      );
      const healedHealth = assertHealthEvalValue(healed.eval?.value);
      await capturePackagedCheckpoint(report, 'rollback-healed', healed);
      expect(healedHealth.health.version).toBe(updateScenario.expectedCurrentVersion);
      const healedGeneration = settledLauncherGeneration(healed.launcher, healedVersion);
      expect(healedGeneration).not.toBeNull();
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
        await runToolsPackJson<MacStopResult>('stop').catch((error: unknown) => {
          console.error('failed to stop packaged mac app during rollback cleanup', error);
        });
      }
      if (cleanupInstalled) {
        await runToolsPackJson<MacUninstallResult>('uninstall').catch((error: unknown) => {
          console.error('failed to uninstall packaged mac app during rollback cleanup', error);
        });
      }
    }
  }, 360_000);
});
