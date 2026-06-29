// Red spec for the core quality-stage floor (tom 问题排查).
//
// Bug: template / community plugins commonly declare a generate-only
// pipeline (`stages: [{ id: 'generate', atoms: ['file-write','live-artifact'] }]`)
// to reuse a locked reference seed. resolveAppliedPipeline returns that
// verbatim (`source: 'declared'`), so the `plan` (TodoWrite) and
// `critique` (5-dimension quality / anti-slop) stages never run. The
// colleague's symptom: using a plugin/template skipped the five-stage
// main flow — no todolist, no real anti-slop critique loop.
//
// Invariant under test: when a plugin produces a code/document design
// artifact (a `generate` stage whose atoms include `file-write` or
// `live-artifact`), the applied pipeline always carries `plan` and
// `critique` — whether the artifact came from a free-form prompt or a
// template. Pure media generation (image/video/audio) stays
// generate-only.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPlugin } from '../src/plugins/apply.js';
import type { InstalledPluginRecord, PluginManifest, PluginPipeline } from '@open-design/contracts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const REGISTRY = {
  skills: [],
  designSystems: [],
  craft: [],
  atoms: [
    { id: 'file-write', label: 'File write' },
    { id: 'live-artifact', label: 'Live artifact' },
    { id: 'todo-write', label: 'Todo write' },
    { id: 'critique-theater', label: 'Critique theater' },
    { id: 'image-generate', label: 'Image generate' },
  ],
};

function templateFixture(pipeline: PluginPipeline, taskKind = 'new-generation'): InstalledPluginRecord {
  return {
    id: 'sample-template',
    title: 'Sample Template',
    version: '1.0.0',
    sourceKind: 'local',
    source: '/tmp/sample-template',
    sourceMarketplaceId: undefined,
    pinnedRef: undefined,
    sourceDigest: undefined,
    trust: 'trusted',
    capabilitiesGranted: ['prompt:inject', 'fs:write'],
    fsPath: '/tmp/sample-template',
    installedAt: 0,
    updatedAt: 0,
    manifest: {
      name: 'sample-template',
      title: 'Sample Template',
      version: '1.0.0',
      description: 'Fixture mirroring a generate-only HTML template.',
      od: {
        kind: 'scenario',
        taskKind: taskKind as 'new-generation',
        useCase: { query: 'Build a landing page.' },
        capabilities: ['prompt:inject', 'fs:write'],
        pipeline,
      },
    },
  } as InstalledPluginRecord;
}

function stageIds(pipeline: PluginPipeline | undefined): string[] {
  return (pipeline?.stages ?? []).map((s) => s.id);
}

