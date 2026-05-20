// Plan §3.AA1 — diffPlugins() pure helper.

import { describe, expect, it } from 'vitest';
import type { InstalledPluginRecord, PluginManifest } from '@open-design/contracts';
import { diffPlugins } from '../src/plugins/diff.js';

const make = (
  id: string,
  manifest: NonNullable<PluginManifest['od']> | undefined = undefined,
  over: Partial<InstalledPluginRecord> = {},
): InstalledPluginRecord => ({
  id,
  title: `Title for ${id}`,
  version: '0.1.0',
  sourceKind: 'local',
  source: '/tmp/' + id,
  fsPath: '/tmp/' + id,
  trust: 'trusted',
  capabilitiesGranted: [],
  installedAt: 1,
  updatedAt: 1,
  manifest: {
    $schema: 'https://open-design.ai/schemas/plugin.v1.json',
    name: id,
    version: '0.1.0',
    title: `Title for ${id}`,
    ...(manifest ? { od: manifest } : {}),
  } as PluginManifest,
  ...over,
});

describe('diffPlugins — equivalence', () => {
  it('returns an empty entries list for byte-equal records', () => {
    const a = make('p', { taskKind: 'new-generation' });
    const b = make('p', { taskKind: 'new-generation' });
    const r = diffPlugins({ a, b });
    expect(r.entries).toEqual([]);
    expect(r.added).toBe(0);
    expect(r.removed).toBe(0);
    expect(r.changed).toBe(0);
    expect(r.pluginId).toBe('p');
  });
});

describe('diffPlugins — top-level record', () => {
  it('detects version + trust changes', () => {
    const a = make('p');
    const b = make('p', undefined, { version: '0.2.0', trust: 'restricted' });
    const r = diffPlugins({ a, b });
    const fields = r.entries.map((e) => e.field).sort();
    expect(fields).toEqual(expect.arrayContaining(['trust', 'version']));
    const versionEntry = r.entries.find((e) => e.field === 'version');
    expect(versionEntry?.kind).toBe('changed');
    expect(versionEntry?.before).toBe('0.1.0');
    expect(versionEntry?.after).toBe('0.2.0');
  });

  it('detects added / removed entries on capabilitiesGranted', () => {
    const a = make('p', undefined, { capabilitiesGranted: ['fs:read'] });
    const b = make('p', undefined, { capabilitiesGranted: ['fs:read', 'connector:slack'] });
    const r = diffPlugins({ a, b });
    const cap = r.entries.find((e) => e.field === 'capabilitiesGranted');
    expect(cap?.kind).toBe('changed');
    expect(cap?.summary).toMatch(/1 added/);
    expect(cap?.after).toContain('connector:slack');
  });

  it('renames surface as id changed (no shared pluginId on the report)', () => {
    const r = diffPlugins({ a: make('alpha'), b: make('beta') });
    expect(r.pluginId).toBeUndefined();
    expect(r.entries.find((e) => e.field === 'id')?.kind).toBe('changed');
  });
});

describe('diffPlugins — manifest body', () => {
  it('detects od.taskKind changes', () => {
    const a = make('p', { taskKind: 'new-generation' });
    const b = make('p', { taskKind: 'code-migration' });
    const r = diffPlugins({ a, b });
    const e = r.entries.find((x) => x.field === 'od.taskKind');
    expect(e?.kind).toBe('changed');
    expect(e?.before).toBe('new-generation');
    expect(e?.after).toBe('code-migration');
  });

  it('detects added / removed inputs[] by name', () => {
    const a = make('p', { taskKind: 'new-generation', inputs: [{ name: 'topic', type: 'string' }] });
    const b = make('p', { taskKind: 'new-generation', inputs: [{ name: 'topic', type: 'string' }, { name: 'tone', type: 'string' }] });
    const r = diffPlugins({ a, b });
    const e = r.entries.find((x) => x.field === 'od.inputs[]');
    expect(e?.summary).toMatch(/1 added/);
    expect(e?.after).toContain('tone');
  });

  it('detects pipeline added / removed / per-stage atoms changes', () => {
    const a = make('p', {
      pipeline: { stages: [
        { id: 'plan', atoms: ['todo-write'] },
        { id: 'do',   atoms: ['file-write'] },
      ] },
    });
    const b = make('p', {
      pipeline: { stages: [
        { id: 'plan', atoms: ['todo-write', 'direction-picker'] },
        { id: 'critique', atoms: ['critique-theater'] },
      ] },
    });
    const r = diffPlugins({ a, b });
    // Stage-id roster differs.
    expect(r.entries.find((e) => e.field === 'od.pipeline.stages')?.kind).toBe('changed');
    // Per-stage atoms diff for the surviving stage 'plan'.
    const planAtoms = r.entries.find((e) => e.field === 'od.pipeline.stages[plan].atoms');
    expect(planAtoms?.summary).toMatch(/1 added/);
  });

  it('emits od.pipeline=added when only the rhs has a pipeline', () => {
    const a = make('p', { taskKind: 'new-generation' });
    const b = make('p', { taskKind: 'new-generation', pipeline: { stages: [{ id: 'x', atoms: ['todo-write'] }] } });
    const r = diffPlugins({ a, b });
    const e = r.entries.find((x) => x.field === 'od.pipeline');
    expect(e?.kind).toBe('added');
    expect(e?.after).toContain('x');
  });

  it('detects connectors required-list churn', () => {
    const a = make('p', { taskKind: 'figma-migration', connectors: { required: [{ id: 'figma', tools: ['files.get'] }] } });
    const b = make('p', { taskKind: 'figma-migration', connectors: { required: [{ id: 'figma', tools: ['files.get'] }, { id: 'slack', tools: [] }] } });
    const r = diffPlugins({ a, b });
    const e = r.entries.find((x) => x.field === 'od.connectors.required');
    expect(e?.summary).toMatch(/1 added/);
  });
});

describe('diffPlugins — output shape', () => {
  it('sorts entries by field path lexicographically (deterministic output)', () => {
    const a = make('p');
    const b = make('p', undefined, { version: '0.2.0', trust: 'restricted', source: '/tmp/new' });
    const r = diffPlugins({ a, b });
    const fields = r.entries.map((e) => e.field);
    expect(fields).toEqual([...fields].sort());
  });

  it("aggregate counts (added/removed/changed) match entries' kind tally", () => {
    const a = make('p', { taskKind: 'new-generation' });
    const b = make('p', { taskKind: 'code-migration', mode: 'edit' });
    const r = diffPlugins({ a, b });
    const counted = { added: 0, removed: 0, changed: 0 };
    for (const e of r.entries) counted[e.kind]++;
    expect({ added: r.added, removed: r.removed, changed: r.changed }).toEqual(counted);
  });
});
