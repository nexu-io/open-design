// Sort-order preference for the plugins home gallery.
//
// The Community gallery leads with the visual-appeal ranking
// (`sortByVisualAppeal`) — that is the "hot" order users see today.
// Some users instead want to scan what landed most recently, so the
// filter bar exposes a hot/newest toggle. The choice is remembered
// per browser (same localStorage strategy as `savedPlugins.ts`) so a
// returning user keeps their preferred scan order.

import type { InstalledPluginRecord } from '@open-design/contracts';

export type PluginSortOrder = 'hot' | 'newest';

export const DEFAULT_PLUGIN_SORT_ORDER: PluginSortOrder = 'hot';

const SORT_ORDER_KEY = 'open-design:plugins-sort-order';

function isBrowserStorageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function isPluginSortOrder(value: unknown): value is PluginSortOrder {
  return value === 'hot' || value === 'newest';
}

export function readStoredSortOrder(): PluginSortOrder {
  if (!isBrowserStorageAvailable()) return DEFAULT_PLUGIN_SORT_ORDER;
  try {
    const raw = window.localStorage.getItem(SORT_ORDER_KEY);
    return isPluginSortOrder(raw) ? raw : DEFAULT_PLUGIN_SORT_ORDER;
  } catch {
    return DEFAULT_PLUGIN_SORT_ORDER;
  }
}

export function writeStoredSortOrder(order: PluginSortOrder): void {
  if (!isBrowserStorageAvailable()) return;
  try {
    window.localStorage.setItem(SORT_ORDER_KEY, order);
  } catch {
    // Preference persistence is best-effort; sorting still works
    // for the session when storage is unavailable.
  }
}

// The manifest's `publishedAt` is the shipped publication date. It is the
// only recency signal that survives a fresh install: the local
// installed-record timestamps are written when THIS machine seeds its
// database, so a first boot (or an upgrade that re-stamps the catalog)
// stamps the whole bundled catalog milliseconds apart in folder-walk
// order — "newest" would otherwise show reverse walk order (roughly
// reverse-alphabetical), not publication recency (#1457).
//
// Catalog-only: for a plugin the user installed themselves (github /
// local / marketplace / ...), "newest" means install recency, and a
// third-party manifest may carry any `publishedAt` value — so only
// bundled records take their freshness from it.
function publishedAtMs(record: InstalledPluginRecord): number | null {
  if (record.sourceKind !== 'bundled') return null;
  const raw = record.manifest?.publishedAt;
  if (typeof raw !== 'string') return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

// Newest-first ordering. Freshness is the manifest publication date for
// bundled catalog records that ship one, else `updatedAt` (which moves on
// install/reinstall/upgrade — the right signal for user-installed
// plugins).
//
// Ties: when BOTH records ship the same usable `publishedAt` (one catalog
// release stamps whole batches — hundreds of manifests — with a single
// date), local `updatedAt`/`installedAt` carry no publication signal: a
// fresh install writes them milliseconds apart in folder-walk order, so
// consulting them would reshuffle every batch per machine (#1457). The
// incoming visual-appeal ranking is the shipped within-batch order, so
// same-publication records keep their incoming position. Local
// timestamps break ties only when at least one side has no usable
// `publishedAt`, where local write recency is the best signal left.
export function sortByNewest<T extends InstalledPluginRecord>(
  records: readonly T[],
): T[] {
  const annotated = records.map((record, idx) => {
    const published = publishedAtMs(record);
    return {
      record,
      idx,
      published,
      freshness: published ?? record.updatedAt,
    };
  });
  annotated.sort((a, b) => {
    if (b.freshness !== a.freshness) {
      return b.freshness - a.freshness;
    }
    if (a.published !== null && b.published !== null) {
      return a.idx - b.idx;
    }
    if (b.record.updatedAt !== a.record.updatedAt) {
      return b.record.updatedAt - a.record.updatedAt;
    }
    if (b.record.installedAt !== a.record.installedAt) {
      return b.record.installedAt - a.record.installedAt;
    }
    return a.idx - b.idx;
  });
  return annotated.map((a) => a.record);
}
