// Phase 4 / plan §3.Y1 — searchInstalledPlugins().

import { describe, expect, it } from 'vitest';
import type { InstalledPluginRecord, PluginManifest } from '@open-design/contracts';
import { searchInstalledPlugins } from '../src/plugins/search.js';

const make = (id: string, over: Partial<{ title: string; description: string; tags: string[]; taskKind: string; mode: string; trust: 'trusted' | 'restricted' | 'bundled'; sourceKind: 'bundled' | 'local' | 'github' | 'url'; }>): InstalledPluginRecord => ({
  id,
  title: over.title ?? `Title for ${id}`,
  version: '0.1.0',
  sourceKind: over.sourceKind ?? 'local',
  source: '/tmp/' + id,
  fsPath: '/tmp/' + id,
  trust: over.trust ?? 'trusted',
  capabilitiesGranted: [],
  installedAt: 1,
  updatedAt: 1,
  manifest: {
    $schema: 'https://open-design.ai/schemas/plugin.v1.json',
    name: id,
    version: '0.1.0',
    title: over.title ?? `Title for ${id}`,
    ...(over.description ? { description: over.description } : {}),
    ...(over.tags ? { tags: over.tags } : {}),
    ...(over.taskKind || over.mode
      ? { od: {
          ...(over.taskKind ? { taskKind: over.taskKind } : {}),
          ...(over.mode     ? { mode: over.mode } : {}),
        } }
      : {}),
  } as PluginManifest,
});

describe('searchInstalledPlugins — free-text query', () => {
  const plugins = [
    make('exact-id', { title: 'Generic title', tags: ['utility'] }),
    make('beta',     { title: 'Awesome card builder', tags: ['ui'] }),
    make('alpha',    { title: 'Description matcher', description: 'helps with cards' }),
    make('gamma',    { title: 'Card power up',       tags: ['cards'] }),
  ];

  it('exact id match wins (rank=0)', () => {
    const r = searchInstalledPlugins({ plugins, query: 'exact-id' });
    expect(r.entries[0]?.plugin.id).toBe('exact-id');
    expect(r.entries[0]?.rank).toBe(0);
  });

  it('exact title match (rank=1) ranks ahead of substring on id', () => {
    const r = searchInstalledPlugins({ plugins, query: 'awesome card builder' });
    expect(r.entries[0]?.plugin.id).toBe('beta');
    expect(r.entries[0]?.rank).toBe(1);
  });

  it('tag exact match (rank=2)', () => {
    const r = searchInstalledPlugins({ plugins, query: 'cards' });
    // gamma has tag 'cards' (exact); alpha/beta only contain
    // 'cards' as substring on title/description.
    expect(r.entries[0]?.plugin.id).toBe('gamma');
    expect(r.entries[0]?.rank).toBe(2);
  });

  it('substring matches across id / title / description / tags', () => {
    const r = searchInstalledPlugins({ plugins, query: 'card' });
    const ids = r.entries.map((e) => e.plugin.id);
    expect(ids).toEqual(expect.arrayContaining(['gamma', 'beta', 'alpha']));
  });

  it('returns empty entries when query matches nothing', () => {
    const r = searchInstalledPlugins({ plugins, query: 'no-such-thing' });
    expect(r.entries).toEqual([]);
  });
});

describe('searchInstalledPlugins — structural filters', () => {
  const plugins = [
    make('a', { taskKind: 'figma-migration', mode: 'extract' }),
    make('b', { taskKind: 'code-migration',  mode: 'extract' }),
    make('c', { taskKind: 'code-migration',  mode: 'edit',    tags: ['phase-7'] }),
    make('d', { trust: 'restricted' }),
    make('e', { sourceKind: 'bundled', trust: 'bundled' }),
  ];

  it('filters by taskKind', () => {
    const r = searchInstalledPlugins({ plugins, taskKind: 'code-migration' });
    expect(r.entries.map((e) => e.plugin.id).sort()).toEqual(['b', 'c']);
  });

  it('filters by mode', () => {
    const r = searchInstalledPlugins({ plugins, mode: 'edit' });
    expect(r.entries.map((e) => e.plugin.id)).toEqual(['c']);
  });

  it('filters by tag', () => {
    const r = searchInstalledPlugins({ plugins, tag: 'phase-7' });
    expect(r.entries.map((e) => e.plugin.id)).toEqual(['c']);
  });

  it('filters by trust tier', () => {
    const r = searchInstalledPlugins({ plugins, trust: 'restricted' });
    expect(r.entries.map((e) => e.plugin.id)).toEqual(['d']);
  });

  it("filters by 'bundled': true keeps only bundled plugins", () => {
    const r = searchInstalledPlugins({ plugins, bundled: true });
    expect(r.entries.map((e) => e.plugin.id)).toEqual(['e']);
  });

  it("filters by 'bundled': false excludes bundled plugins", () => {
    const r = searchInstalledPlugins({ plugins, bundled: false });
    expect(r.entries.map((e) => e.plugin.id).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('combines multiple filters AND', () => {
    const r = searchInstalledPlugins({ plugins, taskKind: 'code-migration', mode: 'extract' });
    expect(r.entries.map((e) => e.plugin.id)).toEqual(['b']);
  });
});

describe('searchInstalledPlugins — query + filters together', () => {
  const plugins = [
    make('alpha', { taskKind: 'code-migration', tags: ['ui'] }),
    make('beta',  { taskKind: 'figma-migration', tags: ['ui'] }),
    make('gamma', { taskKind: 'code-migration', tags: ['build'] }),
  ];

  it('AND-combines free-text + structural filters', () => {
    const r = searchInstalledPlugins({ plugins, query: 'alp', taskKind: 'code-migration' });
    expect(r.entries.map((e) => e.plugin.id)).toEqual(['alpha']);
  });

  it('returns empty when filter excludes the query target', () => {
    const r = searchInstalledPlugins({ plugins, query: 'beta', taskKind: 'code-migration' });
    expect(r.entries).toEqual([]);
  });
});

describe('searchInstalledPlugins — output shape', () => {
  it('reports total + matched fields per entry', () => {
    const r = searchInstalledPlugins({
      plugins: [make('beta', { title: 'Card builder' })],
      query: 'card',
    });
    expect(r.total).toBe(1);
    expect(r.entries[0]?.matched).toEqual(['title']);
  });

  it('breaks rank ties alphabetically by id', () => {
    const r = searchInstalledPlugins({
      plugins: [
        make('zeta',  { title: 'Card library' }),
        make('alpha', { title: 'Card library' }),
      ],
      query: 'card library',
    });
    expect(r.entries.map((e) => e.plugin.id)).toEqual(['alpha', 'zeta']);
  });
});
