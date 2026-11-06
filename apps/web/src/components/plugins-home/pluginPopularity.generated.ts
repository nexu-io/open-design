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
  generatedAt: '2026-07-20',
  windowDays: 28,
  weights: { users: 0.6, runs: 0.4 },
  minUsers: 20,
  count: 127,
};

// Plugin id -> blended popularity score in [0, 1], most-popular first.
export const PLUGIN_POPULARITY: Readonly<Record<string, number>> = {
  'example-web-prototype': 1.0,
  'example-simple-deck': 0.876,
  'example-open-design-landing': 0.7041,
  'example-mobile-app': 0.6979,
  'example-web-clone': 0.6679,
  'example-gamified-app': 0.6248,
  'example-fs-creative-voltage': 0.5995,
  'example-kanban-board': 0.5899,
  'example-wireframe-mobile-flow': 0.5811,
  'example-wireframe-sketch': 0.5784,
  'image-template-anime-martial-arts-battle-illustration': 0.5592,
  'example-fs-electric-studio': 0.5546,
  'example-dashboard': 0.5505,
  'example-mobile-onboarding': 0.5456,
  'example-fs-notebook-tabs': 0.5377,
  'video-template-video-seedance-three-kingdoms-lyubu-yuanmen-archery': 0.535,
  'example-video-hyperframes': 0.5249,
  'example-guizang-ppt': 0.5214,
  'example-wireframe-greybox': 0.5198,
  'example-huashu-slides': 0.5192,
  'example-social-carousel': 0.5154,
  'example-social-media-matrix-tracker-template': 0.5122,
  'example-huashu-keynote-black': 0.5106,
  'video-template-seedance-2-0-15-second-cinematic-japanese-romance-short-film': 0.5106,
  'example-html-ppt-zhangzara-creative-mode': 0.5076,
  'example-motion-frames': 0.5065,
  'example-fs-editorial-forest': 0.5061,
  'example-html-ppt-knowledge-arch-blueprint': 0.5042,
  'example-webgl-experience': 0.5031,
  'example-huashu-bento-insight': 0.5002,
  'example-html-ppt-course-module': 0.4994,
  'example-digital-eguide': 0.4962,
  'image-template-e-commerce-live-stream-ui-mockup': 0.4925,
  'example-resume-modern': 0.4893,
  'example-velar-luxury-real-estate': 0.4877,
  'example-hps-academic-paper': 0.4718,
  'example-fs-emerald-editorial': 0.471,
  'example-wireframe-annotated': 0.4709,
  'example-codex-interactive-capability-map': 0.4603,
  'example-html-ppt-hermes-cyber-terminal': 0.4547,
  'example-html-ppt-zhangzara-capsule': 0.448,
  'example-audio-jingle': 0.4461,
  'example-huashu-takram-soft-tech': 0.4461,
  'example-blog-post': 0.4425,
  'example-doc-kami-parchment': 0.4396,
  'example-mockup-device-3d': 0.4381,
  'example-html-ppt-zhangzara-scatterbrain': 0.4353,
  'example-huashu-luxe-whitespace': 0.4333,
  'video-template-luxury-supercar-cinematic-narrative': 0.4304,
  'example-huashu-golden-circle': 0.4297,
  'example-html-ppt-zhangzara-cobalt-grid': 0.4293,
  'example-html-ppt-weekly-report': 0.4278,
  'example-open-design-landing-deck': 0.4251,
  'example-docs-page': 0.4241,
  'image-template-profile-avatar-anime-girl-to-cinematic-photo': 0.4237,
  'image-template-3d-stone-staircase-evolution-infographic': 0.4216,
  'image-template-profile-avatar-casual-fashion-grid-photoshoot': 0.4209,
  'example-hps-bauhaus': 0.4174,
  'image-template-illustration-crayon-kid-drawing-rework': 0.417,
  'example-deck-swiss-international': 0.4071,
  'image-template-illustrated-city-food-map': 0.4062,
  'example-image-poster': 0.4039,
  'image-template-infographic-otaku-dance-choreography-breakdown-gokurakujodo-16-panels': 0.4021,
  'video-template-frame-kinetic-type': 0.4018,
  'example-pm-spec': 0.4008,
  'example-hps-true-blueprint': 0.3997,
  'image-template-notion-team-dashboard-live-artifact': 0.3997,
  'example-finance-report': 0.3962,
  'example-trading-analysis-dashboard-template': 0.394,
  'example-html-ppt-presenter-mode-reveal': 0.3936,
  'video-template-frame-bold-poster': 0.3919,
  'example-html-ppt-obsidian-claude-gradient': 0.3917,
  'example-web-prototype-taste-soft': 0.391,
  'example-huashu-pentagram-grid': 0.3902,
  'example-social-media-dashboard': 0.3899,
  'video-template-cinematic-east-asian-woman-hand-dance': 0.3896,
  'example-html-ppt-tech-sharing': 0.387,
  'example-html-ppt-zhangzara-sakura-chroma': 0.3856,
  'video-template-frame-liquid-bg-hero': 0.3843,
  'image-template-momotaro-explainer-slide-in-hybrid-style': 0.3824,
  'example-html-ppt-zhangzara-block-frame': 0.3802,
  'video-template-3d-animated-boy-building-lego': 0.3791,
  'example-github-dashboard': 0.3777,
  'example-webgl-caustic-pool': 0.3768,
  'image-template-game-screenshot-anime-fighting-game-captain-ryuuga-vs-kaze-renshin': 0.3757,
  'video-template-a-decade-of-refinement-glow-up': 0.3753,
  'example-huashu-sparkline-arc': 0.3749,
  'example-html-ppt-zhangzara-signal': 0.3739,
  'image-template-social-media-post-showa-day-retro-culture-magazine-cover': 0.3737,
  'video-template-frame-glitch-title': 0.3722,
  'example-invoice': 0.3705,
  'example-web-prototype-taste-brutalist': 0.3705,
  'example-html-ppt-graphify-dark-graph': 0.3692,
  'example-html-ppt-zhangzara-blue-professional': 0.3687,
  'example-hps-memphis-pop': 0.3666,
  'example-html-ppt-zhangzara-monochrome': 0.3585,
  'example-frontend-slides': 0.3564,
  'example-html-ppt-zhangzara-broadside': 0.3564,
  'example-eng-runbook': 0.3546,
  'example-html-ppt-zhangzara-8-bit-orbit': 0.3535,
  'video-template-frame-build-minimal': 0.353,
  'example-frame-logo-outro': 0.3523,
  'video-template-frame-logo-outro': 0.3516,
  'example-ppt-keynote': 0.3512,
  'example-html-ppt-xhs-white-editorial': 0.3507,
  'example-critique': 0.3492,
  'example-dating-web': 0.3448,
  'example-html-ppt-product-launch': 0.3429,
  'example-hps-y2k-chrome': 0.3425,
  'example-html-ppt-testing-safety-alert': 0.3423,
  'example-html-ppt-taste-brutalist': 0.3402,
  'video-template-frame-creative-voltage': 0.3385,
  'example-html-ppt-zhangzara-daisy-days': 0.3373,
  'example-flowai-live-dashboard-template': 0.3364,
  'video-template-frame-pentagram-stat': 0.3358,
  'example-huashu-annual-letter': 0.3354,
  'video-template-frame-bold-signal': 0.3332,
  'example-ve-terminal-mono': 0.3318,
  'example-video-shortform': 0.3313,
  'example-html-ppt-xhs-pastel-card': 0.3309,
  'example-html-ppt-zhangzara-cartesian': 0.3308,
  'video-template-forbidden-city-cat-satire': 0.3259,
  'example-frame-glitch-title': 0.3216,
  'example-frame-flowchart-sticky': 0.3214,
  'example-ve-midnight-editorial': 0.3213,
  'example-deck-guizang-editorial': 0.3203,
  'image-template-profile-avatar-cinematic-south-asian-male-portrait-with-vultures': 0.3183,
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
