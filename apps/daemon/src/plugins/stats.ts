// Phase 4 / spec §11.5 / plan §3.DD1 — installed-plugin inventory stats.
//
// Pure helper that aggregates an in-memory list of
// InstalledPluginRecord into a single health/inventory report.
// Used by:
//
//   - `od plugin stats` — operator at-a-glance inventory check,
//   - the desktop / web 'Plugins' settings panel (via the JSON
//     mode of the same CLI),
//   - the `od doctor` summary (a future patch can fold this in
//     without reimplementing the aggregation).
//
// The function is intentionally pure; the daemon route wires the
// snapshot-side aggregation in separately because that side
// requires a SQLite read.

import type { InstalledPluginRecord, PluginSourceKind } from '@open-design/contracts';

export interface PluginInventoryStats {
  total:       number;
  bySourceKind: Record<string, number>;
  byTrust:      Record<string, number>;
  byTaskKind:   Record<string, number>;
  // Plugins that declared at least one of the §5.3 elevated
  // capabilities (fs:write, subprocess, bash, network, connector*).
  // Surfaces 'how many plugins can mutate state' for an audit panel.
  withElevatedCapabilities: number;
  // The bundled-vs-third-party split. Bundled plugins are re-
  // registered every boot; third-party come from local / github /
  // https / marketplace and never auto-upgrade.
  bundled:      number;
  thirdParty:   number;
  // The newest install timestamp (epoch ms) so an operator can
  // see 'when did anything change last?'.
  lastInstalledAt:  number | null;
  // The newest update timestamp — distinct because re-running the
  // installer on the same source bumps updatedAt without
  // changing installedAt.
  lastUpdatedAt:    number | null;
}

const ELEVATED_CAPABILITIES = new Set(['fs:write', 'subprocess', 'bash', 'network']);

export function pluginInventoryStats(plugins: ReadonlyArray<InstalledPluginRecord>): PluginInventoryStats {
  const stats: PluginInventoryStats = {
    total:       plugins.length,
    bySourceKind: {},
    byTrust:      {},
    byTaskKind:   {},
    withElevatedCapabilities: 0,
    bundled:      0,
    thirdParty:   0,
    lastInstalledAt:  null,
    lastUpdatedAt:    null,
  };

  for (const plugin of plugins) {
    const kind = plugin.sourceKind ?? 'unknown';
    stats.bySourceKind[kind] = (stats.bySourceKind[kind] ?? 0) + 1;
    const trust = plugin.trust ?? 'unknown';
    stats.byTrust[trust] = (stats.byTrust[trust] ?? 0) + 1;

    const taskKind = plugin.manifest.od?.taskKind ?? 'unknown';
    stats.byTaskKind[taskKind] = (stats.byTaskKind[taskKind] ?? 0) + 1;

    const declared = plugin.manifest.od?.capabilities ?? [];
    if (Array.isArray(declared) && declared.some((c) => ELEVATED_CAPABILITIES.has(c) || (typeof c === 'string' && c.startsWith('connector:')))) {
      stats.withElevatedCapabilities++;
    }

    if (plugin.sourceKind === 'bundled' || plugin.trust === 'bundled') stats.bundled++;
    else stats.thirdParty++;

    if (typeof plugin.installedAt === 'number') {
      stats.lastInstalledAt = stats.lastInstalledAt === null
        ? plugin.installedAt
        : Math.max(stats.lastInstalledAt, plugin.installedAt);
    }
    if (typeof plugin.updatedAt === 'number') {
      stats.lastUpdatedAt = stats.lastUpdatedAt === null
        ? plugin.updatedAt
        : Math.max(stats.lastUpdatedAt, plugin.updatedAt);
    }
  }

  return stats;
}

// Snapshot-side aggregation — pure, takes the rows the daemon
// produces from `applied_plugin_snapshots`. Kept in a sister
// function so the route can call both halves and merge on the way
// out.

export interface SnapshotInventoryStats {
  total:        number;
  byStatus:     Record<string, number>;  // 'fresh' | 'stale'
  withProject:  number;                  // project_id IS NOT NULL
  withRun:      number;                  // run_id IS NOT NULL
  // The oldest applied_at + the newest applied_at (epoch ms) so
  // an operator can see 'how far back does our snapshot history
  // reach?'.
  oldestAppliedAt: number | null;
  newestAppliedAt: number | null;
}

export interface SnapshotStatsRow {
  status:     'fresh' | 'stale';
  project_id: string | null;
  run_id:     string | null;
  applied_at: number;
}

// Plan §3.MM2 — `pluginSourceBuckets()` aggregates installed
// plugins by (sourceKind, source) tuples. Used by the
// `od plugin sources` CLI; lives next to the other stats
// helpers so future audit panels can reuse it.

export interface PluginSourceBucket {
  sourceKind:  PluginSourceKind | 'unknown';
  source:      string;
  count:       number;
  plugins:     Array<{ id: string; version: string }>;
}

export interface PluginSourceBucketsResult {
  total:   number;
  buckets: PluginSourceBucket[];
}

export function pluginSourceBuckets(plugins: ReadonlyArray<InstalledPluginRecord>): PluginSourceBucketsResult {
  const map = new Map<string, PluginSourceBucket>();
  for (const p of plugins) {
    const sourceKind = (p.sourceKind ?? 'unknown') as PluginSourceBucket['sourceKind'];
    const source = p.source ?? '(none)';
    const key = `${sourceKind}\t${source}`;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { sourceKind, source, count: 0, plugins: [] };
      map.set(key, bucket);
    }
    bucket.count += 1;
    bucket.plugins.push({ id: p.id, version: p.version });
  }
  // Sort plugins within bucket by id for deterministic output.
  for (const b of map.values()) b.plugins.sort((a, b) => a.id.localeCompare(b.id));
  // Sort buckets by descending count, then ascending sourceKind / source.
  const buckets = [...map.values()].sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    if (a.sourceKind !== b.sourceKind) return a.sourceKind.localeCompare(b.sourceKind);
    return a.source.localeCompare(b.source);
  });
  return { total: plugins.length, buckets };
}

export function snapshotInventoryStats(rows: ReadonlyArray<SnapshotStatsRow>): SnapshotInventoryStats {
  const stats: SnapshotInventoryStats = {
    total: rows.length,
    byStatus:    {},
    withProject: 0,
    withRun:     0,
    oldestAppliedAt: null,
    newestAppliedAt: null,
  };
  for (const row of rows) {
    const status = row.status ?? 'unknown';
    stats.byStatus[status] = (stats.byStatus[status] ?? 0) + 1;
    if (row.project_id) stats.withProject++;
    if (row.run_id)     stats.withRun++;
    if (typeof row.applied_at === 'number') {
      stats.oldestAppliedAt = stats.oldestAppliedAt === null
        ? row.applied_at
        : Math.min(stats.oldestAppliedAt, row.applied_at);
      stats.newestAppliedAt = stats.newestAppliedAt === null
        ? row.applied_at
        : Math.max(stats.newestAppliedAt, row.applied_at);
    }
  }
  return stats;
}
