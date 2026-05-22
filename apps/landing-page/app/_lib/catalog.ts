// Catalog data layer — turns raw Markdown bundles loaded by Astro
// Content Collections (the `SKILL.md`, `DESIGN.md`, `*.md` craft files,
// and Live Artifact `README.md` bundles in the repo root) into the
// shaped records the index and detail pages render.
//
// Why this lives in `_lib/` and not in the page files: every page
// imports from one place, so the parsing rules (folder-name slug,
// description fallback, palette extraction, etc.) stay consistent.

import { getCollection, type CollectionEntry } from 'astro:content';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  DEFAULT_LOCALE,
  type LandingLocaleCode,
  type LocalizedStringValue,
} from '../i18n';
import {
  explicitLocalizedString,
  localizeCraftText,
  localizeSkillDescription,
  localizeSystemText,
  localizeTaxonomyValue,
  localizeTemplateText,
} from '../content-i18n';

// ---------------------------------------------------------------------------
// Preview imagery lookup
//
// Previews are produced offline by `pnpm --filter @open-design/landing-page
// previews` and saved under `public/previews/<bucket>/<slug>.png`. We read
// the directory listing once at build time so each catalog record can carry
// a `previewUrl` (or `null` when the underlying skill has no `example.html`).
// ---------------------------------------------------------------------------

const PREVIEWS_ROOT_CANDIDATES = [
  // `pnpm --filter @open-design/landing-page build` may keep cwd at the
  // workspace root, while direct package scripts run from the app root.
  path.resolve(process.cwd(), 'apps/landing-page/public/previews'),
  path.resolve(process.cwd(), 'public/previews'),
  // Keep the source-relative path as a final fallback for local dev.
  path.resolve(fileURLToPath(new URL('../../public/previews', import.meta.url))),
] as const;

function previewRoot(): string | null {
  return PREVIEWS_ROOT_CANDIDATES.find((dir) => existsSync(dir)) ?? null;
}

/**
 * Map of `slug → filename`, e.g. `'kami-deck' → 'kami-deck.webp'`.
 *
 * We track the actual on-disk filename (with its real extension) so the
 * generated `<img src>` URL never lies about the format. Earlier this
 * was a `Set<string>` and `previewUrlFor()` always emitted `.png`,
 * which 404'd whenever the previews step produced `.webp`/`.jpg`/`.jpeg`
 * (e.g., after a future sharp post-processor or a manually committed
 * template asset).
 */
function listPreviews(bucket: 'skills' | 'systems' | 'templates'): Map<string, string> {
  const root = previewRoot();
  if (!root) return new Map();
  const dir = path.join(root, bucket);
  if (!existsSync(dir)) return new Map();
  const map = new Map<string, string>();
  for (const file of readdirSync(dir)) {
    const m = /^(.+)\.(png|webp|jpg|jpeg)$/i.exec(file);
    if (m && m[1]) {
      // First match wins. If two files exist with the same slug but
      // different extensions, prefer the one that sorts earlier (PNG
      // before WebP in alphabetical order) for deterministic output.
      if (!map.has(m[1])) map.set(m[1], file);
    }
  }
  return map;
}

function previewUrlFor(
  bucket: 'skills' | 'systems' | 'templates',
  slug: string,
  available: Map<string, string>,
): string | null {
  const filename = available.get(slug);
  return filename ? `/previews/${bucket}/${filename}` : null;
}

const REPO_TREE = 'https://github.com/nexu-io/open-design/tree/main';
const REPO_BLOB = 'https://github.com/nexu-io/open-design/blob/main';

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export type SkillEntry = CollectionEntry<'skills'>;

export interface SkillRecord {
  slug: string;
  name: string;
  description: string;
  triggers: ReadonlyArray<string>;
  mode?: string;
  modeLabel?: string;
  platform?: string;
  platformLabel?: string;
  scenario?: string;
  scenarioLabel?: string;
  category?: string;
  categoryLabel?: string;
  featured?: number;
  upstream?: string;
  examplePrompt?: string;
  source: string;
  body: string;
  /** `/previews/skills/<slug>.png` if a generated preview exists, else null. */
  previewUrl: string | null;
}

