import { describe, expect, it } from 'vitest';
import type { PluginManifest } from '@open-design/contracts';
import { mergeManifests } from '../src/merge';
import { resolveAppliedPipeline, type ScenarioRegistryEntry } from '../src/pipeline-fallback';

describe('mergeManifests compat dedup and emptiness', () => {
  it('dedupes identical compat paths across layers', () => {
    const sidecar: PluginManifest = {
      name: 'p',
      version: '1.0.0',
      compat: { agentSkills: [{ path: './SKILL.md' }] },
    };
    const adapter: PluginManifest = {
      name: 'p',
      version: '0.0.0',
      compat: { agentSkills: [{ path: './SKILL.md' }, { path: './OTHER.md' }] },
    };
    const merged = mergeManifests({ sidecar, adapters: [adapter] });
    expect(merged.compat?.agentSkills?.map((r) => r.path)).toEqual(['./SKILL.md', './OTHER.md']);
  });

  it('returns merged.compat undefined when no layer declares compat entries', () => {
    const sidecar: PluginManifest = { name: 'p', version: '1.0.0' };
    const adapter: PluginManifest = { name: 'p', version: '0.0.0' };
    const merged = mergeManifests({ sidecar, adapters: [adapter] });
    expect(merged.compat).toBeUndefined();
  });

  it('throws when no input layer is supplied', () => {
    expect(() => mergeManifests({})).toThrow(/at least one input layer/);
  });

  it('returns the adapter wholesale when no sidecar is supplied', () => {
    const adapter: PluginManifest = {
      name: 'only-adapter',
      version: '1.0.0',
      description: 'd',
    };
    const merged = mergeManifests({ adapters: [adapter] });
    expect(merged.name).toBe('only-adapter');
    expect(merged.description).toBe('d');
  });
});

describe('resolveAppliedPipeline edges', () => {
  const scenarios: ScenarioRegistryEntry[] = [
    {
      id: 'od-new-generation',
      taskKind: 'new-generation',
      pipeline: { stages: [{ id: 'discovery', atoms: ['discovery-question-form'] }] },
    },
  ];

  it('ignores a scenario entry whose pipeline has no stages', () => {
    const broken: ScenarioRegistryEntry[] = [
      {
        id: 'broken',
        taskKind: 'new-generation',
        pipeline: { stages: [] },
      },
      ...scenarios,
    ];
    const manifest: PluginManifest = {
      name: 'p',
      version: '1.0.0',
      od: { taskKind: 'new-generation' },
    };
    const out = resolveAppliedPipeline({ manifest, scenarios: broken });
    expect(out.source).toBe('scenario');
    expect(out.scenarioId).toBe('od-new-generation');
  });

  it('returns the first matching scenario when several share a taskKind', () => {
    const competing: ScenarioRegistryEntry[] = [
      {
        id: 'first',
        taskKind: 'new-generation',
        pipeline: { stages: [{ id: 's', atoms: ['a'] }] },
      },
      {
        id: 'second',
        taskKind: 'new-generation',
        pipeline: { stages: [{ id: 's', atoms: ['a'] }] },
      },
    ];
    const manifest: PluginManifest = {
      name: 'p',
      version: '1.0.0',
      od: { taskKind: 'new-generation' },
    };
    const out = resolveAppliedPipeline({ manifest, scenarios: competing });
    expect(out.scenarioId).toBe('first');
  });
});
