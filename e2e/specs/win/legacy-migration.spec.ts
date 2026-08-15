// @vitest-environment node

import { join } from 'node:path';

import { describe,expect,test } from 'vitest';

import {
	resetPackagedClosureFixture
} from '@/vitest/packaged-closure-fixture';
import { createPackagedSmokeReport } from '@/vitest/packaged-report';
import {
	hasPackagedSmokeLane
} from '@/vitest/packaged-smoke-contract';
import { WIN_PACKAGED_SMOKE_SCENARIOS } from '@/vitest/packaged-smoke-plan-win';
import {
	applyPackagedUpdateEnv,
	resolvePackagedUpdateScenario,
} from '@/vitest/packaged-update-scenario';
import { startToolsServeUpdaterFixture,type ToolsServeUpdaterFixture } from '@/vitest/tools-serve-updater-fixture';
import { shouldRunPackagedWinSmoke } from './lib/context.js';


import type { WinInspectResult,WinStartResult,WinStopResult,WinUninstallResult } from './lib/index.js';
import { assertClosureDesktopIdentity,assertHealthEvalValue,assertPptxExportEvalValue,assertUpgradePersistenceSeed,assertWindowsInviteProtocolRegistration,captureUpdateEnv,existingProjectPptxExportExpression,fileSizeBytes,formatUnknown,legacyInstallerPath,legacyVersion,minimumShellVersion,namespace,portableNsisLogPath,readDesktopIdentityMarker,releaseVersion,requireMigrationInput,resetPackagedUpdaterNamespaceRoots,resolveFromWorkspace,resolveMainBuildInstallerPath,restoreUpdateEnv,runDirectInstaller,runInstallerFallbackAcceptance,runtimeNamespaceRoot,runToolsPackJson,runToolsPackJsonForVersion,seedConfiguredPackagedClosure,seedPackagedOnboardingComplete,smokeLanes,toolsPackDir,updateScenario,upgradePersistenceSeedExpression,verifyCoreOnly,waitForHealthyDesktopVersion,workspaceRoot } from './lib/index.js';

const winLegacyMigrationDescribe = shouldRunPackagedWinSmoke && hasPackagedSmokeLane(smokeLanes, 'migration') && !verifyCoreOnly ? describe : describe.skip;

winLegacyMigrationDescribe('packaged Windows historical outer migration acceptance', () => {
  test(WIN_PACKAGED_SMOKE_SCENARIOS.legacyMigration.title, async () => {
    const report = await createPackagedSmokeReport('win');
    const updateEnv = captureUpdateEnv();
    const legacyFixturePath = requireMigrationInput(
      'OD_PACKAGED_E2E_WIN_LEGACY_INSTALLER_PATH',
      legacyInstallerPath,
    );
    const legacyFixtureVersion = requireMigrationInput(
      'OD_PACKAGED_E2E_WIN_LEGACY_VERSION',
      legacyVersion,
    );
    const requiredShellVersion = requireMigrationInput(
      'OD_PACKAGED_E2E_WIN_MIN_SHELL_VERSION',
      minimumShellVersion,
    );
    const targetReleaseVersion = requireMigrationInput(
      'OD_PACKAGED_E2E_RELEASE_VERSION',
      releaseVersion,
    );
    const installationRoot = join(toolsPackDir, 'runtime', 'win');
    const installDir = join(runtimeNamespaceRoot, 'install', 'Open Design');
    let installed = false;
    let started = false;
    let migrationFixture: ToolsServeUpdaterFixture | null = null;

    try {
      await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch(() => null);
      await resetPackagedUpdaterNamespaceRoots();
      await resetPackagedClosureFixture({
        channel: updateScenario.channel,
        installationRoot,
        namespace,
      });

      const legacyInstall = await runDirectInstaller(resolveFromWorkspace(legacyFixturePath), installDir);
      expect(legacyInstall.code).toBe(0);
      installed = true;
      expect(await fileSizeBytes(join(installDir, 'Open Design.exe'))).toBeGreaterThan(0);
      await seedPackagedOnboardingComplete();

      const currentInstallerPath = await resolveMainBuildInstallerPath();
      migrationFixture = await startToolsServeUpdaterFixture({
        artifactPath: currentInstallerPath,
        channel: updateScenario.channel,
        controlInstallationVersionMin: requiredShellVersion,
        controlInstallationVersionUrl: 'https://open-design.ai/download',
        platform: 'win',
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

      const legacyStart = await runToolsPackJsonForVersion<WinStartResult>('start', legacyFixtureVersion);
      started = true;
      expect(legacyStart.source).toBe('installed');
      const legacyInspect = await waitForHealthyDesktopVersion(legacyFixtureVersion, null, false);
      const legacyHealth = assertHealthEvalValue(legacyInspect.eval?.value);
      expect(legacyHealth.health.version).toBe(legacyFixtureVersion);
      const seedInspect = await runToolsPackJsonForVersion<WinInspectResult>(
        'inspect',
        legacyFixtureVersion,
        ['--expr', upgradePersistenceSeedExpression],
      );
      if (seedInspect.eval?.ok !== true) {
        throw new Error(`legacy Windows project seed eval failed: ${formatUnknown(seedInspect)}`);
      }
      const seeded = assertUpgradePersistenceSeed(seedInspect.eval.value);
      // The old packaged process only exercises updater/minVersion behavior.
      // Seed the new v2 Store before the installer launches the new Shell; no
      // v1 Closure is projected into the transition fixture.
      const committedDistribution = await seedConfiguredPackagedClosure();

      const migration = await runInstallerFallbackAcceptance({
        expectedCurrentVersion: legacyFixtureVersion,
        expectedVersion: targetReleaseVersion,
        fixture: migrationFixture,
        installDir,
        nsisLogPath: portableNsisLogPath,
        persistedProjectId: seeded.projectId,
      });
      expect(migration.downloaded.reinstall).toEqual({
        installedVersion: legacyFixtureVersion,
        minVersion: requiredShellVersion,
        reason: 'outer-below-min',
        url: 'https://open-design.ai/download',
      });
      expect(migration.coldStart.start.pid).not.toBe(legacyStart.pid);
      await assertWindowsInviteProtocolRegistration(installDir);

      if (committedDistribution != null) {
        assertClosureDesktopIdentity(
          await readDesktopIdentityMarker(),
          committedDistribution.manifest.identity.version,
        );
      }
      const coldPptx = assertPptxExportEvalValue((await runToolsPackJson<WinInspectResult>(
        'inspect',
        ['--expr', existingProjectPptxExportExpression(seeded.projectId)],
      )).eval?.value);
      expect(coldPptx.projectId).toBe(seeded.projectId);

      await report.report.json('historical-outer-migration.json', {
        closure: committedDistribution?.pointer ?? null,
        coldPptx,
        legacyHealth,
        migration,
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
        await runToolsPackJson<WinStopResult>('stop').catch(() => undefined);
        await runToolsPackJsonForVersion<WinStopResult>('stop', legacyVersion).catch(() => undefined);
      }
      if (installed) {
        await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch(() => undefined);
      }
      await resetPackagedClosureFixture({
        channel: updateScenario.channel,
        installationRoot,
        namespace,
      }).catch(() => undefined);
    }
  }, 720_000);
});
