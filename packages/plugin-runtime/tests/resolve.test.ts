import { describe, expect, it } from 'vitest';
import type { PluginManifest } from '@open-design/contracts';
import { resolveContext, type RegistryView } from '../src/resolve';

const emptyRegistry: RegistryView = {
  skills: [],
  designSystems: [],
  craft: [],
  atoms: [],
};

const fullRegistry: RegistryView = {
  skills: [
    { id: 'blog-post', title: 'Blog Post' },
    { id: 'pitch-deck', title: 'Pitch Deck' },
  ],
  designSystems: [{ id: 'linear-clone', title: 'Linear Clone' }],
  craft: [{ id: 'typography', title: 'Typography' }],
  atoms: [{ id: 'todo-write', label: 'Todo Write' }],
};

const baseManifest = (od: PluginManifest['od']): PluginManifest => ({
  name: 'sample',
  version: '1.0.0',
  ...(od ? { od } : {}),
});

describe('resolveContext', () => {
  it('returns empty items and refs for a manifest with no od.context', () => {
    const out = resolveContext(baseManifest(undefined), { registry: emptyRegistry });
    expect(out.context.items).toEqual([]);
    expect(out.digestRefs).toEqual([]);
    expect(out.warnings).toEqual([]);
  });

  it('resolves skills that exist in the registry', () => {
    const manifest = baseManifest({
      context: { skills: [{ ref: 'blog-post' }] },
    });
    const out = resolveContext(manifest, { registry: fullRegistry });
    expect(out.context.items).toEqual([
      { kind: 'skill', id: 'blog-post', label: 'Blog Post' },
    ]);
    expect(out.digestRefs).toEqual([{ kind: 'skill', ref: 'blog-post' }]);
  });

  it('strips a leading ./ from skill refs before lookup', () => {
    const manifest = baseManifest({
      context: { skills: [{ ref: './blog-post' }] },
    });
    const out = resolveContext(manifest, { registry: fullRegistry });
    expect(out.context.items[0]?.id).toBe('blog-post');
    expect(out.warnings).toEqual([]);
  });

  it('resolves a design-system by explicit ref', () => {
    const manifest = baseManifest({
      context: { designSystem: { ref: 'linear-clone' } },
    });
    const out = resolveContext(manifest, { registry: fullRegistry });
    expect(out.context.items[0]).toMatchObject({
      kind: 'design-system',
      id: 'linear-clone',
      primary: true,
    });
  });

  it('falls back to the active project design-system when ref is blank', () => {
    const manifest = baseManifest({
      context: { designSystem: { ref: '' } },
    });
    const out = resolveContext(manifest, {
      registry: { ...fullRegistry, activeProjectDesignSystem: { id: 'acme-ds', title: 'Acme' } },
    });
    expect(out.context.items[0]).toMatchObject({ kind: 'design-system', id: 'acme-ds' });
  });

  it('resolves craft slugs against the registry', () => {
    const manifest = baseManifest({
      context: { craft: ['typography'] },
    });
    const out = resolveContext(manifest, { registry: fullRegistry });
    expect(out.context.items[0]).toMatchObject({ kind: 'craft', id: 'typography' });
    expect(out.digestRefs).toContainEqual({ kind: 'craft', ref: 'typography' });
  });

  it('emits warnings for unknown registry refs when warnOnMissing is set', () => {
    const manifest = baseManifest({
      context: {
        skills: [{ ref: 'missing-skill' }],
        designSystem: { ref: 'missing-ds' },
        craft: ['missing-craft'],
      },
    });
    const out = resolveContext(manifest, { registry: fullRegistry, warnOnMissing: true });
    expect(out.warnings).toEqual([
      "Unknown skill ref: 'missing-skill'",
      "Unknown design-system ref: 'missing-ds'",
      "Unknown craft slug: 'missing-craft'",
    ]);
    expect(out.context.items).toEqual([]);
  });

  it('silently drops unknown refs when warnOnMissing is false', () => {
    const manifest = baseManifest({
      context: { skills: [{ ref: 'missing-skill' }] },
    });
    const out = resolveContext(manifest, { registry: fullRegistry });
    expect(out.warnings).toEqual([]);
    expect(out.context.items).toEqual([]);
  });

  it('records pipeline-atom refs so distinct pipelines produce distinct digests', () => {
    const manifest = baseManifest({
      pipeline: { stages: [{ id: 's1', atoms: ['todo-write'] }] },
    });
    const out = resolveContext(manifest, { registry: fullRegistry });
    expect(out.digestRefs).toEqual([{ kind: 'pipeline-atom', ref: 's1:todo-write' }]);
  });
});
