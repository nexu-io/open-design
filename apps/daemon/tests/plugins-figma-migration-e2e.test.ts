// Plan §3.T2 / spec §1 / §10 / §21.3.1 — figma-migration pipeline e2e.
//
// Walks every Phase 6 atom impl in sequence on a Figma fixture
// without going to the network:
//
//   figma-extract  \u2192 figma/{tree.json, tokens.json, meta.json}
//                    via a stubbed Figma REST response.
//   token-map      \u2192 token-map/colors.json + unmatched.json
//                    against a fixture design system.
//   diff-review    \u2192 review/decision.json (accept).
//   handoff        \u2192 handoff/manifest.json with the right
//                    handoffKind from the promotion ladder.
//
// The figma-migration scenario doesn't go through patch-edit /
// build-test (that's the code-migration shape). The smoke test is
// therefore shorter than the code-migration one but exercises the
// network-bound figma-extract path with the same fetch stub the
// asset-rasterisation tests use.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ArtifactManifest } from '@open-design/contracts';
import { runFigmaExtract } from '../src/plugins/atoms/figma-extract.js';
import { runTokenMap, type DesignSystemTokenBag } from '../src/plugins/atoms/token-map.js';
import { runDiffReview } from '../src/plugins/atoms/diff-review.js';
import { runAndPersistHandoff } from '../src/plugins/atoms/handoff.js';

let cwd: string;

const designSystem: DesignSystemTokenBag = {
  id: 'fixture-ds',
  tokens: [
    { name: '--ds-color-primary', value: '#5b8def', kind: 'color' },
    { name: '--ds-color-fg',      value: '#111111', kind: 'color' },
  ],
};

const figmaFixture = {
  document: {
    id: '0:0', name: 'Document', type: 'DOCUMENT',
    children: [{
      id: '1:1', name: 'Page', type: 'CANVAS',
      children: [{
        id: '2:1', name: 'Hero', type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: 1280, height: 720 },
        fills: [{ type: 'SOLID', color: { r: 0.357, g: 0.553, b: 0.937 } }],
        children: [{
          id: '3:1', name: 'Title', type: 'TEXT',
          characters: 'Hello world',
          absoluteBoundingBox: { x: 24, y: 24, width: 200, height: 48 },
          fills: [{ type: 'SOLID', color: { r: 0.067, g: 0.067, b: 0.067 } }],
        }],
      }],
    }],
  },
  version: '1234',
  lastModified: '2026-05-09T00:00:00Z',
};

const stubFetch = (response: { ok?: boolean; body?: unknown }) =>
  vi.fn(async () => ({
    ok:         response.ok ?? true,
    status:     200,
    statusText: 'OK',
    headers:    { get: () => null },
    json:       async () => response.body ?? {},
    text:       async () => '',
  } as unknown as Response));

beforeEach(async () => {
  cwd = await mkdtemp(path.join(os.tmpdir(), 'od-figma-pipeline-e2e-'));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe('figma-migration pipeline — full atom chain', () => {
  it('runs figma-extract \u2192 token-map \u2192 diff-review \u2192 handoff end-to-end', async () => {
    // 1. figma-extract.
    const fetchFn = stubFetch({ body: figmaFixture });
    const figReport = await runFigmaExtract({
      cwd,
      fileUrl: 'https://figma.com/file/ABC123/x',
      token:   'tok',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(figReport.tree.length).toBeGreaterThan(0);
    expect(figReport.meta.fileKey).toBe('ABC123');
    const colors = figReport.tokens.colors.map((t) => t.value);
    expect(colors).toEqual(expect.arrayContaining(['#5b8def', '#111111']));

    // 2. token-map. Reads <cwd>/figma/tokens.json since
    //    code/tokens.json doesn't exist.
    const mapping = await runTokenMap({ cwd, designSystem });
    expect(mapping.meta.sourceKind).toBe('figma');
    const targets = mapping.colors.map((c) => c.target);
    expect(targets).toEqual(expect.arrayContaining(['--ds-color-primary', '--ds-color-fg']));

    // 3. diff-review. The figma flow doesn't have patch-edit
    //    receipts but diff-review still emits the artefacts (with
    //    empty file lists / 0 lines).
    const review = await runDiffReview({
      cwd,
      decision: { decision: 'accept', reviewer: 'user' },
    });
    expect(review.decision?.decision).toBe('accept');
    expect(review.files).toEqual([]);

    // 4. handoff. Without build-test the rung tops out at
    //    'implementation-plan'.
    const seed: ArtifactManifest = {
      version:  1,
      kind:     'html',
      title:    'Hero from Figma',
      entry:    'index.html',
      renderer: 'html',
      exports:  [],
    };
    const handoff = await runAndPersistHandoff({
      cwd,
      manifestSeed: seed,
      exportTarget: { surface: 'figma', target: 'file/ABC123', exportedAt: 1 },
    });
    expect(handoff.manifest.handoffKind).toBe('implementation-plan');
    expect(handoff.signals.deployable).toBe(false);

    // Verify the figma export target landed on the manifest.
    expect(handoff.manifest.exportTargets?.[0]?.surface).toBe('figma');

    // Verify on-disk files match the expectation.
    const onDiskMeta = JSON.parse(await readFile(path.join(cwd, 'figma', 'meta.json'), 'utf8'));
    expect(onDiskMeta.fileKey).toBe('ABC123');
    const onDiskMapping = JSON.parse(await readFile(path.join(cwd, 'token-map', 'colors.json'), 'utf8'));
    expect(onDiskMapping.length).toBeGreaterThan(0);
    const onDiskHandoff = JSON.parse(await readFile(path.join(cwd, 'handoff', 'manifest.json'), 'utf8'));
    expect(onDiskHandoff.handoffKind).toBe('implementation-plan');
  });

  it('reject decision \u2192 design-only on figma flow', async () => {
    const fetchFn = stubFetch({ body: figmaFixture });
    await runFigmaExtract({
      cwd, fileUrl: 'https://figma.com/file/ABC123/x', token: 'tok',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await runTokenMap({ cwd, designSystem });
    await runDiffReview({ cwd, decision: { decision: 'reject', reviewer: 'user' } });
    const seed: ArtifactManifest = {
      version: 1, kind: 'html', title: 'X', entry: 'x.html',
      renderer: 'html', exports: [],
    };
    const handoff = await runAndPersistHandoff({ cwd, manifestSeed: seed });
    expect(handoff.manifest.handoffKind).toBe('design-only');
  });

  it('crosses the bundled-scenario fallback line cleanly: a figma-migration plugin without a pipeline still resolves', async () => {
    // This is a property assertion; no atoms run here. The
    // bundled-scenario fallback resolver (O1) wires the canonical
    // figma-migration pipeline whenever a consumer plugin omits
    // od.pipeline + has taskKind='figma-migration'. The smoke test
    // for the resolver lives in plugins-scenario-fallback; this
    // case just locks the scenario folder still ships the canonical
    // stage list so the resolver has something to copy.
    const scenariosRoot = path.resolve(__dirname, '../../..', 'plugins', '_official', 'scenarios', 'od-figma-migration', 'open-design.json');
    const manifest = JSON.parse(await readFile(scenariosRoot, 'utf8'));
    expect(manifest.od.pipeline.stages.map((s: { id: string }) => s.id)).toEqual([
      'extract', 'tokens', 'generate', 'critique',
    ]);
  });
});
