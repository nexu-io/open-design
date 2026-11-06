// Phase 8 entry slice — runHandoffAtom() pipeline-driven bridge.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ArtifactManifest, ArtifactExportTarget } from '@open-design/contracts';
import { runHandoffAtom } from '../src/plugins/atoms/handoff.js';

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(path.join(os.tmpdir(), 'od-handoff-pipeline-'));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

const baseManifest = (over: Partial<ArtifactManifest> = {}): ArtifactManifest => ({
  version:  1,
  kind:     'react-component',
  title:    'Patch artifact',
  entry:    'index.tsx',
  renderer: 'react-component',
  exports:  [],
  ...over,
});

async function writeBuildTestReport(buildPassing: boolean, testsPassing: boolean) {
  await mkdir(path.join(cwd, 'critique'), { recursive: true });
  await writeFile(
    path.join(cwd, 'critique', 'build-test.json'),
    JSON.stringify({
      build: { status: buildPassing ? 'passing' : 'failing' },
      tests: { status: testsPassing ? 'passing' : 'failing' },
      signals: {
        'build.passing': buildPassing,
        'tests.passing': testsPassing,
        'critique.score': buildPassing && testsPassing ? 5 : 1,
      },
    }, null, 2),
  );
}

async function writeDecision(decision: 'accept' | 'reject' | 'partial') {
  await mkdir(path.join(cwd, 'review'), { recursive: true });
  await writeFile(
    path.join(cwd, 'review', 'decision.json'),
    JSON.stringify({ decision, accepted_files: [], rejected_files: [], reviewer: 'user', decidedAt: new Date().toISOString() }),
  );
}

describe('runHandoffAtom — promotion ladder', () => {
  it("decision='reject' \u2192 handoffKind='design-only'", async () => {
    await writeDecision('reject');
    const out = await runHandoffAtom({ cwd, manifest: baseManifest() });
    expect(out.manifest.handoffKind).toBe('design-only');
    expect(out.signals.decision).toBe('reject');
  });

  it("decision='accept' without build-test \u2192 handoffKind='implementation-plan'", async () => {
    await writeDecision('accept');
    const out = await runHandoffAtom({ cwd, manifest: baseManifest() });
    expect(out.manifest.handoffKind).toBe('implementation-plan');
  });

  it("decision='accept' + build.passing OR tests.passing \u2192 'patch'", async () => {
    await writeDecision('accept');
    await writeBuildTestReport(true, false);
    const a = await runHandoffAtom({ cwd, manifest: baseManifest() });
    expect(a.manifest.handoffKind).toBe('patch');

    await writeBuildTestReport(false, true);
    const b = await runHandoffAtom({ cwd, manifest: baseManifest() });
    expect(b.manifest.handoffKind).toBe('patch');
  });

  it("decision='accept' + both signals + docker exportTarget \u2192 'deployable-app'", async () => {
    await writeDecision('accept');
    await writeBuildTestReport(true, true);
    const exportTarget: ArtifactExportTarget = { surface: 'docker', target: 'ghcr.io/od/x:1', exportedAt: 1 };
    const out = await runHandoffAtom({ cwd, manifest: baseManifest(), exportTarget });
    expect(out.manifest.handoffKind).toBe('deployable-app');
    expect(out.signals.deployable).toBe(true);
    expect(out.manifest.exportTargets).toEqual([exportTarget]);
  });

  it("decision='accept' + both signals WITHOUT docker/cli export \u2192 stays 'patch'", async () => {
    await writeDecision('accept');
    await writeBuildTestReport(true, true);
    const out = await runHandoffAtom({
      cwd,
      manifest: baseManifest(),
      exportTarget: { surface: 'figma', target: 'file/abc', exportedAt: 2 },
    });
    expect(out.manifest.handoffKind).toBe('patch');
    expect(out.signals.deployable).toBe(false);
  });

  it('partial decision behaves like accept on the promotion ladder', async () => {
    await writeDecision('partial');
    await writeBuildTestReport(true, true);
    const out = await runHandoffAtom({
      cwd,
      manifest: baseManifest(),
      exportTarget: { surface: 'cli', target: '/tmp/out', exportedAt: 3 },
    });
    expect(out.manifest.handoffKind).toBe('deployable-app');
  });

  it('no decision file \u2192 leaves handoffKind alone', async () => {
    const out = await runHandoffAtom({ cwd, manifest: baseManifest({ handoffKind: 'patch' }) });
    expect(out.manifest.handoffKind).toBe('patch');
  });
});

describe('runHandoffAtom — append-only contract', () => {
  it('preserves existing exportTargets[] + appends without duplicates', async () => {
    await writeDecision('accept');
    const incoming: ArtifactExportTarget = { surface: 'cli', target: '/p/a.html', exportedAt: 1 };
    const initial = baseManifest({
      exportTargets: [{ surface: 'docker', target: 'ghcr.io/od/x:1', exportedAt: 0 }],
    });
    const a = await runHandoffAtom({ cwd, manifest: initial, exportTarget: incoming });
    expect(a.manifest.exportTargets).toEqual([
      { surface: 'docker', target: 'ghcr.io/od/x:1', exportedAt: 0 },
      incoming,
    ]);
    // Re-record same target → no duplicate.
    const b = await runHandoffAtom({ cwd, manifest: a.manifest, exportTarget: incoming });
    expect(b.manifest.exportTargets?.length).toBe(2);
  });

  it('refuses to demote handoffKind via the monotonic invariant', async () => {
    await writeDecision('reject'); // would map to 'design-only'
    const out = await runHandoffAtom({
      cwd,
      manifest: baseManifest({ handoffKind: 'patch' }),
    });
    expect(out.manifest.handoffKind).toBe('patch');
  });
});

describe('runHandoffAtom — signals', () => {
  it('forwards parsed build/test signals when present', async () => {
    await writeDecision('accept');
    await writeBuildTestReport(true, false);
    const out = await runHandoffAtom({ cwd, manifest: baseManifest() });
    expect(out.signals).toMatchObject({
      decision:     'accept',
      buildPassing: true,
      testsPassing: false,
      deployable:   false,
    });
  });
});
