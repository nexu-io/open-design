// Phase 7-8 entry slice — diff-review atom impl.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runDiffReview } from '../src/plugins/atoms/diff-review.js';

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(path.join(os.tmpdir(), 'od-diff-review-'));
  await mkdir(path.join(cwd, 'plan', 'receipts'), { recursive: true });
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

async function seedReceipts(steps: Array<{ id: string; risk?: string; rationale?: string }>, receipts: Array<{ step: string; files: string[]; added: number; removed: number; rationale?: string }>) {
  await writeFile(
    path.join(cwd, 'plan', 'steps.json'),
    JSON.stringify(steps.map((s) => ({ id: s.id, files: [], rationale: s.rationale ?? '', risk: s.risk ?? 'low', status: 'completed' })), null, 2),
  );
  for (const r of receipts) {
    await writeFile(
      path.join(cwd, 'plan', 'receipts', `step-${r.step}.json`),
      JSON.stringify({ ...r, completedAt: new Date().toISOString() }, null, 2),
    );
  }
}

describe('runDiffReview — artefact emission', () => {
  it('produces diff.patch / summary.md / meta.json from receipts', async () => {
    await seedReceipts(
      [{ id: 'rewrite-button', risk: 'low', rationale: 'tighten copy' }],
      [{ step: 'rewrite-button', files: ['Button.tsx'], added: 1, removed: 1, rationale: 'tightened the copy' }],
    );
    const report = await runDiffReview({ cwd });
    expect(report.files).toEqual(['Button.tsx']);
    expect(report.added).toBe(1);
    expect(report.removed).toBe(1);
    const diff    = await readFile(path.join(cwd, 'review', 'diff.patch'), 'utf8');
    const summary = await readFile(path.join(cwd, 'review', 'summary.md'), 'utf8');
    const meta    = JSON.parse(await readFile(path.join(cwd, 'review', 'meta.json'), 'utf8'));
    expect(diff).toContain('# step: rewrite-button');
    expect(summary).toContain('Patch review summary');
    expect(summary).toContain('rewrite-button');
    expect(meta.atomDigest.length).toBe(40);
    expect(meta.planRevision).toBe(1);
    // No decision yet because none was supplied + no prior file on disk.
    expect(report.decision).toBeUndefined();
  });

  it('aggregates added/removed across receipts and dedupes file lists', async () => {
    await seedReceipts(
      [{ id: 'a' }, { id: 'b' }],
      [
        { step: 'a', files: ['x.ts'],          added: 3, removed: 1 },
        { step: 'b', files: ['x.ts', 'y.ts'],  added: 4, removed: 2 },
      ],
    );
    const report = await runDiffReview({ cwd });
    expect(report.files).toEqual(['x.ts', 'y.ts']);
    expect(report.added).toBe(7);
    expect(report.removed).toBe(3);
  });
});

describe('runDiffReview — decision file', () => {
  it("composes an 'accept' decision with all touched files when accepted_files is omitted", async () => {
    await seedReceipts(
      [{ id: 'a' }],
      [{ step: 'a', files: ['x.ts', 'y.ts'], added: 1, removed: 0 }],
    );
    const report = await runDiffReview({
      cwd,
      decision: { decision: 'accept', reviewer: 'user' },
    });
    expect(report.decision?.decision).toBe('accept');
    expect(report.decision?.accepted_files).toEqual(['x.ts', 'y.ts']);
    expect(report.decision?.rejected_files).toEqual([]);
    const onDisk = JSON.parse(await readFile(path.join(cwd, 'review', 'decision.json'), 'utf8'));
    expect(onDisk.decision).toBe('accept');
    expect(onDisk.reviewer).toBe('user');
  });

  it("composes a 'reject' decision with all files in rejected_files", async () => {
    await seedReceipts(
      [{ id: 'a' }],
      [{ step: 'a', files: ['x.ts'], added: 1, removed: 1 }],
    );
    const report = await runDiffReview({
      cwd,
      decision: { decision: 'reject', reviewer: 'user', reason: 'looks wrong' },
    });
    expect(report.decision?.rejected_files).toEqual(['x.ts']);
    expect(report.decision?.accepted_files).toEqual([]);
    expect(report.decision?.reason).toBe('looks wrong');
  });

  it("requires a 'partial' decision to cover every touched file", async () => {
    await seedReceipts(
      [{ id: 'a' }],
      [{ step: 'a', files: ['x.ts', 'y.ts'], added: 1, removed: 0 }],
    );
    await expect(runDiffReview({
      cwd,
      decision: {
        decision: 'partial',
        reviewer: 'user',
        accepted_files: ['x.ts'],
        rejected_files: [],
      },
    })).rejects.toThrow(/missing y\.ts/);
  });

  it('round-trips a previously persisted decision.json on subsequent runs', async () => {
    await seedReceipts(
      [{ id: 'a' }],
      [{ step: 'a', files: ['x.ts'], added: 1, removed: 0 }],
    );
    await runDiffReview({
      cwd,
      decision: { decision: 'accept', reviewer: 'agent' },
    });
    // Re-run without supplying a decision; persisted file should
    // be returned in the report.
    const second = await runDiffReview({ cwd });
    expect(second.decision?.decision).toBe('accept');
    expect(second.decision?.reviewer).toBe('agent');
  });

  it('handles an empty receipts dir without throwing', async () => {
    await writeFile(path.join(cwd, 'plan', 'steps.json'), '[]');
    const report = await runDiffReview({ cwd });
    expect(report.files).toEqual([]);
    expect(report.added).toBe(0);
    expect(report.removed).toBe(0);
  });
});
