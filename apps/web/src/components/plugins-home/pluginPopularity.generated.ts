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
  generatedAt: '2026-09-21',
  windowDays: 28,
  weights: { users: 0.6, runs: 0.4 },
  minUsers: 20,
  count: 79,
};

// Plugin id -> blended popularity score in [0, 1], most-popular first.
export const PLUGIN_POPULARITY: Readonly<Record<string, number>> = {
  'example-web-prototype': 1.0,
  'example-simple-deck': 0.8339,
  'example-web-clone': 0.8137,
  'example-open-design-landing': 0.6785,
  'example-mobile-app': 0.639,
  'example-webgl-experience': 0.6336,
  'example-kanban-board': 0.6173,
  'example-social-carousel': 0.5629,
  'image-template-anime-martial-arts-battle-illustration': 0.5604,
  'example-gamified-app': 0.5478,
  'example-wireframe-mobile-flow': 0.5342,
  'example-dashboard': 0.5186,
  'example-digital-eguide': 0.5175,
  'example-blog-post': 0.5011,
  'example-fs-creative-voltage': 0.5002,
  'image-template-e-commerce-live-stream-ui-mockup': 0.497,
  'example-webgl-caustic-pool': 0.4889,
  'example-guizang-ppt': 0.4839,
  'example-fs-notebook-tabs': 0.4807,
  'video-template-video-seedance-three-kingdoms-lyubu-yuanmen-archery': 0.4807,
  'example-resume-modern': 0.4785,
  'image-template-profile-avatar-casual-fashion-grid-photoshoot': 0.4731,
  'image-template-profile-avatar-anime-girl-to-cinematic-photo': 0.4664,
  'example-velar-luxury-real-estate': 0.4629,
  'example-codex-interactive-capability-map': 0.4602,
  'image-template-3d-stone-staircase-evolution-infographic': 0.4598,
  'example-motion-frames': 0.4564,
  'video-template-seedance-2-0-15-second-cinematic-japanese-romance-short-film': 0.4551,
  'example-mobile-onboarding': 0.4453,
  'example-video-hyperframes': 0.4414,
  'example-image-poster': 0.4363,
  'example-webgl-aurora-veil': 0.4313,
  'example-fs-electric-studio': 0.4258,
  'example-hps-academic-paper': 0.419,
  'example-doc-kami-parchment': 0.412,
  'video-template-3d-animated-boy-building-lego': 0.4096,
  'video-template-luxury-supercar-cinematic-narrative': 0.4079,
  'example-wireframe-sketch': 0.407,
  'example-mockup-device-3d': 0.4048,
  'example-critique': 0.4044,
  'example-docs-page': 0.3873,
  'image-template-illustration-crayon-kid-drawing-rework': 0.3869,
  'example-flowai-live-dashboard-template': 0.3858,
  'image-template-illustrated-city-food-map': 0.3823,
  'example-huashu-bento-insight': 0.3822,
  'example-audio-jingle': 0.3795,
  'example-html-ppt-zhangzara-creative-mode': 0.3794,
  'example-html-ppt-course-module': 0.3788,
  'example-huashu-keynote-black': 0.3752,
  'example-social-media-matrix-tracker-template': 0.3751,
  'example-social-media-dashboard': 0.3749,
  'example-html-ppt-knowledge-arch-blueprint': 0.3697,
  'example-dating-web': 0.3608,
  'example-finance-report': 0.3601,
  'example-data-report': 0.3599,
  'video-template-frame-logo-outro': 0.359,
  'example-wireframe-greybox': 0.3586,
  'example-pm-spec': 0.3568,
  'example-webgl-distortion-grain': 0.356,
  'video-template-frame-kinetic-type': 0.3557,
  'example-trading-analysis-dashboard-template': 0.3517,
  'video-template-frame-liquid-bg-hero': 0.3513,
  'example-huashu-slides': 0.3511,
  'example-html-ppt-zhangzara-capsule': 0.3469,
  'example-kami-deck': 0.3437,
  'video-template-cinematic-east-asian-woman-hand-dance': 0.3352,
  'example-webgl-particle-galaxy': 0.3343,
  'example-html-ppt-hermes-cyber-terminal': 0.3331,
  'example-html-ppt-zhangzara-block-frame': 0.3327,
  'image-template-profile-avatar-cyberpunk-anime-portrait-with-neon-face-text': 0.3278,
  'example-wireframe-annotated': 0.3273,
  'example-deck-swiss-international': 0.3264,
  'example-github-dashboard': 0.3246,
  'video-template-frame-bold-poster': 0.3235,
  'example-hps-bauhaus': 0.3209,
  'example-email-marketing': 0.3198,
  'image-template-game-screenshot-anime-fighting-game-captain-ryuuga-vs-kaze-renshin': 0.3192,
  'video-template-a-decade-of-refinement-glow-up': 0.316,
  'example-eng-runbook': 0.3154,
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
