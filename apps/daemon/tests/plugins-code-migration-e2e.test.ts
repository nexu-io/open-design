// Plan §3.S2 / spec §1 / §10 / §20.3 / §21.3.2 — code-migration pipeline e2e.
//
// Exercises every Phase 6/7/8 atom impl in sequence on a Next.js
// fixture repo:
//
//   code-import   → code/index.json
//   design-extract → code/tokens.json
//   token-map     → token-map/{colors,...}.json + unmatched.json
//   rewrite-plan  → plan/{plan.md, ownership.json, steps.json, meta.json}
//   patch-edit    → mutates Button.tsx via a unified diff +
//                    plan/receipts/step-rewrite-button.json
//   build-test    → critique/build-test.json (skipped commands; passes)
//   diff-review   → review/{diff.patch, summary.md, decision.json, meta.json}
//   handoff       → ArtifactManifest with handoffKind='patch'
//
// The test does NOT run an actual `pnpm typecheck` / `pnpm test` —
// we pass `'true'` as the build/test command so the runner just
// records the no-op exit-0 receipt. The point is the pipe shape:
// every atom reads what the previous atom wrote, the audit trail
// chains through.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ArtifactManifest } from '@open-design/contracts';
import { runCodeImport } from '../src/plugins/atoms/code-import.js';
import { runDesignExtract } from '../src/plugins/atoms/design-extract.js';
import { runTokenMap, type DesignSystemTokenBag } from '../src/plugins/atoms/token-map.js';
import { runRewritePlan } from '../src/plugins/atoms/rewrite-plan.js';
import { applyPatchForStep } from '../src/plugins/atoms/patch-edit.js';
import { runBuildTest, writeBuildTestReport } from '../src/plugins/atoms/build-test.js';
import { runDiffReview } from '../src/plugins/atoms/diff-review.js';
import { runHandoffAtom } from '../src/plugins/atoms/handoff.js';

let repo: string;
let cwd: string;

const designSystem: DesignSystemTokenBag = {
  id: 'fixture-ds',
  tokens: [
    { name: '--ds-color-primary', value: '#5b8def', kind: 'color' },
    { name: '--ds-spacing-2',      value: '16px',    kind: 'spacing' },
  ],
};

beforeEach(async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'od-pipeline-e2e-'));
  repo = path.join(tmp, 'repo');
  cwd  = path.join(tmp, 'cwd');
  await mkdir(repo, { recursive: true });
  await mkdir(cwd, { recursive: true });

  // Tiny Next.js fixture: one leaf component carrying inline tokens.
  await writeFile(path.join(repo, 'package.json'), JSON.stringify({
    name: 'fixture',
    dependencies: { next: '15', react: '18' },
    devDependencies: { tailwindcss: '4', typescript: '5' },
  }));
  await writeFile(path.join(repo, 'pnpm-lock.yaml'), '');
  await mkdir(path.join(repo, 'app'),       { recursive: true });
  await mkdir(path.join(repo, 'components'),{ recursive: true });
  await writeFile(path.join(repo, 'app', 'page.tsx'),
    `import Button from '@/components/Button';\nexport default function Page(){ return <Button />; }\n`);
  await writeFile(path.join(repo, 'components', 'Button.tsx'),
    `export default function Button() {\n  return <button style={{ color: '#5b8def', padding: '16px' }} />;\n}\n`);
});

afterEach(async () => {
  await rm(path.dirname(repo), { recursive: true, force: true });
});

