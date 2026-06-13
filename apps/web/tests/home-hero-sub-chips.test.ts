import { describe, expect, it } from 'vitest';
import type { InstalledPluginRecord } from '@open-design/contracts';
import {
  filterPluginsBySubChip,
  isSubChipParent,
  subChipsForChip,
} from '../src/components/home-hero/sub-chips';

// Minimal record whose facet derivation lands in a known prototype scene.
// `byMode('prototype')` keys off manifest.od.mode; subcategory tests key off
// tags (slugified). See plugins-home/facets.ts.
function prototypePlugin(id: string, tags: string[]): InstalledPluginRecord {
  return {
    id,
    title: id,
    manifest: { name: id, od: { mode: 'prototype' }, tags },
  } as unknown as InstalledPluginRecord;
}

describe('subChipsForChip', () => {
  it('returns no sub-chips for chips without a second-level rail', () => {
    const records = [prototypePlugin('p-dash', ['dashboard'])];
    expect(subChipsForChip('image', records)).toEqual([]);
    expect(subChipsForChip('video', records)).toEqual([]);
    expect(subChipsForChip('audio', records)).toEqual([]);
    expect(subChipsForChip('live-artifact', records)).toEqual([]);
    expect(subChipsForChip(null, records)).toEqual([]);
  });

  it('surfaces only prototype sub-categories that have installed plugins, using facet labels', () => {
    const records = [
      prototypePlugin('p-dash', ['dashboard']),
      prototypePlugin('p-land', ['landing-page']),
    ];
    const result = subChipsForChip('prototype', records);
    const slugs = result.map((s) => s.slug);
    expect(slugs).toContain('business-dashboards');
    expect(slugs).toContain('landing-marketing');
    // No app/dev/docs/brand plugins installed → those pills are hidden.
    expect(slugs).not.toContain('app-prototypes');
    expect(slugs).not.toContain('developer-tools');
    // Labels match the Community facet table exactly.
    const dash = result.find((s) => s.slug === 'business-dashboards');
    expect(dash?.label).toBe('Dashboards');
  });

  it('returns an empty list when the chip has no installed plugins', () => {
    expect(subChipsForChip('prototype', [])).toEqual([]);
  });

  it('only surfaces pills for sub-categories present in the candidate list it is given', () => {
    // Regression for the "looks unfiltered" bug: subchips must be derived from
    // the SAME list that feeds the preset cards. A dashboard plugin that exists
    // in the full install set but is NOT in the displayed candidate list must
    // not produce a Dashboards pill — otherwise selecting it would filter to an
    // empty/fallback slice.
    const displayed = [prototypePlugin('p-land', ['landing-page'])];
    const slugs = subChipsForChip('prototype', displayed).map((s) => s.slug);
    expect(slugs).toEqual(['landing-marketing']);
    expect(slugs).not.toContain('business-dashboards');

    // And every pill the helper returns must filter to a non-empty slice of
    // that same list.
    for (const slug of slugs) {
      expect(filterPluginsBySubChip(displayed, 'prototype', slug).length).toBeGreaterThan(0);
    }
  });
});

describe('filterPluginsBySubChip', () => {
  it('narrows a plugin list to the chosen sub-category', () => {
    const dash = prototypePlugin('p-dash', ['dashboard']);
    const land = prototypePlugin('p-land', ['landing-page']);
    const result = filterPluginsBySubChip([dash, land], 'prototype', 'business-dashboards');
    expect(result.map((p) => p.id)).toEqual(['p-dash']);
  });
});

describe('isSubChipParent', () => {
  it('matches only prototype and deck', () => {
    expect(isSubChipParent('prototype')).toBe(true);
    expect(isSubChipParent('deck')).toBe(true);
    expect(isSubChipParent('image')).toBe(false);
    expect(isSubChipParent(null)).toBe(false);
  });
});
