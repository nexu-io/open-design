// Shared curator ordering for Home examples and the Community shelf.
//
// These are the template styles we deliberately want in the first
// viewport. The ids are daemon plugin ids, so the ordering remains
// stable across locales and title-copy tweaks.

import type { InstalledPluginRecord } from '@open-design/contracts';

const CURATED_PROTOTYPE_PLUGIN_IDS = [
  'example-open-design-landing',
  'example-kanban-board',
  'example-social-carousel',
  'example-blog-post',
  'example-doc-kami-parchment',
] as const;

export const CURATED_LIVE_ARTIFACT_PLUGIN_IDS = [
  'example-live-dashboard',
  'image-template-notion-team-dashboard-live-artifact',
  'example-social-media-matrix-tracker-template',
  'example-trading-analysis-dashboard-template',
  'example-live-artifact',
] as const;

const CURATED_DECK_PLUGIN_IDS = [
  'example-html-ppt-zhangzara-creative-mode',
  'example-html-ppt-zhangzara-scatterbrain',
  'example-guizang-ppt',
  'example-html-ppt-zhangzara-cobalt-grid',
  'example-html-ppt-zhangzara-capsule',
] as const;

const CURATED_IMAGE_PLUGIN_IDS = [
  'image-template-anime-martial-arts-battle-illustration',
  'image-template-e-commerce-live-stream-ui-mockup',
  'image-template-infographic-otaku-dance-choreography-breakdown-gokurakujodo-16-panels',
  'image-template-profile-avatar-anime-girl-to-cinematic-photo',
  'image-template-social-media-post-showa-day-retro-culture-magazine-cover',
] as const;

const CURATED_VIDEO_PLUGIN_IDS = [
  'video-template-video-seedance-three-kingdoms-lyubu-yuanmen-archery',
  'video-template-seedance-2-0-15-second-cinematic-japanese-romance-short-film',
  'video-template-cinematic-east-asian-woman-hand-dance',
  'video-template-luxury-supercar-cinematic-narrative',
  'video-template-forbidden-city-cat-satire',
] as const;

const CURATED_HYPERFRAMES_PLUGIN_IDS = [
  'video-template-hyperframes-app-showcase-three-phones',
  'video-template-hyperframes-brand-sizzle-reel',
  'video-template-hyperframes-social-overlay-stack',
  'video-template-hyperframes-website-to-video-promo',
  'video-template-hyperframes-flight-map-route',
] as const;

export const CURATED_PLUGIN_IDS_BY_CHIP = {
  prototype: CURATED_PROTOTYPE_PLUGIN_IDS,
  'live-artifact': CURATED_LIVE_ARTIFACT_PLUGIN_IDS,
  deck: CURATED_DECK_PLUGIN_IDS,
  image: CURATED_IMAGE_PLUGIN_IDS,
  video: CURATED_VIDEO_PLUGIN_IDS,
  hyperframes: CURATED_HYPERFRAMES_PLUGIN_IDS,
};

const CURATED_GLOBAL_IDS = [
  ...CURATED_PROTOTYPE_PLUGIN_IDS,
  ...CURATED_LIVE_ARTIFACT_PLUGIN_IDS,
  ...CURATED_DECK_PLUGIN_IDS,
  ...CURATED_IMAGE_PLUGIN_IDS,
  ...CURATED_VIDEO_PLUGIN_IDS,
  ...CURATED_HYPERFRAMES_PLUGIN_IDS,
];

const CURATED_GLOBAL_RANK = new Map<string, number>(
  CURATED_GLOBAL_IDS.map((id, index) => [id, index]),
);

export function curatedPluginPriority(record: InstalledPluginRecord): number | null {
  return CURATED_GLOBAL_RANK.get(record.id) ?? null;
}

export function curatedPluginPriorityForChip(
  record: InstalledPluginRecord,
  chipId: string,
): number | null {
  const ids = (CURATED_PLUGIN_IDS_BY_CHIP as Record<string, readonly string[] | undefined>)[chipId];
  if (!ids) return null;
  const index = ids.indexOf(record.id);
  return index >= 0 ? index : null;
}
