// Second-level "sub-type" rail for the Home input card.
//
// After a first-level create chip is picked (Prototype / Slide deck), this
// rail surfaces a compact row of sub-categories — mirroring how Manus shows
// "landing page / dashboard / portfolio" under its "Website" choice, and
// matching the exact sub-category taxonomy the Community plugin grid uses.
//
// Prototype owns a fixed Home information architecture. Its eight scenes stay
// visible even when the installed plugin catalog has no matching example.
// Deck continues to use the dynamic Community facet taxonomy.

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
  // Mobile and Wireframe used to be top-level Home chips. Keep their catalog
  // action ids so selecting the nested scene preserves the platform/fidelity
  // metadata those actions stamp on the project.
  actionChipId?: 'mobile' | 'wireframe';
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
  // deck — the 15 commercial "品类" scenes (slug === commercial category id)
  'fundraising-pitch': 'present',
  'corporate-strategy': 'kanban',
  'b2b-sales': 'send',
  'product-management': 'blocks',
  'design-craft': 'palette',
  'marketing-gtm': 'globe',
  'data-finance': 'sliders',
  consulting: 'orbit',
  'government-policy': 'info',
  'professional-training': 'lightbulb',
  'academic-research': 'search',
  'ai-literacy': 'sparkles',
  career: 'star',
  'student-coursework': 'file-text',
  life: 'sun',
};
const DEFAULT_SUBCATEGORY_ICON: IconName = 'blocks';

const PROTOTYPE_SUB_CHIPS: readonly HomeHeroSubChip[] = [
  { slug: 'landing-marketing', label: 'Landing / marketing', icon: 'globe' },
  { slug: 'business-dashboards', label: 'Dashboards', icon: 'grid' },
  { slug: 'mobile', label: 'Mobile app', icon: 'smartphone', actionChipId: 'mobile' },
  { slug: 'wireframe', label: 'Wireframe', icon: 'layout', actionChipId: 'wireframe' },
  { slug: 'app-prototypes', label: 'Apps', icon: 'blocks' },
  { slug: 'developer-tools', label: 'Developer tools', icon: 'terminal' },
  { slug: 'brand-design', label: 'Brand / design', icon: 'palette' },
  { slug: 'docs-reports', label: 'Docs / reports', icon: 'file' },
];

export function prototypeSubChipForSlug(slug: string | null): HomeHeroSubChip | null {
  if (!slug) return null;
  return PROTOTYPE_SUB_CHIPS.find((item) => item.slug === slug) ?? null;
}

export function prototypeSubChipForActionChipId(
  chipId: string | null,
): HomeHeroSubChip | null {
  if (!chipId) return null;
  return PROTOTYPE_SUB_CHIPS.find((item) => item.actionChipId === chipId) ?? null;
}

export function isSubChipParent(chipId: string | null): chipId is SubChipParentId {
  return chipId === 'prototype' || chipId === 'deck';
}

// Sub-types for a first-level chip, drawn from the Community facet catalog so
// the labels, set, AND order match the Community section exactly. The display
// order is whatever `SUBCATEGORIES` (in `plugins-home/facets.ts`) declares for
// the parent — there is no Home-only reordering, so the two surfaces stay in
// lockstep. Only sub-categories that actually have installed plugins
// (count > 0) are surfaced. Returns [] for chips without a second-level rail.
export function subChipsForChip(
  chipId: string | null,
  plugins: InstalledPluginRecord[],
): HomeHeroSubChip[] {
  if (!isSubChipParent(chipId)) return [];
  if (chipId === 'prototype') return PROTOTYPE_SUB_CHIPS.map((item) => ({ ...item }));
  const catalog = buildSubcategoryCatalog(plugins);
  const options: FacetOption[] = catalog[chipId] ?? [];
  return options
    .filter((option) => option.count > 0)
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
