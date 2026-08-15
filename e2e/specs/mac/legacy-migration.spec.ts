// @vitest-environment node

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
	applyPackagedUpdateEnv,
	resolvePackagedUpdateScenario,
} from '@/vitest/packaged-update-scenario';
import { startToolsServeUpdaterFixture,type ToolsServeUpdaterFixture } from '@/vitest/tools-serve-updater-fixture';
import { shouldRunPackagedMacSmoke } from './lib/context.js';


import type { MacInspectResult,MacInstallResult,MacStartResult,MacStopResult,MacUninstallResult } from './lib/index.js';
import { assertClosureDesktopIdentity,assertHealthEvalValue,assertMacInviteProtocolRegistration,assertPptxExportEvalValue,assertUpgradePersistenceSeed,capturePackagedCheckpoint,captureUpdateEnv,existingProjectPptxExportExpression,expectPathInside,installLegacyMacDmg,legacyDmgPath,legacyVersion,minimumShellVersion,outputNamespaceRoot,packagedHeadless,packagedMacUpdaterPlatform,readDesktopIdentityMarker,releaseVersion,requireMigrationInput,resetPackagedRuntimeState,resolveMainBuildDmgPath,restoreUpdateEnv,runToolsPackJson,seedConfiguredPackagedClosure,seedPackagedOnboardingComplete,smokeLanes,updateScenario,upgradePersistenceSeedExpression,verifyCoreOnly,waitForHealthyDesktop,waitForUpdaterStatus,workspaceRoot } from './lib/index.js';

const macLegacyMigrationDescribe = shouldRunPackagedMacSmoke && hasPackagedSmokeLane(smokeLanes, 'migration') && !verifyCoreOnly && !packagedHeadless ? describe : describe.skip;

