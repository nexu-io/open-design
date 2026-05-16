// Facet derivation for the Plugins home section.
//
// The filter is a single-axis workflow picker. It intentionally
// summarizes the Home hero rail's mental model instead of exposing raw
// manifest modes or every concrete artifact kind:
//
//   Import · Create · Export · Refine · Extend
//
// Those five lanes describe the platform loop: bring upstream sources
// into Open Design, create new artifacts, ship downstream framework
// handoffs, improve existing work, and extend the system with new
// plugins. Concrete things like Slides, Prototype, React, or Figma
// remain searchable card metadata instead of becoming duplicate tabs
// beside their parent lane.
//
// Each plugin belongs to at most one lane. A second, scoped subcategory
// row appears inside the active lane so Create can still expose the
// accumulated Prototype / Slides / Design system / Media buckets without
// making them peers of Create.
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

function hasAnySlugPart(record: InstalledPluginRecord, slugs: readonly string[]): boolean {
  const haystack = [...recordSlugs(record)];
  return slugs.some((slug) =>
    haystack.some((value) => value === slug || value.split('-').includes(slug)),
  );
}

function byAnySlugPart(...slugs: string[]): (record: InstalledPluginRecord) => boolean {
  return (record) => hasAnySlugPart(record, slugs);
}

function byTaskKind(taskKind: string): (record: InstalledPluginRecord) => boolean {
  return (record) => slugify(manifestTaskKind(record) ?? '') === taskKind;
}

function matchesAny(record: InstalledPluginRecord, tests: Array<(record: InstalledPluginRecord) => boolean>): boolean {
  return tests.some((test) => test(record));
}

const SOURCE_TESTS = [
  byTaskKind('figma-migration'),
  byTaskKind('code-migration'),
  byAnySlug(
    'import',
    'source-import',
    'from-source',
    'migration',
    'figma-migration',
    'code-migration',
    'github-import',
    'repo-import',
  ),
];

const EXTEND_TESTS = [
  byAnySlug('plugin-authoring', 'create-plugin', 'extension', 'marketplace', 'community-plugin'),
];

const GENERATE_TESTS = [
  byTaskKind('new-generation'),
  byAnySlug('generate', 'generation', 'new-generation', 'media-generation'),
  byMode('deck'),
  byMode('prototype'),
  byMode('design-system'),
  byMode('image'),
  byMode('video'),
  byMode('audio'),
];

const EXPORT_TESTS = [
  byMode('export'),
  byAnySlug(
    'export',
    'downstream',
    'handoff',
    'downstream-export',
  ),
];

const EXPORT_FORMAT_TESTS = [
  byAnySlugPart('pptx', 'ppt', 'pdf'),
];

const SHARE_TESTS = [
  byAnySlug(
    'share',
    'publish',
    'github-pr',
    'pull-request',
    'gist',
    'slack',
    'discord',
    'notion',
    'linear',
    'jira',
  ),
];

const DEPLOY_TESTS = [
  byAnySlug(
    'deploy',
    'deployment',
    'vercel',
    'cloudflare',
    'cloudflare-pages',
    'netlify',
    'github-pages',
    'fly',
    'fly-io',
    'render',
  ),
];

const REFINE_TESTS = [
  byTaskKind('tune-collab'),
  byAnySlug('tune-collab', 'refine', 'improve', 'critique', 'review', 'patch-edit'),
];

function isSourcePlugin(record: InstalledPluginRecord): boolean {
  return matchesAny(record, SOURCE_TESTS);
}

function isExportPlugin(record: InstalledPluginRecord): boolean {
  const mode = slugify(manifestField(record, 'mode') ?? '');
  return matchesAny(record, EXPORT_TESTS) || (mode === 'utility' && matchesAny(record, EXPORT_FORMAT_TESTS));
}

function isSharePlugin(record: InstalledPluginRecord): boolean {
  return matchesAny(record, SHARE_TESTS);
}

function isDeployPlugin(record: InstalledPluginRecord): boolean {
  return matchesAny(record, DEPLOY_TESTS);
}

function isExtendPlugin(record: InstalledPluginRecord): boolean {
  return matchesAny(record, EXTEND_TESTS);
}

function isRefinePlugin(record: InstalledPluginRecord): boolean {
  return matchesAny(record, REFINE_TESTS) && !isExportPlugin(record);
}

function isCreatePlugin(record: InstalledPluginRecord): boolean {
  return matchesAny(record, GENERATE_TESTS) && !isExtendPlugin(record) && !isExportPlugin(record);
}

