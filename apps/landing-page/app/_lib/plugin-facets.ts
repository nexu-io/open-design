// Plugin-library facet derivation, ported from
// `apps/web/src/components/plugins-home/facets.ts`.
//
// The web client organizes the Plugins home grid around the artifact a
// user is about to make:
//
//   Prototype · Live Artifact · Slides · Image · Video · HyperFrames · Audio
//
// Prototype, Slides, Image, and Video each expose a row of scene
// children (Dashboards, Apps, Pitch decks, Storyboards, …); HyperFrames
// and Audio stay flat. The marketing site has historically organized
// the same content around author-supplied `od.mode` / `od.scenario`
// taxonomies — confusing for visitors who have never opened the app.
// Mirroring the client taxonomy here makes the catalogue read the same
// on /plugins/ as it does inside the product.
//
// We adapt the client's `InstalledPluginRecord` test functions to the
// landing-side `SkillRecord` / `TemplateRecord` shape: skill `name`,
// `slug`, `mode`, `scenario`, `category` plus the design-template
// origin slugs are the haystack we match against. The client's curated
// `live-artifact` ID list maps to repo folder names because the daemon
// plugin id is `example-<folder-name>` for design-template origins.

import type { SkillRecord, TemplateRecord } from './catalog';
import type { BundledPluginRecord } from './bundled-plugins';

export type PluginCategorySlug =
  | 'prototype'
  | 'live-artifact'
  | 'deck'
  | 'image'
  | 'video'
  | 'hyperframes'
  | 'audio';

export interface PluginCategoryDef {
  slug: PluginCategorySlug;
  label: string;
  /** One-sentence copy used on category headers and tile blurbs. */
  description: string;
}

export interface PluginSubcategoryDef {
  parent: PluginCategorySlug;
  slug: string;
  label: string;
  description: string;
}

export const PLUGIN_CATEGORIES: readonly PluginCategoryDef[] = [
  {
    slug: 'prototype',
    label: 'Prototype',
    description:
      'Interactive product mockups — dashboards, apps, landing pages, internal tools. Anything you’d hand a stakeholder and click through.',
  },
  {
    slug: 'live-artifact',
    label: 'Live Artifact',
    description:
      'Refreshable, data-aware artifacts that re-render whenever the underlying data changes. Live dashboards, monitoring boards, recurring trackers.',
  },
  {
    slug: 'deck',
    label: 'Slides',
    description:
      'Polished slide decks from a narrative brief — pitch decks, course modules, weekly reports, product launches.',
  },
  {
    slug: 'image',
    label: 'Image',
    description:
      'Image assets generated from structured creative direction — UI mockups, brand visuals, storyboards, social posts, illustrations.',
  },
  {
    slug: 'video',
    label: 'Video',
    description:
      'Video prompts, storyboards, and render-ready motion artifacts — short-form social, marketing cuts, motion graphics, cinematic stories.',
  },
  {
    slug: 'hyperframes',
    label: 'HyperFrames',
    description:
      'HyperFrames-ready motion compositions — agent-built video that blends template HTML with frame-level keyframes.',
  },
  {
    slug: 'audio',
    label: 'Audio',
    description:
      'Audio, voice, and sound-design assets generated from a brief — podcast intros, jingles, ambient beds.',
  },
];