macLegacyMigrationDescribe('packaged mac historical outer migration acceptance', () => {
  test(MAC_PACKAGED_SMOKE_SCENARIOS.legacyMigration.title, async () => {
    const report = await createPackagedSmokeReport('mac');
    const updateEnv = captureUpdateEnv();
    const legacyFixturePath = requireMigrationInput('OD_PACKAGED_E2E_MAC_LEGACY_DMG_PATH', legacyDmgPath);
    const legacyFixtureVersion = requireMigrationInput('OD_PACKAGED_E2E_MAC_LEGACY_VERSION', legacyVersion);
    const requiredShellVersion = requireMigrationInput('OD_PACKAGED_E2E_MAC_MIN_SHELL_VERSION', minimumShellVersion);
    const targetReleaseVersion = requireMigrationInput('OD_PACKAGED_E2E_RELEASE_VERSION', releaseVersion);

    let installed = false;
    let started = false;
    let migrationFixture: ToolsServeUpdaterFixture | null = null;
    try {
      await resetPackagedRuntimeState();
      const currentDmgPath = await resolveMainBuildDmgPath();
      const legacyInstall = await installLegacyMacDmg({
        currentDmgPath,
        legacyDmgPath: legacyFixturePath,
        legacyVersion: legacyFixtureVersion,
      });
      installed = true;
      expect(legacyInstall.detached).toBe(true);
      expectPathInside(legacyInstall.installedAppPath, join(outputNamespaceRoot, 'install', 'Applications'));
      await assertMacInviteProtocolRegistration(legacyInstall.installedAppPath);
      await seedPackagedOnboardingComplete();

      migrationFixture = await startToolsServeUpdaterFixture({
        artifactPath: currentDmgPath,
        channel: updateScenario.channel,
        controlInstallationVersionMin: requiredShellVersion,
        controlInstallationVersionUrl: 'https://open-design.ai/download',
        platform: packagedMacUpdaterPlatform,
        version: targetReleaseVersion,
        workspaceRoot,
      });
      applyPackagedUpdateEnv(
        process.env,
        resolvePackagedUpdateScenario({
          releaseChannel: updateScenario.channel,
          releaseVersion: legacyFixtureVersion,
          shellVersion: legacyFixtureVersion,
        }),
        migrationFixture.info.metadataUrl,
      );

      const legacyStart = await runToolsPackJson<MacStartResult>('start', [], legacyFixtureVersion);
      started = true;
      expect(legacyStart.source).toBe('installed');
      const legacyInspect = await waitForHealthyDesktop(legacyFixtureVersion);
      const legacyHealth = assertHealthEvalValue(legacyInspect.eval?.value);
      await capturePackagedCheckpoint(report, 'migration-legacy-running', legacyInspect);
      expect(legacyHealth.health.version).toBe(legacyFixtureVersion);
      const seededInspect = await runToolsPackJson<MacInspectResult>(
        'inspect',
        ['--expr', upgradePersistenceSeedExpression],
        legacyFixtureVersion,
      );
      const seeded = assertUpgradePersistenceSeed(seededInspect.eval?.value);

      const installerRequired = await waitForUpdaterStatus(
        (inspect) => inspect.update?.state === 'downloaded'
          && inspect.update.artifact?.type === 'dmg'
          && inspect.update.availableVersion === targetReleaseVersion
          && inspect.update.reinstall?.reason === 'outer-below-min',
        'legacy packaged beta installer-required migration',
        180_000,
        legacyFixtureVersion,
      );
      expect(installerRequired.update?.currentVersion).toBe(legacyFixtureVersion);
      expect(installerRequired.update?.reinstall).toEqual({
        installedVersion: legacyFixtureVersion,
        minVersion: requiredShellVersion,
        reason: 'outer-below-min',
        url: 'https://open-design.ai/download',
      });
      const installerOpen = await runToolsPackJson<MacInspectResult>(
        'inspect',
        ['--update-action', 'install'],
        legacyFixtureVersion,
      );
      expect(installerOpen.update?.installResult?.dryRun).toBe(true);

      const legacyStop = await runToolsPackJson<MacStopResult>('stop', [], legacyFixtureVersion);
      started = false;
      expect(legacyStop.status).not.toBe('partial');
      expect(legacyStop.remainingPids).toEqual([]);

      const currentInstall = await runToolsPackJson<MacInstallResult>('install');
      expect(currentInstall.installedAppPath).toBe(legacyInstall.installedAppPath);
      const distribution = await seedConfiguredPackagedClosure();
      const currentStart = await runToolsPackJson<MacStartResult>('start');
      started = true;
      expect(currentStart.pid).not.toBe(legacyStart.pid);
      const currentInspect = await waitForHealthyDesktop();
      const currentHealth = assertHealthEvalValue(currentInspect.eval?.value);
      await capturePackagedCheckpoint(report, 'migration-current-running', currentInspect);
      expect(currentHealth.health.version).toBe(targetReleaseVersion);
      expect(currentInspect.update?.currentVersion).toBe(targetReleaseVersion);
      if (distribution != null) {
        assertClosureDesktopIdentity(await readDesktopIdentityMarker(), distribution.manifest.identity.version);
      }
      const migratedPptx = assertPptxExportEvalValue((await runToolsPackJson<MacInspectResult>('inspect', [
        '--expr',
        existingProjectPptxExportExpression(seeded.projectId),
      ])).eval?.value);
      expect(migratedPptx.projectId).toBe(seeded.projectId);

      await migrationFixture.close();
      migrationFixture = null;
      restoreUpdateEnv(updateEnv);

      const currentStop = await runToolsPackJson<MacStopResult>('stop');
      started = false;
      expect(currentStop.status).not.toBe('partial');
      expect(currentStop.remainingPids).toEqual([]);
      await runToolsPackJson<MacStartResult>('start');
      started = true;
      const coldInspect = await waitForHealthyDesktop();
      expect(assertHealthEvalValue(coldInspect.eval?.value).health.version).toBe(targetReleaseVersion);
      await capturePackagedCheckpoint(report, 'migration-current-cold-start', coldInspect);
      const coldPptx = assertPptxExportEvalValue((await runToolsPackJson<MacInspectResult>('inspect', [
        '--expr',
        existingProjectPptxExportExpression(seeded.projectId),
      ])).eval?.value);
      expect(coldPptx.projectId).toBe(seeded.projectId);

      await report.report.json('historical-outer-migration.json', {
        coldPptx,
        currentHealth,
        installerOpen: installerOpen.update,
        installerRequired: installerRequired.update,
        legacyHealth,
        migratedPptx,
        versions: {
          legacy: legacyFixtureVersion,
          minimumShell: requiredShellVersion,
          release: targetReleaseVersion,
        },
      });
    } finally {
      restoreUpdateEnv(updateEnv);
      await migrationFixture?.close().catch(() => undefined);
      if (started) {
        await runToolsPackJson<MacStopResult>('stop').catch(() => undefined);
        await runToolsPackJson<MacStopResult>('stop', [], legacyFixtureVersion).catch(() => undefined);
      }
      if (installed) await runToolsPackJson<MacUninstallResult>('uninstall').catch(() => undefined);
    }
  }, 600_000);
});
