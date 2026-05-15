// Plan §3.DD1 — pluginInventoryStats + snapshotInventoryStats.

import { describe, expect, it } from 'vitest';
import type { InstalledPluginRecord, PluginManifest } from '@open-design/contracts';
import {
  pluginInventoryStats,
  pluginSourceBuckets,
  snapshotInventoryStats,
  type SnapshotStatsRow,
} from '../src/plugins/stats.js';

const make = (
  id: string,
  over: Partial<{
    sourceKind: 'bundled' | 'local' | 'github' | 'url' | 'marketplace';
    trust: 'trusted' | 'restricted' | 'bundled';
    taskKind: string;
    capabilities: string[];
    installedAt: number;
    updatedAt: number;
  }> = {},
): InstalledPluginRecord => ({
  id,
  title: `Title ${id}`,
  version: '0.1.0',
  sourceKind: over.sourceKind ?? 'local',
  source: '/tmp/' + id,
  fsPath: '/tmp/' + id,
  trust: over.trust ?? 'trusted',
  capabilitiesGranted: [],
  installedAt: over.installedAt ?? 1000,
  updatedAt:   over.updatedAt   ?? 1000,
  manifest: {
    $schema: 'https://open-design.ai/schemas/plugin.v1.json',
    name: id,
    version: '0.1.0',
    title: `Title ${id}`,
    od: {
      ...(over.taskKind ? { taskKind: over.taskKind } : {}),
      ...(over.capabilities ? { capabilities: over.capabilities } : {}),
    },
  } as PluginManifest,
});

describe('pluginInventoryStats', () => {
  it('returns zero-shape for an empty list', () => {
    const stats = pluginInventoryStats([]);
    expect(stats.total).toBe(0);
    expect(stats.bundled).toBe(0);
    expect(stats.thirdParty).toBe(0);
    expect(stats.lastInstalledAt).toBeNull();
    expect(stats.lastUpdatedAt).toBeNull();
    expect(stats.bySourceKind).toEqual({});
  });

  it('counts by sourceKind', () => {
    const plugins = [
      make('a', { sourceKind: 'local' }),
      make('b', { sourceKind: 'local' }),
      make('c', { sourceKind: 'bundled', trust: 'bundled' }),
      make('d', { sourceKind: 'github' }),
    ];
    const stats = pluginInventoryStats(plugins);
    expect(stats.bySourceKind).toEqual({ local: 2, bundled: 1, github: 1 });
  });

  it('counts by trust', () => {
    const plugins = [
      make('a', { trust: 'trusted' }),
      make('b', { trust: 'restricted' }),
      make('c', { trust: 'bundled', sourceKind: 'bundled' }),
    ];
    const stats = pluginInventoryStats(plugins);
    expect(stats.byTrust).toEqual({ trusted: 1, restricted: 1, bundled: 1 });
  });

  it('counts by taskKind, defaulting unset to "unknown"', () => {
    const plugins = [
      make('a', { taskKind: 'code-migration' }),
      make('b', { taskKind: 'code-migration' }),
      make('c'),
    ];
    const stats = pluginInventoryStats(plugins);
    expect(stats.byTaskKind).toEqual({ 'code-migration': 2, unknown: 1 });
  });

  it('flags plugins with elevated capabilities', () => {
    const plugins = [
      make('a', { capabilities: ['prompt:inject'] }),
      make('b', { capabilities: ['fs:write'] }),
      make('c', { capabilities: ['network'] }),
      make('d', { capabilities: ['connector:slack'] }),
      make('e', { capabilities: ['subprocess', 'bash'] }),
    ];
    const stats = pluginInventoryStats(plugins);
    expect(stats.withElevatedCapabilities).toBe(4); // b/c/d/e
  });

  it('splits bundled vs. third-party correctly', () => {
    const plugins = [
      make('a', { sourceKind: 'bundled', trust: 'bundled' }),
      make('b', { sourceKind: 'github' }),
      make('c', { sourceKind: 'local' }),
    ];
    const stats = pluginInventoryStats(plugins);
    expect(stats.bundled).toBe(1);
    expect(stats.thirdParty).toBe(2);
  });

  it('finds the newest installedAt + updatedAt across the roster', () => {
    const plugins = [
      make('a', { installedAt: 1000, updatedAt: 2000 }),
      make('b', { installedAt: 5000, updatedAt: 1500 }),
    ];
    const stats = pluginInventoryStats(plugins);
    expect(stats.lastInstalledAt).toBe(5000);
    expect(stats.lastUpdatedAt).toBe(2000);
  });
});

