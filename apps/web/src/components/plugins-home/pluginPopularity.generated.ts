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
  generatedAt: '2026-10-26',
  windowDays: 28,
  weights: { users: 0.6, runs: 0.4 },
  minUsers: 20,
  count: 56,
};

// Plugin id -> blended popularity score in [0, 1], most-popular first.
export const PLUGIN_POPULARITY: Readonly<Record<string, number>> = {
  'example-web-prototype': 1.0,
  'example-web-clone': 0.8129,
  'example-simple-deck': 0.8127,
  'example-velar-luxury-real-estate': 0.6797,
  'example-webgl-experience': 0.6303,
  'example-gamified-app': 0.6176,
  'example-open-design-landing': 0.589,
  'example-motion-visual-lesson': 0.5623,
  'example-motion-future': 0.5497,
  'image-template-vr-headset-exploded-view-poster': 0.5443,
  'example-pricing-page': 0.5363,
  'example-motion-showreel': 0.5334,
  'example-mobile-app': 0.5295,
  'example-hr-onboarding': 0.5259,
  'example-motion-ui-morph': 0.5158,
  'video-template-video-seedance-three-kingdoms-lyubu-yuanmen-archery': 0.512,
  'video-template-seedance-2-0-15-second-cinematic-japanese-romance-short-film': 0.5038,
  'example-video-hyperframes': 0.4969,
  'example-motion-product-promo': 0.4938,
  'image-template-social-media-post-psg-transfer-announcement-poster': 0.4934,
  'example-fs-notebook-tabs': 0.4915,
  'example-fs-creative-voltage': 0.4876,
  'image-template-social-media-post-vintage-sign-painter-sketch': 0.476,
  'example-motion-frames': 0.4682,
  'image-template-profile-avatar-cyberpunk-anime-portrait-with-neon-face-text': 0.4649,
  'example-webgl-caustic-pool': 0.4615,
  'example-resume-modern': 0.4521,
  'example-pm-spec': 0.4441,
  'example-fs-electric-studio': 0.4435,
  'video-template-3d-animated-boy-building-lego': 0.4432,
  'example-html-ppt-zhangzara-block-frame': 0.4404,
  'example-dashboard': 0.4326,
  'video-template-luxury-supercar-cinematic-narrative': 0.429,
  'example-critique': 0.4189,
  'example-guizang-ppt': 0.4179,
  'example-social-carousel': 0.4164,
  'example-social-media-matrix-tracker-template': 0.4163,
  'video-template-cinematic-east-asian-woman-hand-dance': 0.4143,
  'example-image-poster': 0.4085,
  'example-kanban-board': 0.4065,
  'example-wireframe-mobile-flow': 0.4021,
  'image-template-profile-avatar-monochrome-studio-portrait': 0.3997,
  'example-digital-eguide': 0.3965,
  'video-template-frame-kinetic-type': 0.3808,
  'example-webgl-depth-gallery': 0.3736,
  'example-wireframe-sketch': 0.3735,
  'example-finance-report': 0.3732,
  'example-audio-jingle': 0.3731,
  'video-template-frame-bold-poster': 0.3697,
  'example-webgl-aurora-veil': 0.3637,
  'image-template-anime-martial-arts-battle-illustration': 0.3537,
  'example-trading-analysis-dashboard-template': 0.3534,
  'image-template-e-commerce-live-stream-ui-mockup': 0.3334,
  'image-template-notion-team-dashboard-live-artifact': 0.3261,
  'example-codex-interactive-capability-map': 0.3249,
  'video-template-frame-liquid-bg-hero': 0.3243,
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
  'example-live-artifact',
  'example-pptx-html-fidelity-audit',
  'example-x-research',
];
