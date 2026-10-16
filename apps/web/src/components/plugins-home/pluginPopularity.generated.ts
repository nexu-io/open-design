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
  generatedAt: '2026-10-12',
  windowDays: 28,
  weights: { users: 0.6, runs: 0.4 },
  minUsers: 20,
  count: 61,
};

// Plugin id -> blended popularity score in [0, 1], most-popular first.
export const PLUGIN_POPULARITY: Readonly<Record<string, number>> = {
  'example-web-prototype': 1.0,
  'example-simple-deck': 0.8182,
  'example-web-clone': 0.8165,
  'example-velar-luxury-real-estate': 0.6473,
  'example-open-design-landing': 0.634,
  'example-webgl-experience': 0.6279,
  'example-gamified-app': 0.6062,
  'example-mobile-app': 0.5799,
  'example-kanban-board': 0.5388,
  'example-fs-creative-voltage': 0.5089,
  'example-social-carousel': 0.5003,
  'example-pricing-page': 0.4959,
  'image-template-vr-headset-exploded-view-poster': 0.4957,
  'example-hr-onboarding': 0.4926,
  'example-fs-notebook-tabs': 0.483,
  'image-template-anime-martial-arts-battle-illustration': 0.4746,
  'example-wireframe-mobile-flow': 0.4741,
  'video-template-seedance-2-0-15-second-cinematic-japanese-romance-short-film': 0.4707,
  'example-dashboard': 0.4689,
  'example-resume-modern': 0.4637,
  'video-template-video-seedance-three-kingdoms-lyubu-yuanmen-archery': 0.4611,
  'example-video-hyperframes': 0.4586,
  'example-digital-eguide': 0.4545,
  'image-template-social-media-post-psg-transfer-announcement-poster': 0.4438,
  'example-webgl-caustic-pool': 0.4408,
  'example-motion-frames': 0.4359,
  'image-template-social-media-post-vintage-sign-painter-sketch': 0.4334,
  'example-fs-electric-studio': 0.4327,
  'image-template-e-commerce-live-stream-ui-mockup': 0.4281,
  'image-template-profile-avatar-cyberpunk-anime-portrait-with-neon-face-text': 0.4237,
  'example-blog-post': 0.4189,
  'example-guizang-ppt': 0.4151,
  'example-critique': 0.415,
  'example-pm-spec': 0.4103,
  'example-html-ppt-zhangzara-block-frame': 0.41,
  'example-finance-report': 0.4044,
  'example-image-poster': 0.4024,
  'example-codex-interactive-capability-map': 0.3971,
  'image-template-profile-avatar-casual-fashion-grid-photoshoot': 0.3947,
  'video-template-luxury-supercar-cinematic-narrative': 0.3929,
  'image-template-profile-avatar-anime-girl-to-cinematic-photo': 0.3923,
  'example-social-media-matrix-tracker-template': 0.3898,
  'image-template-3d-stone-staircase-evolution-infographic': 0.3841,
  'video-template-3d-animated-boy-building-lego': 0.3804,
  'example-mobile-onboarding': 0.3764,
  'example-mockup-device-3d': 0.3697,
  'example-audio-jingle': 0.3627,
  'example-hps-academic-paper': 0.3619,
  'example-html-ppt-zhangzara-creative-mode': 0.3601,
  'video-template-cinematic-east-asian-woman-hand-dance': 0.3597,
  'example-wireframe-sketch': 0.3591,
  'example-doc-kami-parchment': 0.3579,
  'example-webgl-aurora-veil': 0.3554,
  'image-template-profile-avatar-monochrome-studio-portrait': 0.3487,
  'video-template-frame-bold-poster': 0.346,
  'video-template-frame-kinetic-type': 0.3459,
  'example-webgl-depth-gallery': 0.3428,
  'image-template-illustration-crayon-kid-drawing-rework': 0.3292,
  'example-trading-analysis-dashboard-template': 0.3284,
  'example-huashu-keynote-black': 0.3278,
  'image-template-notion-team-dashboard-live-artifact': 0.3113,
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
