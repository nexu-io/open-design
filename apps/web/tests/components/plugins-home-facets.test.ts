// Facet derivation contract for the plugins-home filter row. The
// home section is driven by artifact-kind primary tabs that mirror the
// artifact creation surface, plus scene buckets derived from the
// user-query taxonomy for the crowded template types.

import { describe, expect, it } from 'vitest';
import type { InstalledPluginRecord } from '@open-design/contracts';
import {
  applyFacetSelection,
  buildFacetCatalog,
  extractCategories,
  extractSubcategories,
  isFeaturedPlugin,
  resolveDefaultSelection,
} from '../../src/components/plugins-home/facets';

function fixture(overrides: {
  id: string;
  title?: string;
  tags?: string[];
  od?: Record<string, unknown>;
}): InstalledPluginRecord {
  return {
    id: overrides.id,
    title: overrides.title ?? overrides.id,
    version: '0.1.0',
    sourceKind: 'bundled',
    source: '/tmp',
    trust: 'bundled',
    capabilitiesGranted: ['prompt:inject'],
    manifest: {
      name: overrides.id,
      version: '0.1.0',
      ...(overrides.tags ? { tags: overrides.tags } : {}),
      ...(overrides.od ? { od: overrides.od } : {}),
    },
    fsPath: '/tmp',
    installedAt: 0,
    updatedAt: 0,
  };
}

describe('extractCategories', () => {
  it('maps generation modes to artifact-kind primary tabs', () => {
    expect(extractCategories(fixture({ id: 'prototype', od: { mode: 'prototype' } }))).toEqual(['prototype']);
    expect(extractCategories(fixture({ id: 'deck', od: { mode: 'deck' } }))).toEqual(['deck']);
    expect(extractCategories(fixture({ id: 'image', od: { mode: 'image' } }))).toEqual(['image']);
    expect(extractCategories(fixture({ id: 'video', od: { mode: 'video' } }))).toEqual(['video']);
    expect(extractCategories(fixture({ id: 'audio', od: { mode: 'audio' } }))).toEqual(['audio']);
  });

  it('splits HyperFrames from the broader video mode', () => {
    expect(
      extractCategories(fixture({ id: 'hf', tags: ['hyperframes'], od: { mode: 'video' } })),
    ).toEqual(['hyperframes']);
    expect(
      extractCategories(fixture({ id: 'composition', tags: ['video-composition'], od: { mode: 'video' } })),
    ).toEqual(['hyperframes']);
  });

  it('keeps non-artifact workflow and design-system plugins out of primary tabs', () => {
    expect(extractCategories(fixture({ id: 'design-system', od: { mode: 'design-system' } }))).toEqual([]);
    expect(extractCategories(fixture({ id: 'import', od: { taskKind: 'figma-migration', mode: 'scenario' } }))).toEqual([]);
    expect(extractCategories(fixture({ id: 'export', tags: ['export', 'react'], od: { mode: 'export' } }))).toEqual([]);
    expect(extractCategories(fixture({ id: 'utility', od: { mode: 'utility' } }))).toEqual([]);
  });

  it('normalises mode casing / formatting via slugify before matching', () => {
    expect(extractCategories(fixture({ id: 'a', od: { mode: 'Prototype' } }))).toEqual(['prototype']);
    expect(extractCategories(fixture({ id: 'b', od: { mode: 'slide_deck' } }))).toEqual([]);
    expect(extractCategories(fixture({ id: 'c', od: { mode: 'deck' } }))).toEqual(['deck']);
  });
});

