import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  capturePackagedFailureEvidence,
  packagedEvidenceRelpath,
  PACKAGED_FAILURE_EVIDENCE_DIR,
} from '@/vitest/packaged-failure-evidence';
import { createReport } from '@/vitest/report';

const scratchRoots: string[] = [];

async function createScratchReport() {
  const root = await mkdtemp(join(tmpdir(), 'od-packaged-evidence-'));
  scratchRoots.push(root);
  return { report: await createReport(root), root };
}

afterEach(async () => {
  while (scratchRoots.length > 0) {
    const root = scratchRoots.pop();
    if (root != null) await rm(root, { force: true, recursive: true });
  }
});

describe('packaged failure evidence paths', () => {
  it('keeps every capture inside the report root even for hostile names', () => {
    expect(packagedEvidenceRelpath(PACKAGED_FAILURE_EVIDENCE_DIR, 'runs.json'))
      .toBe('first-run-failure/runs.json');
    expect(packagedEvidenceRelpath('first-run-failure', '../../escape.log'))
      .toBe('first-run-failure/escape.log');
    expect(packagedEvidenceRelpath('first-run-failure', '/etc/passwd'))
      .toBe('first-run-failure/etc-passwd');
    expect(packagedEvidenceRelpath('first-run-failure', '')).toBe('first-run-failure/unnamed');
  });
});

describe('packaged failure evidence capture', () => {
  it('writes every source into the report and records them in a manifest', async () => {
    const { report, root } = await createScratchReport();

    const entries = await capturePackagedFailureEvidence(report, PACKAGED_FAILURE_EVIDENCE_DIR, [
      { name: 'error.txt', read: async () => 'stage timed out\n' },
      { name: 'runs.json', read: async () => '{"runs":[]}\n' },
      { name: 'desktop-latest.log', read: async () => Uint8Array.from([104, 105]) },
    ]);

    expect(entries.map((entry) => entry.status)).toEqual(['saved', 'saved', 'saved']);
    expect(await readFile(join(root, 'first-run-failure', 'error.txt'), 'utf8'))
      .toBe('stage timed out\n');
    expect(await readFile(join(root, 'first-run-failure', 'desktop-latest.log'), 'utf8')).toBe('hi');
    const manifest = JSON.parse(
      await readFile(join(root, 'first-run-failure', 'index.json'), 'utf8'),
    ) as { entries: Array<{ name: string; relpath: string }> };
    expect(manifest.entries.map((entry) => entry.relpath)).toEqual([
      'first-run-failure/error.txt',
      'first-run-failure/runs.json',
      'first-run-failure/desktop-latest.log',
    ]);
  });

  it('keeps capturing after an unreadable source and records why it failed', async () => {
    // A failed packaged case is usually failing *because* something is broken,
    // so the first source that cannot be read is the normal case, not the
    // exceptional one. Losing the remaining evidence to it would reproduce the
    // exact blind spot this capture exists to remove.
    const { report, root } = await createScratchReport();

    const entries = await capturePackagedFailureEvidence(report, PACKAGED_FAILURE_EVIDENCE_DIR, [
      {
        name: 'runs.json',
        read: async () => {
          throw new Error('desktop IPC socket is gone');
        },
      },
      { name: 'error.txt', read: async () => 'stage timed out\n' },
    ]);

    expect(entries[0]).toMatchObject({ name: 'runs.json', status: 'failed' });
    expect(entries[0]?.detail).toContain('desktop IPC socket is gone');
    expect(entries[1]).toMatchObject({ name: 'error.txt', status: 'saved' });
    expect(await readFile(join(root, 'first-run-failure', 'error.txt'), 'utf8'))
      .toBe('stage timed out\n');
  });

  it('never throws out of the cleanup path, even when the report itself is broken', async () => {
    const brokenReport = {
      json: async () => {
        throw new Error('report root is read-only');
      },
      save: async () => {
        throw new Error('report root is read-only');
      },
    };

    const entries = await capturePackagedFailureEvidence(brokenReport, PACKAGED_FAILURE_EVIDENCE_DIR, [
      { name: 'error.txt', read: async () => 'stage timed out\n' },
    ]);

    expect(entries).toEqual([
      {
        detail: 'Error: report root is read-only',
        name: 'error.txt',
        relpath: 'first-run-failure/error.txt',
        status: 'failed',
      },
    ]);
  });
});
