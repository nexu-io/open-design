// Facet derivation contract for the plugins-home filter row. The
// home section is driven by a single curated workflow axis (Import /
// Create / Export / Refine / Extend) plus scoped subcategories inside
// the active lane. These tests lock the per-record category extraction,
// the catalog build (preserves curated order, drops empty buckets), and
// the selection-based filtering so the manifest fields the catalog
// depends on don't silently drift.

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
  it('maps generation modes to the single Create lane', () => {
    expect(extractCategories(fixture({ id: 'a', od: { mode: 'deck' } }))).toEqual(['create']);
    expect(extractCategories(fixture({ id: 'b', od: { mode: 'prototype' } }))).toEqual(['create']);
    expect(extractCategories(fixture({ id: 'c', od: { mode: 'design-system' } }))).toEqual(['create']);
    expect(extractCategories(fixture({ id: 'd', od: { mode: 'image' } }))).toEqual(['create']);
    expect(extractCategories(fixture({ id: 'e', od: { mode: 'video' } }))).toEqual(['create']);
    expect(extractCategories(fixture({ id: 'f', od: { mode: 'audio' } }))).toEqual(['create']);
  });

  it('maps workflow scenario plugins to a single semantic lane', () => {
    expect(
      extractCategories(fixture({ id: 'figma', od: { taskKind: 'figma-migration', mode: 'scenario' } })),
    ).toEqual(['import']);
    expect(
      extractCategories(fixture({ id: 'folder', od: { taskKind: 'code-migration', mode: 'scenario' } })),
    ).toEqual(['import']);
    expect(
      extractCategories(fixture({ id: 'new', od: { taskKind: 'new-generation', mode: 'scenario' } })),
    ).toEqual(['create']);
    expect(
      extractCategories(fixture({ id: 'react-export', tags: ['export', 'react'], od: { mode: 'export' } })),
    ).toEqual(['export']);
    expect(
      extractCategories(fixture({ id: 'pptx-export', tags: ['html-to-pptx'], od: { mode: 'utility' } })),
    ).toEqual(['export']);
    expect(
      extractCategories(fixture({ id: 'vercel-deploy', tags: ['deploy', 'vercel'], od: { mode: 'utility' } })),
    ).toEqual(['deploy']);
    expect(
      extractCategories(fixture({ id: 'slack-share', tags: ['share', 'slack'], od: { mode: 'utility' } })),
    ).toEqual(['share']);
    expect(
      extractCategories(fixture({ id: 'tune', od: { taskKind: 'tune-collab', mode: 'scenario' } })),
    ).toEqual(['refine']);
    expect(
      extractCategories(fixture({ id: 'author', tags: ['plugin-authoring'], od: { taskKind: 'new-generation', mode: 'scenario' } })),
    ).toEqual(['extend']);
  });

  it('keeps concrete create types under Create instead of duplicating child tabs', () => {
    const f = extractCategories(
      fixture({ id: 'a', tags: ['hyperframes', 'cinematic'], od: { mode: 'video' } }),
    );
    expect(f).toEqual(['create']);
  });

  it('returns no curated categories for plugins outside the shortlist', () => {
    expect(extractCategories(fixture({ id: 'a', od: { mode: 'utility' } }))).toEqual([]);
    expect(extractCategories(fixture({ id: 'b', od: { mode: 'template' } }))).toEqual([]);
    expect(extractCategories(fixture({ id: 'c', od: { mode: 'scenario' } }))).toEqual([]);
    expect(extractCategories(fixture({ id: 'd', od: {} }))).toEqual([]);
  });

  it('normalises mode casing / formatting via slugify before matching', () => {
    expect(extractCategories(fixture({ id: 'a', od: { mode: 'Design System' } }))).toEqual(['create']);
    expect(extractCategories(fixture({ id: 'b', od: { mode: 'design_system' } }))).toEqual(['create']);
  });
});