describe('code-migration pipeline — full atom chain', () => {
  it('runs every atom in sequence and ends on a patch-tier ArtifactManifest', async () => {
    // 1. code-import.
    const importIndex = await runCodeImport({ repoPath: repo, cwd });
    expect(importIndex.framework).toBe('next');
    expect(importIndex.files.map((f) => f.path)).toContain('components/Button.tsx');

    // 2. design-extract.
    const designReport = await runDesignExtract({ cwd, repoPath: repo });
    const tokenValues = designReport.colors.map((t) => t.value);
    expect(tokenValues).toContain('#5b8def');

    // 3. token-map. design-extract picks up the inline hex but not
    //    the JSX-quoted spacing literal — that's expected, the
    //    SKILL.md fragment documents the regex's CSS-property bias.
    //    Color crosswalk is enough for this smoke chain.
    const mapping = await runTokenMap({ cwd, designSystem });
    expect(mapping.colors[0]?.target).toBe('--ds-color-primary');

    // 4. rewrite-plan.
    const plan = await runRewritePlan({ cwd, intent: 'tighten the brand' });
    const buttonStep = plan.steps.find((s) => s.id === 'rewrite-button');
    expect(buttonStep).toBeDefined();
    expect(buttonStep?.files).toContain('components/Button.tsx');
    // The build-test step is always last.
    expect(plan.steps[plan.steps.length - 1]?.id).toBe('build-test');

    // 5. patch-edit. We materialise the components/Button.tsx file
    //    inside the project cwd so the applier can read it and write
    //    the receipt back in-place. (rewrite-plan + earlier atoms
    //    only wrote planning artefacts under <cwd>.)
    await mkdir(path.join(cwd, 'components'), { recursive: true });
    await writeFile(path.join(cwd, 'components', 'Button.tsx'),
      `export default function Button() {\n  return <button style={{ color: '#5b8def', padding: '16px' }} />;\n}\n`);
    const diff = `--- a/components/Button.tsx
+++ b/components/Button.tsx
@@ -1,3 +1,3 @@
 export default function Button() {
-  return <button style={{ color: '#5b8def', padding: '16px' }} />;
+  return <button style={{ color: 'var(--ds-color-primary)', padding: 'var(--ds-spacing-2)' }} />;
 }
`;
    const patch = await applyPatchForStep({
      cwd,
      stepId: 'rewrite-button',
      diff,
      rationale: 'tokens-alignment',
    });
    expect(patch.status).toBe('completed');
    expect(patch.added).toBe(1);
    expect(patch.removed).toBe(1);
    const updated = await readFile(path.join(cwd, 'components', 'Button.tsx'), 'utf8');
    expect(updated).toContain('var(--ds-color-primary)');

    // 6. build-test (we override commands to no-ops so we don't shell
    //    out to a real toolchain in CI).
    const buildReport = await runBuildTest({
      cwd,
      buildCommand: 'true',
      testCommand:  'true',
    });
    expect(buildReport.signals['build.passing']).toBe(true);
    expect(buildReport.signals['tests.passing']).toBe(true);
    await writeBuildTestReport({ cwd, report: buildReport });

    // 7. diff-review (with explicit decision).
    const review = await runDiffReview({
      cwd,
      decision: { decision: 'accept', reviewer: 'user' },
    });
    expect(review.decision?.decision).toBe('accept');
    expect(review.added).toBe(1);
    expect(review.removed).toBe(1);
    expect(review.files).toEqual(['components/Button.tsx']);

    // 8. handoff. With accept + both build/test signals AND a 'cli'
    //    exportTarget, the manifest promotes to 'deployable-app'.
    const initialManifest: ArtifactManifest = {
      version:  1,
      kind:     'react-component',
      title:    'Button (re-tokenised)',
      entry:    'components/Button.tsx',
      renderer: 'react-component',
      exports:  [],
    };
    const handoff = await runHandoffAtom({
      cwd,
      manifest: initialManifest,
      exportTarget: { surface: 'cli', target: '/tmp/od-export', exportedAt: Date.now() },
    });
    expect(handoff.signals.decision).toBe('accept');
    expect(handoff.signals.buildPassing).toBe(true);
    expect(handoff.signals.testsPassing).toBe(true);
    expect(handoff.signals.deployable).toBe(true);
    expect(handoff.manifest.handoffKind).toBe('deployable-app');
    expect(handoff.manifest.exportTargets?.[0]?.surface).toBe('cli');
  });

  it('reject decision + missing build-test still demotes through the ladder cleanly', async () => {
    await runCodeImport({ repoPath: repo, cwd });
    await runDesignExtract({ cwd, repoPath: repo });
    await runRewritePlan({ cwd });
    // Skip patch-edit; jump straight to a 'reject' diff-review.
    await runDiffReview({
      cwd,
      decision: { decision: 'reject', reviewer: 'user', reason: 'wrong direction' },
    });
    const handoff = await runHandoffAtom({
      cwd,
      manifest: {
        version: 1, kind: 'react-component', title: 'X', entry: 'x.tsx',
        renderer: 'react-component', exports: [],
      },
    });
    expect(handoff.manifest.handoffKind).toBe('design-only');
    expect(handoff.signals.deployable).toBe(false);
  });
});
