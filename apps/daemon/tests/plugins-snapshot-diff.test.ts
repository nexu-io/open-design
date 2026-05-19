// Plan §3.BB2 — diffSnapshots() pure helper.

import { describe, expect, it } from 'vitest';
import type { AppliedPluginSnapshot } from '@open-design/contracts';
import { diffSnapshots } from '../src/plugins/snapshot-diff.js';

const make = (over: Partial<AppliedPluginSnapshot> = {}): AppliedPluginSnapshot => ({
  snapshotId: 'snap-1',
  pluginId: 'p',
  pluginVersion: '0.1.0',
  manifestSourceDigest: 'd1',
  inputs: {},
  resolvedContext: { items: [], itemRefs: [] } as unknown as AppliedPluginSnapshot['resolvedContext'],
  capabilitiesGranted: [],
  capabilitiesRequired: [],
  assetsStaged: [],
  taskKind: 'new-generation',
  appliedAt: 1,
  connectorsRequired: [],
  connectorsResolved: [],
  mcpServers: [],
  status: 'fresh',
  ...over,
});

describe('diffSnapshots — equivalence + invariance', () => {
  it('reports digestEqual=true and zero entries on byte-equal snapshots', () => {
    const a = make({ inputs: { topic: 'x' } });
    const b = make({ inputs: { topic: 'x' } });
    const r = diffSnapshots({ a, b });
    expect(r.digestEqual).toBe(true);
    expect(r.entries).toEqual([]);
    expect(r.added).toBe(0);
    expect(r.changed).toBe(0);
    expect(r.pluginId).toBe('p');
  });

  it('flags digestEqual=false when manifestSourceDigest differs', () => {
    const a = make({ manifestSourceDigest: 'd1' });
    const b = make({ snapshotId: 'snap-2', manifestSourceDigest: 'd2' });
    const r = diffSnapshots({ a, b });
    expect(r.digestEqual).toBe(false);
    const digestEntry = r.entries.find((e) => e.field === 'manifestSourceDigest');
    expect(digestEntry?.kind).toBe('changed');
    expect(digestEntry?.before).toBe('d1');
    expect(digestEntry?.after).toBe('d2');
  });
});

describe('diffSnapshots — input map', () => {
  it("reports added / removed / changed inputs in one summary entry", () => {
    const a = make({ inputs: { keep: 'same', drop: 'gone', edit: 'old' } });
    const b = make({ inputs: { keep: 'same',                  edit: 'new', add: 'new' } });
    const r = diffSnapshots({ a, b });
    const e = r.entries.find((x) => x.field === 'inputs');
    expect(e?.kind).toBe('changed');
    expect(e?.summary).toMatch(/1 added.*1 removed.*1 changed/);
  });
});

describe('diffSnapshots — capability + connector arrays', () => {
  it('detects added / removed entries on capabilitiesGranted', () => {
    const a = make({ capabilitiesGranted: ['fs:read'] });
    const b = make({ capabilitiesGranted: ['fs:read', 'connector:slack'] });
    const r = diffSnapshots({ a, b });
    const e = r.entries.find((x) => x.field === 'capabilitiesGranted');
    expect(e?.summary).toMatch(/1 added/);
    expect(e?.after).toContain('connector:slack');
  });

  it('detects connector status drift', () => {
    const a = make({
      connectorsResolved: [{ id: 'figma', tools: [], status: 'connected' } as unknown as AppliedPluginSnapshot['connectorsResolved'][number]],
    });
    const b = make({
      connectorsResolved: [{ id: 'figma', tools: [], status: 'pending' } as unknown as AppliedPluginSnapshot['connectorsResolved'][number]],
    });
    const r = diffSnapshots({ a, b });
    const e = r.entries.find((x) => x.field === 'connectorsResolved');
    expect(e?.kind).toBe('changed');
  });
});

describe('diffSnapshots — pipeline', () => {
  it('detects pipeline added / removed / per-stage atoms churn', () => {
    const a = make({
      pipeline: { stages: [
        { id: 'plan', atoms: ['todo-write'] },
        { id: 'do',   atoms: ['file-write'] },
      ] },
    });
    const b = make({
      pipeline: { stages: [
        { id: 'plan',     atoms: ['todo-write', 'direction-picker'] },
        { id: 'critique', atoms: ['critique-theater'] },
      ] },
    });
    const r = diffSnapshots({ a, b });
    expect(r.entries.find((e) => e.field === 'pipeline.stages')?.kind).toBe('changed');
    const planAtoms = r.entries.find((e) => e.field === 'pipeline.stages[plan].atoms');
    expect(planAtoms?.summary).toMatch(/1 added/);
  });

  it("emits pipeline=added when only the rhs has a pipeline", () => {
    const a = make();
    const b = make({ pipeline: { stages: [{ id: 'x', atoms: ['todo-write'] }] } });
    const r = diffSnapshots({ a, b });
    const e = r.entries.find((x) => x.field === 'pipeline');
    expect(e?.kind).toBe('added');
  });
});

describe('diffSnapshots — output shape', () => {
  it('sorts entries by field path lexicographically', () => {
    const a = make();
    const b = make({ snapshotId: 'snap-2', pluginVersion: '0.2.0', taskKind: 'code-migration' });
    const r = diffSnapshots({ a, b });
    const fields = r.entries.map((e) => e.field);
    expect(fields).toEqual([...fields].sort());
  });

  it("aggregate counts match entries' kind tally", () => {
    const a = make();
    const b = make({ pluginVersion: '0.2.0', status: 'stale' });
    const r = diffSnapshots({ a, b });
    const counted = { added: 0, removed: 0, changed: 0 };
    for (const e of r.entries) counted[e.kind]++;
    expect({ added: r.added, removed: r.removed, changed: r.changed }).toEqual(counted);
  });
});
