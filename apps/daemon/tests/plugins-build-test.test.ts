// Phase 7 entry slice / spec §10 / §22.4 — build-test runner.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runBuildTest, writeBuildTestReport } from '../src/plugins/atoms/build-test.js';

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'od-build-test-'));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('runBuildTest — explicit overrides', () => {
  it('reports status=passing when both commands exit 0', async () => {
    const report = await runBuildTest({
      cwd: tmp,
      buildCommand: 'true',
      testCommand:  'true',
    });
    expect(report.build.status).toBe('passing');
    expect(report.tests.status).toBe('passing');
    expect(report.signals['build.passing']).toBe(true);
    expect(report.signals['tests.passing']).toBe(true);
    expect(report.signals['critique.score']).toBe(5);
  });

  it('reports status=failing when the build command exits non-zero', async () => {
    const report = await runBuildTest({
      cwd: tmp,
      buildCommand: 'exit 7',
      testCommand:  null,
    });
    expect(report.build.status).toBe('failing');
    expect(report.build.exitCode).toBe(7);
    expect(report.signals['build.passing']).toBe(false);
    expect(report.signals['critique.score']).toBe(1);
  });

  it('skips a half cleanly when the command is null + records a reason', async () => {
    const report = await runBuildTest({
      cwd: tmp,
      buildCommand: 'true',
      testCommand:  null,
    });
    expect(report.build.status).toBe('passing');
    expect(report.tests.status).toBe('skipped');
    expect(report.tests.reason).toMatch(/no test command/);
    // Skipped does not flip the signal off.
    expect(report.signals['tests.passing']).toBe(true);
    // Score: build passed, tests skipped (count as passing) → 5.
    expect(report.signals['critique.score']).toBe(5);
  });

  it('truncates the log when output exceeds the budget', async () => {
    // Produce ~64 KiB of output; cap is 1 KiB.
    const report = await runBuildTest({
      cwd: tmp,
      buildCommand: 'yes "X" | head -c 65536',
      testCommand:  null,
      logBudgetBytes: 1024,
    });
    expect(report.build.status).toBe('passing');
    expect(report.build.log.length).toBeLessThan(2_500);
    expect(report.build.log).toContain('truncated');
  });
});

describe('runBuildTest — package.json inference', () => {
  it('derives commands from npm scripts when no override is supplied', async () => {
    await writeFile(
      path.join(tmp, 'package.json'),
      JSON.stringify({
        name: 'fixture',
        scripts: { typecheck: 'true', test: 'true' },
      }),
    );
    const report = await runBuildTest({ cwd: tmp });
    expect(report.build.command).toMatch(/^npm run typecheck$/);
    expect(report.tests.command).toMatch(/^npm run test$/);
    expect(report.build.status).toBe('passing');
    expect(report.tests.status).toBe('passing');
  });

  it('prefers pnpm when pnpm-lock.yaml exists', async () => {
    await writeFile(
      path.join(tmp, 'package.json'),
      JSON.stringify({ name: 'fixture', scripts: { test: 'true' } }),
    );
    await writeFile(path.join(tmp, 'pnpm-lock.yaml'), '');
    const report = await runBuildTest({ cwd: tmp });
    expect(report.tests.command).toMatch(/^pnpm run test$/);
    expect(report.build.status).toBe('skipped');
  });
});

describe('writeBuildTestReport', () => {
  it('writes critique/build-test.json + critique/build-test.log under cwd', async () => {
    const report = await runBuildTest({
      cwd: tmp,
      buildCommand: 'true',
      testCommand:  'true',
    });
    const { jsonPath, logPath } = await writeBuildTestReport({ cwd: tmp, report });
    const json = JSON.parse(await readFile(jsonPath, 'utf8'));
    expect(json.build.status).toBe('passing');
    expect(json.tests.status).toBe('passing');
    expect(json.signals['build.passing']).toBe(true);
    const log = await readFile(logPath, 'utf8');
    expect(log).toContain('# build');
    expect(log).toContain('# tests');
  });
});