function deriveSkillSlug(id: string): string {
  // `id` is `[folder]/SKILL` (no extension). We want the folder name.
  const folder = id.split('/')[0] ?? id;
  return folder;
}

function firstParagraph(text: string | undefined, fallback = ''): string {
  if (!text) return fallback;
  return text.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? fallback;
}

export function shapeSkill(
  entry: SkillEntry,
  previews: Map<string, string>,
  locale: LandingLocaleCode = DEFAULT_LOCALE,
): SkillRecord {
  const slug = deriveSkillSlug(entry.id);
  const data = entry.data as {
    name?: LocalizedStringValue;
    description?: LocalizedStringValue;
    triggers?: string[];
    i18n?: Record<string, {
      name?: string;
      description?: string;
      triggers?: string[];
      examplePrompt?: string;
      example_prompt?: string;
    }>;
    od?: {
      mode?: string;
      platform?: string;
      scenario?: string;
      category?: string;
      featured?: number;
      upstream?: string;
      example_prompt?: LocalizedStringValue;
    };
  };
  const localized = data.i18n?.[locale];
  const name = explicitLocalizedString(localized?.name ?? data.name, locale) ?? slug;
  const rawDescription = explicitLocalizedString(data.description, DEFAULT_LOCALE) ?? '';
  const description =
    explicitLocalizedString(localized?.description ?? data.description, locale) ??
    localizeSkillDescription({
      name,
      mode: data.od?.mode,
      scenario: data.od?.scenario,
      category: data.od?.category,
      locale,
      fallback: rawDescription,
    });
  const examplePrompt = explicitLocalizedString(
    localized?.examplePrompt ?? localized?.example_prompt ?? data.od?.example_prompt,
    locale,
  ) ?? '';
  return {
    slug,
    name,
    description,
    triggers: localized?.triggers ?? (locale === DEFAULT_LOCALE ? data.triggers ?? [] : []),
    mode: data.od?.mode,
    modeLabel: localizeTaxonomyValue(data.od?.mode, locale),
    platform: data.od?.platform,
    platformLabel: localizeTaxonomyValue(data.od?.platform, locale),
    scenario: data.od?.scenario,
    scenarioLabel: localizeTaxonomyValue(data.od?.scenario, locale),
    category: data.od?.category,
    categoryLabel: localizeTaxonomyValue(data.od?.category, locale),
    featured: data.od?.featured,
    upstream: data.od?.upstream,
    examplePrompt,
    source: `${REPO_TREE}/skills/${slug}`,
    body: entry.body ?? '',
    previewUrl: previewUrlFor('skills', slug, previews),
  };
}

export async function getSkillRecords(
  locale: LandingLocaleCode = DEFAULT_LOCALE,
): Promise<ReadonlyArray<SkillRecord>> {
  const previews = listPreviews('skills');
  const entries = await getCollection('skills');
  const shaped = entries.map((entry) => shapeSkill(entry, previews, locale));
  return shaped.sort((a, b) => {
    // Featured (lower number = higher priority) first, then alphabetical.
    const af = a.featured ?? Number.POSITIVE_INFINITY;
    const bf = b.featured ?? Number.POSITIVE_INFINITY;
    if (af !== bf) return af - bf;
    return a.name.localeCompare(b.name);
  });
}

// ---------------------------------------------------------------------------
// Design Systems
// ---------------------------------------------------------------------------

export type SystemEntry = CollectionEntry<'systems'>;

export interface SystemRecord {
  slug: string;
  name: string;
  category: string;
  categoryLabel: string;
  tagline: string;
  atmosphere: string;
  palette: ReadonlyArray<string>;
  source: string;
  body: string;
}

function extractH1(body: string): string | undefined {
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) return trimmed.slice(2).trim();
  }
  return undefined;
}

function extractCategoryBlock(body: string): { category: string; tagline: string } {
  // Convention: a `> Category:` blockquote, optionally followed by extra
  // tagline lines also prefixed with `>`.
  const lines = body.split('\n');
  let category = '';
  const taglineLines: string[] = [];
  let inBlock = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!inBlock) {
      const m = /^>\s*Category:\s*(.+)$/i.exec(line);
      if (m && m[1]) {
        category = m[1].trim();
        inBlock = true;
        continue;
      }
    } else {
      if (line.startsWith('>')) {
        const text = line.replace(/^>\s?/, '').trim();
        if (text.length > 0) taglineLines.push(text);
      } else if (line.length === 0 && taglineLines.length === 0) {
        // tolerate a single blank line between Category and tagline
      } else {
        break;
      }
    }
  }
  return { category, tagline: taglineLines.join(' ').trim() };
}