// Curated workflow list. Keep this intentionally small: these are
// semantic lanes, not artifact kinds or framework names.
const PRIMARY_CATEGORIES: readonly CategoryDef[] = [
  {
    slug: 'import',
    label: 'Import',
    starterPrompt: 'Create an Open Design plugin that imports a source into a project and normalizes it into editable artifacts.',
    test: isSourcePlugin,
  },
  {
    slug: 'create',
    label: 'Create',
    starterPrompt: 'Create an Open Design plugin that generates a reusable artifact from a short user brief.',
    test: isCreatePlugin,
  },
  {
    slug: 'export',
    label: 'Export',
    starterPrompt: 'Create an Open Design plugin that exports an accepted artifact into a downstream file or framework handoff.',
    test: isExportPlugin,
  },
  {
    slug: 'share',
    label: 'Share',
    starterPrompt: 'Create an Open Design plugin that packages an accepted artifact for sharing with collaborators.',
    test: isSharePlugin,
  },
  {
    slug: 'deploy',
    label: 'Deploy',
    starterPrompt: 'Create an Open Design plugin that deploys an accepted artifact to a hosted downstream surface.',
    test: isDeployPlugin,
  },
  {
    slug: 'refine',
    label: 'Refine',
    starterPrompt: 'Create an Open Design plugin that reviews, patches, and improves an existing artifact.',
    test: isRefinePlugin,
  },
  {
    slug: 'extend',
    label: 'Extend',
    starterPrompt: 'Create an Open Design plugin that extends the Open Design plugin catalog or authoring workflow.',
    test: isExtendPlugin,
  },
];

