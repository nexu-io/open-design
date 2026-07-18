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
  generatedAt: '2026-07-03',
  windowDays: 28,
  weights: { users: 0.6, runs: 0.4 },
  minUsers: 20,
  count: 101,
};

// Plugin id -> blended popularity score in [0, 1], most-popular first.
export const PLUGIN_POPULARITY: Readonly<Record<string, number>> = {
  'example-web-prototype': 1.0,
  'example-simple-deck': 0.8737,
  'example-mobile-app': 0.6698,
  'example-open-design-landing': 0.6687,
  'example-gamified-app': 0.6031,
  'image-template-anime-martial-arts-battle-illustration': 0.5741,
  'example-fs-creative-voltage': 0.5676,
  'example-dashboard': 0.5504,
  'example-kanban-board': 0.5448,
  'example-social-media-matrix-tracker-template': 0.5448,
  'example-guizang-ppt': 0.5431,
  'example-html-ppt-zhangzara-creative-mode': 0.5402,
  'example-fs-electric-studio': 0.5385,
  'video-template-video-seedance-three-kingdoms-lyubu-yuanmen-archery': 0.5375,
  'example-video-hyperframes': 0.5304,
  'example-wireframe-sketch': 0.5233,
  'example-html-ppt-knowledge-arch-blueprint': 0.5202,
  'image-template-e-commerce-live-stream-ui-mockup': 0.5136,
  'video-template-seedance-2-0-15-second-cinematic-japanese-romance-short-film': 0.5128,
  'example-fs-notebook-tabs': 0.5082,
  'example-html-ppt-course-module': 0.5028,
  'example-motion-frames': 0.5023,
  'example-huashu-slides': 0.4912,
  'example-mobile-onboarding': 0.4885,
  'example-huashu-keynote-black': 0.4878,
  'example-wireframe-mobile-flow': 0.4792,
  'example-huashu-bento-insight': 0.4695,
  'example-velar-luxury-real-estate': 0.4554,
  'example-social-carousel': 0.4532,
  'example-resume-modern': 0.4517,
  'example-html-ppt-hermes-cyber-terminal': 0.4422,
  'example-audio-jingle': 0.4415,
  'example-html-ppt-zhangzara-capsule': 0.441,
  'example-html-ppt-zhangzara-scatterbrain': 0.44,
  'example-huashu-luxe-whitespace': 0.4365,
  'example-fs-editorial-forest': 0.435,
  'image-template-profile-avatar-casual-fashion-grid-photoshoot': 0.4318,
  'example-html-ppt-obsidian-claude-gradient': 0.428,
  'image-template-profile-avatar-anime-girl-to-cinematic-photo': 0.4275,
  'example-hps-academic-paper': 0.4262,
  'video-template-luxury-supercar-cinematic-narrative': 0.4232,
  'example-web-prototype-taste-brutalist': 0.423,
  'example-digital-eguide': 0.422,
  'example-html-ppt-product-launch': 0.4209,
  'example-doc-kami-parchment': 0.4183,
  'example-html-ppt-zhangzara-cobalt-grid': 0.4151,
  'image-template-3d-stone-staircase-evolution-infographic': 0.4113,
  'example-blog-post': 0.4104,
  'example-fs-emerald-editorial': 0.409,
  'image-template-illustration-crayon-kid-drawing-rework': 0.4082,
  'example-open-design-landing-deck': 0.408,
  'example-web-prototype-taste-soft': 0.4076,
  'image-template-notion-team-dashboard-live-artifact': 0.4054,
  'video-template-cinematic-east-asian-woman-hand-dance': 0.4037,
  'image-template-infographic-otaku-dance-choreography-breakdown-gokurakujodo-16-panels': 0.4028,
  'example-trading-analysis-dashboard-template': 0.4023,
  'example-html-ppt-presenter-mode-reveal': 0.402,
  'example-deck-swiss-international': 0.4018,
  'example-docs-page': 0.3997,
  'image-template-illustrated-city-food-map': 0.398,
  'example-huashu-golden-circle': 0.3966,
  'example-huashu-takram-soft-tech': 0.396,
  'example-html-ppt-weekly-report': 0.3951,
  'example-dating-web': 0.3924,
  'example-image-poster': 0.3922,
  'example-codex-interactive-capability-map': 0.389,
  'example-html-ppt-tech-sharing': 0.3888,
  'example-wireframe-greybox': 0.3847,
  'video-template-frame-bold-poster': 0.3835,
  'example-mockup-device-3d': 0.3759,
  'example-social-media-dashboard': 0.3754,
  'example-pm-spec': 0.3738,
  'example-html-ppt-graphify-dark-graph': 0.3673,
  'example-finance-report': 0.362,
  'example-critique': 0.3617,
  'example-html-ppt-testing-safety-alert': 0.3616,
  'example-eng-runbook': 0.3608,
  'video-template-frame-kinetic-type': 0.3607,
  'video-template-3d-animated-boy-building-lego': 0.3596,
  'video-template-a-decade-of-refinement-glow-up': 0.3575,
  'example-html-ppt-zhangzara-broadside': 0.3532,
  'example-hps-true-blueprint': 0.352,
  'example-deck-guizang-editorial': 0.3516,
  'example-huashu-pentagram-grid': 0.3516,
  'example-html-ppt-zhangzara-signal': 0.3513,
  'example-invoice': 0.351,
  'image-template-momotaro-explainer-slide-in-hybrid-style': 0.3505,
  'example-html-ppt-zhangzara-block-frame': 0.3479,
  'image-template-social-media-post-showa-day-retro-culture-magazine-cover': 0.3473,
  'example-hps-memphis-pop': 0.347,
  'example-html-ppt-xhs-white-editorial': 0.347,
  'example-html-ppt-zhangzara-monochrome': 0.347,
  'example-html-ppt-zhangzara-blue-professional': 0.3452,
  'example-wireframe-annotated': 0.3425,
  'image-template-game-screenshot-anime-fighting-game-captain-ryuuga-vs-kaze-renshin': 0.3412,
  'example-github-dashboard': 0.341,
  'example-html-ppt-taste-brutalist': 0.3402,
  'video-template-frame-build-minimal': 0.3396,
  'example-huashu-sparkline-arc': 0.337,
  'video-template-forbidden-city-cat-satire': 0.3352,
  'video-template-frame-bold-signal': 0.3028,
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
  'example-replit-deck',
  'example-x-research',
];
