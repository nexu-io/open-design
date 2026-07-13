import { describe, expect, it } from 'vitest';
import { mergeManifests } from '../src/merge';
import type { PluginManifest } from '@open-design/contracts';

const adapter: PluginManifest = {
  name: 'plugin',
  title: 'From Adapter',
  version: '0.0.0',
  description: 'adapter desc',
  compat: { agentSkills: [{ path: './SKILL.md' }] },
  od: {
    kind: 'skill',
    taskKind: 'new-generation',
    mode: 'prototype',
    inputs: [{ name: 'tone', type: 'string' }],
  },
};

const sidecar: PluginManifest = {
  name: 'plugin',
  title: 'From Sidecar',
  version: '1.0.0',
  description: 'sidecar desc',
  od: {
    taskKind: 'tune-collab',
    inputs: [{ name: 'audience', type: 'select', options: ['VC'] }],
  },
};

describe('mergeManifests', () => {
  it('lets the sidecar win for scalar fields', () => {
    const merged = mergeManifests({ sidecar, adapters: [adapter] });
    expect(merged.title).toBe('From Sidecar');
    expect(merged.version).toBe('1.0.0');
    expect(merged.description).toBe('sidecar desc');
    expect(merged.od?.taskKind).toBe('tune-collab');
  });

  it('falls back to adapter values when sidecar omits them', () => {
    const merged = mergeManifests({ sidecar, adapters: [adapter] });
    expect(merged.od?.mode).toBe('prototype');
    expect(merged.od?.kind).toBe('skill');
  });

  it('keeps the sidecar inputs array intact, not deep-merged', () => {
    const merged = mergeManifests({ sidecar, adapters: [adapter] });
    expect(merged.od?.inputs?.length).toBe(1);
    expect(merged.od?.inputs?.[0]?.name).toBe('audience');
  });

  it('unions compat lists across layers', () => {
    const merged = mergeManifests({
      sidecar: { ...sidecar, compat: { claudePlugins: [{ path: './.claude-plugin/plugin.json' }] } },
      adapters: [adapter],
    });
    expect(merged.compat?.agentSkills?.length).toBe(1);
    expect(merged.compat?.claudePlugins?.length).toBe(1);
  });
});
