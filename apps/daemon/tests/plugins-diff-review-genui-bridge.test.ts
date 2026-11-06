// Phase 8 entry slice — diff-review GenUI bridge.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  applyDiffReviewDecisionToCwd,
  isDiffReviewSurfaceId,
  parseDiffReviewGenuiResponse,
} from '../src/plugins/atoms/diff-review-genui-bridge.js';

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(path.join(os.tmpdir(), 'od-diff-review-bridge-'));
  await mkdir(path.join(cwd, 'plan', 'receipts'), { recursive: true });
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

async function seedReceipts() {
  await writeFile(
    path.join(cwd, 'plan', 'steps.json'),
    JSON.stringify([
      { id: 'rewrite-button', files: [], rationale: '', risk: 'low', status: 'completed' },
    ], null, 2),
  );
  await writeFile(
    path.join(cwd, 'plan', 'receipts', 'step-rewrite-button.json'),
    JSON.stringify({
      step: 'rewrite-button',
      files: ['Button.tsx', 'Button.css'],
      added: 1,
      removed: 1,
      rationale: '',
      completedAt: new Date().toISOString(),
    }, null, 2),
  );
}

describe('isDiffReviewSurfaceId', () => {
  it('matches the auto-derived prefix', () => {
    expect(isDiffReviewSurfaceId('__auto_diff_review_review')).toBe(true);
    expect(isDiffReviewSurfaceId('__auto_diff_review_verify')).toBe(true);
  });
  it('rejects unrelated ids', () => {
    expect(isDiffReviewSurfaceId('__auto_connector_slack')).toBe(false);
    expect(isDiffReviewSurfaceId('plugin-declared-surface')).toBe(false);
    expect(isDiffReviewSurfaceId('')).toBe(false);
  });
});

describe('parseDiffReviewGenuiResponse', () => {
  it('accepts a well-shaped accept payload', () => {
    const out = parseDiffReviewGenuiResponse({
      decision: 'accept',
      accepted_files: ['x.ts'],
      rejected_files: [],
    });
    expect('error' in out).toBe(false);
    if (!('error' in out)) {
      expect(out.decision).toBe('accept');
      expect(out.accepted_files).toEqual(['x.ts']);
    }
  });

  it("forwards the optional 'reason' field when non-empty", () => {
    const out = parseDiffReviewGenuiResponse({
      decision: 'reject',
      reason: 'looks wrong',
    });
    if ('error' in out) throw new Error(out.error);
    expect(out.reason).toBe('looks wrong');
  });

  it('strips non-string entries from the file lists', () => {
    const out = parseDiffReviewGenuiResponse({
      decision: 'partial',
      accepted_files: ['x.ts', 42, null],
      rejected_files: ['y.ts'],
    });
    if ('error' in out) throw new Error(out.error);
    expect(out.accepted_files).toEqual(['x.ts']);
  });

  it('rejects non-object payloads', () => {
    const a = parseDiffReviewGenuiResponse(null);
    expect('error' in a).toBe(true);
    const b = parseDiffReviewGenuiResponse('accept');
    expect('error' in b).toBe(true);
  });

  it('rejects unknown decision values', () => {
    const out = parseDiffReviewGenuiResponse({ decision: 'maybe' });
    expect('error' in out).toBe(true);
  });
});

describe('applyDiffReviewDecisionToCwd', () => {
  it('writes review/decision.json end-to-end on accept', async () => {
    await seedReceipts();
    const result = await applyDiffReviewDecisionToCwd({
      cwd,
      reviewer: 'user',
      value: { decision: 'accept' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.decision?.decision).toBe('accept');
      expect(result.report.decision?.reviewer).toBe('user');
      expect(result.report.decision?.accepted_files).toEqual(['Button.css', 'Button.tsx']);
    }
    const decision = JSON.parse(await readFile(path.join(cwd, 'review', 'decision.json'), 'utf8'));
    expect(decision.decision).toBe('accept');
    expect(decision.accepted_files).toEqual(['Button.css', 'Button.tsx']);
  });

  it('forwards reason + reviewer=agent when respondedBy=agent', async () => {
    await seedReceipts();
    const result = await applyDiffReviewDecisionToCwd({
      cwd,
      reviewer: 'agent',
      value: { decision: 'reject', reason: 'auto-revert' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.decision?.decision).toBe('reject');
      expect(result.report.decision?.reviewer).toBe('agent');
      expect(result.report.decision?.reason).toBe('auto-revert');
    }
  });

  it('returns ok=false on a partial decision missing some files', async () => {
    await seedReceipts();
    const result = await applyDiffReviewDecisionToCwd({
      cwd,
      reviewer: 'user',
      value: {
        decision: 'partial',
        accepted_files: ['Button.tsx'],
        rejected_files: [],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/missing Button\.css/);
  });

  it('returns ok=false on malformed value WITHOUT touching disk', async () => {
    await seedReceipts();
    const result = await applyDiffReviewDecisionToCwd({
      cwd,
      reviewer: 'user',
      value: { decision: 'maybe' },
    });
    expect(result.ok).toBe(false);
    await expect(readFile(path.join(cwd, 'review', 'decision.json'), 'utf8'))
      .rejects.toThrow();
  });
});