// Scoped child buckets. These are deliberately parented so the row can
// say "Create" first, then reveal the user's accumulated concrete modes
// only after that lane is active.
const SUBCATEGORIES: readonly SubcategoryDef[] = [
  {
    parent: 'import',
    slug: 'from-figma',
    label: 'Figma',
    starterPrompt: 'Create an Open Design plugin that imports a Figma file or frame URL and rebuilds it as editable Open Design artifacts.',
    test: byTaskKind('figma-migration'),
  },
  {
    parent: 'import',
    slug: 'from-github',
    label: 'GitHub',
    starterPrompt: 'Create an Open Design plugin that imports a GitHub repository or path, discovers the design entrypoints, and prepares an editable workspace.',
    test: byAnySlug('github', 'github-import', 'repo-import'),
  },
  {
    parent: 'import',
    slug: 'from-code',
    label: 'Code / folder',
    starterPrompt: 'Create an Open Design plugin that imports a local code folder and turns the relevant UI into an editable design artifact.',
    test: byTaskKind('code-migration'),
  },
  {
    parent: 'import',
    slug: 'from-url',
    label: 'URL',
    starterPrompt: 'Create an Open Design plugin that imports a public URL, captures the page structure, and recreates it as an editable artifact.',
    test: byAnySlug('url-import', 'website-import', 'web-import'),
  },
  {
    parent: 'import',
    slug: 'from-screenshot',
    label: 'Screenshot',
    starterPrompt: 'Create an Open Design plugin that imports a screenshot or image reference and reconstructs a matching editable UI.',
    test: byAnySlug('screenshot-import', 'image-import'),
  },
  {
    parent: 'import',
    slug: 'from-pdf',
    label: 'PDF',
    starterPrompt: 'Create an Open Design plugin that imports a PDF and converts key pages into editable Open Design artifacts.',
    test: byAnySlugPart('pdf'),
  },
  {
    parent: 'import',
    slug: 'from-pptx',
    label: 'PPTX',
    starterPrompt: 'Create an Open Design plugin that imports a PPTX deck and converts slides into editable deck artifacts.',
    test: byAnySlugPart('pptx', 'ppt'),
  },
  {
    parent: 'import',
    slug: 'from-framer',
    label: 'Framer',
    starterPrompt: 'Create an Open Design plugin that imports a Framer site or project export and rebuilds it as editable components.',
    test: byAnySlug('framer-import', 'framer'),
  },
  {
    parent: 'import',
    slug: 'from-webflow',
    label: 'Webflow',
    starterPrompt: 'Create an Open Design plugin that imports a Webflow site export and maps it into editable Open Design artifacts.',
    test: byAnySlug('webflow-import', 'webflow'),
  },
  {
    parent: 'create',
    slug: 'prototype',
    label: 'Prototype',
    starterPrompt: 'Create an Open Design plugin that generates an interactive prototype from a product brief.',
    test: byMode('prototype'),
  },
  {
    parent: 'create',
    slug: 'deck',
    label: 'Slides',
    starterPrompt: 'Create an Open Design plugin that generates a polished slide deck from a narrative brief.',
    test: byMode('deck'),
  },
  {
    parent: 'create',
    slug: 'design-system',
    label: 'Design system',
    starterPrompt: 'Create an Open Design plugin that generates a reusable design system from brand and product constraints.',
    test: byMode('design-system'),
  },
  {
    parent: 'create',
    slug: 'hyperframes',
    label: 'HyperFrames',
    starterPrompt: 'Create an Open Design plugin that generates a HyperFrames-ready motion composition.',
    test: byAnySlug('hyperframes'),
  },
  {
    parent: 'create',
    slug: 'image',
    label: 'Image',
    starterPrompt: 'Create an Open Design plugin that generates image assets from structured creative direction.',
    test: byMode('image'),
  },
  {
    parent: 'create',
    slug: 'video',
    label: 'Video',
    starterPrompt: 'Create an Open Design plugin that generates video prompts, storyboards, or render-ready motion artifacts.',
    test: byMode('video'),
  },
  {
    parent: 'create',
    slug: 'audio',
    label: 'Audio',
    starterPrompt: 'Create an Open Design plugin that generates audio, voice, or sound-design assets from a brief.',
    test: byMode('audio'),
  },
  {
    parent: 'export',
    slug: 'pptx',
    label: 'PPTX',
    starterPrompt: 'Create an Open Design plugin that exports an accepted deck artifact to PPTX with high visual fidelity.',
    test: byAnySlugPart('pptx', 'ppt'),
  },
  {
    parent: 'export',
    slug: 'pdf',
    label: 'PDF',
    starterPrompt: 'Create an Open Design plugin that exports an accepted artifact to a polished PDF package.',
    test: byAnySlugPart('pdf'),
  },
  {
    parent: 'export',
    slug: 'html',
    label: 'HTML',
    starterPrompt: 'Create an Open Design plugin that exports an accepted artifact to standalone HTML.',
    test: byAnySlug('html'),
  },
  {
    parent: 'export',
    slug: 'zip',
    label: 'ZIP',
    starterPrompt: 'Create an Open Design plugin that exports an accepted artifact as a portable ZIP bundle.',
    test: byAnySlug('zip'),
  },
  {
    parent: 'export',
    slug: 'markdown',
    label: 'Markdown',
    starterPrompt: 'Create an Open Design plugin that exports an accepted artifact to Markdown with asset references.',
    test: byAnySlug('markdown', 'md'),
  },
  {
    parent: 'export',
    slug: 'figma',
    label: 'Figma',
    starterPrompt: 'Create an Open Design plugin that exports an accepted artifact into a Figma-ready handoff package.',
    test: byAnySlug('figma-export'),
  },
  {
    parent: 'export',
    slug: 'nextjs',
    label: 'Next.js',
    starterPrompt: 'Create an Open Design plugin that exports an accepted artifact to a Next.js App Router implementation.',
    test: byAnySlug('next', 'nextjs'),
  },
  {
    parent: 'export',
    slug: 'reactjs',
    label: 'React.js',
    starterPrompt: 'Create an Open Design plugin that exports an accepted artifact to a React component handoff.',
    test: byAnySlug('react', 'reactjs'),
  },
  {
    parent: 'export',
    slug: 'vuejs',
    label: 'Vue.js',
    starterPrompt: 'Create an Open Design plugin that exports an accepted artifact to a Vue single-file component.',
    test: byAnySlug('vue', 'vuejs'),
  },
  {
    parent: 'export',
    slug: 'sveltejs',
    label: 'Svelte.js',
    starterPrompt: 'Create an Open Design plugin that exports an accepted artifact to a Svelte component.',
    test: byAnySlug('svelte', 'sveltejs'),
  },
  {
    parent: 'export',
    slug: 'astro',
    label: 'Astro',
    starterPrompt: 'Create an Open Design plugin that exports an accepted artifact to an Astro component or page.',
    test: byAnySlug('astro'),
  },
  {
    parent: 'export',
    slug: 'angular',
    label: 'Angular',
    starterPrompt: 'Create an Open Design plugin that exports an accepted artifact to an Angular component.',
    test: byAnySlug('angular'),
  },
  {
    parent: 'export',
    slug: 'tailwind',
    label: 'Tailwind',
    starterPrompt: 'Create an Open Design plugin that exports an accepted artifact using Tailwind CSS classes.',
    test: byAnySlug('tailwind', 'tailwindcss'),
  },
  {
    parent: 'share',
    slug: 'public-link',
    label: 'Public link',
    starterPrompt: 'Create an Open Design plugin that publishes an accepted artifact to a shareable public link.',
    test: byAnySlug('public-link', 'share-link'),
  },
  {
    parent: 'share',
    slug: 'github-pr',
    label: 'GitHub PR',
    starterPrompt: 'Create an Open Design plugin that opens a GitHub pull request with the accepted artifact changes.',
    test: byAnySlug('github-pr', 'pull-request'),
  },
  {
    parent: 'share',
    slug: 'github-gist',
    label: 'GitHub Gist',
    starterPrompt: 'Create an Open Design plugin that publishes an accepted artifact as a GitHub Gist.',
    test: byAnySlug('gist', 'github-gist'),
  },
  {
    parent: 'share',
    slug: 'slack',
    label: 'Slack',
    starterPrompt: 'Create an Open Design plugin that shares an accepted artifact summary and link to Slack.',
    test: byAnySlug('slack'),
  },
  {
    parent: 'share',
    slug: 'discord',
    label: 'Discord',
    starterPrompt: 'Create an Open Design plugin that shares an accepted artifact summary and link to Discord.',
    test: byAnySlug('discord'),
  },
  {
    parent: 'share',
    slug: 'notion',
    label: 'Notion',
    starterPrompt: 'Create an Open Design plugin that publishes an accepted artifact and notes into Notion.',
    test: byAnySlug('notion'),
  },
  {
    parent: 'share',
    slug: 'linear',
    label: 'Linear',
    starterPrompt: 'Create an Open Design plugin that posts an accepted artifact update to a Linear issue.',
    test: byAnySlug('linear'),
  },
  {
    parent: 'share',
    slug: 'jira',
    label: 'Jira',
    starterPrompt: 'Create an Open Design plugin that posts an accepted artifact update to a Jira ticket.',
    test: byAnySlug('jira'),
  },
  {
    parent: 'deploy',
    slug: 'vercel',
    label: 'Vercel',
    starterPrompt: 'Create an Open Design plugin that deploys an accepted web artifact to Vercel and returns preview and production links.',
    test: byAnySlug('vercel'),
  },
  {
    parent: 'deploy',
    slug: 'cloudflare',
    label: 'Cloudflare',
    starterPrompt: 'Create an Open Design plugin that deploys an accepted web artifact to Cloudflare Pages.',
    test: byAnySlug('cloudflare', 'cloudflare-pages'),
  },
  {
    parent: 'deploy',
    slug: 'netlify',
    label: 'Netlify',
    starterPrompt: 'Create an Open Design plugin that deploys an accepted web artifact to Netlify.',
    test: byAnySlug('netlify'),
  },
  {
    parent: 'deploy',
    slug: 'github-pages',
    label: 'GitHub Pages',
    starterPrompt: 'Create an Open Design plugin that deploys an accepted static artifact to GitHub Pages.',
    test: byAnySlug('github-pages'),
  },
  {
    parent: 'deploy',
    slug: 'fly-io',
    label: 'Fly.io',
    starterPrompt: 'Create an Open Design plugin that deploys an accepted app artifact to Fly.io.',
    test: byAnySlug('fly', 'fly-io'),
  },
  {
    parent: 'deploy',
    slug: 'render',
    label: 'Render',
    starterPrompt: 'Create an Open Design plugin that deploys an accepted app artifact to Render.',
    test: byAnySlug('render'),
  },
  {
    parent: 'deploy',
    slug: 'docker',
    label: 'Docker',
    starterPrompt: 'Create an Open Design plugin that packages an accepted app artifact into a Docker-ready handoff.',
    test: byAnySlug('docker'),
  },
  {
    parent: 'refine',
    slug: 'tune',
    label: 'Tune',
    starterPrompt: 'Create an Open Design plugin that tunes an existing artifact based on user feedback.',
    test: byAnySlug('tune-collab'),
  },
  {
    parent: 'refine',
    slug: 'review',
    label: 'Review',
    starterPrompt: 'Create an Open Design plugin that reviews an existing artifact and proposes concrete fixes.',
    test: byAnySlug('critique', 'review', 'diff-review'),
  },
  {
    parent: 'extend',
    slug: 'plugin-authoring',
    label: 'Plugin authoring',
    starterPrompt: 'Create an Open Design plugin that helps users author, validate, and install new Open Design plugins.',
    test: byAnySlug('plugin-authoring'),
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

// Smart default selection. Lead users into the visually strongest
// creation bucket first; Slides tends to contain polished, image-heavy
// cards, while the broader Create lane remains one tap away.
export const PREFERRED_DEFAULT_SELECTION: FacetSelection = {
  category: 'create',
  subcategory: 'deck',
};

export function resolveDefaultSelection(catalog: FacetCatalog): FacetSelection {
  const wantCategory = PREFERRED_DEFAULT_SELECTION.category;
  const hasCategory = wantCategory
    ? catalog.category.some((o) => o.slug === wantCategory)
    : true;
  if (!hasCategory || !wantCategory) return { category: null, subcategory: null };

  const wantSubcategory = PREFERRED_DEFAULT_SELECTION.subcategory;
  if (!wantSubcategory) return PREFERRED_DEFAULT_SELECTION;

  const hasSubcategoryWithPlugins = catalog.subcategory[wantCategory]?.some(
    (o) => o.slug === wantSubcategory && o.count > 0,
  );
  if (hasSubcategoryWithPlugins) return PREFERRED_DEFAULT_SELECTION;
  return { category: wantCategory, subcategory: null };
}
