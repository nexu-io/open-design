import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import { createReport, type E2eReport } from './report.ts';
import { e2eWorkspaceRoot } from './suite.ts';

export type PackagedReportPlatform = 'mac' | 'win';

export type PackagedSmokeReport = {
  report: E2eReport;
  saveCheckpoint: (input: PackagedSmokeCheckpoint) => Promise<PackagedSmokeCheckpointRecord>;
  saveScreenshot: (path: string) => Promise<void>;
  saveSummary: (value: unknown) => Promise<void>;
  screenshotRelpath: string;
};

export type PackagedSmokeCheckpoint = {
  logs?: unknown;
  name: string;
  screenshotPath: string;
  snapshot: unknown;
};

export type PackagedSmokeCheckpointRecord = {
  capturedAt: string;
  logs: string | null;
  name: string;
  screenshot: string;
  snapshot: string;
};

export async function createPackagedSmokeReport(platform: PackagedReportPlatform): Promise<PackagedSmokeReport> {
  const root = resolveFromWorkspace(
    process.env.OD_PACKAGED_E2E_REPORT_DIR ?? join('.tmp', 'e2e-release-report', platform),
  );
  const report = await createReport(root);
  const screenshotRelpath = `screenshots/open-design-${platform}-smoke.png`;

  return {
    report,
    saveCheckpoint: async (input) => {
      const name = normalizeCheckpointName(input.name);
      const prefix = `evidence/${name}`;
      const screenshot = `${prefix}/renderer.png`;
      const snapshot = `${prefix}/snapshot.json`;
      const logs = input.logs == null ? null : `${prefix}/logs.json`;
      await Promise.all([
        report.save(screenshot, await readFile(input.screenshotPath)),
        report.json(snapshot, input.snapshot),
        ...(logs == null ? [] : [report.json(logs, input.logs)]),
      ]);
      const record: PackagedSmokeCheckpointRecord = {
        capturedAt: new Date().toISOString(),
        logs,
        name,
        screenshot,
        snapshot,
      };
      await report.json(`${prefix}/checkpoint.json`, record);
      return record;
    },
    saveScreenshot: async (path) => {
      await report.save(screenshotRelpath, await readFile(path));
    },
    saveSummary: async (value) => {
      await report.json('summary.json', value);
    },
    screenshotRelpath,
  };
}

function normalizeCheckpointName(value: string): string {
  const name = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (name.length === 0) throw new Error('packaged smoke checkpoint name must not be empty');
  return name;
}

function resolveFromWorkspace(path: string): string {
  return isAbsolute(path) ? path : resolve(e2eWorkspaceRoot(), path);
}
