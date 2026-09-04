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
      location: expect.stringMatching(/^index\.html:1:/u),
      validation: { status: 'repairable', source: 'run_finalizer' },
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
