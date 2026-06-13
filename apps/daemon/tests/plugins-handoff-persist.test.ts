// Phase 8 entry slice — runAndPersistHandoff() round-trip + auto-bridge.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ArtifactManifest } from '@open-design/contracts';
import { runAndPersistHandoff } from '../src/plugins/atoms/handoff.js';
import { applyDiffReviewDecisionToCwd } from '../src/plugins/atoms/diff-review-genui-bridge.js';

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(path.join(os.tmpdir(), 'od-handoff-persist-'));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

async function writeDecision(decision: 'accept' | 'reject' | 'partial') {
  await mkdir(path.join(cwd, 'review'), { recursive: true });
  await writeFile(
    path.join(cwd, 'review', 'decision.json'),
    JSON.stringify({ decision, accepted_files: [], rejected_files: [], reviewer: 'user', decidedAt: new Date().toISOString() }),
  );
}

async function writeBuildTest(buildPassing: boolean, testsPassing: boolean) {
  await mkdir(path.join(cwd, 'critique'), { recursive: true });
  await writeFile(
    path.join(cwd, 'critique', 'build-test.json'),
    JSON.stringify({
      signals: {
        'build.passing': buildPassing,
        'tests.passing': testsPassing,
        'critique.score': buildPassing && testsPassing ? 5 : 1,
      },
    }),
  );
}

async function writeReceipts() {
  await mkdir(path.join(cwd, 'plan', 'receipts'), { recursive: true });
  await writeFile(
    path.join(cwd, 'plan', 'steps.json'),
    JSON.stringify([
      { id: 'rewrite-button', files: [], rationale: '', risk: 'low', status: 'completed' },
    ]),
  );
  await writeFile(
    path.join(cwd, 'plan', 'receipts', 'step-rewrite-button.json'),
    JSON.stringify({
      step: 'rewrite-button',
      files: ['Button.tsx'],
      added: 1, removed: 1,
      rationale: '',
      completedAt: new Date().toISOString(),
    }),
  );
}

describe('runAndPersistHandoff', () => {
  it('creates handoff/manifest.json from the seed when no manifest exists', async () => {
    await writeDecision('accept');
    const result = await runAndPersistHandoff({
      cwd,
      manifestSeed: {
        version: 1, kind: 'react-component', title: 'Button',
        entry: 'Button.tsx', renderer: 'react-component', exports: [],
      },
    });
    expect(result.persistMode).toBe('created');
    expect(result.manifest.handoffKind).toBe('implementation-plan');
    const onDisk = JSON.parse(await readFile(result.manifestPath, 'utf8'));
    expect(onDisk.handoffKind).toBe('implementation-plan');
  });

  it('round-trips an existing manifest + advances handoffKind monotonically', async () => {
    await writeDecision('accept');
    const initial: ArtifactManifest = {
      version: 1, kind: 'react-component', title: 'Button',
      entry: 'Button.tsx', renderer: 'react-component', exports: [],
      handoffKind: 'design-only',
    };
    await mkdir(path.join(cwd, 'handoff'), { recursive: true });
    await writeFile(path.join(cwd, 'handoff', 'manifest.json'), JSON.stringify(initial));

    const a = await runAndPersistHandoff({ cwd });
    expect(a.persistMode).toBe('updated');
    expect(a.manifest.handoffKind).toBe('implementation-plan');

    // Re-run is a no-op (the inputs didn't change).
    const b = await runAndPersistHandoff({ cwd });
    expect(b.persistMode).toBe('skipped');
    expect(b.manifest.handoffKind).toBe('implementation-plan');
  });

  it('promotes to deployable-app when build/test signals + docker export combine', async () => {
    await writeDecision('accept');
    await writeBuildTest(true, true);
    const result = await runAndPersistHandoff({
      cwd,
      manifestSeed: {
        version: 1, kind: 'react-component', title: 'Button',
        entry: 'Button.tsx', renderer: 'react-component', exports: [],
      },
      exportTarget: { surface: 'docker', target: 'ghcr.io/od/x:1', exportedAt: 1 },
    });
    expect(result.manifest.handoffKind).toBe('deployable-app');
    expect(result.signals.deployable).toBe(true);
  });
});

describe('applyDiffReviewDecisionToCwd \u2192 auto-handoff bridge', () => {
  it('writes BOTH review/decision.json AND handoff/manifest.json on accept', async () => {
    await writeReceipts();
    const result = await applyDiffReviewDecisionToCwd({
      cwd,
      reviewer: 'user',
      value: { decision: 'accept' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.decision?.decision).toBe('accept');
      expect(result.handoff?.manifest.handoffKind).toBe('implementation-plan');
      expect(result.handoff?.persistMode).toBe('created');
    }
    const onDisk = JSON.parse(await readFile(path.join(cwd, 'handoff', 'manifest.json'), 'utf8'));
    expect(onDisk.handoffKind).toBe('implementation-plan');
  });

  it('forwards build-test signals through into the auto-handoff manifest', async () => {
    await writeReceipts();
    await writeBuildTest(true, true);
    const result = await applyDiffReviewDecisionToCwd({
      cwd,
      reviewer: 'user',
      value: { decision: 'accept' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Without a docker/cli export target the rung tops out at 'patch'.
      expect(result.handoff?.manifest.handoffKind).toBe('patch');
      expect(result.handoff?.signals.buildPassing).toBe(true);
      expect(result.handoff?.signals.testsPassing).toBe(true);
    }
  });

  it("a 'reject' decision auto-stamps handoffKind='design-only'", async () => {
    await writeReceipts();
    const result = await applyDiffReviewDecisionToCwd({
      cwd,
      reviewer: 'user',
      value: { decision: 'reject' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.handoff?.manifest.handoffKind).toBe('design-only');
    }
  });
});
