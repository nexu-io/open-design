// Localized display labels for the curated facet SUBCATEGORIES
// (`./facets.ts`). The taxonomy table keeps English labels as the
// canonical data (slugs and grouping are derived from it for filtering),
// while every rendering surface — the Home composer sub-type rail and the
// Community subcategory pills — resolves the visible text through the
// typed i18n dict. Unknown slugs (a newly added facet before its key
// lands) fall back to the table's English label.

import type { useT } from '../../i18n';
import { commercialCategoryLabel, isCommercialCategoryId } from './categoryLabel';

export function pluginSubfacetLabel(
  slug: string,
  fallback: string,
  t: ReturnType<typeof useT>,
): string {
  // Deck sub-facets are the 15 commercial "品类" scenes (see `./facets.ts`),
  // so their slugs are commercial category ids — resolve them through the same
  // dict the card chip uses so the filter row and the tag read identically.
  if (isCommercialCategoryId(slug)) return commercialCategoryLabel(slug, t);
  switch (slug) {
    case 'web-landing': return t('pluginsHome.subfacet.web-landing');
    case 'web-tools': return t('pluginsHome.subfacet.web-tools');
    case 'mobile-apps': return t('pluginsHome.subfacet.mobile-apps');
    case 'dashboards': return t('pluginsHome.subfacet.dashboards');
    case 'pitch-business': return t('pluginsHome.subfacet.pitch-business');
    case 'course-training': return t('pluginsHome.subfacet.course-training');
    case 'reports-briefings': return t('pluginsHome.subfacet.reports-briefings');
    case 'product-sales': return t('pluginsHome.subfacet.product-sales');
    case 'engineering-talks': return t('pluginsHome.subfacet.engineering-talks');
    case 'creative-decks': return t('pluginsHome.subfacet.creative-decks');
    case 'ui-product-mockups': return t('pluginsHome.subfacet.ui-product-mockups');
    case 'brand-visuals': return t('pluginsHome.subfacet.brand-visuals');
    case 'storyboards-motion-refs': return t('pluginsHome.subfacet.storyboards-motion-refs');
    case 'social-content': return t('pluginsHome.subfacet.social-content');
    case 'avatar-portrait': return t('pluginsHome.subfacet.avatar-portrait');
    case 'illustration-style': return t('pluginsHome.subfacet.illustration-style');
    case 'motion-effects': return t('pluginsHome.subfacet.motion-effects');
    case 'social-short-form': return t('pluginsHome.subfacet.social-short-form');
    case 'marketing-product': return t('pluginsHome.subfacet.marketing-product');
    case 'data-explainers': return t('pluginsHome.subfacet.data-explainers');
    case 'cinematic-story': return t('pluginsHome.subfacet.cinematic-story');
    default: return fallback;
  }
}
