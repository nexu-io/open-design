// @vitest-environment node

import { mkdir,readFile } from 'node:fs/promises';
import { dirname,join } from 'node:path';

import { describe,expect,test } from 'vitest';

import {
	createPackagedSmokeReport
} from '@/vitest/packaged-report';
import { shouldRunPackagedMacSmoke } from './lib/context.js';


import type { MacInspectResult,MacInstallResult,MacStartResult,MacStopResult,MacUninstallResult } from './lib/index.js';
import { assertHealthEvalValue,fileSizeBytes,namespace,printPackagedLogs,resetPackagedMacRuntimeData,runToolsPackJson,seedConfiguredPackagedClosure,toolsPackDir,waitForHealthyDesktop,waitForPackagedOnboarding } from './lib/index.js';

const macOnboardingDescribe = shouldRunPackagedMacSmoke && process.env.OD_PACKAGED_E2E_MAC_ONBOARDING_SMOKE === '1' ? describe : describe.skip;

macOnboardingDescribe('packaged mac onboarding AMR smoke', () => {
  let installedAppPath: string | null = null;
  let started = false;

  test('[P0] @electron-smoke starts a fresh packaged app on the Cloud identity gate', async () => {
    const report = await createPackagedSmokeReport('mac');
    let passed = false;
    try {
      await runToolsPackJson<MacUninstallResult>('uninstall').catch((error: unknown) => {
        console.error('failed to uninstall stale packaged mac app before onboarding smoke', error);
      });
      await resetPackagedMacRuntimeData();

      const install = await runToolsPackJson<MacInstallResult>('install');
      installedAppPath = install.installedAppPath;
      expect(install.namespace).toBe(namespace);
      expect(install.detached).toBe(true);
      await seedConfiguredPackagedClosure();

      const start = await runToolsPackJson<MacStartResult>('start');
      started = true;
      expect(start.namespace).toBe(namespace);
      expect(start.source).toBe('installed');
      expect(start.appPath).toBe(install.installedAppPath);

      const inspect = await waitForHealthyDesktop();
      const health = assertHealthEvalValue(inspect.eval?.value);
      expect(health.status).toBe(200);
      expect(health.health.ok).toBe(true);

      const initial = await waitForPackagedOnboarding((snapshot) =>
        snapshot.onboardingVisible && snapshot.cloudSignInVisible,
        'fresh packaged onboarding Cloud identity gate',
      );
      expect(initial.href).toMatch(/^(od:\/\/app\/|http:\/\/127\.0\.0\.1:\d+\/)/);
      expect(initial.cloudSignInVisible).toBe(true);

      const onboardingScreenshotPath = join(toolsPackDir, 'screenshots', `${namespace}-onboarding.png`);
      await mkdir(dirname(onboardingScreenshotPath), { recursive: true });
      const screenshot = await runToolsPackJson<MacInspectResult>('inspect', ['--path', onboardingScreenshotPath]);
      expect(screenshot.screenshot?.path).toBe(onboardingScreenshotPath);
      expect(await fileSizeBytes(onboardingScreenshotPath)).toBeGreaterThan(0);
      await report.report.save('screenshots/open-design-mac-onboarding-smoke.png', await readFile(onboardingScreenshotPath));
      await report.report.json('onboarding-summary.json', {
        health,
        initial,
        namespace,
        screenshot: 'screenshots/open-design-mac-onboarding-smoke.png',
        start: {
          appPath: start.appPath,
          executablePath: start.executablePath,
          logPath: start.logPath,
          pid: start.pid,
          source: start.source,
          status: start.status,
        },
      });

      const stop = await runToolsPackJson<MacStopResult>('stop');
      started = false;
      expect(stop.namespace).toBe(namespace);
      expect(stop.status).not.toBe('partial');

      const uninstall = await runToolsPackJson<MacUninstallResult>('uninstall');
      installedAppPath = null;
      expect(uninstall.namespace).toBe(namespace);
      expect(uninstall.installedAppPath).toBe(install.installedAppPath);
      expect(uninstall.removed).toBe(true);
      await resetPackagedMacRuntimeData();
      passed = true;
    } finally {
      if (!passed) {
        await printPackagedLogs().catch((error: unknown) => {
          console.error('failed to read packaged mac onboarding logs after failure', error);
        });
      }

      if (started || installedAppPath != null) {
        await runToolsPackJson<MacUninstallResult>('uninstall').catch((error: unknown) => {
          console.error('failed to uninstall packaged mac onboarding app during cleanup', error);
        });
        started = false;
        installedAppPath = null;
      }
      await resetPackagedMacRuntimeData().catch((error: unknown) => {
        console.error('failed to reset packaged mac onboarding runtime data during cleanup', error);
      });
    }
  }, 180_000);
});
