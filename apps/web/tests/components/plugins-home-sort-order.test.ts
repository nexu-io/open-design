// @vitest-environment jsdom
//
// Sort-order contract for the plugins home gallery: "hot" keeps the
// visual-appeal ranking, "newest" re-ranks by record freshness, and
// the picked order is remembered per browser.

import { beforeEach, describe, expect, it } from 'vitest';
import type { InstalledPluginRecord } from '@open-design/contracts';
import {
  DEFAULT_PLUGIN_SORT_ORDER,
  readStoredSortOrder,
  sortByNewest,
  writeStoredSortOrder,
} from '../../src/components/plugins-home/sortOrder';

function fixture(overrides: {
  id: string;
  installedAt?: number;
  updatedAt?: number;
  publishedAt?: string;
  sourceKind?: InstalledPluginRecord['sourceKind'];
}): InstalledPluginRecord {
  return {
    id: overrides.id,
    title: overrides.id,
    version: '0.1.0',
    sourceKind: overrides.sourceKind ?? 'bundled',
    source: '/tmp',
    trust: 'bundled',
    capabilitiesGranted: ['prompt:inject'],
    manifest: {
      name: overrides.id,
      version: '0.1.0',
      ...(overrides.publishedAt !== undefined
        ? { publishedAt: overrides.publishedAt }
        : {}),
    },
    fsPath: '/tmp',
    installedAt: overrides.installedAt ?? 0,
    updatedAt: overrides.updatedAt ?? 0,
  };
}