describe('extractSubcategories', () => {
  it('maps prototype templates to prompt-taxonomy scene buckets', () => {
    expect(extractSubcategories(fixture({ id: 'dashboard', tags: ['dashboard'], od: { mode: 'prototype' } }))).toEqual(['business-dashboards']);
    expect(extractSubcategories(fixture({ id: 'app', tags: ['mobile-app'], od: { mode: 'prototype' } }))).toEqual(['app-prototypes']);
    expect(extractSubcategories(fixture({ id: 'landing', tags: ['saas-landing'], od: { mode: 'prototype' } }))).toEqual(['landing-marketing']);
    expect(extractSubcategories(fixture({ id: 'dev', tags: ['engineering'], od: { mode: 'prototype' } }))).toEqual(['developer-tools']);
    expect(extractSubcategories(fixture({ id: 'clinical', tags: ['case-report'], od: { mode: 'prototype' } }))).toEqual(['docs-reports']);
    expect(extractSubcategories(fixture({ id: 'brand', tags: ['wireframe'], od: { mode: 'prototype' } }))).toEqual(['brand-design']);
  });

  it('maps deck templates to pitch, course, report, product, engineering, and creative scenes', () => {
    expect(extractSubcategories(fixture({ id: 'pitch', tags: ['pitch-deck'], od: { mode: 'deck' } }))).toEqual(['pitch-business']);
    expect(extractSubcategories(fixture({ id: 'course', tags: ['course-module'], od: { mode: 'deck' } }))).toEqual(['course-training']);
    expect(extractSubcategories(fixture({ id: 'report', tags: ['weekly-report'], od: { mode: 'deck' } }))).toEqual(['reports-briefings']);
    expect(extractSubcategories(fixture({ id: 'launch', tags: ['product-launch'], od: { mode: 'deck' } }))).toEqual(['product-sales']);
    expect(extractSubcategories(fixture({ id: 'tech', tags: ['tech-sharing'], od: { mode: 'deck' } }))).toEqual(['engineering-talks']);
    expect(extractSubcategories(fixture({ id: 'creative', tags: ['zhangzara'], od: { mode: 'deck' } }))).toEqual(['creative-decks']);
  });

  it('maps image templates to visual-scene buckets', () => {
    expect(extractSubcategories(fixture({ id: 'ui', tags: ['app-web-design'], od: { mode: 'image' } }))).toEqual(['ui-product-mockups']);
    expect(extractSubcategories(fixture({ id: 'brand', tags: ['typography'], od: { mode: 'image' } }))).toEqual(['brand-visuals']);
    expect(extractSubcategories(fixture({ id: 'storyboard', tags: ['storyboard'], od: { mode: 'image' } }))).toEqual(['storyboards-motion-refs']);
    expect(extractSubcategories(fixture({ id: 'social', tags: ['social-media-post'], od: { mode: 'image' } }))).toEqual(['social-content']);
    expect(extractSubcategories(fixture({ id: 'portrait', tags: ['profile-avatar'], od: { mode: 'image' } }))).toEqual(['avatar-portrait']);
    expect(extractSubcategories(fixture({ id: 'illustration', tags: ['illustration'], od: { mode: 'image' } }))).toEqual(['illustration-style']);
  });

  it('maps non-HyperFrames video templates to scene buckets', () => {
    expect(extractSubcategories(fixture({ id: 'motion', tags: ['motion-graphics'], od: { mode: 'video' } }))).toEqual(['motion-effects']);
    expect(extractSubcategories(fixture({ id: 'social', tags: ['short-form'], od: { mode: 'video' } }))).toEqual(['social-short-form']);
    expect(extractSubcategories(fixture({ id: 'marketing', tags: ['product-promo'], od: { mode: 'video' } }))).toEqual(['marketing-product']);
    expect(extractSubcategories(fixture({ id: 'data', tags: ['flowchart'], od: { mode: 'video' } }))).toEqual(['data-explainers']);
    expect(extractSubcategories(fixture({ id: 'cinema', tags: ['cinematic'], od: { mode: 'video' } }))).toEqual(['cinematic-story']);
  });

  it('keeps HyperFrames and Audio flat with no second-level buckets', () => {
    expect(extractSubcategories(fixture({ id: 'hf', tags: ['hyperframes'], od: { mode: 'video' } }))).toEqual([]);
    expect(extractSubcategories(fixture({ id: 'audio', od: { mode: 'audio' } }))).toEqual([]);
  });
});

