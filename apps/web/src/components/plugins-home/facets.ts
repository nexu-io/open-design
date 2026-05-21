// Facet derivation for the Plugins home section.
//
// The Home starter grid is organized around the artifact a user wants
// to make first:
//
//   Prototype · Slides · Image · Video · HyperFrames · Audio
//
// Prototype, Slides, Image, and Video have enough bundled templates to
// deserve a second row. Those child buckets follow the Feishu prompt
// taxonomy from the user-query analysis doc: business dashboards, app
// prototypes, landing pages, pitch decks, training decks, brand visuals,
// video/motion generation, and adjacent scene clusters. HyperFrames and
// Audio stay flat because their catalog slices are intentionally small.
//
// Counts in each category reflect the catalog *as a whole*, not the
// post-filter slice. We deliberately avoid recomputing counts after
// a selection because per-axis counts that "go to zero" as the user
// clicks make the row visually noisy and obscure how the overall
// catalog is shaped.

import type { InstalledPluginRecord } from '@open-design/contracts';

export type FacetAxis = 'category' | 'subcategory';

export interface FacetOption {
  slug: string;
  label: string;
  count: number;
  starterPrompt: string;
}

export interface FacetCatalog {
  category: FacetOption[];
  subcategory: Record<string, FacetOption[]>;
}

export interface FacetSelection {
  category: string | null;
  subcategory: string | null;
}

interface CategoryDef {
  slug: string;
  label: string;
  starterPrompt: string;
  test: (record: InstalledPluginRecord) => boolean;
}