function extractAtmosphere(body: string): string {
  // Take the first paragraph of the first H2 section that looks like
  // "Visual Theme & Atmosphere" (or any first paragraph after `## 1.`).
  const lines = body.split('\n');
  let inSection = false;
  const buf: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!inSection) {
      if (/^##\s+1\./.test(raw) || /^##\s+.*Atmosphere/i.test(raw)) {
        inSection = true;
      }
      continue;
    }
    if (line.startsWith('##')) break;
    if (line.length === 0 && buf.length > 0) break;
    if (line.length === 0) continue;
    buf.push(line);
  }
  return buf.join(' ').trim();
}

const HEX_RE = /#[0-9a-fA-F]{6}\b/g;

function extractPalette(body: string, limit = 5): ReadonlyArray<string> {
  const seen = new Set<string>();
  const matches = body.match(HEX_RE) ?? [];
  for (const hex of matches) {
    seen.add(hex.toLowerCase());
    if (seen.size >= limit) break;
  }
  return Array.from(seen);
}

export function shapeSystem(
  entry: SystemEntry,
  locale: LandingLocaleCode = DEFAULT_LOCALE,
): SystemRecord {
  const slug = entry.id.split('/')[0] ?? entry.id;
  const body = entry.body ?? '';
  const data = entry.data as {
    i18n?: Record<string, {
      name?: string;
      category?: string;
      tagline?: string;
      atmosphere?: string;
    }>;
  };
  const localized = data.i18n?.[locale];
  const h1 = extractH1(body) ?? slug;
  const { category, tagline } = extractCategoryBlock(body);
  const atmosphere = extractAtmosphere(body);
  const palette = extractPalette(body);
  const name =
    localized?.name ??
    (h1.replace(/^Design System Inspired by\s+/i, '').trim() || slug);
  const rawCategory = localized?.category ?? (category || 'Uncategorized');
  const localizedText = localizeSystemText({
    name,
    category: rawCategory,
    paletteCount: palette.length,
    locale,
    fallbackTagline: localized?.tagline ?? tagline,
    fallbackAtmosphere: localized?.atmosphere ?? atmosphere,
  });
  return {
    slug,
    name,
    category: rawCategory,
    categoryLabel: localizedText.category,
    tagline: localizedText.tagline,
    atmosphere: localizedText.atmosphere,
    palette,
    source: `${REPO_TREE}/design-systems/${slug}`,
    body,
  };
}