export const PLUGIN_SUBCATEGORIES: readonly PluginSubcategoryDef[] = [
  // Prototype
  { parent: 'prototype', slug: 'business-dashboards', label: 'Dashboards',
    description: 'Business systems, admin panels, analytics dashboards, ops control rooms.' },
  { parent: 'prototype', slug: 'app-prototypes', label: 'Apps',
    description: 'Multi-screen mobile and web apps — onboarding, productivity, social.' },
  { parent: 'prototype', slug: 'landing-marketing', label: 'Landing & marketing',
    description: 'Landing pages, marketing sites, pricing pages, waitlists, campaign pages.' },
  { parent: 'prototype', slug: 'developer-tools', label: 'Developer tools',
    description: 'Engineering surfaces, dev workflows, technical docs, code-collab UIs.' },
  { parent: 'prototype', slug: 'docs-reports', label: 'Docs & reports',
    description: 'Reports, case studies, specs, invoices, resumes, knowledge documents.' },
  { parent: 'prototype', slug: 'brand-design', label: 'Brand & design',
    description: 'Brand pages, visual exploration, design reviews, mockups.' },

  // Slides / Deck
  { parent: 'deck', slug: 'pitch-business', label: 'Pitch & business',
    description: 'Fundraising decks, business plans, investor narratives, strategic memos.' },
  { parent: 'deck', slug: 'course-training', label: 'Course & training',
    description: 'Course modules, workshops, lessons, classroom slides.' },
  { parent: 'deck', slug: 'reports-briefings', label: 'Reports & briefings',
    description: 'Weekly reports, business reviews, white papers, briefings.' },
  { parent: 'deck', slug: 'product-sales', label: 'Product & sales',
    description: 'Product launches, sales decks, feature reveals, customer pitches.' },
  { parent: 'deck', slug: 'engineering-talks', label: 'Engineering talks',
    description: 'Tech sharing, architecture walkthroughs, dev workflow talks.' },
  { parent: 'deck', slug: 'creative-decks', label: 'Creative decks',
    description: 'Editorial, brand, social, fashion, creator-portfolio decks.' },

  // Image
  { parent: 'image', slug: 'ui-product-mockups', label: 'UI & product mockups',
    description: 'Product UI mockups, game UI, interface showcases, app cards.' },
  { parent: 'image', slug: 'brand-visuals', label: 'Brand & logo',
    description: 'Logos, brand visuals, typography-led posters, identity systems.' },
  { parent: 'image', slug: 'storyboards-motion-refs', label: 'Storyboards',
    description: 'Storyboards, choreography breakdowns, pose references, motion sheets.' },
  { parent: 'image', slug: 'social-content', label: 'Social & content',
    description: 'Social posts, infographics, explainers, content cards.' },
  { parent: 'image', slug: 'avatar-portrait', label: 'Avatar & portrait',
    description: 'Avatars, portraits, identity photos, character headshots.' },
  { parent: 'image', slug: 'illustration-style', label: 'Illustration & style',
    description: 'Illustrations, anime, fantasy scenes, 3D renders, style transfer.' },

  // Video
  { parent: 'video', slug: 'motion-effects', label: 'Motion & effects',
    description: 'Motion graphics, VFX, title frames, animation, logo outros.' },
  { parent: 'video', slug: 'social-short-form', label: 'Social short form',
    description: 'Vertical social clips, TikTok-style captions, dance trends.' },
  { parent: 'video', slug: 'marketing-product', label: 'Marketing & product',
    description: 'Product promos, advertising, brand sizzle reels, marketing cuts.' },
  { parent: 'video', slug: 'data-explainers', label: 'Data & explainers',
    description: 'Data explainers, animated charts, maps, diagrams, flow walkthroughs.' },
  { parent: 'video', slug: 'cinematic-story', label: 'Cinematic story',
    description: 'Cinematic scenes, story sequences, anime/action shots, fantasy clips.' },
];

/**
 * Curated live-artifact ids. Mirrors `CURATED_LIVE_ARTIFACT_PLUGIN_IDS`
 * in `apps/web/src/components/plugins-home/curatedPriority.ts`.
 *
 * We accept both forms — the manifest `name` (`example-live-dashboard`,
 * what bundled-plugin records carry) and the bare folder slug
 * (`live-dashboard`, what legacy SkillRecord/TemplateRecord carry) —
 * so a single set works for both data sources.
 */
const LIVE_ARTIFACT_SLUGS: ReadonlySet<string> = new Set([
  // Bundled-plugin manifest ids.
  'example-live-dashboard',
  'example-live-artifact',
  'example-social-media-matrix-tracker-template',
  'example-trading-analysis-dashboard-template',
  'image-template-notion-team-dashboard-live-artifact',
  // Bare folder slugs (used by SkillRecord / TemplateRecord adapters).
  'live-dashboard',
  'live-artifact',
  'social-media-matrix-tracker-template',
  'trading-analysis-dashboard-template',
]);

