// AUTO-GENERATED — DO NOT EDIT BY HAND.
//
// Blended template popularity, used to order the plugin/example grid and the
// Home rail so the templates users actually reach for lead each category and
// sub-category (OPEND-449). Higher score = more popular; range [0, 1].
//
// How it is built (deterministic, creds-free transform):
//   score = 0.6 * norm(log1p(distinctUsers)) + 0.4 * norm(log1p(runs))
//   • window: trailing 28 days of `run_finished` events (by plugin_id)
//   • distinct users are the anti-gaming signal; runs add engagement depth
//   • log1p tames the head-template scale gap; min-max normalized over the
//     live-catalog template set so both metrics land in [0, 1]
//   • RETIRED plugins (absent from the live catalog) are dropped
//   • templates with no renderable preview are EXCLUDED — mode-seed entries
//     (e.g. the generic Live Artifact / HyperFrames options) live in the
//     composer mode picker, not the gallery, so usage must not float them up
//   • templates below 20 distinct users are OMITTED so thin-sample
//     tail templates keep their curated/visual fallback order
//
// Regenerate with: pnpm exec tsx scripts/refresh-plugin-popularity.ts --write
// Refreshed weekly by .github/workflows/refresh-plugin-popularity.yml.
// See pluginPopularity.RUNBOOK.md here.

export interface PluginPopularityMeta {
  readonly generatedAt: string;
  readonly windowDays: number;
  readonly weights: { readonly users: number; readonly runs: number };
  readonly minUsers: number;
  readonly count: number;
}

export const PLUGIN_POPULARITY_META: PluginPopularityMeta = {
  generatedAt: '2026-11-23',
  windowDays: 28,
  weights: { users: 0.6, runs: 0.4 },
  minUsers: 20,
  count: 48,
};

// Plugin id -> blended popularity score in [0, 1], most-popular first.
export const PLUGIN_POPULARITY: Readonly<Record<string, number>> = {
  'example-web-prototype': 1.0,
  'example-simple-deck': 0.8121,
  'example-web-clone': 0.7615,
  'example-mobile-app': 0.5827,
  'example-open-design-landing': 0.5813,
  'example-velar-luxury-real-estate': 0.5792,
  'example-live-artifact': 0.5543,
  'image-template-vr-headset-exploded-view-poster': 0.5493,
  'video-template-video-seedance-three-kingdoms-lyubu-yuanmen-archery': 0.5489,
  'video-template-3d-animated-boy-building-lego': 0.5484,
  'example-webgl-experience': 0.5365,
  'video-template-seedance-2-0-15-second-cinematic-japanese-romance-short-film': 0.5335,
  'example-critique': 0.5308,
  'example-gamified-app': 0.529,
  'image-template-social-media-post-psg-transfer-announcement-poster': 0.5065,
  'example-webgl-aurora-veil': 0.4931,
  'image-template-social-media-post-vintage-sign-painter-sketch': 0.4907,
  'example-webgl-caustic-pool': 0.4895,
  'example-video-hyperframes': 0.486,
  'example-dashboard': 0.4856,
  'video-template-luxury-supercar-cinematic-narrative': 0.468,
  'example-audio-jingle': 0.4679,
  'image-template-profile-avatar-cyberpunk-anime-portrait-with-neon-face-text': 0.4634,
  'example-motion-showreel': 0.4627,
  'example-motion-ui-morph': 0.4589,
  'example-kanban-board': 0.4526,
  'example-pm-spec': 0.4522,
  'example-wireframe-mobile-flow': 0.4497,
  'example-image-poster': 0.4436,
  'example-motion-frames': 0.439,
  'example-fs-creative-voltage': 0.4382,
  'video-template-cinematic-east-asian-woman-hand-dance': 0.4371,
  'example-motion-visual-lesson': 0.4333,
  'example-motion-product-promo': 0.43,
  'example-motion-future': 0.4182,
  'example-hr-onboarding': 0.4175,
  'example-pricing-page': 0.4157,
  'example-social-carousel': 0.4105,
  'example-wireframe-sketch': 0.4078,
  'example-webgl-depth-gallery': 0.4034,
  'example-guizang-ppt': 0.4012,
  'example-fs-electric-studio': 0.398,
  'example-fs-notebook-tabs': 0.3963,
  'example-fs-editorial-forest': 0.3907,
  'example-resume-modern': 0.3868,
  'image-template-profile-avatar-monochrome-studio-portrait': 0.3813,
  'example-social-media-matrix-tracker-template': 0.3687,
  'image-template-3d-stone-staircase-evolution-infographic': 0.3651,
};

// Templates with no renderable preview — suppressed from the visual gallery
// grid so they never show as an empty letter card. They still reach users
// through the composer's mode picker. Repo-derived (baked manifest + on-disk
// `od.preview` entry existence), refreshed alongside the scores above.
export const PLUGIN_NO_PREVIEW: readonly string[] = [
  'example-dcf-valuation',
  'example-design-brief',
  'example-hatch-pet',
  'example-html-ppt',
  'example-hyperframes',
  'example-last30days',
  'example-pptx-html-fidelity-audit',
  'example-x-research',
];
