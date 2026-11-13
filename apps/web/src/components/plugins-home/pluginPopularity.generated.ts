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
  generatedAt: '2026-11-09',
  windowDays: 28,
  weights: { users: 0.6, runs: 0.4 },
  minUsers: 20,
  count: 56,
};

// Plugin id -> blended popularity score in [0, 1], most-popular first.
export const PLUGIN_POPULARITY: Readonly<Record<string, number>> = {
  'example-web-prototype': 1.0,
  'example-simple-deck': 0.809,
  'example-web-clone': 0.7962,
  'example-velar-luxury-real-estate': 0.6583,
  'example-webgl-experience': 0.5986,
  'example-gamified-app': 0.5936,
  'example-motion-visual-lesson': 0.5903,
  'example-motion-future': 0.5779,
  'example-open-design-landing': 0.574,
  'example-motion-showreel': 0.5693,
  'example-motion-ui-morph': 0.5523,
  'example-mobile-app': 0.5514,
  'image-template-vr-headset-exploded-view-poster': 0.5428,
  'video-template-video-seedance-three-kingdoms-lyubu-yuanmen-archery': 0.5321,
  'example-motion-product-promo': 0.5232,
  'example-pricing-page': 0.5186,
  'video-template-seedance-2-0-15-second-cinematic-japanese-romance-short-film': 0.5181,
  'example-video-hyperframes': 0.5084,
  'image-template-social-media-post-psg-transfer-announcement-poster': 0.5026,
  'video-template-3d-animated-boy-building-lego': 0.4971,
  'example-hr-onboarding': 0.491,
  'image-template-social-media-post-vintage-sign-painter-sketch': 0.4808,
  'example-fs-notebook-tabs': 0.4744,
  'example-webgl-caustic-pool': 0.4709,
  'example-motion-frames': 0.4705,
  'example-dashboard': 0.4674,
  'example-fs-creative-voltage': 0.4552,
  'example-critique': 0.4535,
  'image-template-profile-avatar-cyberpunk-anime-portrait-with-neon-face-text': 0.4527,
  'example-audio-jingle': 0.4468,
  'video-template-luxury-supercar-cinematic-narrative': 0.4448,
  'example-pm-spec': 0.4406,
  'example-image-poster': 0.4273,
  'example-wireframe-mobile-flow': 0.4257,
  'example-fs-electric-studio': 0.4245,
  'example-social-media-matrix-tracker-template': 0.4241,
  'example-resume-modern': 0.422,
  'video-template-cinematic-east-asian-woman-hand-dance': 0.4213,
  'example-html-ppt-zhangzara-block-frame': 0.4187,
  'example-guizang-ppt': 0.4171,
  'example-webgl-aurora-veil': 0.4146,
  'example-social-carousel': 0.4125,
  'example-kanban-board': 0.411,
  'example-wireframe-sketch': 0.4044,
  'image-template-profile-avatar-monochrome-studio-portrait': 0.3993,
  'video-template-frame-bold-poster': 0.3759,
  'example-digital-eguide': 0.3733,
  'example-webgl-depth-gallery': 0.3708,
  'example-trading-analysis-dashboard-template': 0.3648,
  'video-template-frame-kinetic-type': 0.3621,
  'image-template-anime-martial-arts-battle-illustration': 0.3491,
  'image-template-notion-team-dashboard-live-artifact': 0.3414,
  'example-finance-report': 0.3413,
  'image-template-e-commerce-live-stream-ui-mockup': 0.339,
  'image-template-3d-stone-staircase-evolution-infographic': 0.3313,
  'example-codex-interactive-capability-map': 0.3276,
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