describe('extractSubcategories', () => {
  it('maps Create plugins to concrete accumulated buckets', () => {
    expect(extractSubcategories(fixture({ id: 'a', od: { mode: 'prototype' } }))).toEqual(['prototype']);
    expect(extractSubcategories(fixture({ id: 'b', od: { mode: 'deck' } }))).toEqual(['deck']);
    expect(extractSubcategories(fixture({ id: 'c', od: { mode: 'design-system' } }))).toEqual(['design-system']);
    expect(extractSubcategories(fixture({ id: 'd', tags: ['hyperframes'], od: { mode: 'video' } }))).toEqual(['hyperframes']);
    expect(extractSubcategories(fixture({ id: 'e', od: { mode: 'image' } }))).toEqual(['image']);
  });

  it('maps Import and Export plugins to lane-scoped child buckets', () => {
    expect(
      extractSubcategories(fixture({ id: 'figma', od: { taskKind: 'figma-migration', mode: 'scenario' } })),
    ).toEqual(['from-figma']);
    expect(
      extractSubcategories(fixture({ id: 'folder', od: { taskKind: 'code-migration', mode: 'scenario' } })),
    ).toEqual(['from-code']);
    expect(
      extractSubcategories(fixture({ id: 'next-export', tags: ['export', 'nextjs', 'react'], od: { mode: 'export' } })),
    ).toEqual(['nextjs']);
    expect(
      extractSubcategories(fixture({ id: 'react-export', tags: ['export', 'react'], od: { mode: 'export' } })),
    ).toEqual(['reactjs']);
    expect(
      extractSubcategories(fixture({ id: 'vue-export', tags: ['export', 'vuejs'], od: { mode: 'export' } })),
    ).toEqual(['vuejs']);
    expect(
      extractSubcategories(fixture({ id: 'svelte-export', tags: ['export', 'sveltejs'], od: { mode: 'export' } })),
    ).toEqual(['sveltejs']);
    expect(
      extractSubcategories(fixture({ id: 'pptx-export', tags: ['html-to-pptx'], od: { mode: 'utility' } })),
    ).toEqual(['pptx']);
    expect(
      extractSubcategories(fixture({ id: 'pdf-export', tags: ['pdf-guide'], od: { mode: 'utility' } })),
    ).toEqual(['pdf']);
  });
});

describe('buildFacetCatalog', () => {
  it('produces a single category axis with curated order preserved and empty buckets dropped', () => {
    const plugins = [
      fixture({ id: 'source', od: { taskKind: 'figma-migration', mode: 'scenario' } }),
      fixture({ id: 'a', od: { mode: 'design-system' } }),
      fixture({ id: 'b', od: { mode: 'design-system' } }),
      fixture({ id: 'c', od: { mode: 'deck' } }),
      fixture({ id: 'd', od: { mode: 'image' } }),
      fixture({ id: 'e', od: { mode: 'video' } }),
      fixture({ id: 'f', tags: ['hyperframes'], od: { mode: 'video' } }),
      fixture({ id: 'react-export', tags: ['export', 'react'], od: { mode: 'export' } }),
      fixture({ id: 'next-export', tags: ['export', 'nextjs', 'react'], od: { mode: 'export' } }),
      fixture({ id: 'vue-export', tags: ['export', 'vuejs'], od: { mode: 'export' } }),
      fixture({ id: 'svelte-export', tags: ['export', 'sveltejs'], od: { mode: 'export' } }),
      fixture({ id: 'pptx-export', tags: ['html-to-pptx'], od: { mode: 'utility' } }),
      fixture({ id: 'pdf-export', tags: ['pdf-guide'], od: { mode: 'utility' } }),
      fixture({ id: 'tune', od: { taskKind: 'tune-collab', mode: 'scenario' } }),
      fixture({ id: 'author', tags: ['plugin-authoring'], od: { taskKind: 'new-generation', mode: 'scenario' } }),
      // Plugins outside the shortlist do not surface as filter pills.
      fixture({ id: 'g', od: { mode: 'utility' } }),
    ];
    const catalog = buildFacetCatalog(plugins);
    expect(catalog.category.map((o) => o.slug)).toEqual([
      'import',
      'create',
      'export',
      'share',
      'deploy',
      'refine',
      'extend',
    ]);
    expect(catalog.category.find((o) => o.slug === 'create')?.count).toBe(6);
    expect(catalog.category.find((o) => o.slug === 'import')?.count).toBe(1);
    expect(catalog.category.find((o) => o.slug === 'export')?.count).toBe(6);
    expect(catalog.category.find((o) => o.slug === 'share')?.count).toBe(0);
    expect(catalog.category.find((o) => o.slug === 'deploy')?.count).toBe(0);
    expect(catalog.category.find((o) => o.slug === 'refine')?.count).toBe(1);
    expect(catalog.category.find((o) => o.slug === 'extend')?.count).toBe(1);
    expect((catalog.subcategory.create ?? []).map((o) => o.slug)).toEqual([
      'prototype',
      'deck',
      'design-system',
      'hyperframes',
      'image',
      'video',
      'audio',
    ]);
    expect((catalog.subcategory.import ?? []).map((o) => o.slug)).toEqual([
      'from-figma',
      'from-github',
      'from-code',
      'from-url',
      'from-screenshot',
      'from-pdf',
      'from-pptx',
      'from-framer',
      'from-webflow',
    ]);
    expect((catalog.subcategory.export ?? []).map((o) => o.slug)).toEqual([
      'pptx',
      'pdf',
      'html',
      'zip',
      'markdown',
      'figma',
      'nextjs',
      'reactjs',
      'vuejs',
      'sveltejs',
      'astro',
      'angular',
      'tailwind',
    ]);
    expect((catalog.subcategory.deploy ?? []).map((o) => o.slug)).toEqual([
      'vercel',
      'cloudflare',
      'netlify',
      'github-pages',
      'fly-io',
      'render',
      'docker',
    ]);
  });

  it('keeps planned category and subcategory axes when no plugin matches', () => {
    const catalog = buildFacetCatalog([
      fixture({ id: 'a', od: { mode: 'utility' } }),
      fixture({ id: 'b', od: { mode: 'template' } }),
    ]);
    expect(catalog.category.map((o) => [o.slug, o.count])).toEqual([
      ['import', 0],
      ['create', 0],
      ['export', 0],
      ['share', 0],
      ['deploy', 0],
      ['refine', 0],
      ['extend', 0],
    ]);
    expect(catalog.subcategory.deploy?.find((o) => o.slug === 'vercel')?.count).toBe(0);
  });
});