describe('buildFacetCatalog', () => {
  it('produces artifact-kind primary tabs in product order', () => {
    const catalog = buildFacetCatalog([
      fixture({ id: 'prototype', tags: ['dashboard'], od: { mode: 'prototype' } }),
      fixture({ id: 'deck', tags: ['pitch-deck'], od: { mode: 'deck' } }),
      fixture({ id: 'image', tags: ['profile-avatar'], od: { mode: 'image' } }),
      fixture({ id: 'video', tags: ['cinematic'], od: { mode: 'video' } }),
      fixture({ id: 'hf', tags: ['hyperframes'], od: { mode: 'video' } }),
      fixture({ id: 'audio', od: { mode: 'audio' } }),
      fixture({ id: 'design-system', od: { mode: 'design-system' } }),
    ]);

    expect(catalog.category.map((o) => [o.slug, o.count])).toEqual([
      ['prototype', 1],
      ['deck', 1],
      ['image', 1],
      ['video', 1],
      ['hyperframes', 1],
      ['audio', 1],
    ]);
    expect((catalog.subcategory.prototype ?? []).map((o) => o.slug)).toEqual([
      'business-dashboards',
      'app-prototypes',
      'landing-marketing',
      'developer-tools',
      'docs-reports',
      'brand-design',
    ]);
    expect((catalog.subcategory.deck ?? []).map((o) => o.slug)).toEqual([
      'pitch-business',
      'course-training',
      'reports-briefings',
      'product-sales',
      'engineering-talks',
      'creative-decks',
    ]);
    expect((catalog.subcategory.image ?? []).map((o) => o.slug)).toEqual([
      'ui-product-mockups',
      'brand-visuals',
      'storyboards-motion-refs',
      'social-content',
      'avatar-portrait',
      'illustration-style',
    ]);
    expect((catalog.subcategory.video ?? []).map((o) => o.slug)).toEqual([
      'motion-effects',
      'social-short-form',
      'marketing-product',
      'data-explainers',
      'cinematic-story',
    ]);
    expect(catalog.subcategory.hyperframes).toBeUndefined();
    expect(catalog.subcategory.audio).toBeUndefined();
  });
});

describe('applyFacetSelection', () => {
  const plugins = [
    fixture({ id: 'prototype-dashboard', tags: ['dashboard'], od: { mode: 'prototype' } }),
    fixture({ id: 'prototype-app', tags: ['mobile-app'], od: { mode: 'prototype' } }),
    fixture({ id: 'deck', tags: ['pitch-deck'], od: { mode: 'deck' } }),
    fixture({ id: 'image', tags: ['profile-avatar'], od: { mode: 'image' } }),
    fixture({ id: 'video', tags: ['cinematic'], od: { mode: 'video' } }),
    fixture({ id: 'hf', tags: ['hyperframes'], od: { mode: 'video' } }),
    fixture({ id: 'audio', od: { mode: 'audio' } }),
  ];

  it('returns everything when no category is selected', () => {
    expect(
      applyFacetSelection(plugins, { category: null, subcategory: null }).map((p) => p.id),
    ).toEqual(['prototype-dashboard', 'prototype-app', 'deck', 'image', 'video', 'hf', 'audio']);
  });

  it('filters by the selected artifact-kind category slug', () => {
    expect(
      applyFacetSelection(plugins, { category: 'prototype', subcategory: null }).map((p) => p.id),
    ).toEqual(['prototype-dashboard', 'prototype-app']);
    expect(
      applyFacetSelection(plugins, { category: 'hyperframes', subcategory: null }).map((p) => p.id),
    ).toEqual(['hf']);
    expect(
      applyFacetSelection(plugins, { category: 'video', subcategory: null }).map((p) => p.id),
    ).toEqual(['video']);
  });

  it('filters by the selected scene bucket inside the selected artifact kind', () => {
    expect(
      applyFacetSelection(plugins, { category: 'prototype', subcategory: 'business-dashboards' }).map((p) => p.id),
    ).toEqual(['prototype-dashboard']);
    expect(
      applyFacetSelection(plugins, { category: 'prototype', subcategory: 'app-prototypes' }).map((p) => p.id),
    ).toEqual(['prototype-app']);
  });
});

describe('isFeaturedPlugin', () => {
  it('returns true for boolean featured picks and numeric curator ranks', () => {
    expect(isFeaturedPlugin(fixture({ id: 'a', od: { featured: true } }))).toBe(true);
    expect(isFeaturedPlugin(fixture({ id: 'ranked', od: { featured: 4 } }))).toBe(true);
    expect(isFeaturedPlugin(fixture({ id: 'b', od: { featured: 'true' } }))).toBe(false);
    expect(isFeaturedPlugin(fixture({ id: 'c' }))).toBe(false);
  });
});

describe('resolveDefaultSelection', () => {
  it('defaults the home catalog to Prototype when that bucket exists', () => {
    const catalog = buildFacetCatalog([
      fixture({ id: 'slides', od: { mode: 'deck' } }),
      fixture({ id: 'prototype', od: { mode: 'prototype' } }),
    ]);

    expect(resolveDefaultSelection(catalog)).toEqual({
      category: 'prototype',
      subcategory: null,
    });
  });

  it('falls back to the first populated artifact kind when Prototype is unavailable', () => {
    const catalog = buildFacetCatalog([
      fixture({ id: 'slides', od: { mode: 'deck' } }),
    ]);

    expect(resolveDefaultSelection(catalog)).toEqual({
      category: 'deck',
      subcategory: null,
    });
  });
});
