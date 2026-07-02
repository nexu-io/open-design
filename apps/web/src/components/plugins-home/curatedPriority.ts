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

// Wireframe scenario: lo-fi / sketch explorations across distinct styles —
// hand-drawn sketch, crisp greybox/blueprint, a multi-screen mobile flow, and
// an annotated/redline landing wireframe. The chip's tag-matching surfaces any
// other lo-fi templates behind these.
const CURATED_WIREFRAME_PLUGIN_IDS = [
  'example-wireframe-sketch',
  'example-wireframe-greybox',
  'example-wireframe-mobile-flow',
  'example-wireframe-annotated',
] as const;

// Mobile scenario: real native-app prototype mockups (iOS / Android phone
// screens), so the carousel reads as "this is what a mobile result looks
// like" rather than generic web prototypes.
const CURATED_MOBILE_PLUGIN_IDS = [
  'example-mobile-app',
  'example-mobile-onboarding',
  'example-gamified-app',
  'example-mockup-device-3d',
] as const;

// Document scenario: polished, print-ready documents — resumes, reports,
// invoices, papers, briefs — chosen for visual quality.
const CURATED_DOCUMENT_PLUGIN_IDS = [
  'example-resume-modern',
  'example-doc-kami-parchment',
  'example-data-report',
  'example-finance-report',
  'example-invoice',
  'example-clinical-case-report',
  'example-hps-academic-paper',
  'example-digital-eguide',
  'example-article-magazine',
  'example-meeting-notes',
  'example-design-brief',
  'example-pm-spec',
] as const;

export const CURATED_LIVE_ARTIFACT_PLUGIN_IDS = [
  'example-live-dashboard',
  'image-template-notion-team-dashboard-live-artifact',
  'example-social-media-matrix-tracker-template',
  'example-trading-analysis-dashboard-template',
  'example-live-artifact',
] as const;

// Pinned-to-front slide library (curator request): the community-sourced
// slides batch leads both the Home hero deck chip and the Home plugin grid's
// Slides shelf, ahead of the standing curated deck picks below. Order here is
// the exact display order requested (family roots first, then variants).
const PINNED_SLIDE_PLUGIN_IDS = [
  // `example-frontend-slides` (the bare family-root template) is intentionally
  // NOT pinned — its generic cover reads as filler at the top of the shelf, so
  // it drops to the uncurated tail while the styled variants below still lead.
  'example-fs-creative-voltage',
  'example-fs-electric-studio',
  'example-fs-emerald-editorial',
  'example-fs-editorial-forest',
  'example-fs-notebook-tabs',
  'example-huashu-slides',
  'example-huashu-keynote-black',
  'example-huashu-takram-soft-tech',
  'example-huashu-luxe-whitespace',
  'example-huashu-bento-insight',
  'example-huashu-golden-circle',
  'example-huashu-pentagram-grid',
  'example-huashu-sparkline-arc',
  'example-huashu-annual-letter',
  'example-hps-bauhaus',
  'example-hps-memphis-pop',
  'example-hps-y2k-chrome',
  'example-hps-retro-tv',
  'example-hps-true-blueprint',
  'example-hps-academic-paper',
  'example-ve-midnight-editorial',
  'example-ve-terminal-mono',
] as const;

const CURATED_DECK_PLUGIN_IDS = [
  ...PINNED_SLIDE_PLUGIN_IDS,
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
  wireframe: CURATED_WIREFRAME_PLUGIN_IDS,
  mobile: CURATED_MOBILE_PLUGIN_IDS,
  document: CURATED_DOCUMENT_PLUGIN_IDS,
  'live-artifact': CURATED_LIVE_ARTIFACT_PLUGIN_IDS,
  deck: CURATED_DECK_PLUGIN_IDS,
  image: CURATED_IMAGE_PLUGIN_IDS,
  video: CURATED_VIDEO_PLUGIN_IDS,
  hyperframes: CURATED_HYPERFRAMES_PLUGIN_IDS,
};

const CURATED_GLOBAL_IDS = [
  ...CURATED_PROTOTYPE_PLUGIN_IDS,
  ...CURATED_WIREFRAME_PLUGIN_IDS,
  ...CURATED_MOBILE_PLUGIN_IDS,
  ...CURATED_DOCUMENT_PLUGIN_IDS,
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
