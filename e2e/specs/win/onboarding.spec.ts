// @vitest-environment node

import { mkdir,readFile } from 'node:fs/promises';
import { dirname,join } from 'node:path';

import { describe,expect,test } from 'vitest';

import { createPackagedSmokeReport } from '@/vitest/packaged-report';
import { shouldRunPackagedWinSmoke } from './lib/context.js';


import type { SmokeTiming,WinInspectResult,WinInstallResult,WinStartResult,WinStopResult,WinUninstallResult } from './lib/index.js';
import { assertHealthEvalValue,expectPathInside,fileSizeBytes,measureSmokeStep,namespace,printPackagedLogs,printSmokeTimings,resetPackagedRuntimeDataRoot,resetPackagedRuntimeNamespaceRoot,runtimeNamespaceRoot,runToolsPackJson,seedConfiguredPackagedClosure,toolsPackDir,waitForHealthyDesktop,waitForPackagedOnboarding } from './lib/index.js';

const winOnboardingDescribe = shouldRunPackagedWinSmoke && process.env.OD_PACKAGED_E2E_WIN_ONBOARDING_SMOKE === '1' ? describe : describe.skip;

winOnboardingDescribe('packaged windows onboarding AMR smoke', () => {
  let installed = false;
  let started = false;

  test('[P0] @electron-smoke starts a fresh packaged Windows app on the Cloud identity gate', async () => {
    const report = await createPackagedSmokeReport('win');
    const timings: SmokeTiming[] = [];
    let install: WinInstallResult | null = null;
    let installedNamespaceRoot: string | null = null;
    let passed = false;
    try {
      await measureSmokeStep(timings, 'pre-clean uninstall', async () => {
        await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch(() => null);
      });

      install = await measureSmokeStep(timings, 'install', async () => runToolsPackJson<WinInstallResult>('install'));
      installed = true;
      expect(install.namespace).toBe(namespace);
      expectPathInside(install.installDir, join(runtimeNamespaceRoot, 'install'));
      installedNamespaceRoot = runtimeNamespaceRoot;
      await resetPackagedRuntimeDataRoot();
      await seedConfiguredPackagedClosure();

      const start = await measureSmokeStep(timings, 'start fresh onboarding', async () => runToolsPackJson<WinStartResult>('start'));
      started = true;
      expect(start.namespace).toBe(namespace);
      expect(start.source).toBe('installed');
      expectPathInside(start.executablePath, install.installDir);

      const inspect = await measureSmokeStep(timings, 'wait healthy inspect eval', async () => waitForHealthyDesktop());
      expect(inspect.status?.state).toBe('running');
      // A fresh install boots at `od://app/` and the SPA immediately redirects to the dedicated
      // onboarding route (`od://app/onboarding`, since the #4513 cloud sign-in redesign). Whether
      // the desktop is reported healthy just before or just after that redirect is a race, so the
      // healthy URL/href may be either — match the prefix leniently exactly as the mac smoke and
      // the onboarding-landing assertion below do, instead of pinning the bare root (which flaked
      // ~3 of 4 nightly Windows builds when the redirect won the race).
      expect(inspect.status?.url).toMatch(/^(od:\/\/app\/|http:\/\/127\.0\.0\.1:\d+\/)/);
      const health = assertHealthEvalValue(inspect.eval?.value);
      expect(health.href).toMatch(/^(od:\/\/app\/|http:\/\/127\.0\.0\.1:\d+\/)/);
      expect(health.status).toBe(200);
      expect(health.health.ok).toBe(true);

      const initial = await waitForPackagedOnboarding((snapshot) =>
        snapshot.onboardingVisible && snapshot.cloudSignInVisible,
        'fresh packaged Windows onboarding Cloud identity gate',
      );
      // Onboarding lives on a dedicated route since the #4513 cloud sign-in
      // redesign, so the href is `od://app/onboarding` (packaged) — not the
      // bare app root. Match the prefix the same lenient way the mac smoke
      // does instead of pinning the exact root path. Before the user-data
      // reset fix the app booted to Home and never reached this line, which
      // is why the stale exact-match assertion went unnoticed.
      expect(initial.href).toMatch(/^(od:\/\/app\/|http:\/\/127\.0\.0\.1:\d+\/)/);
      expect(initial.cloudSignInVisible).toBe(true);

      const onboardingScreenshotPath = join(toolsPackDir, 'screenshots', `${namespace}-onboarding.png`);
      await mkdir(dirname(onboardingScreenshotPath), { recursive: true });
      const screenshot = await runToolsPackJson<WinInspectResult>('inspect', ['--path', onboardingScreenshotPath]);
      expect(screenshot.screenshot?.path).toBe(onboardingScreenshotPath);
      expect(await fileSizeBytes(onboardingScreenshotPath)).toBeGreaterThan(0);
      await report.report.save('screenshots/open-design-win-onboarding-smoke.png', await readFile(onboardingScreenshotPath));
      await report.report.json('onboarding-summary.json', {
        health,
        initial,
        namespace,
        screenshot: 'screenshots/open-design-win-onboarding-smoke.png',
        start: {
          executablePath: start.executablePath,
          logPath: start.logPath,
          pid: start.pid,
          source: start.source,
          status: start.status,
        },
        timings,
      });

      const stop = await measureSmokeStep(timings, 'stop', async () => runToolsPackJson<WinStopResult>('stop'));
      started = false;
      expect(stop.namespace).toBe(namespace);
      expect(stop.status).not.toBe('partial');

      const uninstall = await measureSmokeStep(timings, 'uninstall remove data', async () =>
        runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']),
      );
      installed = false;
      expect(uninstall.namespace).toBe(namespace);
      expect(uninstall.residueObservation?.productNamespaceRootExists).toBe(false);
      passed = true;
    } finally {
      if (!passed) {
        await printPackagedLogs().catch((error: unknown) => {
          console.error('failed to read packaged windows onboarding logs after failure', error);
        });
      }

      if (started) {
        await runToolsPackJson<WinStopResult>('stop').catch((error: unknown) => {
          console.error('failed to stop packaged windows onboarding app during cleanup', error);
        });
        started = false;
      }

      if (installed) {
        await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch((error: unknown) => {
          console.error('failed to uninstall packaged windows onboarding app during cleanup', error);
        });
        installed = false;
      }

      if (installedNamespaceRoot != null) {
        await resetPackagedRuntimeNamespaceRoot(installedNamespaceRoot).catch((error: unknown) => {
          console.error('failed to reset packaged windows onboarding runtime data during cleanup', error);
        });
      }
      printSmokeTimings(timings);
    }
  }, 720_000);
});
