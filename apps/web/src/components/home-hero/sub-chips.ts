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
import type { Locale } from '../../i18n/types';
import type { IconName } from '../Icon';
import {
  buildSubcategoryCatalog,
  extractSubcategories,
  type FacetOption,
} from '../plugins-home/facets';

// Parent chips that carry a second-level rail. Prototype/deck draw from the
// Community facet catalog; social-card/diagram use a local taxonomy because
// they are template scenarios, not installed plugin subfacets.
export type SubChipParentId = 'prototype' | 'deck' | 'social-card' | 'diagram';

export interface HomeHeroSubChip {
  // Facet subcategory slug, e.g. 'business-dashboards'.
  slug: string;
  label: string;
  icon: IconName;
  // When true the chip is hidden behind the "More …" overflow toggle in the
  // sub-type rail instead of rendering inline. Lets a rich taxonomy stay
  // comprehensive without spilling the row onto three lines. Only meaningful
  // for the local social-card / diagram rails.
  overflow?: boolean;
}

const PARENT_IDS: readonly SubChipParentId[] = ['prototype', 'deck', 'social-card', 'diagram'];

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
  // social-card
  'x-twitter-card': 'share',
  'threads-card': 'comment',
  'xiaohongshu-carousel': 'image',
  'wechat-cover': 'file-text',
  'linkedin-card': 'file',
  'instagram-story': 'smartphone',
  'reddit-card': 'comment',
  'youtube-thumbnail': 'play',
  'facebook-card': 'share',
  'product-hunt-card': 'star',
  'spotify-card': 'mic',
  'quote-poster': 'file-text',
  // diagram
  'architecture-diagram': 'grid',
  'workflow-diagram': 'refresh',
  'rag-agent-diagram': 'sparkles',
  'uml-diagram': 'blocks',
  'data-flow-diagram': 'kanban',
  'comparison-diagram': 'layers-filled',
  'sequence-diagram': 'kanban',
  'mindmap-diagram': 'sparkles',
  'network-diagram': 'grid',
  'er-diagram': 'blocks',
  'timeline-diagram': 'refresh',
  'state-machine-diagram': 'refresh',
};
const DEFAULT_SUBCATEGORY_ICON: IconName = 'blocks';

export function isSubChipParent(chipId: string | null): chipId is SubChipParentId {
  return chipId === 'prototype' || chipId === 'deck' || chipId === 'social-card' || chipId === 'diagram';
}

function subChip(slug: string, label: string, overflow = false): HomeHeroSubChip {
  return {
    slug,
    label,
    icon: SUBCATEGORY_ICONS[slug] ?? DEFAULT_SUBCATEGORY_ICON,
    ...(overflow ? { overflow: true } : {}),
  };
}

const LOCAL_SUBCHIPS: Record<'social-card' | 'diagram', HomeHeroSubChip[]> = {
  // Overseas-facing platforms lead; domestic (Xiaohongshu, WeChat) follow.
  // The first six render inline; the rest collapse behind the "More …" toggle
  // so the rail stays comprehensive without overflowing onto extra rows.
  'social-card': [
    subChip('x-twitter-card', 'Twitter / X'),
    subChip('threads-card', 'Threads'),
    subChip('linkedin-card', 'LinkedIn'),
    subChip('instagram-story', 'Instagram story'),
    subChip('xiaohongshu-carousel', 'Xiaohongshu / Rednote'),
    subChip('wechat-cover', 'WeChat cover'),
    subChip('reddit-card', 'Reddit', true),
    subChip('youtube-thumbnail', 'YouTube thumbnail', true),
    subChip('facebook-card', 'Facebook', true),
    subChip('product-hunt-card', 'Product Hunt', true),
    subChip('spotify-card', 'Spotify', true),
    subChip('quote-poster', 'Quote poster', true),
  ],
  diagram: [
    subChip('architecture-diagram', 'Architecture'),
    subChip('workflow-diagram', 'Workflow'),
    subChip('rag-agent-diagram', 'RAG / Agent'),
    subChip('uml-diagram', 'UML'),
    subChip('data-flow-diagram', 'Data flow'),
    subChip('comparison-diagram', 'Comparison'),
    subChip('sequence-diagram', 'Sequence', true),
    subChip('mindmap-diagram', 'Mind map', true),
    subChip('network-diagram', 'Network', true),
    subChip('er-diagram', 'ER model', true),
    subChip('timeline-diagram', 'Timeline', true),
    subChip('state-machine-diagram', 'State machine', true),
  ],
};

const LOCAL_SUBCHIP_LABELS_ZH: Record<string, string> = {
  'x-twitter-card': 'Twitter / X',
  'threads-card': 'Threads',
  'xiaohongshu-carousel': '小红书图文',
  'wechat-cover': '公众号封面',
  'linkedin-card': 'LinkedIn',
  'instagram-story': 'Instagram Story',
  'reddit-card': 'Reddit',
  'youtube-thumbnail': 'YouTube 封面',
  'facebook-card': 'Facebook',
  'product-hunt-card': 'Product Hunt',
  'spotify-card': 'Spotify',
  'quote-poster': '金句海报',
  'architecture-diagram': '架构图',
  'workflow-diagram': '流程图',
  'rag-agent-diagram': 'RAG / Agent',
  'uml-diagram': 'UML',
  'data-flow-diagram': '数据流',
  'comparison-diagram': '对比图',
  'sequence-diagram': '时序图',
  'mindmap-diagram': '思维导图',
  'network-diagram': '网络拓扑',
  'er-diagram': 'ER 模型',
  'timeline-diagram': '时间线',
  'state-machine-diagram': '状态机',
};

function localizeLocalSubChip(sub: HomeHeroSubChip, locale: Locale | undefined): HomeHeroSubChip {
  if (locale !== 'zh-CN' && locale !== 'zh-TW') return sub;
  return {
    ...sub,
    label: LOCAL_SUBCHIP_LABELS_ZH[sub.slug] ?? sub.label,
  };
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
  locale?: Locale,
): HomeHeroSubChip[] {
  if (!isSubChipParent(chipId)) return [];
  if (chipId === 'social-card' || chipId === 'diagram') {
    return LOCAL_SUBCHIPS[chipId].map((sub) => localizeLocalSubChip(sub, locale));
  }
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
