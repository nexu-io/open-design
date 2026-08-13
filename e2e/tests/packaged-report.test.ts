import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { createPackagedSmokeReport } from '@/vitest/packaged-report';

let scratchRoot: string | null = null;
let previousReportDir: string | undefined;

afterEach(async () => {
  if (previousReportDir == null) delete process.env.OD_PACKAGED_E2E_REPORT_DIR;
  else process.env.OD_PACKAGED_E2E_REPORT_DIR = previousReportDir;
  if (scratchRoot != null) await rm(scratchRoot, { force: true, recursive: true });
  scratchRoot = null;
});

describe('packaged smoke report evidence', () => {
  test('stores a named renderer capture with state and logs beside it', async () => {
    previousReportDir = process.env.OD_PACKAGED_E2E_REPORT_DIR;
    scratchRoot = await mkdtemp(join(tmpdir(), 'open-design-packaged-report-'));
    const reportRoot = join(scratchRoot, 'report');
    const screenshotPath = join(scratchRoot, 'renderer.png');
    process.env.OD_PACKAGED_E2E_REPORT_DIR = reportRoot;
    await writeFile(screenshotPath, Buffer.from('png-evidence'));

    const report = await createPackagedSmokeReport('mac');
    const checkpoint = await report.saveCheckpoint({
      logs: { desktop: ['ready'] },
      name: 'Closure repaired',
      screenshotPath,
      snapshot: { status: { state: 'running', windowVisible: false } },
    });

    expect(checkpoint.name).toBe('closure-repaired');
    expect(checkpoint.screenshot).toBe('evidence/closure-repaired/renderer.png');
    expect(await readFile(join(reportRoot, checkpoint.screenshot), 'utf8')).toBe('png-evidence');
    expect(JSON.parse(await readFile(join(reportRoot, checkpoint.snapshot), 'utf8'))).toEqual({
      status: { state: 'running', windowVisible: false },
    });
    expect(JSON.parse(await readFile(join(reportRoot, checkpoint.logs!), 'utf8'))).toEqual({
      desktop: ['ready'],
    });
  });
});
