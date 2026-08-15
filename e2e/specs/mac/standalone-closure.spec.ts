// @vitest-environment node

import { join } from 'node:path';

import { describe,expect,test } from 'vitest';

import {
	activateBrokenClosureSuccessor,
	readCommittedPackagedClosureFixture,
	readPackagedClosureBuildFixture,
	readPackagedClosureFixtureRuntime,
	resetPackagedClosureFixture
} from '@/vitest/packaged-closure-fixture';
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


import type { MacInstallResult,MacStartResult,MacStopResult,MacUninstallResult } from './lib/index.js';
import { assertClosureDesktopIdentity,assertHealthEvalValue,capturePackagedCheckpoint,captureUpdateEnv,closureBuildJsonPath,closureDistributionManifestPath,namespace,packagedMacClosureTarget,packagedMacUpdaterPlatform,readDesktopIdentityMarker,resetPackagedRuntimeState,restoreUpdateEnv,runMacStandaloneDistributionAcceptance,runToolsPackJson,seedPackagedOnboardingComplete,smokeLanes,toolsPackDir,updateFixture,updateScenario,verifyCoreOnly,waitForHealthyDesktop,workspaceRoot } from './lib/index.js';

const shellAbsorbsStandaloneAcceptance = hasPackagedSmokeLane(smokeLanes, 'shell') && hasPackagedSmokeLane(smokeLanes, 'standalone') && !verifyCoreOnly && updateFixture === 'tools-serve' && closureBuildJsonPath != null;
const macClosureDescribe = shouldRunPackagedMacSmoke && hasPackagedSmokeLane(smokeLanes, 'standalone') && (closureDistributionManifestPath != null || closureBuildJsonPath != null) && !shellAbsorbsStandaloneAcceptance ? describe : describe.skip;

macClosureDescribe('packaged mac Standalone Closure release acceptance', () => {
  test(MAC_PACKAGED_SMOKE_SCENARIOS.standaloneClosure.title, async () => {
    if (closureDistributionManifestPath != null) {
      await runMacStandaloneDistributionAcceptance();
      return;
    }
    const installationRoot = join(toolsPackDir, 'runtime', 'mac');
    const report = await createPackagedSmokeReport('mac');
    const updateEnv = captureUpdateEnv();
    let installed = false;
    let started = false;
    let closureFixture: ToolsServeUpdaterFixture | null = null;
    try {
      await resetPackagedRuntimeState();
      await resetPackagedClosureFixture({
        channel: updateScenario.channel,
        installationRoot,
        namespace,
      });
      await runToolsPackJson<MacInstallResult>('install');
      installed = true;
      await seedPackagedOnboardingComplete();
      const closureBuild = await readPackagedClosureBuildFixture({
        buildJsonPath: closureBuildJsonPath!,
        channel: updateScenario.channel,
        expectedPlatform: packagedMacClosureTarget,
        workspaceRoot,
      });
      closureFixture = await startToolsServeUpdaterFixture({
        channel: updateScenario.channel,
        closureManifestPath: closureBuild.manifestPath,
        platform: packagedMacUpdaterPlatform,
        rebaseClosureUrl: true,
        version: closureBuild.manifest.identity.version,
        workspaceRoot,
      });
      applyPackagedUpdateEnv(
        process.env,
        updateScenario,
        closureFixture.info.metadataUrl,
        { openDryRun: false },
      );

      const firstStart = await runToolsPackJson<MacStartResult>('start');
      started = true;
      const firstInspect = await waitForHealthyDesktop();
      expect(assertHealthEvalValue(firstInspect.eval?.value).health.ok).toBe(true);
      await capturePackagedCheckpoint(report, 'closure-first-start', firstInspect);
      const fixture = await readCommittedPackagedClosureFixture({
        buildJsonPath: closureBuildJsonPath!,
        channel: updateScenario.channel,
        expectedPlatform: packagedMacClosureTarget,
        installationRoot,
        namespace,
        workspaceRoot,
      });
      assertClosureDesktopIdentity(await readDesktopIdentityMarker(), fixture.manifest.identity.version);

      await closureFixture.close();
      closureFixture = null;

      const reinstallStop = await runToolsPackJson<MacStopResult>('stop');
      started = false;
      expect(reinstallStop.remainingPids).toEqual([]);
      await runToolsPackJson<MacInstallResult>('install');
      const reinstallStart = await runToolsPackJson<MacStartResult>('start');
      started = true;
      expect(reinstallStart.pid).not.toBe(firstStart.pid);
      const reinstallInspect = await waitForHealthyDesktop();
      await capturePackagedCheckpoint(report, 'closure-reinstall', reinstallInspect);
      assertClosureDesktopIdentity(await readDesktopIdentityMarker(), fixture.manifest.identity.version);

      const faultStop = await runToolsPackJson<MacStopResult>('stop');
      started = false;
      expect(faultStop.remainingPids).toEqual([]);
      const broken = await activateBrokenClosureSuccessor(fixture);
      expect((await readPackagedClosureFixtureRuntime(fixture)).attempt?.standalone).toEqual(broken.pointer);
      await runToolsPackJson<MacStartResult>('start');
      started = true;
      const recoveredInspect = await waitForHealthyDesktop();
      await capturePackagedCheckpoint(report, 'closure-rollback', recoveredInspect);
      assertClosureDesktopIdentity(await readDesktopIdentityMarker(), fixture.manifest.identity.version);
      const recovered = await readPackagedClosureFixtureRuntime(fixture);
      expect(recovered.active?.standalone).toEqual(fixture.pointer);
      expect(recovered.attempt).toBeNull();
    } finally {
      restoreUpdateEnv(updateEnv);
      await closureFixture?.close().catch(() => undefined);
      if (started) await runToolsPackJson<MacStopResult>('stop').catch(() => undefined);
      if (installed) await runToolsPackJson<MacUninstallResult>('uninstall').catch(() => undefined);
      await resetPackagedClosureFixture({
        channel: updateScenario.channel,
        installationRoot,
        namespace,
      }).catch(() => undefined);
    }
  }, 360_000);
});