interface SubcategoryDef extends CategoryDef {
  parent: string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function manifestField(record: InstalledPluginRecord, key: string): string | undefined {
  const od = (record.manifest?.od ?? {}) as Record<string, unknown>;
  const v = od[key];
  return typeof v === 'string' ? v : undefined;
}

function manifestTaskKind(record: InstalledPluginRecord): string | undefined {
  return manifestField(record, 'taskKind');
}

function manifestTagSlugs(record: InstalledPluginRecord): string[] {
  const raw = record.manifest?.tags ?? [];
  return raw.map((t) => slugify(String(t))).filter(Boolean);
}

function pipelineAtomSlugs(record: InstalledPluginRecord): string[] {
  const stages = record.manifest?.od?.pipeline?.stages ?? [];
  return stages.flatMap((stage) => stage.atoms.map(slugify));
}

function recordSlugs(record: InstalledPluginRecord): Set<string> {
  return new Set([
    slugify(record.id),
    slugify(record.manifest?.name ?? ''),
    slugify(record.title ?? ''),
    slugify(manifestTaskKind(record) ?? ''),
    slugify(manifestField(record, 'mode') ?? ''),
    slugify(manifestField(record, 'scenario') ?? ''),
    slugify(manifestField(record, 'surface') ?? ''),
    ...manifestTagSlugs(record),
    ...pipelineAtomSlugs(record),
  ].filter(Boolean));
}

function byMode(mode: string): (record: InstalledPluginRecord) => boolean {
  return (record) => {
    const v = manifestField(record, 'mode');
    return typeof v === 'string' && slugify(v) === mode;
  };
}

function hasAnySlug(record: InstalledPluginRecord, slugs: readonly string[]): boolean {
  const haystack = recordSlugs(record);
  return slugs.some((slug) => haystack.has(slug));
}

function byAnySlug(...slugs: string[]): (record: InstalledPluginRecord) => boolean {
  return (record) => hasAnySlug(record, slugs);
}

function matchesAny(record: InstalledPluginRecord, tests: Array<(record: InstalledPluginRecord) => boolean>): boolean {
  return tests.some((test) => test(record));
}

const HYPERFRAMES_TESTS = [
  byAnySlug(
    'hyperframes',
    'html-video',
    'video-composition',
    'interactive-video',
  ),
];

function isHyperFramesPlugin(record: InstalledPluginRecord): boolean {
  return matchesAny(record, HYPERFRAMES_TESTS);
}

function isVideoPlugin(record: InstalledPluginRecord): boolean {
  return byMode('video')(record) && !isHyperFramesPlugin(record);
}

// Curated artifact-kind list. Keep this aligned with the Home creation
// intents and the app's artifact product types.
const PRIMARY_CATEGORIES: readonly CategoryDef[] = [
  {
    slug: 'prototype',
    label: 'Prototype',
    starterPrompt: 'Create an Open Design plugin that generates an interactive prototype from a product brief.',
    test: byMode('prototype'),
  },
  {
    slug: 'deck',
    label: 'Slides',
    starterPrompt: 'Create an Open Design plugin that generates a polished slide deck from a narrative brief.',
    test: byMode('deck'),
  },
  {
    slug: 'image',
    label: 'Image',
    starterPrompt: 'Create an Open Design plugin that generates image assets from structured creative direction.',
    test: byMode('image'),
  },
  {
    slug: 'video',
    label: 'Video',
    starterPrompt: 'Create an Open Design plugin that generates video prompts, storyboards, or render-ready motion artifacts.',
    test: isVideoPlugin,
  },
  {
    slug: 'hyperframes',
    label: 'HyperFrames',
    starterPrompt: 'Create an Open Design plugin that generates a HyperFrames-ready motion composition.',
    test: isHyperFramesPlugin,
  },
  {
    slug: 'audio',
    label: 'Audio',
    starterPrompt: 'Create an Open Design plugin that generates audio, voice, or sound-design assets from a brief.',
    test: byMode('audio'),
  },
];

// Scene child buckets based on the Feishu prompt taxonomy. HyperFrames
// and Audio intentionally have no children, so selecting them keeps the
// section flat.
const SUBCATEGORIES: readonly SubcategoryDef[] = [
  {
    parent: 'prototype',
    slug: 'business-dashboards',
    label: 'Dashboards',
    starterPrompt: 'Create an Open Design prototype plugin for business systems, admin panels, or analytics dashboards.',
    test: byAnySlug(
      'dashboard',
      'admin-panel',
      'analytics',
      'control-panel',
      'team-dashboard',
      'live-dashboard',
      'refreshable-dashboard',
      'ops-dashboard',
      'github-dashboard',
      'social-media-dashboard',
      'data',
      'chart',
    ),
  },
  {
    parent: 'prototype',
    slug: 'app-prototypes',
    label: 'Apps',
    starterPrompt: 'Create an Open Design prototype plugin for multi-screen apps, onboarding, or task-productivity flows.',
    test: byAnySlug(
      'mobile',
      'app',
      'mobile-app',
      'ios-app',
      'android-app',
      'phone-screen',
      'app-ui',
      'app-mockup',
      'app-onboarding',
      'onboarding',
      'signup',
      'task',
      'habit-tracker',
      'dating-app',
    ),
  },
  {
    parent: 'prototype',
    slug: 'landing-marketing',
    label: 'Landing / marketing',
    starterPrompt: 'Create an Open Design prototype plugin for landing pages, marketing sites, pricing pages, or campaign pages.',
    test: byAnySlug(
      'landing',
      'landing-page',
      'saas-landing',
      'marketing-page',
      'product-landing',
      'pricing',
      'pricing-page',
      'waitlist-page',
      'coming-soon-page',
      'email-template',
      'newsletter',
      'lead-magnet',
      'e-guide',
      'poster',
      'social-carousel',
    ),
  },
  {
    parent: 'prototype',
    slug: 'developer-tools',
    label: 'Developer tools',
    starterPrompt: 'Create an Open Design prototype plugin for developer tools, engineering workflows, docs, or code collaboration.',
    test: byAnySlug(
      'engineering',
      'docs',
      'documentation',
      'api-reference',
      'runbook',
      'ops-doc',
      'sre-doc',
      'github',
      'linear',
      'issue',
    ),
  },
  {
    parent: 'prototype',
    slug: 'docs-reports',
    label: 'Docs / reports',
    starterPrompt: 'Create an Open Design prototype plugin for reports, documents, case studies, specs, invoices, or resumes.',
    test: byAnySlug(
      'report',
      'financial-report',
      'finance-report',
      'case-report',
      'clinical-case',
      'case-study',
      'guide',
      'tutorial',
      'pm-spec',
      'prd',
      'spec',
      'invoice',
      'resume',
      'cv',
    ),
  },
  {
    parent: 'prototype',
    slug: 'brand-design',
    label: 'Brand / design',
    starterPrompt: 'Create an Open Design prototype plugin for brand pages, visual exploration, design reviews, or mockups.',
    test: byAnySlug(
      'design',
      'design-review',
      'design-audit',
      'critique',
      'mockup',
      'wireframe',
      'visual',
      'brand',
    ),
  },
  {
    parent: 'deck',
    slug: 'pitch-business',
    label: 'Pitch / business',
    starterPrompt: 'Create an Open Design deck plugin for fundraising, business plans, investor decks, or strategic narratives.',
    test: byAnySlug(
      'pitch-deck',
      'pitch',
      'fundraising',
      'seed-round',
      'investor-deck',
      'vc-deck',
      'business-plan',
      'b2b-saas-pitch',
      'founder-vision-deck',
    ),
  },
  {
    parent: 'deck',
    slug: 'course-training',
    label: 'Course / training',
    starterPrompt: 'Create an Open Design deck plugin for courses, training materials, workshops, or classroom slides.',
    test: byAnySlug(
      'course-module',
      'course-slides',
      'training-deck',
      'workshop',
      'lesson',
      'education',
      'classroom',
    ),
  },
  {
    parent: 'deck',
    slug: 'reports-briefings',
    label: 'Reports / briefings',
    starterPrompt: 'Create an Open Design deck plugin for weekly reports, management briefings, white papers, or business reviews.',
    test: byAnySlug(
      'weekly-report',
      'status-update',
      'team-report',
      'business-review',
      'white-paper',
      'investment-thesis',
      'consulting-deliverable',
      'financial',
      'data-viz-launch',
    ),
  },
  {
    parent: 'deck',
    slug: 'product-sales',
    label: 'Product / sales',
    starterPrompt: 'Create an Open Design deck plugin for product launches, sales enablement, feature reveals, or customer pitches.',
    test: byAnySlug(
      'product-launch',
      'launch-deck',
      'feature-reveal',
      'launch-slides',
      'sales',
      'customer',
      'product',
    ),
  },
  {
    parent: 'deck',
    slug: 'engineering-talks',
    label: 'Engineering talks',
    starterPrompt: 'Create an Open Design deck plugin for technical presentations, architecture walkthroughs, or dev workflow talks.',
    test: byAnySlug(
      'engineering',
      'tech-sharing',
      'tech-talk',
      'technical-presentation',
      'system-design',
      'architecture',
      'developer-tutorial',
      'dev-workflow',
      'incident',
      'red-team',
      'risk-review',
    ),
  },
  {
    parent: 'deck',
    slug: 'creative-decks',
    label: 'Creative decks',
    starterPrompt: 'Create an Open Design deck plugin for creative, editorial, brand, social, or visual storytelling decks.',
    test: byAnySlug(
      'marketing',
      'editorial',
      'zhangzara',
      'creative-agency-pitch',
      'brand-manifesto',
      'fashion-brand-deck',
      'creator-portfolio',
      'xhs',
      'design-studio-deck',
    ),
  },
  {
    parent: 'image',
    slug: 'ui-product-mockups',
    label: 'UI / product mockups',
    starterPrompt: 'Create an Open Design image plugin for product UI mockups, game UI, product cards, or interface showcases.',
    test: byAnySlug(
      'app-web-design',
      'game-ui',
      'ui',
      'hud',
      'live-artifact',
      'app-showcase',
      'product',
      'mockup',
    ),
  },
  {
    parent: 'image',
    slug: 'brand-visuals',
    label: 'Brand / logo',
    starterPrompt: 'Create an Open Design image plugin for logos, brand visuals, typography-led posters, or visual systems.',
    test: byAnySlug('logo', 'brand', 'typography', 'poster', 'key-art', 'cover-art'),
  },
  {
    parent: 'image',
    slug: 'storyboards-motion-refs',
    label: 'Storyboards',
    starterPrompt: 'Create an Open Design image plugin for storyboards, choreography breakdowns, pose references, or motion planning sheets.',
    test: byAnySlug('storyboard', 'dance', 'choreography', 'pose-reference', 'video-reference', 'sequence'),
  },
  {
    parent: 'image',
    slug: 'social-content',
    label: 'Social / content',
    starterPrompt: 'Create an Open Design image plugin for social posts, infographics, explainers, or content graphics.',
    test: byAnySlug('social-media-post', 'infographic', 'explainer', 'social', 'collage'),
  },
  {
    parent: 'image',
    slug: 'avatar-portrait',
    label: 'Avatar / portrait',
    starterPrompt: 'Create an Open Design image plugin for avatars, portraits, identity photos, or character headshots.',
    test: byAnySlug('profile-avatar', 'portrait', 'selfie', 'identity'),
  },
  {
    parent: 'image',
    slug: 'illustration-style',
    label: 'Illustration / style',
    starterPrompt: 'Create an Open Design image plugin for illustrations, anime, fantasy scenes, 3D renders, or style-transfer prompts.',
    test: byAnySlug(
      'illustration',
      'anime',
      'fantasy',
      '3d-render',
      'cinematic',
      'crayon',
      'style-transfer',
      'nature',
    ),
  },
  {
    parent: 'video',
    slug: 'motion-effects',
    label: 'Motion / effects',
    starterPrompt: 'Create an Open Design video plugin for motion graphics, VFX, title frames, animation, or logo/outro sequences.',
    test: byAnySlug(
      'motion-graphics',
      'vfx',
      'frame',
      'kinetic-typography',
      'logo',
      'outro',
      'title',
      'transition',
      'animation',
    ),
  },
  {
    parent: 'video',
    slug: 'social-short-form',
    label: 'Social / short form',
    starterPrompt: 'Create an Open Design video plugin for short-form social clips, vertical video, TikTok-style captions, or dance trends.',
    test: byAnySlug('short-form', 'vertical', 'tiktok', 'social-meme', 'dance', 'k-pop', 'karaoke', 'captions'),
  },
  {
    parent: 'video',
    slug: 'marketing-product',
    label: 'Marketing / product',
    starterPrompt: 'Create an Open Design video plugin for product promos, advertising, brand sizzle reels, or marketing cuts.',
    test: byAnySlug('marketing', 'product', 'advertising', 'product-promo', 'saas', 'website-to-video', 'brand'),
  },
  {
    parent: 'video',
    slug: 'data-explainers',
    label: 'Data / explainers',
    starterPrompt: 'Create an Open Design video plugin for data explainers, animated charts, maps, diagrams, or flow walkthroughs.',
    test: byAnySlug('data', 'chart', 'flowchart', 'diagram', 'map', 'route', 'infographic'),
  },
  {
    parent: 'video',
    slug: 'cinematic-story',
    label: 'Cinematic / story',
    starterPrompt: 'Create an Open Design video plugin for cinematic scenes, story sequences, anime/action shots, or fantasy clips.',
    test: byAnySlug(
      'cinematic',
      'fantasy',
      'action',
      'anime',
      'game-cinematic',
      'cyberpunk',
      'nature',
      'cinematic-romance',
      'combat',
    ),
  },
];

function extractPrimaryCategory(record: InstalledPluginRecord): string | null {
  return PRIMARY_CATEGORIES.find((c) => c.test(record))?.slug ?? null;
}

// Per-plugin category derivation. Returns at most one curated primary
// category, preserving display order.
export function extractCategories(record: InstalledPluginRecord): string[] {
  const primary = extractPrimaryCategory(record);
  return primary ? [primary] : [];
}

export function extractSubcategories(record: InstalledPluginRecord, parent?: string | null): string[] {
  const primary = parent ?? extractPrimaryCategory(record);
  if (!primary) return [];
  const match = SUBCATEGORIES.find((c) => c.parent === primary && c.test(record));
  return match ? [match.slug] : [];
}

export function buildCategoryCatalog(plugins: InstalledPluginRecord[]): FacetOption[] {
  const counts = new Map<string, number>();
  for (const p of plugins) {
    for (const slug of extractCategories(p)) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }
  return PRIMARY_CATEGORIES.map((c) => ({
    slug: c.slug,
    label: c.label,
    starterPrompt: c.starterPrompt,
    count: counts.get(c.slug) ?? 0,
  }));
}

export function buildSubcategoryCatalog(plugins: InstalledPluginRecord[]): Record<string, FacetOption[]> {
  const counts = new Map<string, number>();
  for (const p of plugins) {
    const parent = extractPrimaryCategory(p);
    if (!parent) continue;
    for (const slug of extractSubcategories(p, parent)) {
      counts.set(`${parent}:${slug}`, (counts.get(`${parent}:${slug}`) ?? 0) + 1);
    }
  }
  return PRIMARY_CATEGORIES.reduce<Record<string, FacetOption[]>>((acc, category) => {
    const options = SUBCATEGORIES.filter((c) => c.parent === category.slug)
      .map((c) => ({
        slug: c.slug,
        label: c.label,
        starterPrompt: c.starterPrompt,
        count: counts.get(`${category.slug}:${c.slug}`) ?? 0,
      }));
    if (options.length > 0) acc[category.slug] = options;
    return acc;
  }, {});
}

export function buildFacetCatalog(plugins: InstalledPluginRecord[]): FacetCatalog {
  return {
    category: buildCategoryCatalog(plugins),
    subcategory: buildSubcategoryCatalog(plugins),
  };
}

export function applyFacetSelection(
  plugins: InstalledPluginRecord[],
  selection: FacetSelection,
): InstalledPluginRecord[] {
  if (!selection.category) return plugins;
  const want = selection.category;
  const inCategory = plugins.filter((p) => extractCategories(p).includes(want));
  if (!selection.subcategory) return inCategory;
  return inCategory.filter((p) => extractSubcategories(p, want).includes(selection.subcategory!));
}

export function isFeaturedPlugin(record: InstalledPluginRecord): boolean {
  const od = (record.manifest?.od ?? {}) as Record<string, unknown>;
  return (
    od.featured === true ||
    (typeof od.featured === 'number' && Number.isFinite(od.featured))
  );
}

// Free-text search across the obvious user-facing surface area: title,
// description, id, and tags. Composed with the category selection via
// AND inside the hook so the search narrows whatever the user has
// already filtered to. Multi-word queries are required to all match
// somewhere in the haystack so phrase fragments like "design slides"
// don't surface unrelated plugins.
export function filterByQuery(
  plugins: InstalledPluginRecord[],
  query: string,
): InstalledPluginRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return plugins;
  const terms = q.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return plugins;
  return plugins.filter((p) => {
    const haystack = [
      p.title ?? '',
      p.id,
      p.manifest?.description ?? '',
      (p.manifest?.tags ?? []).join(' '),
    ]
      .join(' ')
      .toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
}

// Smart default selection. Lead with the first artifact kind in the
// Home creation flow while keeping all prototype scenes visible.
export const PREFERRED_DEFAULT_SELECTION: FacetSelection = {
  category: 'prototype',
  subcategory: null,
};

export function resolveDefaultSelection(catalog: FacetCatalog): FacetSelection {
  const wantCategory = PREFERRED_DEFAULT_SELECTION.category;
  const preferredCategory = wantCategory
    ? catalog.category.find((o) => o.slug === wantCategory && o.count > 0)
    : undefined;
  const selectedCategory = preferredCategory ?? catalog.category.find((o) => o.count > 0);
  if (!selectedCategory) return { category: null, subcategory: null };
  if (selectedCategory.slug !== wantCategory) {
    return { category: selectedCategory.slug, subcategory: null };
  }

  const wantSubcategory = PREFERRED_DEFAULT_SELECTION.subcategory;
  if (!wantSubcategory) return PREFERRED_DEFAULT_SELECTION;

  const hasSubcategoryWithPlugins = catalog.subcategory[wantCategory]?.some(
    (o) => o.slug === wantSubcategory && o.count > 0,
  );
  if (hasSubcategoryWithPlugins) return PREFERRED_DEFAULT_SELECTION;
  return { category: wantCategory, subcategory: null };
}