interface MatchableRecord {
  slug: string;
  name?: string;
  mode?: string;
  scenario?: string;
  category?: string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

/**
 * Build a fuzzy haystack of slugs the client's `byAnySlug` checks
 * against — slug, name, mode, scenario, category, plus tokens of the
 * compound slug (so `social-media-dashboard` also matches against
 * `social`, `media`, `dashboard`).
 */
function recordSlugs(record: MatchableRecord): Set<string> {
  const tokens: string[] = [
    slugify(record.slug),
    slugify(record.name ?? ''),
    slugify(record.mode ?? ''),
    slugify(record.scenario ?? ''),
    slugify(record.category ?? ''),
  ];
  for (const part of record.slug.split('-')) {
    tokens.push(slugify(part));
  }
  return new Set(tokens.filter(Boolean));
}

function hasAnySlug(record: MatchableRecord, slugs: readonly string[]): boolean {
  const haystack = recordSlugs(record);
  return slugs.some((slug) => haystack.has(slug));
}

function modeMatches(record: MatchableRecord, mode: string): boolean {
  return slugify(record.mode ?? '') === mode;
}

/**
 * Returns the artifact-kind category for a record, or `null` if it
 * doesn't fit any of the seven product types (instruction-only skills
 * like `copywriting` end up here).
 *
 * Mirrors the precedence order from `apps/web/.../facets.ts`:
 * Live Artifact wins over Prototype (when the slug is in the curated
 * list), HyperFrames wins over Video.
 */
export function categorizePlugin(record: MatchableRecord): PluginCategorySlug | null {
  if (LIVE_ARTIFACT_SLUGS.has(record.slug)) return 'live-artifact';

  if (
    hasAnySlug(record, [
      'hyperframes',
      'html-video',
      'video-composition',
      'interactive-video',
    ])
  ) {
    return 'hyperframes';
  }

  if (modeMatches(record, 'prototype')) return 'prototype';
  if (modeMatches(record, 'deck')) return 'deck';
  if (modeMatches(record, 'image')) return 'image';
  if (modeMatches(record, 'video')) return 'video';
  if (modeMatches(record, 'audio')) return 'audio';

  return null;
}

/**
 * Returns the scene subcategory under the record's primary category,
 * or `null` if the record doesn't fit any (e.g. the parent has no
 * subcategories or the record straddles two scene buckets — first match
 * wins, mirroring the client implementation).
 */
export function categorizeSubcategory(
  record: MatchableRecord,
  parent?: PluginCategorySlug | null,
): string | null {
  const primary = parent ?? categorizePlugin(record);
  if (!primary) return null;

  const candidates = PLUGIN_SUBCATEGORIES.filter((s) => s.parent === primary);
  for (const sub of candidates) {
    if (subcategoryTest(sub.slug)(record)) return sub.slug;
  }
  return null;
}

function subcategoryTest(slug: string): (record: MatchableRecord) => boolean {
  const slugs = SUBCATEGORY_SLUGS[slug];
  if (!slugs) return () => false;
  return (record) => hasAnySlug(record, slugs);
}

/**
 * Per-subcategory keyword bundles, transcribed from `byAnySlug(...)`
 * arguments in `apps/web/.../facets.ts`. When the client list grows,
 * mirror the new slugs here so the marketing taxonomy stays aligned.
 */
const SUBCATEGORY_SLUGS: Record<string, readonly string[]> = {
  'business-dashboards': [
    'dashboard', 'admin-panel', 'analytics', 'control-panel', 'team-dashboard',
    'live-dashboard', 'refreshable-dashboard', 'ops-dashboard', 'github-dashboard',
    'social-media-dashboard', 'data', 'chart',
  ],
  'app-prototypes': [
    'mobile', 'app', 'mobile-app', 'ios-app', 'android-app', 'phone-screen',
    'app-ui', 'app-mockup', 'app-onboarding', 'onboarding', 'signup', 'task',
    'habit-tracker', 'dating-app',
  ],
  'landing-marketing': [
    'landing', 'landing-page', 'saas-landing', 'marketing-page', 'product-landing',
    'pricing', 'pricing-page', 'waitlist-page', 'coming-soon-page', 'email-template',
    'newsletter', 'lead-magnet', 'e-guide', 'poster', 'social-carousel',
  ],
  'developer-tools': [
    'engineering', 'docs', 'documentation', 'api-reference', 'runbook', 'ops-doc',
    'sre-doc', 'github', 'linear', 'issue',
  ],
  'docs-reports': [
    'report', 'financial-report', 'finance-report', 'case-report', 'clinical-case',
    'case-study', 'guide', 'tutorial', 'pm-spec', 'prd', 'spec', 'invoice',
    'resume', 'cv',
  ],
  'brand-design': [
    'design', 'design-review', 'design-audit', 'critique', 'mockup', 'wireframe',
    'visual', 'brand',
  ],
  'pitch-business': [
    'pitch-deck', 'pitch', 'fundraising', 'seed-round', 'investor-deck', 'vc-deck',
    'business-plan', 'b2b-saas-pitch', 'founder-vision-deck',
  ],
  'course-training': [
    'course-module', 'course-slides', 'training-deck', 'workshop', 'lesson',
    'education', 'classroom',
  ],
  'reports-briefings': [
    'weekly-report', 'status-update', 'team-report', 'business-review', 'white-paper',
    'investment-thesis', 'consulting-deliverable', 'financial', 'data-viz-launch',
  ],
  'product-sales': [
    'product-launch', 'launch-deck', 'feature-reveal', 'launch-slides', 'sales',
    'customer', 'product',
  ],
  'engineering-talks': [
    'engineering', 'tech-sharing', 'tech-talk', 'technical-presentation',
    'system-design', 'architecture', 'developer-tutorial', 'dev-workflow', 'incident',
    'red-team', 'risk-review',
  ],
  'creative-decks': [
    'marketing', 'editorial', 'zhangzara', 'creative-agency-pitch', 'brand-manifesto',
    'fashion-brand-deck', 'creator-portfolio', 'xhs', 'design-studio-deck',
  ],
  'ui-product-mockups': [
    'app-web-design', 'game-ui', 'ui', 'hud', 'live-artifact', 'app-showcase',
    'product', 'mockup',
  ],
  'brand-visuals': ['logo', 'brand', 'typography', 'poster', 'key-art', 'cover-art'],
  'storyboards-motion-refs': [
    'storyboard', 'dance', 'choreography', 'pose-reference', 'video-reference', 'sequence',
  ],
  'social-content': ['social-media-post', 'infographic', 'explainer', 'social', 'collage'],
  'avatar-portrait': ['profile-avatar', 'portrait', 'selfie', 'identity'],
  'illustration-style': [
    'illustration', 'anime', 'fantasy', '3d-render', 'cinematic', 'crayon',
    'style-transfer', 'nature',
  ],
  'motion-effects': [
    'motion-graphics', 'vfx', 'frame', 'kinetic-typography', 'logo', 'outro',
    'title', 'transition', 'animation',
  ],
  'social-short-form': [
    'short-form', 'vertical', 'tiktok', 'social-meme', 'dance', 'k-pop', 'karaoke', 'captions',
  ],
  'marketing-product': [
    'marketing', 'product', 'advertising', 'product-promo', 'saas',
    'website-to-video', 'brand',
  ],
  'data-explainers': ['data', 'chart', 'flowchart', 'diagram', 'map', 'route', 'infographic'],
  'cinematic-story': [
    'cinematic', 'fantasy', 'action', 'anime', 'game-cinematic', 'cyberpunk',
    'nature', 'cinematic-romance', 'combat',
  ],
};

export function getSubcategoriesFor(parent: PluginCategorySlug): PluginSubcategoryDef[] {
  return PLUGIN_SUBCATEGORIES.filter((s) => s.parent === parent);
}

/** Adapter so `categorizePlugin` works against either record shape. */
export function pluginRecordOf(
  source: SkillRecord | TemplateRecord,
): MatchableRecord {
  return {
    slug: source.slug,
    name: source.name,
    mode: source.mode,
    scenario: source.scenario,
    category: 'category' in source ? source.category : undefined,
  };
}

/**
 * Adapter for the bundled-plugin manifest format. The slug we hand to
 * `categorizePlugin` is the manifest id (`image-template-...`,
 * `video-template-...`) so the prefix-based heuristics in the
 * subcategory bundles still bite. Tags are folded into the name field
 * so `byAnySlug` can match against `infographic`, `mobile-app`, etc.
 * the same way it does for SkillRecord taxonomy values.
 */
export function bundledRecordOf(source: BundledPluginRecord): MatchableRecord {
  // Joining tags into `name` lets `recordSlugs` tokenize them along
  // with the slug so `byAnySlug(['mobile-app', ...])` matches.
  return {
    slug: source.manifestId,
    name: [source.title, source.tags.join(' ')].filter(Boolean).join(' '),
    mode: source.mode,
    scenario: source.scenario,
    category: source.surface,
  };
}
