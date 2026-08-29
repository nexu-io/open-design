import { describe, expect, it } from 'vitest';
import type { InstalledPluginRecord } from '@open-design/contracts';
import { automaticStrategyTaskProfileForRouteId } from '@open-design/contracts';
import {
  filterPluginsBySubChip,
  isSubChipParent,
  legacyPrototypeSceneForChipId,
  prototypeSceneProjectMetadata,
  prototypeSubChipForSlug,
  subChipsForChip,
} from '../src/components/home-hero/sub-chips';
import { findChip, HOME_HERO_CHIPS } from '../src/components/home-hero/chips';

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
    // Neighbour witness: HyperFrames owns no second-level rail at all, so it
    // has no nested scene that could ever swap its route.
    expect(subChipsForChip('hyperframes', records)).toEqual([]);
    expect(subChipsForChip(null, records)).toEqual([]);
  });

  it('always exposes the fixed eight prototype scenes in product order', () => {
    const records = [
      prototypePlugin('p-dash', ['dashboard']),
      prototypePlugin('p-land', ['landing-page']),
    ];
    const result = subChipsForChip('prototype', records);
    expect(result.map((s) => s.slug)).toEqual([
      'landing-marketing',
      'business-dashboards',
      'mobile',
      'wireframe',
      'app-prototypes',
      'developer-tools',
      'brand-design',
      'docs-reports',
    ]);
    const dash = result.find((s) => s.slug === 'business-dashboards');
    expect(dash?.label).toBe('Dashboards');
    // Mobile app and Wireframe carry a metadata refinement of their parent, not
    // a pointer at a first-level chip: nothing here names a chip id.
    expect(result.find((s) => s.slug === 'mobile')?.projectMetadata).toEqual({
      platform: 'auto',
      platformTargets: ['mobile-ios', 'mobile-android'],
    });
    expect(result.find((s) => s.slug === 'wireframe')?.projectMetadata).toEqual({
      fidelity: 'wireframe',
    });
    // Every other scene narrows the example rail only and stamps nothing.
    expect(
      result.filter((s) => s.projectMetadata !== undefined).map((s) => s.slug),
    ).toEqual(['mobile', 'wireframe']);
  });

  it('keeps the fixed prototype hierarchy visible without installed plugins', () => {
    expect(subChipsForChip('prototype', [])).toHaveLength(8);
  });

  it('keeps the Home prototype hierarchy independent from the dynamic plugin catalog', () => {
    const displayed = [prototypePlugin('p-land', ['landing-page'])];
    const slugs = subChipsForChip('prototype', displayed).map((s) => s.slug);
    expect(slugs).toContain('business-dashboards');
    expect(slugs).toContain('developer-tools');
    expect(slugs).toContain('mobile');
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

describe('prototypeSceneProjectMetadata', () => {
  const prototypeChip = findChip('prototype')!;

  it('stamps exactly the parent task type when no scene refines it', () => {
    // 原型 itself stamps nothing beyond the kind the create flow derives, so a
    // scene-less pick must not gain metadata just by going through the merge.
    expect(prototypeSceneProjectMetadata(prototypeChip, null)).toBeNull();
    expect(prototypeSceneProjectMetadata(prototypeChip, prototypeSubChipForSlug('app-prototypes')))
      .toBeNull();
  });

  it('stamps the parent kind plus the scene refinement, and nothing else', () => {
    // The exact metadata these two scenes stamped as first-level chips. This is
    // the whole contract of the second-level rail: same route, same plugin,
    // same project kind, plus the one thing the scene refines. `toEqual` pins
    // that no extra field is introduced, `JSON.stringify` that not even the key
    // order moved (project metadata is persisted and compared as JSON).
    const mobile = prototypeSceneProjectMetadata(
      prototypeChip,
      prototypeSubChipForSlug('mobile'),
    );
    expect(mobile).toEqual({
      kind: 'prototype',
      platform: 'auto',
      platformTargets: ['mobile-ios', 'mobile-android'],
    });
    expect(JSON.stringify(mobile)).toBe(
      '{"kind":"prototype","platform":"auto","platformTargets":["mobile-ios","mobile-android"]}',
    );

    const wireframe = prototypeSceneProjectMetadata(
      prototypeChip,
      prototypeSubChipForSlug('wireframe'),
    );
    expect(wireframe).toEqual({ kind: 'prototype', fidelity: 'wireframe' });
    expect(JSON.stringify(wireframe)).toBe('{"kind":"prototype","fidelity":"wireframe"}');
  });

  it('lets the parent keep the fields the scene does not refine', () => {
    // Witness for a parent that already stamps metadata of its own: a scene
    // layers onto it rather than replacing it, and can never restate `kind`.
    const webClone = findChip('web-clone')!;
    expect(prototypeSceneProjectMetadata(webClone, prototypeSubChipForSlug('wireframe')))
      .toEqual({ kind: 'prototype', intent: 'web-clone', fidelity: 'wireframe' });
    expect(prototypeSceneProjectMetadata(webClone, null))
      .toEqual({ kind: 'prototype', intent: 'web-clone' });
  });
});

describe('legacyPrototypeSceneForChipId', () => {
  it('folds the two retired top-level chip ids onto the scenes they became', () => {
    // Persisted composer drafts and queued cross-surface intents still carry
    // these ids; the scenes themselves are no longer chips.
    expect(legacyPrototypeSceneForChipId('mobile')?.slug).toBe('mobile');
    expect(legacyPrototypeSceneForChipId('wireframe')?.slug).toBe('wireframe');
    expect(findChip('mobile')).toBeUndefined();
    expect(findChip('wireframe')).toBeUndefined();
  });

  it('leaves every live chip id — and no id at all — alone', () => {
    for (const chip of HOME_HERO_CHIPS) {
      expect(legacyPrototypeSceneForChipId(chip.id), chip.id).toBeNull();
    }
    expect(legacyPrototypeSceneForChipId('landing-marketing')).toBeNull();
    expect(legacyPrototypeSceneForChipId(null)).toBeNull();
  });

  it('routes exactly the product-owned OD Next task types and nothing else', () => {
    // Full catalog sweep: a chip id IS a first-level task type now, so the
    // automatic route set is read straight off the catalog. It must not
    // silently grow when a chip is added.
    const routed = HOME_HERO_CHIPS
      .filter((chip) => automaticStrategyTaskProfileForRouteId(chip.id) !== null)
      .map((chip) => chip.id)
      .sort();
    expect(routed).toEqual(['deck', 'hyperframes', 'prototype']);
    // And a second-level scene has no id of its own to route by, so it can
    // neither claim a route nor strand its parent's.
    for (const scene of subChipsForChip('prototype', [])) {
      expect(automaticStrategyTaskProfileForRouteId(scene.slug), scene.slug).toBeNull();
    }
  });
});