describe('core quality-stage floor', () => {
  it('injects plan + critique into a generate-only HTML/live-artifact template', () => {
    const plugin = templateFixture({
      stages: [{ id: 'generate', atoms: ['file-write', 'live-artifact'] }],
    });
    const { result } = applyPlugin({ plugin, inputs: {}, registry: REGISTRY });
    const ids = stageIds(result.pipeline);

    expect(ids).toContain('plan');
    expect(ids).toContain('generate');
    expect(ids).toContain('critique');
    // plan must precede generate; critique must follow it.
    expect(ids.indexOf('plan')).toBeLessThan(ids.indexOf('generate'));
    expect(ids.indexOf('critique')).toBeGreaterThan(ids.indexOf('generate'));

    const critique = result.pipeline!.stages.find((s) => s.id === 'critique');
    expect(critique?.atoms).toContain('critique-theater');
    expect(critique?.repeat).toBe(true);
    const plan = result.pipeline!.stages.find((s) => s.id === 'plan');
    expect(plan?.atoms).toContain('todo-write');
  });

  it('leaves a pure media (image) generate-only pipeline untouched', () => {
    const plugin = templateFixture({
      stages: [{ id: 'generate', atoms: ['image-generate'] }],
    });
    const { result } = applyPlugin({ plugin, inputs: {}, registry: REGISTRY });
    expect(stageIds(result.pipeline)).toEqual(['generate']);
  });

  // Regression for the blocking review: bundled media scenarios seed an
  // `example.html`, so they ship `generate: [file-write, live-artifact]`
  // — the SAME atom shape as a code artifact. The media `mode` must keep
  // them generate-only; gating on atom shape alone would wrongly rewrite
  // them to plan -> generate -> critique.
  it.each([
    ['image', 'plugins/_official/examples/image-poster/open-design.json'],
    ['video', 'plugins/_official/examples/vfx-text-cursor/open-design.json'],
    ['audio', 'plugins/_official/examples/audio-jingle/open-design.json'],
  ])('leaves the bundled %s media template generate-only despite file-write/live-artifact atoms', (mode, relPath) => {
    const manifest = JSON.parse(
      readFileSync(path.join(REPO_ROOT, relPath), 'utf8'),
    ) as PluginManifest;
    // Sanity: the shipped media template carries the code-artifact atom
    // shape, so this guards the exact false-positive class the reviewer flagged.
    expect(manifest.od?.mode).toBe(mode);
    const atoms = manifest.od?.pipeline?.stages.find((s) => s.id === 'generate')?.atoms ?? [];
    expect(atoms).toEqual(expect.arrayContaining(['file-write', 'live-artifact']));

    const plugin: InstalledPluginRecord = {
      id: manifest.name,
      title: manifest.title ?? manifest.name,
      version: manifest.version,
      sourceKind: 'bundled',
      source: `/bundled/${manifest.name}`,
      sourceMarketplaceId: undefined,
      pinnedRef: undefined,
      sourceDigest: undefined,
      trust: 'trusted',
      capabilitiesGranted: ['prompt:inject', 'fs:write'],
      fsPath: `/bundled/${manifest.name}`,
      installedAt: 0,
      updatedAt: 0,
      manifest,
    } as InstalledPluginRecord;

    const { result } = applyPlugin({ plugin, inputs: {}, registry: REGISTRY });
    expect(stageIds(result.pipeline)).toEqual(['generate']);
  });

  it('repairs the real bundled web-prototype template (generate-only on disk)', () => {
    const manifest = JSON.parse(
      readFileSync(
        path.join(REPO_ROOT, 'plugins/_official/examples/web-prototype/open-design.json'),
        'utf8',
      ),
    ) as PluginManifest;
    // Sanity: the shipped template really is generate-only — this is the
    // exact shape the screenshots' templates carry.
    expect(manifest.od?.pipeline?.stages.map((s) => s.id)).toEqual(['generate']);

    const plugin: InstalledPluginRecord = {
      id: 'web-prototype',
      title: manifest.title ?? 'web-prototype',
      version: manifest.version,
      sourceKind: 'bundled',
      source: '/bundled/web-prototype',
      sourceMarketplaceId: undefined,
      pinnedRef: undefined,
      sourceDigest: undefined,
      trust: 'trusted',
      capabilitiesGranted: ['prompt:inject', 'fs:write'],
      fsPath: '/bundled/web-prototype',
      installedAt: 0,
      updatedAt: 0,
      manifest,
    } as InstalledPluginRecord;

    const { result } = applyPlugin({ plugin, inputs: {}, registry: REGISTRY });
    const ids = stageIds(result.pipeline);
    expect(ids).toContain('plan');
    expect(ids).toContain('critique');
    expect(ids.indexOf('plan')).toBeLessThan(ids.indexOf('generate'));
    expect(ids.indexOf('critique')).toBeGreaterThan(ids.indexOf('generate'));
  });

  // Regression: critique must land immediately AFTER generate, not at the
  // end of the pipeline. A template with post-generate work
  // (generate -> handoff) would otherwise become generate -> handoff ->
  // critique, letting the downstream stage run before the quality loop.
  it('inserts critique right after generate, before any post-generate stage', () => {
    const plugin = templateFixture({
      stages: [
        { id: 'generate', atoms: ['file-write', 'live-artifact'] },
        { id: 'handoff', atoms: ['file-write'] },
      ],
    });
    const { result } = applyPlugin({ plugin, inputs: {}, registry: REGISTRY });
    const ids = stageIds(result.pipeline);
    expect(ids).toEqual(['plan', 'generate', 'critique', 'handoff']);
  });

  // Regression: a media manifest that omits `od.pipeline` falls back to
  // the new-generation scenario (the fallback keys on taskKind only,
  // ignoring mode), arriving as discovery -> plan -> generate -> critique.
  // The media guard must collapse that scenario-derived pipeline back to
  // generate-only, otherwise "pure media stays generate-only" is broken
  // for fallback-driven media plugins.
  it('collapses a scenario-fallback media pipeline back to generate-only', () => {
    const plugin: InstalledPluginRecord = {
      ...templateFixture({ stages: [] }),
      manifest: {
        name: 'media-no-pipeline',
        title: 'Media No Pipeline',
        version: '1.0.0',
        description: 'A media plugin that omits od.pipeline.',
        od: {
          kind: 'skill',
          taskKind: 'new-generation',
          mode: 'image',
          useCase: { query: 'Make a poster.' },
          capabilities: ['prompt:inject', 'fs:write'],
          // deliberately no `pipeline` — forces scenario fallback
        },
      },
    } as InstalledPluginRecord;

    const registryWithScenario = {
      ...REGISTRY,
      scenarios: [
        {
          id: 'od-new-generation',
          taskKind: 'new-generation' as const,
          pipeline: {
            stages: [
              { id: 'discovery', atoms: ['question-form'] },
              { id: 'plan', atoms: ['todo-write'] },
              { id: 'generate', atoms: ['file-write', 'live-artifact'] },
              { id: 'critique', atoms: ['critique-theater'], repeat: true, until: 'critique.score>=4 || iterations>=3' },
            ],
          },
        },
      ],
    };

    const { result } = applyPlugin({ plugin, inputs: {}, registry: registryWithScenario });
    expect(stageIds(result.pipeline)).toEqual(['generate']);
  });

  // Control: a NON-media manifest that omits od.pipeline keeps the full
  // scenario fallback untouched (plan + critique already present → no-op).
  it('leaves a non-media scenario-fallback pipeline intact', () => {
    const plugin: InstalledPluginRecord = {
      ...templateFixture({ stages: [] }),
      manifest: {
        name: 'web-no-pipeline',
        title: 'Web No Pipeline',
        version: '1.0.0',
        description: 'A web plugin that omits od.pipeline.',
        od: {
          kind: 'skill',
          taskKind: 'new-generation',
          mode: 'web',
          useCase: { query: 'Build a landing page.' },
          capabilities: ['prompt:inject', 'fs:write'],
        },
      },
    } as InstalledPluginRecord;

    const registryWithScenario = {
      ...REGISTRY,
      scenarios: [
        {
          id: 'od-new-generation',
          taskKind: 'new-generation' as const,
          pipeline: {
            stages: [
              { id: 'discovery', atoms: ['question-form'] },
              { id: 'plan', atoms: ['todo-write'] },
              { id: 'generate', atoms: ['file-write', 'live-artifact'] },
              { id: 'critique', atoms: ['critique-theater'], repeat: true, until: 'critique.score>=4 || iterations>=3' },
            ],
          },
        },
      ],
    };

    const { result } = applyPlugin({ plugin, inputs: {}, registry: registryWithScenario });
    expect(stageIds(result.pipeline)).toEqual(['discovery', 'plan', 'generate', 'critique']);
  });

  it('does not duplicate stages a template already declares', () => {
    const plugin = templateFixture({
      stages: [
        { id: 'plan', atoms: ['todo-write'] },
        { id: 'generate', atoms: ['file-write', 'live-artifact'] },
        { id: 'critique', atoms: ['critique-theater'], repeat: true, until: 'critique.score>=4 || iterations>=3' },
      ],
    });
    const { result } = applyPlugin({ plugin, inputs: {}, registry: REGISTRY });
    const ids = stageIds(result.pipeline);
    expect(ids.filter((id) => id === 'plan')).toHaveLength(1);
    expect(ids.filter((id) => id === 'critique')).toHaveLength(1);
  });
});
