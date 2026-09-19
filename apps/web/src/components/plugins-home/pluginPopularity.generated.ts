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
  generatedAt: '2026-09-14',
  windowDays: 28,
  weights: { users: 0.6, runs: 0.4 },
  minUsers: 20,
  count: 88,
};

// Plugin id -> blended popularity score in [0, 1], most-popular first.
export const PLUGIN_POPULARITY: Readonly<Record<string, number>> = {
  'example-web-prototype': 1.0,
  'example-simple-deck': 0.8534,
  'example-web-clone': 0.815,
  'example-open-design-landing': 0.6854,
  'example-mobile-app': 0.6598,
  'example-webgl-experience': 0.6474,
  'example-kanban-board': 0.6217,
  'example-gamified-app': 0.5677,
  'image-template-anime-martial-arts-battle-illustration': 0.5676,
  'example-wireframe-mobile-flow': 0.5661,
  'example-social-carousel': 0.5629,
  'example-fs-creative-voltage': 0.5337,
  'example-digital-eguide': 0.5281,
  'example-dashboard': 0.5272,
  'example-guizang-ppt': 0.5113,
  'example-webgl-caustic-pool': 0.5107,
  'example-blog-post': 0.5098,
  'image-template-e-commerce-live-stream-ui-mockup': 0.4987,
  'example-fs-notebook-tabs': 0.4979,
  'video-template-video-seedance-three-kingdoms-lyubu-yuanmen-archery': 0.4948,
  'example-resume-modern': 0.4913,
  'example-motion-frames': 0.4806,
  'image-template-profile-avatar-anime-girl-to-cinematic-photo': 0.4788,
  'example-mobile-onboarding': 0.4767,
  'example-wireframe-sketch': 0.4753,
  'image-template-profile-avatar-casual-fashion-grid-photoshoot': 0.4711,
  'example-codex-interactive-capability-map': 0.4677,
  'image-template-3d-stone-staircase-evolution-infographic': 0.4656,
  'example-velar-luxury-real-estate': 0.4643,
  'example-fs-electric-studio': 0.462,
  'video-template-seedance-2-0-15-second-cinematic-japanese-romance-short-film': 0.4588,
  'example-video-hyperframes': 0.4573,
  'example-webgl-aurora-veil': 0.4433,
  'example-image-poster': 0.4366,
  'example-mockup-device-3d': 0.425,
  'example-hps-academic-paper': 0.4238,
  'video-template-3d-animated-boy-building-lego': 0.4156,
  'example-huashu-keynote-black': 0.4117,
  'example-wireframe-greybox': 0.4114,
  'example-doc-kami-parchment': 0.4096,
  'example-html-ppt-zhangzara-creative-mode': 0.4096,
  'video-template-luxury-supercar-cinematic-narrative': 0.4089,
  'image-template-illustration-crayon-kid-drawing-rework': 0.4068,
  'example-html-ppt-knowledge-arch-blueprint': 0.4003,
  'example-huashu-bento-insight': 0.3979,
  'example-flowai-live-dashboard-template': 0.3959,
  'example-docs-page': 0.3956,
  'example-social-media-matrix-tracker-template': 0.3931,
  'example-critique': 0.391,
  'video-template-frame-kinetic-type': 0.3892,
  'image-template-illustrated-city-food-map': 0.3828,
  'example-html-ppt-course-module': 0.3815,
  'example-webgl-distortion-grain': 0.3792,
  'example-social-media-dashboard': 0.3736,
  'example-audio-jingle': 0.3705,
  'example-wireframe-annotated': 0.3702,
  'example-html-ppt-hermes-cyber-terminal': 0.3682,
  'video-template-frame-liquid-bg-hero': 0.3682,
  'example-html-ppt-zhangzara-capsule': 0.3677,
  'example-huashu-slides': 0.3633,
  'example-trading-analysis-dashboard-template': 0.3627,
  'video-template-frame-logo-outro': 0.3611,
  'example-html-ppt-zhangzara-block-frame': 0.3591,
  'example-deck-swiss-international': 0.3556,
  'example-data-report': 0.3551,
  'example-github-dashboard': 0.3531,
  'example-dating-web': 0.3526,
  'example-webgl-depth-gallery': 0.3499,
  'example-pm-spec': 0.3492,
  'example-kami-deck': 0.3465,
  'video-template-frame-bold-poster': 0.3393,
  'example-finance-report': 0.3387,
  'video-template-cinematic-east-asian-woman-hand-dance': 0.3367,
  'example-hps-bauhaus': 0.3352,
  'example-live-dashboard': 0.3348,
  'example-webgl-particle-galaxy': 0.3291,
  'example-email-marketing': 0.3253,
  'example-frame-flowchart-sticky': 0.3246,
  'image-template-profile-avatar-cyberpunk-anime-portrait-with-neon-face-text': 0.3226,
  'example-html-ppt-zhangzara-scatterbrain': 0.3213,
  'image-template-momotaro-explainer-slide-in-hybrid-style': 0.3167,
  'example-hps-true-blueprint': 0.3159,
  'image-template-game-screenshot-anime-fighting-game-captain-ryuuga-vs-kaze-renshin': 0.315,
  'video-template-frame-build-minimal': 0.3081,
  'example-eng-runbook': 0.3078,
  'video-template-a-decade-of-refinement-glow-up': 0.3057,
  'example-fs-editorial-forest': 0.2993,
  'image-template-notion-team-dashboard-live-artifact': 0.2901,
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
