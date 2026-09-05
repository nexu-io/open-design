import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { finalizeDeliverableSyntax } from '../../src/artifacts/deliverable-syntax-finalization.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => (
    fs.rm(root, { recursive: true, force: true })
  )));
});

async function htmlFixture(source: string): Promise<string> {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'od-syntax-finalizer-'));
  roots.push(projectRoot);
  await fs.writeFile(path.join(projectRoot, 'index.html'), source, 'utf8');
  return projectRoot;
}

describe('deliverable syntax finalization', () => {
  it('accepts a parse-valid final Web deliverable', async () => {
    const projectRoot = await htmlFixture(
      '<!doctype html><script>const ready = true;</script>',
    );

    await expect(finalizeDeliverableSyntax({
      artifactKind: 'html',
      projectRoot,
      entryFile: 'index.html',
      processTreeQuiescent: true,
      checkedAt: 123,
      previousMetrics: {
        schema: 'open-design.deliverable-syntax-metrics/v1',
        checkCount: 2,
        checkerDurationMs: 9,
        repairableCheckCount: 1,
        initialDiagnosticCount: 1,
        latestDiagnosticCount: 1,
        firstRepairableAtMs: 100,
      },
      monotonicNow: (() => {
        const values = [100, 107];
        return () => values.shift() ?? 107;
      })(),
    })).resolves.toMatchObject({
      action: 'allow',
      validation: {
        status: 'pass',
        source: 'run_finalizer',
        checkedAt: 123,
        metrics: {
          checkCount: 3,
          checkerDurationMs: 16,
          repairableCheckCount: 1,
          initialDiagnosticCount: 1,
          latestDiagnosticCount: 0,
          firstRepairableAtMs: 100,
          repairPassedAtMs: 123,
          repairWindowDurationMs: 23,
        },
      },
    });
  });

  it('blocks terminal success when the final Web candidate is still broken', async () => {
    const projectRoot = await htmlFixture(
      '<!doctype html><script>const broken = ;</script>',
    );

    await expect(finalizeDeliverableSyntax({
      artifactKind: 'html',
      projectRoot,
      entryFile: 'index.html',
      processTreeQuiescent: true,
    })).resolves.toMatchObject({
      action: 'fail',
      reason: 'no_safe_fix',
      location: expect.stringMatching(/^index\.html:1:/u),
      validation: { status: 'repairable', source: 'run_finalizer' },
    });
  });

  it('repairs missing delimiters in the host and verifies after each patch', async () => {
    const projectRoot = await htmlFixture(
      '<!doctype html><script>function ready() { const items = [1, 2;</script>',
    );
    const wallValues = [1_000, 1_012, 1_025];
    const monotonicValues = [0, 4, 4, 7, 7, 12, 12, 17, 17, 23];

    await expect(finalizeDeliverableSyntax({
      artifactKind: 'html',
      projectRoot,
      entryFile: 'index.html',
      processTreeQuiescent: true,
      wallNow: () => wallValues.shift() ?? 1_025,
      monotonicNow: () => monotonicValues.shift() ?? 23,
    })).resolves.toMatchObject({
      action: 'allow',
      validation: {
        status: 'pass',
        repairState: {
          mode: 'host_safe_fixer',
          attempt: 2,
          maxAttempts: 3,
        },
        metrics: {
          checkCount: 3,
          checkerDurationMs: 15,
          repairableCheckCount: 2,
          initialDiagnosticCount: 1,
          latestDiagnosticCount: 0,
          repairWindowDurationMs: 25,
          repairExecutor: 'host_safe_fixer',
          repairDurationMs: 8,
          appliedRepairRules: ['insert_missing_closing_delimiter'],
        },
      },
    });
    await expect(fs.readFile(path.join(projectRoot, 'index.html'), 'utf8'))
      .resolves.toBe(
        '<!doctype html><script>function ready() { const items = [1, 2];}</script>',
      );
  });

  it('does not ask the host fixer to guess an expression value', async () => {
    const projectRoot = await htmlFixture(
      '<!doctype html><script>const broken = ;</script>',
    );

    await expect(finalizeDeliverableSyntax({
      artifactKind: 'html',
      projectRoot,
      entryFile: 'index.html',
      processTreeQuiescent: true,
    })).resolves.toMatchObject({ action: 'fail', reason: 'no_safe_fix' });
    await expect(fs.readFile(path.join(projectRoot, 'index.html'), 'utf8'))
      .resolves.toBe('<!doctype html><script>const broken = ;</script>');
  });

  it('stops after three accepted patches when the candidate still does not parse', async () => {
    const projectRoot = await htmlFixture(
      '<!doctype html><script>function ready() { if (true) { const items = [[1, 2;</script>',
    );

    await expect(finalizeDeliverableSyntax({
      artifactKind: 'html',
      projectRoot,
      entryFile: 'index.html',
      processTreeQuiescent: true,
    })).resolves.toMatchObject({
      action: 'fail',
      reason: 'attempt_limit_reached',
      validation: {
        status: 'repairable',
        repairState: { attempt: 3, maxAttempts: 3, mode: 'host_safe_fixer' },
        metrics: { checkCount: 4, repairableCheckCount: 4 },
      },
    });
  });

  it('skips non-Web deliverables before touching the filesystem', async () => {
    await expect(finalizeDeliverableSyntax({
      artifactKind: 'pdf',
      projectRoot: '/path/that/does/not/exist',
      entryFile: 'report.pdf',
      processTreeQuiescent: true,
    })).resolves.toEqual({ action: 'skip' });
  });

  it('records an inconclusive non-blocking check while the process tree is not quiet', async () => {
    await expect(finalizeDeliverableSyntax({
      artifactKind: 'html',
      projectRoot: '/path/that/does/not/exist',
      entryFile: 'index.html',
      processTreeQuiescent: false,
      checkedAt: 456,
    })).resolves.toMatchObject({
      action: 'allow',
      validation: {
        status: 'incomplete',
        reason: 'process_tree_not_quiescent',
        checkedAt: 456,
      },
    });
  });
});
