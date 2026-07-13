// Phase 8 entry slice — auto-derived choice surface for diff-review.

import { describe, expect, it } from 'vitest';
import type {
  InstalledPluginRecord,
  PluginManifest,
} from '@open-design/contracts';
import { applyPlugin } from '../src/plugins/apply.js';
import { deriveAutoAtomSurfaces } from '../src/plugins/atoms/auto-surfaces.js';

const baseRegistry = (scenarios: any[] = []) => ({
  skills: [],
  designSystems: [],
  craft: [],
  atoms: [],
  scenarios,
});

const consumer = (od: NonNullable<PluginManifest['od']>): InstalledPluginRecord => ({
  id: 'fixture',
  title: 'Fixture',
  version: '0.1.0',
  sourceKind: 'local',
  source: '/tmp/fixture',
  fsPath: '/tmp/fixture',
  trust: 'trusted',
  capabilitiesGranted: ['prompt:inject'],
  installedAt: Date.now(),
  updatedAt: Date.now(),
  manifest: {
    $schema: 'https://open-design.ai/schemas/plugin.v1.json',
    name: 'fixture',
    title: 'Fixture',
    version: '0.1.0',
    od,
  } as PluginManifest,
});

describe('deriveAutoAtomSurfaces — diff-review choice', () => {
  it('emits one __auto_diff_review_<stageId> per stage that contains diff-review', () => {
    const out = deriveAutoAtomSurfaces({
      pipeline: {
        stages: [
          { id: 'review-final', atoms: ['diff-review'] },
          { id: 'review-touchups', atoms: ['critique-theater', 'diff-review'] },
          { id: 'plain', atoms: ['todo-write'] },
        ],
      },
    });
    expect(out).toHaveLength(2);
    expect(out.map((s) => s.id)).toEqual([
      '__auto_diff_review_review-final',
      '__auto_diff_review_review-touchups',
    ]);
    for (const s of out) {
      expect(s.kind).toBe('choice');
      expect(s.persist).toBe('run');
      expect((s.schema as { properties: { decision: { enum: string[] } } }).properties.decision.enum).toEqual(['accept', 'reject', 'partial']);
      expect(s.trigger?.atom).toBe('diff-review');
    }
  });

  it('returns empty when no pipeline is supplied', () => {
    expect(deriveAutoAtomSurfaces({})).toEqual([]);
  });

  it("returns empty when no stage carries 'diff-review'", () => {
    expect(deriveAutoAtomSurfaces({
      pipeline: { stages: [{ id: 'plan', atoms: ['todo-write'] }] },
    })).toEqual([]);
  });
});

describe('applyPlugin — diff-review auto-surface integration', () => {
  it('lands the auto-surface on AppliedPluginSnapshot.genuiSurfaces when the plugin pipeline declares diff-review', () => {
    const out = applyPlugin({
      plugin: consumer({
        taskKind: 'code-migration',
        pipeline: {
          stages: [
            { id: 'review', atoms: ['diff-review'] },
          ],
        },
      }),
      inputs: {},
      registry: baseRegistry(),
    });
    const ids = out.result.genuiSurfaces?.map((s) => s.id) ?? [];
    expect(ids).toContain('__auto_diff_review_review');
    const surface = out.result.genuiSurfaces?.find((s) => s.id === '__auto_diff_review_review');
    expect(surface?.kind).toBe('choice');
  });

  it('lands the auto-surface when the diff-review stage comes from the bundled scenario fallback', () => {
    const out = applyPlugin({
      plugin: consumer({ taskKind: 'code-migration' }), // no pipeline
      inputs: {},
      registry: baseRegistry([
        {
          id: 'od-code-migration',
          taskKind: 'code-migration',
          pipeline: {
            stages: [
              { id: 'verify',  atoms: ['patch-edit', 'build-test'] },
              { id: 'review',  atoms: ['diff-review'] },
              { id: 'handoff', atoms: ['handoff'] },
            ],
          },
        },
      ]),
    });
    const ids = out.result.genuiSurfaces?.map((s) => s.id) ?? [];
    expect(ids).toContain('__auto_diff_review_review');
  });

  it('a plugin-declared surface with the same id wins over the auto-derived one', () => {
    const declaredSurface = {
      id:      '__auto_diff_review_review',
      kind:    'choice' as const,
      persist: 'project' as const,
      prompt:  'CUSTOM PROMPT',
      schema:  { type: 'object', properties: { decision: { type: 'string', enum: ['accept', 'reject', 'partial'] } }, required: ['decision'] },
    };
    const out = applyPlugin({
      plugin: consumer({
        taskKind: 'code-migration',
        pipeline: { stages: [{ id: 'review', atoms: ['diff-review'] }] },
        genui: { surfaces: [declaredSurface] },
      }),
      inputs: {},
      registry: baseRegistry(),
    });
    const matches = (out.result.genuiSurfaces ?? []).filter((s) => s.id === '__auto_diff_review_review');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.persist).toBe('project');
    expect(matches[0]?.prompt).toBe('CUSTOM PROMPT');
  });
});
