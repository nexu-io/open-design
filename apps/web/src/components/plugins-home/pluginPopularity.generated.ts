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
  generatedAt: '2026-09-28',
  windowDays: 28,
  weights: { users: 0.6, runs: 0.4 },
  minUsers: 20,
  count: 81,
};

// Plugin id -> blended popularity score in [0, 1], most-popular first.
export const PLUGIN_POPULARITY: Readonly<Record<string, number>> = {
  'example-web-prototype': 1.0,
  'example-simple-deck': 0.8276,
  'example-web-clone': 0.8135,
  'example-open-design-landing': 0.6785,
  'example-mobile-app': 0.6338,
  'example-webgl-experience': 0.63,
  'example-kanban-board': 0.6146,
  'example-gamified-app': 0.5717,
  'example-social-carousel': 0.5642,
  'example-velar-luxury-real-estate': 0.5551,
  'image-template-anime-martial-arts-battle-illustration': 0.5409,
  'example-wireframe-mobile-flow': 0.5214,
  'example-dashboard': 0.5171,
  'example-digital-eguide': 0.5138,
  'example-fs-creative-voltage': 0.512,
  'example-blog-post': 0.4912,
  'example-fs-notebook-tabs': 0.4911,
  'image-template-e-commerce-live-stream-ui-mockup': 0.4824,
  'example-resume-modern': 0.4814,
  'example-webgl-caustic-pool': 0.4732,
  'example-guizang-ppt': 0.4699,
  'video-template-video-seedance-three-kingdoms-lyubu-yuanmen-archery': 0.4662,
  'example-motion-frames': 0.4611,
  'video-template-seedance-2-0-15-second-cinematic-japanese-romance-short-film': 0.4585,
  'image-template-profile-avatar-casual-fashion-grid-photoshoot': 0.458,
  'image-template-profile-avatar-anime-girl-to-cinematic-photo': 0.4546,
  'example-codex-interactive-capability-map': 0.4535,
  'image-template-3d-stone-staircase-evolution-infographic': 0.4499,
  'example-mobile-onboarding': 0.4494,
  'example-fs-electric-studio': 0.4368,
  'example-video-hyperframes': 0.434,
  'example-image-poster': 0.4334,
  'example-webgl-aurora-veil': 0.4182,
  'example-critique': 0.4158,
  'example-hps-academic-paper': 0.4129,
  'example-pricing-page': 0.411,
  'example-mockup-device-3d': 0.4095,
  'example-doc-kami-parchment': 0.4088,
  'example-wireframe-sketch': 0.4023,
  'video-template-3d-animated-boy-building-lego': 0.4019,
  'video-template-luxury-supercar-cinematic-narrative': 0.3897,
  'example-finance-report': 0.3844,
  'example-social-media-matrix-tracker-template': 0.3842,
  'image-template-illustration-crayon-kid-drawing-rework': 0.383,
  'example-audio-jingle': 0.3817,
  'example-flowai-live-dashboard-template': 0.3774,
  'example-huashu-bento-insight': 0.3761,
  'example-pm-spec': 0.3736,
  'image-template-illustrated-city-food-map': 0.3736,
  'example-hr-onboarding': 0.3733,
  'example-html-ppt-course-module': 0.3681,
  'example-social-media-dashboard': 0.3681,
  'example-dating-web': 0.3675,
  'example-data-report': 0.3667,
  'example-html-ppt-zhangzara-creative-mode': 0.3645,
  'example-webgl-distortion-grain': 0.3626,
  'example-huashu-keynote-black': 0.3619,
  'example-docs-page': 0.3596,
  'image-template-vr-headset-exploded-view-poster': 0.3593,
  'example-huashu-slides': 0.354,
  'example-html-ppt-knowledge-arch-blueprint': 0.3503,
  'image-template-social-media-post-psg-transfer-announcement-poster': 0.3489,
  'example-wireframe-greybox': 0.3488,
  'example-html-ppt-zhangzara-block-frame': 0.3483,
  'video-template-frame-kinetic-type': 0.3473,
  'image-template-profile-avatar-cyberpunk-anime-portrait-with-neon-face-text': 0.3472,
  'example-trading-analysis-dashboard-template': 0.3466,
  'video-template-frame-logo-outro': 0.3457,
  'example-html-ppt-zhangzara-capsule': 0.3423,
  'video-template-frame-bold-poster': 0.3404,
  'example-kami-deck': 0.3388,
  'example-github-dashboard': 0.3347,
  'video-template-cinematic-east-asian-woman-hand-dance': 0.3283,
  'example-html-ppt-hermes-cyber-terminal': 0.3267,
  'video-template-frame-liquid-bg-hero': 0.323,
  'example-eng-runbook': 0.3219,
  'image-template-game-screenshot-anime-fighting-game-captain-ryuuga-vs-kaze-renshin': 0.319,
  'image-template-social-media-post-vintage-sign-painter-sketch': 0.3181,
  'example-email-marketing': 0.3173,
  'image-template-notion-team-dashboard-live-artifact': 0.3086,
  'video-template-a-decade-of-refinement-glow-up': 0.3044,
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