describe('sortByNewest', () => {
  it('orders by updatedAt descending', () => {
    const records = [
      fixture({ id: 'old', updatedAt: 100 }),
      fixture({ id: 'newest', updatedAt: 300 }),
      fixture({ id: 'mid', updatedAt: 200 }),
    ];
    expect(sortByNewest(records).map((r) => r.id)).toEqual(['newest', 'mid', 'old']);
  });

  it('breaks updatedAt ties by installedAt descending', () => {
    const records = [
      fixture({ id: 'earlier-install', updatedAt: 100, installedAt: 10 }),
      fixture({ id: 'later-install', updatedAt: 100, installedAt: 20 }),
    ];
    expect(sortByNewest(records).map((r) => r.id)).toEqual([
      'later-install',
      'earlier-install',
    ]);
  });

  it('keeps the incoming order for fully tied records (stable sort)', () => {
    // A bundled catalog seeded in one transaction shares timestamps; the
    // incoming visual-appeal ranking must survive instead of degrading
    // to raw daemon order.
    const records = [
      fixture({ id: 'appeal-first', updatedAt: 50, installedAt: 50 }),
      fixture({ id: 'appeal-second', updatedAt: 50, installedAt: 50 }),
      fixture({ id: 'appeal-third', updatedAt: 50, installedAt: 50 }),
    ];
    expect(sortByNewest(records).map((r) => r.id)).toEqual([
      'appeal-first',
      'appeal-second',
      'appeal-third',
    ]);
  });

  it('ranks by manifest publishedAt when local timestamps are tied (fresh install)', () => {
    // Issue #1457 reproduction: a fresh install (or an upgrade that
    // re-stamps the catalog) seeds every bundled plugin in one boot, so
    // installedAt/updatedAt carry only the seeding walk's own clock —
    // ties and millisecond-apart folder-walk order — and "Newest"
    // silently degrades to an order unrelated to publication. The
    // manifest's publishedAt is the shipped publication date and must
    // win over those meaningless local timestamps.
    const seededAt = 1_700_000_000_000;
    const records = [
      fixture({
        id: 'published-2025',
        installedAt: seededAt,
        updatedAt: seededAt,
        publishedAt: '2025-03-01T00:00:00Z',
      }),
      fixture({
        id: 'published-2026',
        installedAt: seededAt,
        updatedAt: seededAt,
        publishedAt: '2026-06-20T00:00:00Z',
      }),
      fixture({
        id: 'published-2024',
        installedAt: seededAt,
        updatedAt: seededAt,
        publishedAt: '2024-11-05T00:00:00Z',
      }),
    ];
    expect(sortByNewest(records).map((r) => r.id)).toEqual([
      'published-2026',
      'published-2025',
      'published-2024',
    ]);
  });

  it('keeps publication order when a local content update bumps updatedAt', () => {
    // A typo fix shipped for an old template refreshes its local
    // updatedAt, but "Newest" means newly PUBLISHED — the tweaked old
    // template must not leapfrog genuinely newer publications.
    const records = [
      fixture({
        id: 'old-template-tweaked',
        updatedAt: 9_000,
        installedAt: 1_000,
        publishedAt: '2025-01-01T00:00:00Z',
      }),
      fixture({
        id: 'new-template',
        updatedAt: 1_000,
        installedAt: 1_000,
        publishedAt: '2026-05-01T00:00:00Z',
      }),
    ];
    expect(sortByNewest(records).map((r) => r.id)).toEqual([
      'new-template',
      'old-template-tweaked',
    ]);
  });

  it('preserves the incoming appeal order inside a same-publishedAt batch despite differing local timestamps', () => {
    // One catalog release stamps many templates with the same
    // publishedAt (the largest current batch is 322 manifests). A fresh
    // install then seeds those records milliseconds apart in folder-walk
    // order — local updatedAt/installedAt carry no publication signal
    // inside the batch, so they must not reshuffle it. The incoming
    // visual-appeal ranking is the shipped within-batch order.
    const publishedAt = '2026-05-12T07:18:16Z';
    const records = [
      fixture({ id: 'appeal-first', updatedAt: 5_000, installedAt: 5_000, publishedAt }),
      fixture({ id: 'appeal-second', updatedAt: 9_000, installedAt: 9_000, publishedAt }),
      fixture({ id: 'appeal-third', updatedAt: 7_000, installedAt: 7_000, publishedAt }),
    ];
    expect(sortByNewest(records).map((r) => r.id)).toEqual([
      'appeal-first',
      'appeal-second',
      'appeal-third',
    ]);
  });

  it('falls back to updatedAt for records without a parseable publishedAt', () => {
    // A user-installed plugin has no publication date; its local install
    // recency is its freshness. An invalid date string must not be
    // treated as newer or older than everything — it just falls back.
    const records = [
      fixture({
        id: 'published-recently',
        updatedAt: 1_000,
        publishedAt: '2026-01-01T00:00:00Z',
      }),
      fixture({ id: 'installed-later', updatedAt: Date.parse('2026-03-01T00:00:00Z') }),
      fixture({
        id: 'garbage-date',
        updatedAt: Date.parse('2025-06-01T00:00:00Z'),
        publishedAt: 'not-a-date',
      }),
    ];
    expect(sortByNewest(records).map((r) => r.id)).toEqual([
      'installed-later',
      'published-recently',
      'garbage-date',
    ]);
  });

  it('ranks a user-installed plugin by local recency even when its manifest carries an old publishedAt', () => {
    // publishedAt is a catalog signal. A third-party manifest (github /
    // local / marketplace install) may carry any publishedAt value, but
    // for a plugin the user installed themselves "Newest" means install
    // recency — a just-installed plugin tops the shelf instead of being
    // buried behind bundled templates with newer catalog dates.
    const records = [
      fixture({
        id: 'bundled-recent-catalog-date',
        updatedAt: 1_000,
        installedAt: 1_000,
        publishedAt: '2026-01-01T00:00:00Z',
      }),
      fixture({
        id: 'user-installed-old-manifest-date',
        sourceKind: 'github',
        updatedAt: Date.parse('2026-03-01T00:00:00Z'),
        installedAt: Date.parse('2026-03-01T00:00:00Z'),
        publishedAt: '2024-01-01T00:00:00Z',
      }),
    ];
    expect(sortByNewest(records).map((r) => r.id)).toEqual([
      'user-installed-old-manifest-date',
      'bundled-recent-catalog-date',
    ]);
  });

  it('does not mutate the input array', () => {
    const records = [
      fixture({ id: 'a', updatedAt: 1 }),
      fixture({ id: 'b', updatedAt: 2 }),
    ];
    sortByNewest(records);
    expect(records.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('sort-order persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to hot when nothing is stored', () => {
    expect(readStoredSortOrder()).toBe(DEFAULT_PLUGIN_SORT_ORDER);
    expect(readStoredSortOrder()).toBe('hot');
  });

  it('round-trips the picked order', () => {
    writeStoredSortOrder('newest');
    expect(readStoredSortOrder()).toBe('newest');
    writeStoredSortOrder('hot');
    expect(readStoredSortOrder()).toBe('hot');
  });

  it('falls back to the default on an unknown stored value', () => {
    window.localStorage.setItem('open-design:plugins-sort-order', 'bogus');
    expect(readStoredSortOrder()).toBe('hot');
  });
});
