import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import { createReport, type E2eReport } from './report.ts';
import { e2eWorkspaceRoot } from './smoke-suite.ts';

export type PackagedReportPlatform = 'mac' | 'win';

export type PackagedSmokeReport = {
  report: E2eReport;
  saveScreenshot: (path: string) => Promise<void>;
  saveSummary: (value: unknown) => Promise<void>;
  screenshotRelpath: string;
};

export async function createPackagedSmokeReport(platform: PackagedReportPlatform): Promise<PackagedSmokeReport> {
  const root = resolveFromWorkspace(
    process.env.OD_PACKAGED_E2E_REPORT_DIR ?? join('.tmp', 'e2e-release-report', platform),
  );
  const report = await createReport(root);
  const screenshotRelpath = `screenshots/open-design-${platform}-smoke.png`;

  return {
    report,
    saveScreenshot: async (path) => {
      await report.save(screenshotRelpath, await readFile(path));
    },
    saveSummary: async (value) => {
      await report.json('summary.json', value);
    },
    screenshotRelpath,
  };
}

function resolveFromWorkspace(path: string): string {
  return isAbsolute(path) ? path : resolve(e2eWorkspaceRoot(), path);
}
