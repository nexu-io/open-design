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
  generatedAt: '2026-11-02',
  windowDays: 28,
  weights: { users: 0.6, runs: 0.4 },
  minUsers: 20,
  count: 56,
};

// Plugin id -> blended popularity score in [0, 1], most-popular first.
export const PLUGIN_POPULARITY: Readonly<Record<string, number>> = {
  'example-web-prototype': 1.0,
  'example-simple-deck': 0.8146,
  'example-web-clone': 0.8039,
  'example-velar-luxury-real-estate': 0.6718,
  'example-webgl-experience': 0.619,
  'example-gamified-app': 0.6078,
  'example-open-design-landing': 0.5866,
  'example-motion-visual-lesson': 0.5748,
  'example-motion-future': 0.5644,
  'example-motion-showreel': 0.5529,
  'image-template-vr-headset-exploded-view-poster': 0.5403,
  'example-motion-ui-morph': 0.535,
  'example-pricing-page': 0.5306,
  'example-mobile-app': 0.5296,
  'video-template-video-seedance-three-kingdoms-lyubu-yuanmen-archery': 0.5233,
  'example-hr-onboarding': 0.5121,
  'example-motion-product-promo': 0.5119,
  'video-template-seedance-2-0-15-second-cinematic-japanese-romance-short-film': 0.5036,
  'example-video-hyperframes': 0.502,
  'image-template-social-media-post-psg-transfer-announcement-poster': 0.4944,
  'example-fs-notebook-tabs': 0.4883,
  'image-template-social-media-post-vintage-sign-painter-sketch': 0.4787,
  'example-fs-creative-voltage': 0.477,
  'video-template-3d-animated-boy-building-lego': 0.4751,
  'example-motion-frames': 0.475,
  'image-template-profile-avatar-cyberpunk-anime-portrait-with-neon-face-text': 0.4645,
  'example-webgl-caustic-pool': 0.4621,
  'example-dashboard': 0.4499,
  'example-resume-modern': 0.443,
  'example-fs-electric-studio': 0.4415,
  'example-critique': 0.4385,
  'video-template-luxury-supercar-cinematic-narrative': 0.438,
  'example-html-ppt-zhangzara-block-frame': 0.4375,
  'example-pm-spec': 0.4346,
  'example-social-media-matrix-tracker-template': 0.4209,
  'example-wireframe-mobile-flow': 0.4199,
  'example-social-carousel': 0.4188,
  'video-template-cinematic-east-asian-woman-hand-dance': 0.4173,
  'example-guizang-ppt': 0.411,
  'example-audio-jingle': 0.4083,
  'example-image-poster': 0.4065,
  'example-huashu-bento-insight': 0.4021,
  'example-kanban-board': 0.4008,
  'image-template-profile-avatar-monochrome-studio-portrait': 0.3987,
  'example-wireframe-sketch': 0.3909,
  'example-digital-eguide': 0.3853,
  'video-template-frame-kinetic-type': 0.3762,
  'example-webgl-aurora-veil': 0.3761,
  'video-template-frame-bold-poster': 0.3731,
  'example-webgl-depth-gallery': 0.3637,
  'example-trading-analysis-dashboard-template': 0.3602,
  'image-template-e-commerce-live-stream-ui-mockup': 0.3479,
  'example-finance-report': 0.3407,
  'image-template-anime-martial-arts-battle-illustration': 0.3404,
  'example-codex-interactive-capability-map': 0.3379,
  'image-template-notion-team-dashboard-live-artifact': 0.3202,
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
