// Second-level "sub-type" rail for the Home input card.
//
// After a first-level create chip is picked (Prototype / Slide deck), this
// rail surfaces a compact row of sub-categories — mirroring how Manus shows
// "landing page / dashboard / portfolio" under its "Website" choice, and
// matching the exact sub-category taxonomy the Community plugin grid uses.
//
// The list is NOT hand-authored here: it is derived from the same
// `SUBCATEGORIES` facet table the Community section uses
// (`plugins-home/facets.ts`), so the labels and grouping stay in lockstep.
// Picking a sub-type filters the example-prompt cards below the rail to that
// scene; it does NOT bind a plugin or stamp an active badge.

import type { InstalledPluginRecord } from '@open-design/contracts';
import type { IconName } from '../Icon';
import {
  buildSubcategoryCatalog,
  extractSubcategories,
  type FacetOption,
} from '../plugins-home/facets';

// Parent chips that carry a second-level rail. Media chips (image/video/
// audio/hyperframes) own their own inline composer form and are excluded;
// the facet table only defines children for prototype/deck/image/video, and
// we surface the rail for prototype + deck.
export type SubChipParentId = 'prototype' | 'deck';

export interface HomeHeroSubChip {
  // Facet subcategory slug, e.g. 'business-dashboards'.
  slug: string;
  label: string;
  icon: IconName;
}

const PARENT_IDS: readonly SubChipParentId[] = ['prototype', 'deck'];

// Icon per facet subcategory slug. Falls back to a neutral glyph so a newly
// added facet still renders a pill rather than crashing.
const SUBCATEGORY_ICONS: Record<string, IconName> = {
  // prototype
  'business-dashboards': 'grid',
  'app-prototypes': 'blocks',
  'landing-marketing': 'globe',
  'developer-tools': 'terminal',
  'docs-reports': 'file',
  'brand-design': 'palette',
  // deck
  'pitch-business': 'present',
  'course-training': 'lightbulb',
  'reports-briefings': 'file',
  'product-sales': 'star',
  'engineering-talks': 'terminal',
  'creative-decks': 'palette',
};
const DEFAULT_SUBCATEGORY_ICON: IconName = 'blocks';

// Home-rail display order overrides. Slugs listed here float to the front (in
// this order); everything else keeps the Community facet order behind them.
// Kept local so it doesn't perturb the Community section's ordering.
const SUBCATEGORY_PRIORITY: Partial<Record<SubChipParentId, readonly string[]>> = {
  prototype: ['landing-marketing'],
};

function orderSubcategories(
  parent: SubChipParentId,
  options: readonly FacetOption[],
): FacetOption[] {
  const priority = SUBCATEGORY_PRIORITY[parent];
  if (!priority || priority.length === 0) return [...options];
  const rank = (slug: string) => {
    const index = priority.indexOf(slug);
    return index === -1 ? priority.length : index;
  };
  return [...options].sort((a, b) => rank(a.slug) - rank(b.slug));
}

export function isSubChipParent(chipId: string | null): chipId is SubChipParentId {
  return chipId === 'prototype' || chipId === 'deck';
}

// Sub-types for a first-level chip, drawn from the Community facet catalog so
// the labels match exactly. Only sub-categories that actually have installed
// plugins (count > 0) are surfaced, preserving the facet display order.
// Returns [] for chips without a second-level rail.
export function subChipsForChip(
  chipId: string | null,
  plugins: InstalledPluginRecord[],
): HomeHeroSubChip[] {
  if (!isSubChipParent(chipId)) return [];
  const catalog = buildSubcategoryCatalog(plugins);
  const options: FacetOption[] = catalog[chipId] ?? [];
  return orderSubcategories(chipId, options.filter((option) => option.count > 0))
    .map((option) => ({
      slug: option.slug,
      label: option.label,
      icon: SUBCATEGORY_ICONS[option.slug] ?? DEFAULT_SUBCATEGORY_ICON,
    }));
}

// Narrow a list of example-prompt plugins to a chosen sub-category. The
// `parent` chip id scopes which facet subcategory table is consulted.
export function filterPluginsBySubChip(
  plugins: InstalledPluginRecord[],
  parent: SubChipParentId,
  subcategorySlug: string,
): InstalledPluginRecord[] {
  return plugins.filter((plugin) =>
    extractSubcategories(plugin, parent).includes(subcategorySlug),
  );
}

export { PARENT_IDS };
