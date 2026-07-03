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

  it('groups live artifacts ahead of their underlying rendering mode', () => {
    expect(
      extractCategories(
        fixture({
          id: 'example-live-dashboard',
          tags: ['live-dashboard'],
          od: { mode: 'prototype' },
        }),
      ),
    ).toEqual(['live-artifact']);
    expect(
      extractCategories(
        fixture({
          id: 'image-template-notion-team-dashboard-live-artifact',
          tags: ['live-artifact'],
          od: { mode: 'image' },
        }),
      ),
    ).toEqual(['live-artifact']);
    expect(
      extractCategories(
        fixture({
          id: 'example-social-media-matrix-tracker-template',
          tags: ['live-artifacts'],
          od: { mode: 'template' },
        }),
      ),
    ).toEqual(['live-artifact']);
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

  // Deck scenes are the 15 commercial "品类" buckets, resolved from the plugin's
  // commercial category id (od.category / a category tag / od.scenario) rather
  // than tag-slug heuristics, so the filter row shares one taxonomy with the
  // per-card category chip.
  it('maps deck templates to their commercial scene by resolved category id', () => {
    expect(extractSubcategories(fixture({ id: 'pitch', od: { mode: 'deck', category: 'fundraising-pitch' } }))).toEqual(['fundraising-pitch']);
    expect(extractSubcategories(fixture({ id: 'board', od: { mode: 'deck', category: 'corporate-strategy' } }))).toEqual(['corporate-strategy']);
    expect(extractSubcategories(fixture({ id: 'sales', od: { mode: 'deck', category: 'b2b-sales' } }))).toEqual(['b2b-sales']);
    expect(extractSubcategories(fixture({ id: 'craft', od: { mode: 'deck', category: 'design-craft' } }))).toEqual(['design-craft']);
    // A category tag resolves the scene when od.category is absent.
    expect(extractSubcategories(fixture({ id: 'tagged', tags: ['ai-literacy'], od: { mode: 'deck' } }))).toEqual(['ai-literacy']);
    // A deck with no resolvable commercial category lands in no scene bucket.
    expect(extractSubcategories(fixture({ id: 'bare', tags: ['pitch-deck'], od: { mode: 'deck' } }))).toEqual([]);
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

  // Regression: the prototype/image/video rail display order
  // (SUBCATEGORY_DISPLAY_ORDER) must NOT change which bucket an overlapping-tag
  // plugin lands in. Bucketing is decided by SUBCATEGORIES matching precedence,
  // which stays stable even though Brand / design renders first in the rails.
  // (Decks are exempt: their bucket is the single resolved commercial category.)
  it('keeps bucket membership stable for overlapping-tag plugins regardless of display order', () => {
    // `dashboard` + `design`: stays in Dashboards (not Brand / design).
    expect(
      extractSubcategories(fixture({ id: 'dash-glass', tags: ['dashboard', 'design'], od: { mode: 'prototype' } })),
    ).toEqual(['business-dashboards']);
    // mobile app + `design`: stays in Apps (not Brand / design).
    expect(
      extractSubcategories(fixture({ id: 'mobile', tags: ['mobile-app', 'design'], od: { mode: 'prototype' } })),
    ).toEqual(['app-prototypes']);
    // landing + `brand`: stays in Landing / marketing (not Brand / design).
    expect(
      extractSubcategories(fixture({ id: 'landing-brand', tags: ['saas-landing', 'brand'], od: { mode: 'prototype' } })),
    ).toEqual(['landing-marketing']);
  });

  it('keeps Live Artifact, HyperFrames, and Audio flat with no second-level buckets', () => {
    expect(
      extractSubcategories(
        fixture({
          id: 'example-live-artifact',
          tags: ['live-artifact'],
          od: { mode: 'prototype' },
        }),
      ),
    ).toEqual([]);
    expect(extractSubcategories(fixture({ id: 'hf', tags: ['hyperframes'], od: { mode: 'video' } }))).toEqual([]);
    expect(extractSubcategories(fixture({ id: 'audio', od: { mode: 'audio' } }))).toEqual([]);
  });
});

describe('buildFacetCatalog', () => {
  it('produces artifact-kind primary tabs in product order', () => {
    const catalog = buildFacetCatalog([
      fixture({ id: 'prototype', tags: ['dashboard'], od: { mode: 'prototype' } }),
      fixture({ id: 'example-live-artifact', tags: ['live-artifact'], od: { mode: 'prototype' } }),
      fixture({ id: 'deck', tags: ['pitch-deck'], od: { mode: 'deck' } }),
      fixture({ id: 'image', tags: ['profile-avatar'], od: { mode: 'image' } }),
      fixture({ id: 'video', tags: ['cinematic'], od: { mode: 'video' } }),
      fixture({ id: 'hf', tags: ['hyperframes'], od: { mode: 'video' } }),
      fixture({ id: 'audio', od: { mode: 'audio' } }),
      fixture({ id: 'design-system', od: { mode: 'design-system' } }),
    ]);

    expect(catalog.category.map((o) => [o.slug, o.count])).toEqual([
      ['deck', 1],
      ['prototype', 1],
      ['live-artifact', 1],
      ['image', 1],
      ['video', 1],
      ['hyperframes', 1],
      ['audio', 1],
    ]);
    // Display order (SUBCATEGORY_DISPLAY_ORDER) — distinct from the matching
    // precedence encoded by the SUBCATEGORIES array order.
    expect((catalog.subcategory.prototype ?? []).map((o) => o.slug)).toEqual([
      'landing-marketing',
      'brand-design',
      'business-dashboards',
      'app-prototypes',
      'developer-tools',
      'docs-reports',
    ]);
    // Deck scenes: the 15 commercial "品类" buckets in commercial-priority order.
    expect((catalog.subcategory.deck ?? []).map((o) => o.slug)).toEqual([
      'fundraising-pitch',
      'corporate-strategy',
      'b2b-sales',
      'product-management',
      'design-craft',
      'marketing-gtm',
      'data-finance',
      'consulting',
      'government-policy',
      'professional-training',
      'academic-research',
      'ai-literacy',
      'career',
      'student-coursework',
      'life',
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
    expect(catalog.subcategory['live-artifact']).toBeUndefined();
    expect(catalog.subcategory.hyperframes).toBeUndefined();
    expect(catalog.subcategory.audio).toBeUndefined();
  });
});

describe('applyFacetSelection', () => {
  const plugins = [
    fixture({ id: 'prototype-dashboard', tags: ['dashboard'], od: { mode: 'prototype' } }),
    fixture({ id: 'prototype-app', tags: ['mobile-app'], od: { mode: 'prototype' } }),
    fixture({ id: 'example-live-artifact', tags: ['live-artifact'], od: { mode: 'prototype' } }),
    fixture({ id: 'deck', od: { mode: 'deck', category: 'fundraising-pitch' } }),
    fixture({ id: 'image', tags: ['profile-avatar'], od: { mode: 'image' } }),
    fixture({ id: 'video', tags: ['cinematic'], od: { mode: 'video' } }),
    fixture({ id: 'hf', tags: ['hyperframes'], od: { mode: 'video' } }),
    fixture({ id: 'audio', od: { mode: 'audio' } }),
  ];

  it('returns everything when no category is selected', () => {
    expect(
      applyFacetSelection(plugins, { category: null, subcategory: null }).map((p) => p.id),
    ).toEqual([
      'prototype-dashboard',
      'prototype-app',
      'example-live-artifact',
      'deck',
      'image',
      'video',
      'hf',
      'audio',
    ]);
  });

  it('filters by the selected artifact-kind category slug', () => {
    expect(
      applyFacetSelection(plugins, { category: 'prototype', subcategory: null }).map((p) => p.id),
    ).toEqual(['prototype-dashboard', 'prototype-app']);
    expect(
      applyFacetSelection(plugins, { category: 'live-artifact', subcategory: null }).map((p) => p.id),
    ).toEqual(['example-live-artifact']);
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
    // Deck scene bucket = the plugin's resolved commercial category.
    expect(
      applyFacetSelection(plugins, { category: 'deck', subcategory: 'fundraising-pitch' }).map((p) => p.id),
    ).toEqual(['deck']);
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
  it('defaults the home catalog to Slides when that bucket exists', () => {
    const catalog = buildFacetCatalog([
      fixture({ id: 'slides', od: { mode: 'deck' } }),
      fixture({ id: 'prototype', od: { mode: 'prototype' } }),
    ]);

    expect(resolveDefaultSelection(catalog)).toEqual({
      category: 'deck',
      subcategory: null,
    });
  });

  it('falls back to the first populated artifact kind when Slides is unavailable', () => {
    const catalog = buildFacetCatalog([
      fixture({ id: 'prototype', od: { mode: 'prototype' } }),
    ]);

    expect(resolveDefaultSelection(catalog)).toEqual({
      category: 'prototype',
      subcategory: null,
    });
  });
});
