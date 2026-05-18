// Plan §3.Z1 — patch-edit atomic file writes.
//
// Asserts the safety contract: a patch apply that crashes mid-
// write must NOT leave the source file truncated. The applier
// writes to a sibling tmpfile + renames into place, so a crash
// between writeFile and rename leaves the original intact.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyPatchForStep } from '../src/plugins/atoms/patch-edit.js';

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(path.join(os.tmpdir(), 'od-patch-atomic-'));
  await mkdir(path.join(cwd, 'plan'), { recursive: true });
  await writeFile(
    path.join(cwd, 'plan', 'steps.json'),
    JSON.stringify([
      { id: 'rewrite-x', files: ['x.ts'], rationale: '', risk: 'low', status: 'pending' },
    ], null, 2),
  );
  await writeFile(path.join(cwd, 'plan', 'ownership.json'), '[]');
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe('applyPatchForStep — atomic file writes', () => {
  it('does NOT leave a stray .tmp blob beside the target after a successful edit', async () => {
    await writeFile(path.join(cwd, 'x.ts'), 'line one\nline two\nline three\n');
    const diff = `--- a/x.ts
+++ b/x.ts
@@ -1,3 +1,3 @@
 line one
-line two
+line TWO
 line three
`;
    const result = await applyPatchForStep({ cwd, stepId: 'rewrite-x', diff });
    expect(result.status).toBe('completed');
    const entries = await readdir(cwd);
    // Only x.ts and the plan dir should be present; no .tmp leftovers.
    const tmpish = entries.filter((n) => n.includes('.tmp'));
    expect(tmpish).toEqual([]);
    const updated = await readFile(path.join(cwd, 'x.ts'), 'utf8');
    expect(updated).toBe('line one\nline TWO\nline three\n');
  });

  it('preserves the original file byte-equal when the apply rejects on context mismatch', async () => {
    const original = 'line one\nline two\nline three\n';
    await writeFile(path.join(cwd, 'x.ts'), original);
    const stale = `--- a/x.ts
+++ b/x.ts
@@ -1,3 +1,3 @@
 different one
-line two
+line TWO
 line three
`;
    const result = await applyPatchForStep({ cwd, stepId: 'rewrite-x', diff: stale });
    expect(result.status).toBe('failed');
    expect(result.reason).toMatch(/context mismatch/);
    // The original must be byte-equal — no atomic-write artefact
    // partially overwrote it.
    expect(await readFile(path.join(cwd, 'x.ts'), 'utf8')).toBe(original);
    // No .tmp leftover from the rejected attempt.
    const entries = await readdir(cwd);
    expect(entries.filter((n) => n.includes('.tmp'))).toEqual([]);
  });

  it('cleans up plan/steps.json + receipt without leaving .tmp siblings', async () => {
    await writeFile(path.join(cwd, 'x.ts'), 'a\n');
    const diff = `--- a/x.ts
+++ b/x.ts
@@ -1,1 +1,1 @@
-a
+b
`;
    await applyPatchForStep({ cwd, stepId: 'rewrite-x', diff });
    const planEntries = await readdir(path.join(cwd, 'plan'));
    expect(planEntries.filter((n) => n.includes('.tmp'))).toEqual([]);
    const receiptEntries = await readdir(path.join(cwd, 'plan', 'receipts'));
    expect(receiptEntries.filter((n) => n.includes('.tmp'))).toEqual([]);
  });
});
