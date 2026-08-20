// Localized display label for a plugin's COMMERCIAL category ("品类") — the
// small, calm type signal every deck card carries in the reference template
// galleries (Genspark AI Slides "Academic", Skywork "商业计划书").
//
// This is a separate taxonomy from the curated facet subcategories in
// `./subfacetLabel.ts`: those describe the *artifact surface* (dashboards,
// landing pages, pitch decks…), while this maps a deck to the commercial
// scenario it was built for. The 15 canonical ids below are the source of
// truth; every rendering surface (Community gallery tile, Create-page picker
// card, Home example-prompt card) resolves the visible text through the typed
// i18n dict so the same chip reads consistently across all three.
//
// Kept as a pure module so the resolver can be unit-tested without React and
// the three card components can share one call.

import type { InstalledPluginRecord } from '@open-design/contracts';
import type { useT } from '../../i18n';

// The 15 canonical commercial category ids. English labels live in the i18n
// dict (`pluginsHome.commercialCategory.<id>`); this list only drives
// resolution + membership checks.
export const COMMERCIAL_CATEGORY_IDS = [
  'student-coursework',
  'corporate-strategy',
  'professional-training',
  'b2b-sales',
  'academic-research',
  'marketing-gtm',
  'data-finance',
  'fundraising-pitch',
  'government-policy',
  'product-management',
  'consulting',
  'career',
  'ai-literacy',
  'life',
  'design-craft',
] as const;

export type CommercialCategoryId = (typeof COMMERCIAL_CATEGORY_IDS)[number];

const KNOWN_CATEGORY_IDS = new Set<string>(COMMERCIAL_CATEGORY_IDS);

export function isCommercialCategoryId(value: unknown): value is CommercialCategoryId {
  return typeof value === 'string' && KNOWN_CATEGORY_IDS.has(value);
}

/**
 * Resolve a plugin's commercial category id, or null when it has none.
 *
 * Resolution order:
 *   1. `manifest.od.category` — the explicit kebab id (e.g. `b2b-sales`).
 *   2. the first `manifest.tags` entry that is a known category id.
 *   3. `manifest.od.scenario` — a legacy fallback that some decks use.
 * Only ids in {@link COMMERCIAL_CATEGORY_IDS} resolve; anything else is null so
 * the chip stays absent rather than surfacing a raw slug.
 */
export function resolveCommercialCategoryId(
  record: InstalledPluginRecord,
): CommercialCategoryId | null {
  const od = record.manifest?.od as
    | { category?: unknown; scenario?: unknown }
    | undefined;

  if (isCommercialCategoryId(od?.category)) return od.category;

  for (const tag of record.manifest?.tags ?? []) {
    if (isCommercialCategoryId(tag)) return tag;
  }

  if (isCommercialCategoryId(od?.scenario)) return od.scenario;

  return null;
}

/**
 * Localized commercial-category label for a card chip, or null when the plugin
 * carries no known category. Reused by all three deck-card surfaces.
 */
export function pluginCategoryLabel(
  record: InstalledPluginRecord,
  t: ReturnType<typeof useT>,
): string | null {
  const id = resolveCommercialCategoryId(record);
  return id ? commercialCategoryLabel(id, t) : null;
}

/**
 * Localized label for one commercial category id. Exported so the deck facet
 * filter row (`./subfacetLabel.ts`) resolves the SAME visible text as the card
 * chip — the two surfaces share one taxonomy.
 */
export function commercialCategoryLabel(
  id: CommercialCategoryId,
  t: ReturnType<typeof useT>,
): string {
  switch (id) {
    case 'student-coursework': return t('pluginsHome.commercialCategory.student-coursework');
    case 'corporate-strategy': return t('pluginsHome.commercialCategory.corporate-strategy');
    case 'professional-training': return t('pluginsHome.commercialCategory.professional-training');
    case 'b2b-sales': return t('pluginsHome.commercialCategory.b2b-sales');
    case 'academic-research': return t('pluginsHome.commercialCategory.academic-research');
    case 'marketing-gtm': return t('pluginsHome.commercialCategory.marketing-gtm');
    case 'data-finance': return t('pluginsHome.commercialCategory.data-finance');
    case 'fundraising-pitch': return t('pluginsHome.commercialCategory.fundraising-pitch');
    case 'government-policy': return t('pluginsHome.commercialCategory.government-policy');
    case 'product-management': return t('pluginsHome.commercialCategory.product-management');
    case 'consulting': return t('pluginsHome.commercialCategory.consulting');
    case 'career': return t('pluginsHome.commercialCategory.career');
    case 'ai-literacy': return t('pluginsHome.commercialCategory.ai-literacy');
    case 'life': return t('pluginsHome.commercialCategory.life');
    case 'design-craft': return t('pluginsHome.commercialCategory.design-craft');
  }
}
