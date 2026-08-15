// @vitest-environment node

import { join } from 'node:path';

import { describe,expect,test } from 'vitest';

import {
	activateBrokenClosureSuccessor,
	readPackagedClosureFixtureRuntime,
	resetPackagedClosureFixture
} from '@/vitest/packaged-closure-fixture';
import {
	hasPackagedSmokeLane
} from '@/vitest/packaged-smoke-contract';
import { WIN_PACKAGED_SMOKE_SCENARIOS } from '@/vitest/packaged-smoke-plan-win';
import { shouldRunPackagedWinSmoke } from './lib/context.js';


import type { SmokeTiming,WinInstallResult,WinStartResult,WinStopResult,WinUninstallResult } from './lib/index.js';
import { assertClosureDesktopIdentity,assertHealthEvalValue,closureBuildJsonPath,closureDistributionManifestPath,measureSmokeStep,namespace,printLifecycleTimings,printSmokeTimings,readDesktopIdentityMarker,resetPackagedUpdaterNamespaceRoots,runToolsPackJson,runWinStandaloneDistributionAcceptance,seedPackagedOnboardingComplete,seedReusableWinPackagedClosureFixture,shellSmokeProof,smokeLanes,toolsPackDir,updateFixture,updateScenario,verifyCoreOnly,waitForHealthyDesktop,workspaceRoot } from './lib/index.js';

const shellAbsorbsStandaloneAcceptance = hasPackagedSmokeLane(smokeLanes, 'shell') && hasPackagedSmokeLane(smokeLanes, 'standalone') && !verifyCoreOnly && updateFixture === 'tools-serve' && closureBuildJsonPath != null;
const winClosureDescribe = shouldRunPackagedWinSmoke && hasPackagedSmokeLane(smokeLanes, 'standalone') && (closureDistributionManifestPath != null || closureBuildJsonPath != null) && !shellAbsorbsStandaloneAcceptance ? describe : describe.skip;

winClosureDescribe('packaged Windows Standalone Closure release acceptance', () => {
  test(WIN_PACKAGED_SMOKE_SCENARIOS.standaloneClosure.title, async () => {
    if (closureDistributionManifestPath != null) {
      await runWinStandaloneDistributionAcceptance();
      return;
    }
    const installationRoot = join(toolsPackDir, 'runtime', 'win');
    const timings: SmokeTiming[] = [];
    let installed = false;
    let started = false;
    try {
      await measureSmokeStep(timings, 'pre-clean namespace', async () => {
        await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch(() => null);
        await resetPackagedUpdaterNamespaceRoots();
        await resetPackagedClosureFixture({
          channel: updateScenario.channel,
          installationRoot,
          namespace,
        });
      });
      const install = await measureSmokeStep(timings, 'install', async () => runToolsPackJson<WinInstallResult>('install'));
      installed = true;
      printLifecycleTimings('standalone install lifecycle timings', install.lifecycleTimings);
      await measureSmokeStep(timings, 'seed onboarding complete', seedPackagedOnboardingComplete);
      const fixture = await seedReusableWinPackagedClosureFixture({
        buildJsonPath: closureBuildJsonPath!,
        channel: updateScenario.channel,
        expectedPlatform: 'win32-x64',
        installationRoot,
        namespace,
        timings,
        workspaceRoot,
      });

      const firstStart = await measureSmokeStep(timings, 'first cold start', async () => runToolsPackJson<WinStartResult>('start'));
      started = true;
      const firstInspect = await measureSmokeStep(timings, 'first healthy wait', async () => waitForHealthyDesktop());
      expect(assertHealthEvalValue(firstInspect.eval?.value).health.ok).toBe(true);
      assertClosureDesktopIdentity(await readDesktopIdentityMarker(), fixture.manifest.identity.version);

      const restartStop = await measureSmokeStep(timings, 'stop before offline restart', async () =>
        runToolsPackJson<WinStopResult>('stop'),
      );
      started = false;
      expect(restartStop.remainingPids).toEqual([]);
      if (shellSmokeProof !== 'hit') {
        await measureSmokeStep(timings, 'reinstall without reusable Shell proof', async () =>
          runToolsPackJson<WinInstallResult>('install'),
        );
      } else {
        timings.push({ durationMs: 0, step: 'reuse exact Shell reinstall proof' });
      }
      const restartStart = await measureSmokeStep(timings, 'offline committed restart', async () =>
        runToolsPackJson<WinStartResult>('start'),
      );
      started = true;
      expect(restartStart.pid).not.toBe(firstStart.pid);
      await measureSmokeStep(timings, 'offline restart healthy wait', async () => waitForHealthyDesktop());
      assertClosureDesktopIdentity(await readDesktopIdentityMarker(), fixture.manifest.identity.version);

      const faultStop = await measureSmokeStep(timings, 'stop before damaged successor', async () =>
        runToolsPackJson<WinStopResult>('stop'),
      );
      started = false;
      expect(faultStop.remainingPids).toEqual([]);
      const broken = await measureSmokeStep(timings, 'materialize damaged successor', async () =>
        activateBrokenClosureSuccessor(fixture),
      );
      expect((await readPackagedClosureFixtureRuntime(fixture)).attempt?.standalone).toEqual(broken.pointer);
      await measureSmokeStep(timings, 'rollback interrupted successor on start', async () =>
        runToolsPackJson<WinStartResult>('start'),
      );
      started = true;
      await measureSmokeStep(timings, 'rolled-back binding healthy wait', async () => waitForHealthyDesktop());
      assertClosureDesktopIdentity(await readDesktopIdentityMarker(), fixture.manifest.identity.version);
      const recovered = await readPackagedClosureFixtureRuntime(fixture);
      expect(recovered.active?.standalone).toEqual(fixture.pointer);
      expect(recovered.attempt).toBeNull();
    } finally {
      if (started) {
        await measureSmokeStep(timings, 'cleanup stop', async () =>
          runToolsPackJson<WinStopResult>('stop').catch(() => undefined),
        );
      }
      if (installed) {
        const uninstall = await measureSmokeStep(timings, 'cleanup uninstall', async () =>
          runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch(() => undefined),
        );
        printLifecycleTimings('standalone uninstall lifecycle timings', uninstall?.lifecycleTimings);
      }
      await measureSmokeStep(timings, 'cleanup Closure fixture', async () =>
        resetPackagedClosureFixture({
          channel: updateScenario.channel,
          installationRoot,
          namespace,
        }).catch(() => undefined),
      );
      printSmokeTimings(timings);
    }
  }, 720_000);
});