export async function getSystemRecords(
  locale: LandingLocaleCode = DEFAULT_LOCALE,
): Promise<ReadonlyArray<SystemRecord>> {
  const entries = await getCollection('systems');
  return entries
    .map((entry) => shapeSystem(entry, locale))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Craft
// ---------------------------------------------------------------------------

export type CraftEntry = CollectionEntry<'craft'>;

export interface CraftRecord {
  slug: string;
  name: string;
  summary: string;
  source: string;
  body: string;
}

const CRAFT_NAME_OVERRIDES: Record<string, string> = {
  'rtl-and-bidi': 'RTL & Bidi',
};

function titleizeSlug(slug: string): string {
  const override = CRAFT_NAME_OVERRIDES[slug];
  if (override) return override;
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Markdown → display-text helpers
//
// Live-artifact READMEs and craft `*.md` files mix prose with editorial
// metadata blocks (`> Category: …`, `> Family: …`) and decorative
// inline syntax (backticks around slugs in the H1, asterisks for
// emphasis). When we surface them as page titles, card descriptions,
// or `<meta name="description">`, we want clean text — never raw
// Markdown noise like `\`otd-operations-brief\` · live-artifact template`
// or a literal `>` as the entire summary.
// ---------------------------------------------------------------------------

/** Strip backticks, leading/trailing emphasis, link wrappers, soft breaks. */
function stripMarkdownInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '$1')           // `code` → code
    .replace(/\*\*([^*]+)\*\*/g, '$1')      // **bold** → bold
    .replace(/\*([^*]+)\*/g, '$1')          // *italic* → italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) → text
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * First plain-prose paragraph after the H1, with all leading
 * blockquote / list / fenced-code / horizontal-rule lines skipped.
 *
 * The "first paragraph" definition: a contiguous run of non-empty
 * lines that aren't headings, blockquotes, list markers, table rows,
 * code fences, or HR rules. Returns the empty string if no such
 * paragraph exists, leaving the caller to apply its own fallback.
 */
function extractFirstProseParagraph(body: string): string {
  const lines = body.split('\n');
  let pastH1 = false;
  let inFence = false;
  const buf: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();

    if (!pastH1) {
      if (line.startsWith('# ')) pastH1 = true;
      continue;
    }
    if (line.startsWith('```') || line.startsWith('~~~')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    // Section break.
    if (line.startsWith('#')) break;

    if (line.length === 0) {
      if (buf.length > 0) break;
      continue;
    }

    // Skip editorial metadata blocks until we find real prose. Authors
    // commonly stack `> Category:`, `> Family:`, `> Style:` lines under
    // the H1 — they're meaningful in the README but useless as a card
    // summary or SEO snippet.
    if (line.startsWith('>')) continue;
    // Skip lists / table rows / horizontal rules with the same logic.
    if (/^([-*+]\s|\d+\.\s|\||---+$|\*\*\*+$|___+$)/.test(line)) {
      if (buf.length > 0) break;
      continue;
    }

    buf.push(line);
  }

  return stripMarkdownInline(buf.join(' '));
}

export function shapeCraft(
  entry: CraftEntry,
  locale: LandingLocaleCode = DEFAULT_LOCALE,
): CraftRecord {
  const slug = entry.id;
  const body = entry.body ?? '';
  const data = entry.data as {
    i18n?: Record<string, {
      name?: string;
      summary?: string;
    }>;
  };
  const localized = data.i18n?.[locale];
  const h1 = extractH1(body);
  const cleanH1 = h1 ? stripMarkdownInline(h1).replace(/\s+craft rules?$/i, '').trim() : '';
  const fallbackName = localized?.name ?? (cleanH1 || titleizeSlug(slug));
  const fallbackSummary = localized?.summary ?? extractFirstProseParagraph(body);
  const localizedText = localizeCraftText({
    slug,
    name: fallbackName,
    summary: fallbackSummary,
    locale,
  });
  return {
    slug,
    name: localizedText.name,
    summary: localizedText.summary,
    source: `${REPO_BLOB}/craft/${slug}.md`,
    body,
  };
}

export async function getCraftRecords(
  locale: LandingLocaleCode = DEFAULT_LOCALE,
): Promise<ReadonlyArray<CraftRecord>> {
  const entries = await getCollection('craft');
  // Astro normalizes the entry id from `craft/README.md` to `readme`
  // (lowercase, extension stripped). Comparing the raw `'README'` string
  // misses it on disk and used to ship `/craft/readme/` as a public
  // craft principle and inflate the nav count by one. Compare
  // case-insensitively so future README casings (`Readme.md`, etc.) are
  // also filtered out.
  return entries
    .filter((e) => e.id.toLowerCase() !== 'readme')
    .map((entry) => shapeCraft(entry, locale))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Templates — renderable design templates + legacy Live Artifacts
// ---------------------------------------------------------------------------

export interface TemplateRecord {
  slug: string;
  name: string;
  summary: string;
  origin: 'design-template' | 'live-artifact';
  mode?: string;
  modeLabel?: string;
  platform?: string;
  platformLabel?: string;
  scenario?: string;
  scenarioLabel?: string;
  featured?: number;
  source: string;
  detailHref: string;
  /** Skill body / template README body (Markdown). */
  body: string;
  previewUrl: string | null;
}

export type TemplateEntry = CollectionEntry<'templates'>;
export type DesignTemplateEntry = CollectionEntry<'designTemplates'>;

export function shapeDesignTemplate(
  entry: DesignTemplateEntry,
  previews: Map<string, string>,
  locale: LandingLocaleCode = DEFAULT_LOCALE,
): TemplateRecord {
  const slug = deriveSkillSlug(entry.id);
  const data = entry.data as {
    name?: LocalizedStringValue;
    description?: LocalizedStringValue;
    i18n?: Record<string, {
      name?: string;
      description?: string;
      summary?: string;
    }>;
    od?: {
      mode?: string;
      platform?: string;
      scenario?: string;
      featured?: number;
    };
  };
  const body = entry.body ?? '';
  const localized = data.i18n?.[locale];
  const name =
    explicitLocalizedString(localized?.name ?? data.name, locale) ?? titleizeSlug(slug);
  const summary =
    explicitLocalizedString(
      localized?.summary ?? localized?.description ?? data.description,
      locale,
    ) ||
    firstParagraph(explicitLocalizedString(data.description, DEFAULT_LOCALE)) ||
    extractFirstProseParagraph(body) ||
    'Open Design renderable design template.';
  const localizedText = localizeTemplateText({ name, summary, locale });

  return {
    slug,
    name: localizedText.name,
    summary: localizedText.summary,
    origin: 'design-template',
    mode: data.od?.mode,
    modeLabel: localizeTaxonomyValue(data.od?.mode, locale),
    platform: data.od?.platform,
    platformLabel: localizeTaxonomyValue(data.od?.platform, locale),
    scenario: data.od?.scenario,
    scenarioLabel: localizeTaxonomyValue(data.od?.scenario, locale),
    featured: data.od?.featured,
    source: `${REPO_TREE}/design-templates/${slug}`,
    detailHref: `/templates/${slug}/`,
    body,
    previewUrl: previewUrlFor('templates', slug, previews),
  };
}

export function shapeLiveArtifactTemplate(
  entry: TemplateEntry,
  previews: Map<string, string>,
  locale: LandingLocaleCode = DEFAULT_LOCALE,
): TemplateRecord {
  const slug = entry.id.split('/')[0] ?? entry.id;
  const body = entry.body ?? '';
  const data = entry.data as {
    i18n?: Record<string, {
      name?: string;
      summary?: string;
    }>;
  };
  const localized = data.i18n?.[locale];
  const h1 = extractH1(body);

  // Some authors write `# \`otd-operations-brief\` · live-artifact template`
  // — strip the inline backticks/asterisks and drop the trailing
  // `· live-artifact template` boilerplate so card titles read like
  // human prose ("otd-operations-brief") instead of raw Markdown.
  let cleanH1 = h1 ? stripMarkdownInline(h1) : '';
  cleanH1 = cleanH1
    .replace(/\s*[·•]\s*live[\s-]artifact\s+template$/i, '')
    .trim();

  const summary = extractFirstProseParagraph(body) || 'Open Design Live Artifact template.';
  const localizedText = localizeTemplateText({
    name: localized?.name ?? (cleanH1 || titleizeSlug(slug)),
    summary: localized?.summary ?? summary,
    locale,
  });

  const liveSlug = `live-${slug}`;
  return {
    slug: liveSlug,
    name: localizedText.name,
    summary: localizedText.summary,
    origin: 'live-artifact',
    mode: 'template',
    modeLabel: localizeTaxonomyValue('template', locale),
    scenario: 'live-artifacts',
    scenarioLabel: localizeTaxonomyValue('live-artifacts', locale),
    source: `${REPO_TREE}/templates/live-artifacts/${slug}`,
    detailHref: `/templates/${liveSlug}/`,
    body,
    previewUrl: previewUrlFor('templates', liveSlug, previews),
  };
}

export async function getTemplateRecords(
  locale: LandingLocaleCode = DEFAULT_LOCALE,
): Promise<ReadonlyArray<TemplateRecord>> {
  const previews = listPreviews('templates');
  const designEntries = await getCollection('designTemplates');
  const designRecords = designEntries.map((entry) =>
    shapeDesignTemplate(entry, previews, locale),
  );

  const liveEntries = await getCollection('templates');
  const liveRecords = liveEntries.map((entry) =>
    shapeLiveArtifactTemplate(entry, previews, locale),
  );

  return [...designRecords, ...liveRecords].sort((a, b) => {
    // Keep explicitly featured templates first, then group the canonical
    // design-template catalogue ahead of legacy live-artifact shims.
    const af = a.featured ?? Number.POSITIVE_INFINITY;
    const bf = b.featured ?? Number.POSITIVE_INFINITY;
    if (af !== bf) return af - bf;
    if (a.origin !== b.origin) return a.origin === 'design-template' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// ---------------------------------------------------------------------------
// Counts
//
// `getCatalogCounts()` is the canonical numbers source for the homepage
// (hero stat rings, hero lead, capabilities cards, footer Library) and
// the nav badges. Anything in `app/page.tsx` that talks about catalog
// size MUST read from here — never hardcode. The `byMode` and
// `byPlatform` breakdowns power the `Labs` filter pills so they stay
// in sync with `od.mode` / `od.platform` across the SKILL.md corpus.
// ---------------------------------------------------------------------------

export interface CatalogCounts {
  skills: number;
  systems: number;
  templates: number;
  craft: number;
  /** SKILL.md `od.mode` → count. Lowercase keys (e.g. `deck`, `prototype`). */
  byMode: Readonly<Record<string, number>>;
  /** SKILL.md `od.platform` → count. Lowercase keys (e.g. `mobile`, `desktop`). */
  byPlatform: Readonly<Record<string, number>>;
}

function tallyKey(values: Iterable<string | undefined>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) {
    if (!v) continue;
    const k = v.toLowerCase();
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export async function getCatalogCounts(): Promise<CatalogCounts> {
  const [skills, systems, templates, craft] = await Promise.all([
    getSkillRecords(),
    getSystemRecords(),
    getTemplateRecords(),
    getCraftRecords(),
  ]);
  return {
    skills: skills.length,
    systems: systems.length,
    templates: templates.length,
    craft: craft.length,
    byMode: tallyKey(skills.map((s) => s.mode)),
    byPlatform: tallyKey(skills.map((s) => s.platform)),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function uniq<T>(values: ReadonlyArray<T>): ReadonlyArray<T> {
  return Array.from(new Set(values));
}

export function tally<T extends string | number>(values: ReadonlyArray<T>): ReadonlyArray<readonly [T, number]> {
  const map = new Map<T, number>();
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

// ---------------------------------------------------------------------------
// Tag slugification (used for `/skills/mode/<slug>/`,
// `/skills/scenario/<slug>/`, `/systems/category/<slug>/` routes).
//
// Stable, lossless rules:
//   "AI & LLM"               → "ai-llm"
//   "Productivity & SaaS"    → "productivity-saas"
//   "Editorial · Studio"     → "editorial-studio"
//   "Editorial / Print"      → "editorial-print"
//   "live-artifacts"         → "live-artifacts"  (already a slug)
// ---------------------------------------------------------------------------

export function slugifyTag(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Tag canonicalization — collapse near-duplicate authoring spellings into
// one route per concept. Without this, `od.scenario: operation` and
// `od.scenario: operations` would generate two separate `/skills/scenario/...`
// pages for what is plainly the same facet.
//
// Keep aliases conservative — only collapse values that mean exactly the
// same thing (singular/plural, hyphen/space variants). Add more entries as
// inconsistencies appear; the alias key is matched case-insensitively
// against the raw frontmatter value before slugification.
// ---------------------------------------------------------------------------

const SCENARIO_ALIASES: Readonly<Record<string, string>> = {
  operation: 'operations',
  live: 'live-artifacts',
};

const MODE_ALIASES: Readonly<Record<string, string>> = {
  // No aliases needed today — modes are an enum maintained centrally.
};

const CATEGORY_ALIASES: Readonly<Record<string, string>> = {
  // No aliases needed today — categories come from DESIGN.md headers
  // and are reasonably consistent across the corpus.
};

function canonicalize(
  raw: string | undefined,
  aliases: Readonly<Record<string, string>>,
): string | undefined {
  if (!raw) return raw;
  const key = raw.trim().toLowerCase();
  return aliases[key] ?? raw;
}

export function canonicalScenario(raw: string | undefined): string | undefined {
  return canonicalize(raw, SCENARIO_ALIASES);
}

export function canonicalMode(raw: string | undefined): string | undefined {
  return canonicalize(raw, MODE_ALIASES);
}

export function canonicalCategory(raw: string | undefined): string | undefined {
  return canonicalize(raw, CATEGORY_ALIASES);
}

export interface TagDescriptor {
  slug: string;
  label: string;
  count: number;
}

/** Build [slug, label, count] index over a list of (possibly undefined) values. */
export function tagIndex(values: ReadonlyArray<string | undefined>): ReadonlyArray<TagDescriptor> {
  const counts = new Map<string, { label: string; count: number }>();
  for (const v of values) {
    if (!v) continue;
    const slug = slugifyTag(v);
    const existing = counts.get(slug);
    if (existing) {
      existing.count++;
    } else {
      counts.set(slug, { label: v, count: 1 });
    }
  }
  return Array.from(counts.entries())
    .map(([slug, { label, count }]) => ({ slug, label, count }))
    .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
}

// ---------------------------------------------------------------------------
// Tag-page selectors (used by the `/skills/mode/<slug>/` etc. routes via
// getStaticPaths). Each returns the matching records plus the canonical
// human label (preserving the original `od.mode` casing for the heading).
// ---------------------------------------------------------------------------

export async function getSkillsForMode(
  slug: string,
  locale: LandingLocaleCode = DEFAULT_LOCALE,
): Promise<{
  label: string | null;
  records: ReadonlyArray<SkillRecord>;
}> {
  const all = await getSkillRecords(locale);
  const matches = all.filter((s) => {
    const canonical = canonicalMode(s.mode);
    return canonical && slugifyTag(canonical) === slug;
  });
  return {
    label:
      localizeTaxonomyValue(canonicalMode(matches[0]?.mode), locale) ??
      canonicalMode(matches[0]?.mode) ??
      null,
    records: matches,
  };
}

export async function getSkillsForScenario(
  slug: string,
  locale: LandingLocaleCode = DEFAULT_LOCALE,
): Promise<{
  label: string | null;
  records: ReadonlyArray<SkillRecord>;
}> {
  const all = await getSkillRecords(locale);
  const matches = all.filter((s) => {
    const canonical = canonicalScenario(s.scenario);
    return canonical && slugifyTag(canonical) === slug;
  });
  return {
    label:
      localizeTaxonomyValue(canonicalScenario(matches[0]?.scenario), locale) ??
      canonicalScenario(matches[0]?.scenario) ??
      null,
    records: matches,
  };
}

export async function getSystemsForCategory(
  slug: string,
  locale: LandingLocaleCode = DEFAULT_LOCALE,
): Promise<{
  label: string | null;
  records: ReadonlyArray<SystemRecord>;
}> {
  const all = await getSystemRecords(locale);
  const matches = all.filter((s) => {
    const canonical = canonicalCategory(s.category);
    return canonical !== undefined && slugifyTag(canonical) === slug;
  });
  return {
    label:
      localizeTaxonomyValue(canonicalCategory(matches[0]?.category), locale) ??
      canonicalCategory(matches[0]?.category) ??
      null,
    records: matches,
  };
}

export async function getSkillModeIndex(
  locale: LandingLocaleCode = DEFAULT_LOCALE,
): Promise<ReadonlyArray<TagDescriptor>> {
  const all = await getSkillRecords();
  return tagIndex(all.map((s) => canonicalMode(s.mode))).map((tag) => ({
    ...tag,
    label: localizeTaxonomyValue(tag.label, locale) ?? tag.label,
  }));
}

export async function getSkillScenarioIndex(
  locale: LandingLocaleCode = DEFAULT_LOCALE,
): Promise<ReadonlyArray<TagDescriptor>> {
  const all = await getSkillRecords();
  return tagIndex(all.map((s) => canonicalScenario(s.scenario))).map((tag) => ({
    ...tag,
    label: localizeTaxonomyValue(tag.label, locale) ?? tag.label,
  }));
}

export async function getSystemCategoryIndex(
  locale: LandingLocaleCode = DEFAULT_LOCALE,
): Promise<ReadonlyArray<TagDescriptor>> {
  const all = await getSystemRecords();
  return tagIndex(all.map((s) => canonicalCategory(s.category))).map((tag) => ({
    ...tag,
    label: localizeTaxonomyValue(tag.label, locale) ?? tag.label,
  }));
}