describe('applyFacetSelection', () => {
  const plugins = [
    fixture({ id: 'a', od: { mode: 'design-system' } }),
    fixture({ id: 'b', od: { mode: 'prototype' } }),
    fixture({ id: 'c', od: { mode: 'image' } }),
    fixture({ id: 'd', od: { mode: 'video' } }),
    fixture({ id: 'e', tags: ['hyperframes'], od: { mode: 'video' } }),
    fixture({ id: 'f', tags: ['export', 'react'], od: { mode: 'export' } }),
    fixture({ id: 'h', tags: ['html-to-pptx'], od: { mode: 'utility' } }),
    fixture({ id: 'g', od: { taskKind: 'code-migration', mode: 'scenario' } }),
  ];

  it('returns everything when no category is selected', () => {
    expect(
      applyFacetSelection(plugins, { category: null, subcategory: null }).map((p) => p.id),
    ).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'h', 'g']);
  });

  it('filters by the selected category slug', () => {
    expect(
      applyFacetSelection(plugins, { category: 'create', subcategory: null }).map((p) => p.id),
    ).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(
      applyFacetSelection(plugins, { category: 'export', subcategory: null }).map((p) => p.id),
    ).toEqual(['f', 'h']);
    expect(
      applyFacetSelection(plugins, { category: 'import', subcategory: null }).map((p) => p.id),
    ).toEqual(['g']);
  });

  it('filters by the selected subcategory inside the selected category', () => {
    expect(
      applyFacetSelection(plugins, { category: 'create', subcategory: 'design-system' }).map((p) => p.id),
    ).toEqual(['a']);
    expect(
      applyFacetSelection(plugins, { category: 'create', subcategory: 'hyperframes' }).map((p) => p.id),
    ).toEqual(['e']);
    expect(
      applyFacetSelection(plugins, { category: 'export', subcategory: 'reactjs' }).map((p) => p.id),
    ).toEqual(['f']);
    expect(
      applyFacetSelection(plugins, { category: 'export', subcategory: 'pptx' }).map((p) => p.id),
    ).toEqual(['h']);
  });

  it('returns an empty list when no plugin matches the selected category', () => {
    expect(
      applyFacetSelection(plugins, { category: 'refine', subcategory: null }).map((p) => p.id),
    ).toEqual([]);
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
  it('defaults the home catalog to Create > Slides when that bucket exists', () => {
    const catalog = buildFacetCatalog([
      fixture({ id: 'slides', od: { mode: 'deck' } }),
      fixture({ id: 'prototype', od: { mode: 'prototype' } }),
    ]);

    expect(resolveDefaultSelection(catalog)).toEqual({
      category: 'create',
      subcategory: 'deck',
    });
  });

  it('falls back to the Create lane when Slides is unavailable', () => {
    const catalog = buildFacetCatalog([
      fixture({ id: 'prototype', od: { mode: 'prototype' } }),
    ]);

    expect(resolveDefaultSelection(catalog)).toEqual({
      category: 'create',
      subcategory: null,
    });
  });
});
