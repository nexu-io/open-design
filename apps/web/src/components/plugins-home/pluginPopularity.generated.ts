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
  generatedAt: '2026-09-07',
  windowDays: 28,
  weights: { users: 0.6, runs: 0.4 },
  minUsers: 20,
  count: 89,
};

// Plugin id -> blended popularity score in [0, 1], most-popular first.
export const PLUGIN_POPULARITY: Readonly<Record<string, number>> = {
  'example-web-prototype': 1.0,
  'example-simple-deck': 0.8666,
  'example-web-clone': 0.8228,
  'example-mobile-app': 0.6814,
  'example-open-design-landing': 0.679,
  'example-webgl-experience': 0.6515,
  'example-kanban-board': 0.6101,
  'example-wireframe-mobile-flow': 0.586,
  'example-gamified-app': 0.5756,
  'image-template-anime-martial-arts-battle-illustration': 0.5719,
  'example-fs-creative-voltage': 0.5443,
  'example-social-carousel': 0.5434,
  'example-dashboard': 0.5252,
  'example-guizang-ppt': 0.5248,
  'example-digital-eguide': 0.5247,
  'example-webgl-caustic-pool': 0.5195,
  'image-template-e-commerce-live-stream-ui-mockup': 0.5063,
  'example-fs-notebook-tabs': 0.5045,
  'example-wireframe-sketch': 0.5033,
  'video-template-video-seedance-three-kingdoms-lyubu-yuanmen-archery': 0.5004,
  'example-blog-post': 0.4963,
  'example-mobile-onboarding': 0.4933,
  'example-motion-frames': 0.4915,
  'example-resume-modern': 0.491,
  'example-fs-electric-studio': 0.4869,
  'image-template-profile-avatar-anime-girl-to-cinematic-photo': 0.4805,
  'image-template-profile-avatar-casual-fashion-grid-photoshoot': 0.4714,
  'example-velar-luxury-real-estate': 0.4649,
  'image-template-3d-stone-staircase-evolution-infographic': 0.4605,
  'video-template-seedance-2-0-15-second-cinematic-japanese-romance-short-film': 0.4603,
  'example-video-hyperframes': 0.4593,
  'example-codex-interactive-capability-map': 0.4588,
  'example-webgl-aurora-veil': 0.4426,
  'example-image-poster': 0.4397,
  'example-html-ppt-zhangzara-creative-mode': 0.4375,
  'example-mockup-device-3d': 0.4365,
  'example-wireframe-greybox': 0.4321,
  'example-huashu-keynote-black': 0.4289,
  'example-hps-academic-paper': 0.4259,
  'image-template-illustration-crayon-kid-drawing-rework': 0.4248,
  'video-template-luxury-supercar-cinematic-narrative': 0.4207,
  'example-huashu-bento-insight': 0.4173,
  'video-template-3d-animated-boy-building-lego': 0.4134,
  'example-wireframe-annotated': 0.4131,
  'example-social-media-matrix-tracker-template': 0.4085,
  'example-docs-page': 0.4042,
  'example-html-ppt-knowledge-arch-blueprint': 0.4041,
  'video-template-frame-kinetic-type': 0.3998,
  'example-flowai-live-dashboard-template': 0.3977,
  'example-html-ppt-course-module': 0.3953,
  'example-html-ppt-zhangzara-capsule': 0.3925,
  'image-template-illustrated-city-food-map': 0.39,
  'example-doc-kami-parchment': 0.3893,
  'example-trading-analysis-dashboard-template': 0.387,
  'example-critique': 0.3862,
  'example-webgl-distortion-grain': 0.3813,
  'example-live-dashboard': 0.3805,
  'example-html-ppt-hermes-cyber-terminal': 0.3764,
  'example-deck-swiss-international': 0.3756,
  'example-audio-jingle': 0.3733,
  'video-template-frame-liquid-bg-hero': 0.3732,
  'example-webgl-depth-gallery': 0.3682,
  'video-template-frame-logo-outro': 0.3667,
  'example-kami-deck': 0.3664,
  'example-github-dashboard': 0.3651,
  'video-template-frame-bold-poster': 0.3617,
  'example-pm-spec': 0.3583,
  'example-html-ppt-zhangzara-block-frame': 0.3564,
  'example-html-ppt-zhangzara-studio': 0.3559,
  'example-frame-flowchart-sticky': 0.3554,
  'example-fs-editorial-forest': 0.3478,
  'image-template-momotaro-explainer-slide-in-hybrid-style': 0.343,
  'example-data-report': 0.3416,
  'example-huashu-slides': 0.3393,
  'example-hps-bauhaus': 0.3388,
  'example-dating-web': 0.3381,
  'video-template-cinematic-east-asian-woman-hand-dance': 0.333,
  'image-template-game-screenshot-anime-fighting-game-captain-ryuuga-vs-kaze-renshin': 0.332,
  'example-hps-true-blueprint': 0.329,
  'video-template-frame-build-minimal': 0.3255,
  'image-template-profile-avatar-cyberpunk-anime-portrait-with-neon-face-text': 0.3253,
  'example-deck-open-slide-canvas': 0.3245,
  'example-finance-report': 0.324,
  'example-social-media-dashboard': 0.323,
  'example-email-marketing': 0.3217,
  'example-webgl-particle-galaxy': 0.3123,
  'example-huashu-golden-circle': 0.3033,
  'video-template-a-decade-of-refinement-glow-up': 0.2997,
  'example-eng-runbook': 0.2916,
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