describe('snapshotInventoryStats', () => {
  const row = (over: Partial<SnapshotStatsRow> = {}): SnapshotStatsRow => ({
    status: 'fresh',
    project_id: null,
    run_id: null,
    applied_at: 1000,
    ...over,
  });

  it('returns zero-shape for an empty list', () => {
    const s = snapshotInventoryStats([]);
    expect(s.total).toBe(0);
    expect(s.byStatus).toEqual({});
    expect(s.withProject).toBe(0);
    expect(s.withRun).toBe(0);
    expect(s.oldestAppliedAt).toBeNull();
    expect(s.newestAppliedAt).toBeNull();
  });

  it('counts status / project / run / oldest+newest applied', () => {
    const rows = [
      row({ status: 'fresh', project_id: 'p1',  run_id: 'r1', applied_at: 100 }),
      row({ status: 'fresh', project_id: 'p2',  run_id: null, applied_at: 200 }),
      row({ status: 'stale', project_id: null,  run_id: null, applied_at: 50  }),
    ];
    const s = snapshotInventoryStats(rows);
    expect(s.total).toBe(3);
    expect(s.byStatus).toEqual({ fresh: 2, stale: 1 });
    expect(s.withProject).toBe(2);
    expect(s.withRun).toBe(1);
    expect(s.oldestAppliedAt).toBe(50);
    expect(s.newestAppliedAt).toBe(200);
  });
});

describe('pluginSourceBuckets — Plan §3.MM2', () => {
  it('returns total=0 + empty buckets[] for an empty list', () => {
    const result = pluginSourceBuckets([]);
    expect(result.total).toBe(0);
    expect(result.buckets).toEqual([]);
  });

  // Local helper that overrides the make()'s baked-in source/fsPath.
  const withSource = (rec: ReturnType<typeof make>, source: string) => ({ ...rec, source, fsPath: source });

  it('aggregates plugins by (sourceKind, source) tuples', () => {
    const result = pluginSourceBuckets([
      withSource(make('a', { sourceKind: 'github' }), 'github:owner/repo'),
      withSource(make('b', { sourceKind: 'github' }), 'github:owner/repo'),
      withSource(make('c', { sourceKind: 'local'  }), '/tmp/c'),
    ]);
    expect(result.total).toBe(3);
    expect(result.buckets).toHaveLength(2);
    const github = result.buckets.find((b) => b.sourceKind === 'github');
    expect(github?.count).toBe(2);
    expect(github?.source).toBe('github:owner/repo');
    expect(github?.plugins.map((p) => p.id).sort()).toEqual(['a', 'b']);
  });

  it('sorts buckets by descending count, then ascending sourceKind/source', () => {
    const result = pluginSourceBuckets([
      withSource(make('a', { sourceKind: 'local'  }), '/x'),
      withSource(make('b', { sourceKind: 'local'  }), '/x'),
      withSource(make('c', { sourceKind: 'github' }), 'github:owner/repo'),
    ]);
    // local/(/x)=2, github/(github:owner/repo)=1 → local first.
    expect(result.buckets[0]?.sourceKind).toBe('local');
    expect(result.buckets[1]?.sourceKind).toBe('github');
  });

  it('breaks count ties alphabetically by sourceKind', () => {
    const result = pluginSourceBuckets([
      withSource(make('a', { sourceKind: 'local'  }), '/x'),
      withSource(make('b', { sourceKind: 'github' }), 'github:owner/repo'),
    ]);
    // Both count=1; github < local alphabetically.
    expect(result.buckets[0]?.sourceKind).toBe('github');
    expect(result.buckets[1]?.sourceKind).toBe('local');
  });

  it('plugins inside a bucket sort by id alphabetically', () => {
    const result = pluginSourceBuckets([
      withSource(make('zeta',  { sourceKind: 'local' }), '/x'),
      withSource(make('alpha', { sourceKind: 'local' }), '/x'),
      withSource(make('mango', { sourceKind: 'local' }), '/x'),
    ]);
    expect(result.buckets[0]?.plugins.map((p) => p.id)).toEqual(['alpha', 'mango', 'zeta']);
  });
});
