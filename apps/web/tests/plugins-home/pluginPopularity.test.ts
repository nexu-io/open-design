import { describe, expect, it } from 'vitest';
import {
  PLUGIN_POPULARITY,
  PLUGIN_NO_PREVIEW,
} from '../../src/components/plugins-home/pluginPopularity.generated';
import {
  ALWAYS_LAST,
  POPULARITY_LEADS_CURATION,
  comparePluginGalleryOrder,
  isSunkToBottom,
  pluginPopularityScore,
} from '../../src/components/plugins-home/pluginPopularity';

// Assertions are written against invariants, not specific mid-list ids, so the
// weekly data refresh does not turn this red.
const scoredIds = Object.keys(PLUGIN_POPULARITY);
const UNSCORED = '__retired_or_unknown_plugin__';
// Two scored ids that are NOT sunk, highest and lowest, to check the ordering.
const rankable = scoredIds.filter((id) => !isSunkToBottom(id)).sort((a, b) => PLUGIN_POPULARITY[b]! - PLUGIN_POPULARITY[a]!);

describe('pluginPopularity', () => {
  it('scores every listed template in (0, 1] and returns null for unknown/retired ids', () => {
    expect(pluginPopularityScore(UNSCORED)).toBeNull();
    expect(scoredIds.length).toBeGreaterThan(0);
    for (const id of scoredIds) {
      const score = pluginPopularityScore(id);
      expect(score).not.toBeNull();
      expect(score!).toBeGreaterThan(0);
      expect(score!).toBeLessThanOrEqual(1);
    }
  });

  it('sinks the default mode-seeds and the no-preview tiles to the bottom', () => {
    for (const id of [...ALWAYS_LAST, ...PLUGIN_NO_PREVIEW]) {
      expect(isSunkToBottom(id)).toBe(true);
    }
    expect(isSunkToBottom('example-open-design-landing')).toBe(false);
  });

  it('orders a sunk tile after a normal one regardless of usage', () => {
    const normal = rankable[0]!;
    const sunk = ALWAYS_LAST[0]!; // example-web-prototype — the top-usage seed
    expect(comparePluginGalleryOrder(normal, sunk, false, false)).toBeLessThan(0);
    expect(comparePluginGalleryOrder(sunk, normal, false, false)).toBeGreaterThan(0);
  });

  it('orders non-prototype tiles by usage (higher score first)', () => {
    const hi = rankable[0]!;
    const lo = rankable[rankable.length - 1]!;
    if (PLUGIN_POPULARITY[hi]! !== PLUGIN_POPULARITY[lo]!) {
      expect(comparePluginGalleryOrder(hi, lo, false, false)).toBeLessThan(0);
      expect(comparePluginGalleryOrder(lo, hi, false, false)).toBeGreaterThan(0);
    }
  });

  it('skips usage for curation-governed (prototype) tiles, deferring to curated order', () => {
    const hi = rankable[0]!;
    const lo = rankable[rankable.length - 1]!;
    // both governed by curation -> popularity ignored -> defer (0)
    expect(comparePluginGalleryOrder(hi, lo, true, true)).toBe(0);
  });

  it('keeps the usage-ordering knob on (OPEND-449)', () => {
    expect(POPULARITY_LEADS_CURATION).toBe(true);
  });
});
