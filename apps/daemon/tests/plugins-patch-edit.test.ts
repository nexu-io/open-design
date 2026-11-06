// Phase 7 entry slice — patch-edit atom impl.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  applyPatchForStep,
  readPlanProgress,
  skipStep,
} from '../src/plugins/atoms/patch-edit.js';

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(path.join(os.tmpdir(), 'od-patch-edit-'));
  await mkdir(path.join(cwd, 'plan'), { recursive: true });
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

async function seedPlan(steps: Array<Record<string, unknown>>, ownership: Array<{ file: string; layer: string }> = []) {
  await writeFile(path.join(cwd, 'plan', 'steps.json'), JSON.stringify(steps, null, 2) + '\n');
  await writeFile(path.join(cwd, 'plan', 'ownership.json'), JSON.stringify(ownership, null, 2) + '\n');
}

describe('applyPatchForStep — happy paths', () => {
  it('applies a single-file edit + records the receipt', async () => {
    await seedPlan([
      { id: 'rewrite-button', files: ['Button.tsx'], rationale: '', risk: 'low', status: 'pending' },
    ]);
    await writeFile(path.join(cwd, 'Button.tsx'),
      `export const Button = () => {\n  return <button>old</button>;\n};\n`);
    const diff = `--- a/Button.tsx
+++ b/Button.tsx
@@ -1,3 +1,3 @@
 export const Button = () => {
-  return <button>old</button>;
+  return <button>NEW</button>;
 };
`;
    const result = await applyPatchForStep({
      cwd,
      stepId: 'rewrite-button',
      diff,
      rationale: 'tighten copy',
    });
    expect(result.status).toBe('completed');
    expect(result.filesTouched).toEqual(['Button.tsx']);
    expect(result.added).toBe(1);
    expect(result.removed).toBe(1);
    const updated = await readFile(path.join(cwd, 'Button.tsx'), 'utf8');
    expect(updated).toContain('NEW');
    const receipt = JSON.parse(await readFile(path.join(cwd, 'plan', 'receipts', 'step-rewrite-button.json'), 'utf8'));
    expect(receipt.rationale).toBe('tighten copy');
    expect(receipt.added).toBe(1);
    const steps = JSON.parse(await readFile(path.join(cwd, 'plan', 'steps.json'), 'utf8'));
    expect(steps[0].status).toBe('completed');
  });

  it('creates a new file when the source is /dev/null and the path is in step.files[]', async () => {
    await seedPlan([
      { id: 'add-config', files: ['config/feature-flags.ts'], rationale: '', risk: 'low', status: 'pending' },
    ]);
    const diff = `--- /dev/null
+++ b/config/feature-flags.ts
@@ -0,0 +1,3 @@
+export const flags = {
+  newButton: true,
+};
`;
    const result = await applyPatchForStep({ cwd, stepId: 'add-config', diff });
    expect(result.status).toBe('completed');
    const created = await readFile(path.join(cwd, 'config', 'feature-flags.ts'), 'utf8');
    expect(created).toContain('newButton: true');
  });

  it('deletes a file when the target is /dev/null', async () => {
    await seedPlan([
      { id: 'remove-old', files: ['old.ts'], rationale: '', risk: 'low', status: 'pending' },
    ]);
    await writeFile(path.join(cwd, 'old.ts'), 'export const x = 1;\n');
    const diff = `--- a/old.ts
+++ /dev/null
@@ -1,1 +0,0 @@
-export const x = 1;
`;
    const result = await applyPatchForStep({ cwd, stepId: 'remove-old', diff });
    expect(result.status).toBe('completed');
    await expect(readFile(path.join(cwd, 'old.ts'), 'utf8')).rejects.toThrow();
  });
});

