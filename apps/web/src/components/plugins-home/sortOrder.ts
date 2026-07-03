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

// Newest-first ordering. `updatedAt` moves on reinstall/upgrade so it is
// the freshness signal; `installedAt` breaks ties for records written in
// the same batch. The sort is stable, so records with identical
// timestamps (e.g. a bundled catalog seeded in one transaction) keep
// their incoming visual-appeal order instead of degrading to raw
// daemon order.
export function sortByNewest<T extends InstalledPluginRecord>(
  records: readonly T[],
): T[] {
  const annotated = records.map((record, idx) => ({ record, idx }));
  annotated.sort((a, b) => {
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