describe('applyPatchForStep — safety guards', () => {
  it('refuses a hunk whose target is not in step.files[]', async () => {
    await seedPlan([
      { id: 'rewrite-button', files: ['Button.tsx'], rationale: '', risk: 'low', status: 'pending' },
    ]);
    await writeFile(path.join(cwd, 'Other.tsx'), 'export const X = 1;\n');
    const diff = `--- a/Other.tsx
+++ b/Other.tsx
@@ -1,1 +1,1 @@
-export const X = 1;
+export const X = 2;
`;
    const result = await applyPatchForStep({ cwd, stepId: 'rewrite-button', diff });
    expect(result.status).toBe('failed');
    expect(result.reason).toMatch(/not in step\.files\[\]/);
    // Verify no mutation happened.
    expect(await readFile(path.join(cwd, 'Other.tsx'), 'utf8')).toBe('export const X = 1;\n');
  });

  it('refuses to touch a shell-tier file when step.risk !== high', async () => {
    await seedPlan(
      [{ id: 'tweak-layout', files: ['app/layout.tsx'], rationale: '', risk: 'low', status: 'pending' }],
      [{ file: 'app/layout.tsx', layer: 'shell' }],
    );
    await mkdir(path.join(cwd, 'app'), { recursive: true });
    await writeFile(path.join(cwd, 'app', 'layout.tsx'),
      `export default function Layout() { return null; }\n`);
    const diff = `--- a/app/layout.tsx
+++ b/app/layout.tsx
@@ -1,1 +1,1 @@
-export default function Layout() { return null; }
+export default function Layout() { return <div />; }
`;
    const result = await applyPatchForStep({ cwd, stepId: 'tweak-layout', diff });
    expect(result.status).toBe('failed');
    expect(result.reason).toMatch(/may not touch shell-tier/);
  });

  it('refuses path-traversal targets', async () => {
    await seedPlan([
      { id: 'naughty', files: ['../escape.ts'], rationale: '', risk: 'low', status: 'pending' },
    ]);
    const diff = `--- /dev/null
+++ b/../escape.ts
@@ -0,0 +1,1 @@
+x
`;
    const result = await applyPatchForStep({ cwd, stepId: 'naughty', diff });
    expect(result.status).toBe('failed');
    expect(result.reason).toMatch(/unsafe path/);
  });

  it('refuses Windows absolute targets', async () => {
    await seedPlan([
      { id: 'naughty', files: ['C:/escape.ts'], rationale: '', risk: 'low', status: 'pending' },
    ]);
    const diff = `--- /dev/null
+++ b/C:/escape.ts
@@ -0,0 +1,1 @@
+x
`;
    const result = await applyPatchForStep({ cwd, stepId: 'naughty', diff });
    expect(result.status).toBe('failed');
    expect(result.reason).toMatch(/unsafe path/);
  });

  it('rejects context mismatches (stale patch detection)', async () => {
    await seedPlan([
      { id: 'rewrite-x', files: ['x.ts'], rationale: '', risk: 'low', status: 'pending' },
    ]);
    await writeFile(path.join(cwd, 'x.ts'), 'line one\nline two\nline three\n');
    const staleDiff = `--- a/x.ts
+++ b/x.ts
@@ -1,3 +1,3 @@
 different one
-line two
+line TWO
 line three
`;
    const result = await applyPatchForStep({ cwd, stepId: 'rewrite-x', diff: staleDiff });
    expect(result.status).toBe('failed');
    expect(result.reason).toMatch(/context mismatch/);
    // Original content preserved on rejection.
    expect(await readFile(path.join(cwd, 'x.ts'), 'utf8')).toBe('line one\nline two\nline three\n');
  });

  it('returns idempotent result when called on an already-completed step', async () => {
    await seedPlan([
      { id: 'done', files: ['x.ts'], rationale: '', risk: 'low', status: 'completed' },
    ]);
    const r = await applyPatchForStep({ cwd, stepId: 'done', diff: '--- a/x.ts\n+++ b/x.ts\n@@ -0,0 +0,0 @@\n' });
    expect(r.status).toBe('completed');
    expect(r.reason).toMatch(/already in terminal state/);
  });
});

describe('skipStep + readPlanProgress', () => {
  it('marks a step skipped + writes a receipt', async () => {
    await seedPlan([
      { id: 'maybe', files: ['x.ts'], rationale: '', risk: 'low', status: 'pending' },
      { id: 'next',  files: ['y.ts'], rationale: '', risk: 'low', status: 'pending' },
    ]);
    await skipStep({ cwd, stepId: 'maybe', rationale: 'no longer needed after token alignment' });
    const steps = JSON.parse(await readFile(path.join(cwd, 'plan', 'steps.json'), 'utf8'));
    expect(steps.find((s: { id: string }) => s.id === 'maybe').status).toBe('skipped');
    const receipt = JSON.parse(await readFile(path.join(cwd, 'plan', 'receipts', 'step-maybe.json'), 'utf8'));
    expect(receipt.rationale).toMatch(/token alignment/);
  });

  it('readPlanProgress reports total + terminal counts', async () => {
    await seedPlan([
      { id: 'a', files: [], rationale: '', risk: 'low', status: 'pending' },
      { id: 'b', files: [], rationale: '', risk: 'low', status: 'completed' },
      { id: 'c', files: [], rationale: '', risk: 'low', status: 'skipped' },
    ]);
    const p = await readPlanProgress(cwd);
    expect(p).toEqual({ total: 3, terminal: 2 });
  });
});
