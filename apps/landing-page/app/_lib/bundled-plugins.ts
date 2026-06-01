// Loader for `plugins/_official/<bucket>/<slug>/open-design.json` —
// the bundled-plugin catalogue the daemon registers on startup and
// the in-app Plugins home displays. Authoritative source of truth for
// the marketing site's `/plugins/...` routes; mirroring it keeps the
// landing-page counts in lockstep with what visitors see when they
// open Open Design.
//
// Why a parallel loader instead of extending `catalog.ts`:
//   - Catalog reads SKILL.md frontmatter through Astro Content
//     Collections; bundled plugins ship `open-design.json` (a
//     manifest, not Markdown), so the data shape is different and
//     forcing one loader to handle both invites schema confusion.
//   - The manifest's `od.preview.poster` is already a CDN URL — no
//     Playwright pass required, screenshots are skipped entirely for
//     this dataset.
//   - Atoms (utility plugins like `code-import`, `patch-edit`) share
//     the same manifest format but are filtered out of the public
//     library. Centralising the filter here keeps every catalog
//     route in sync.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pluginDetailPath, pluginDetailSlug } from './plugin-slug';
import {
  DEFAULT_LOCALE,
  getLocaleDefinition,
  type LandingLocaleCode,
} from '../i18n';

const SOURCE_ROOTS = [
  // Build run from monorepo root.
  path.resolve(process.cwd(), 'plugins/_official'),
  // Build run from `apps/landing-page/`.
  path.resolve(process.cwd(), '../../plugins/_official'),
  // Source-relative fallback (matches the convention in `catalog.ts`).
  path.resolve(fileURLToPath(new URL('../../../../plugins/_official', import.meta.url))),
] as const;

function pluginsRoot(): string | null {
  return SOURCE_ROOTS.find((dir) => existsSync(dir)) ?? null;
}

const COMMUNITY_ROOTS = [
  path.resolve(process.cwd(), 'plugins/community'),
  path.resolve(process.cwd(), '../../plugins/community'),
  path.resolve(fileURLToPath(new URL('../../../../plugins/community', import.meta.url))),
] as const;

function communityRoot(): string | null {
  return COMMUNITY_ROOTS.find((dir) => existsSync(dir)) ?? null;
}

/** Buckets we walk under `plugins/_official/`. Order = display order. */
export const BUNDLED_BUCKETS = [
  'examples',
  'image-templates',
  'video-templates',
  'scenarios',
  'design-systems',
  'atoms',
] as const;

export type BundledBucket = (typeof BUNDLED_BUCKETS)[number];

// Detail pages cover every locally-shipped plugin: the `_official` buckets
// above PLUS the `community/` source folders. `community` is not a `_official`
// bucket (no tier subdir), so it gets its own label/source handling.
export type DetailBucket = BundledBucket | 'community';

export interface BundledPluginRecord {
  /** Folder name, e.g. `3d-stone-staircase-evolution-infographic`. */
  slug: string;
  /** Manifest `name`, e.g. `image-template-3d-stone-staircase-evolution-infographic`. */
  manifestId: string;
  /** Source bucket (or `community` for community-folder plugins). */
  bucket: DetailBucket;
  /** Manifest `title` (English baseline; pre-localization fallback). */
  title: string;
  /**
   * Manifest `title_i18n` map keyed by locale (long code, e.g. `zh-CN`,
   * `zh-TW`, `pt-BR`, `ja`). Authors fill this opportunistically; consumers
   * should resolve via {@link resolveBundledTitle} so the lookup chain
   * (long code → short code → English fallback) stays consistent.
   */
  titleI18n?: Readonly<Record<string, string>>;
  /** Manifest `description`. */
  description: string;
  /** Manifest `description_i18n` map. See {@link titleI18n} comment. */
  descriptionI18n?: Readonly<Record<string, string>>;
  /** Manifest `tags`. */
  tags: ReadonlyArray<string>;
  /** Manifest `author.name`. */
  authorName?: string;
  /** Manifest `author.url`. */
  authorUrl?: string;
  /** Manifest `homepage`. */
  homepage?: string;
  /** od.mode (e.g. `prototype`, `image`, `video`). */
  mode?: string;
  /** od.scenario. */
  scenario?: string;
  /** od.platform. */
  platform?: string;
  /** od.surface. */
  surface?: string;
  /** od.kind (e.g. `scenario`, `atom`, `system`). Atoms get filtered. */
  kind?: string;
  /** Preview poster URL (already on R2 / CDN). */
  previewPoster?: string;
  /** Preview type — `image`, `video`, `html`, etc. */
  previewType?: string;
  /** Preview video URL when `previewType === 'video'` (Cloudflare Stream MP4). */
  previewVideo?: string;
  /**
   * Public URL for the runnable preview entry when the manifest
   * carries `od.preview.entry` and `od.preview.type === 'html'`.
   * `copy-example-html.ts` mirrors the local entry to
   * `out/plugins/<manifest-id>/<entry-relative-path>` so this URL
   * resolves on Cloudflare Pages without the SPA-fallback hitting
   * the homepage.
   */
  previewEntryUrl?: string;
  /** Single-segment detail slug (matches the catalog id's last segment). */
  detailSlug: string;
  /** Detail page URL on this site (`/plugins/<detail-slug>/`). */
  detailHref: string;
  /** GitHub source folder URL. */
  sourceUrl: string;
}

interface BundledManifestRaw {
  name?: unknown;
  title?: unknown;
  title_i18n?: unknown;
  description?: unknown;
  description_i18n?: unknown;
  tags?: unknown;
  author?: { name?: unknown; url?: unknown };
  homepage?: unknown;
  od?: {
    kind?: unknown;
    mode?: unknown;
    scenario?: unknown;
    platform?: unknown;
    surface?: unknown;
    preview?: {
      type?: unknown;
      poster?: unknown;
      entry?: unknown;
      video?: unknown;
    };
  };
}

function entryRelativeUrl(
  manifestId: string,
  entryRel: string | undefined,
  slugDir: string,
): string | undefined {
  if (!entryRel) return undefined;
  // Strip the leading `./` so concatenating with the detail-page URL
  // doesn't produce `/plugins/<id>/./example.html`.
  const clean = entryRel.replace(/^\.\//, '');
  // Verify the manifest's promise. Several first-party manifests
  // declare a preview entry that never made it into the repo
  // (`example-design-brief`'s `./brief-preview.html`,
  // `example-x-research`'s `./example.html`, …). Without this guard
  // the detail page renders a click-to-expand iframe pointing at a
  // file that copy-example-html.ts skipped, and Cloudflare Pages
  // SPA-fallbacks the iframe URL to the homepage. Dropping the URL
  // here makes the page fall back to a static thumbnail instead.
  const localPath = path.join(slugDir, clean);
  if (!existsSync(localPath)) return undefined;
  return `/plugins/${manifestId}/${clean}`;
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function asStringArray(v: unknown): ReadonlyArray<string> {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

/**
 * Coerce a manifest's `title_i18n` / `description_i18n` payload to a plain
 * `{ [locale]: string }` map. Anything that isn't a string-valued object is
 * dropped — the schema permits one of two shapes (omitted or `Record<string,
 * string>`) and we don't want a malformed manifest to poison the loader.
 */
function asLocaleMap(v: unknown): Readonly<Record<string, string>> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(v as Record<string, unknown>)) {
    if (typeof value === 'string' && value.length > 0) out[key] = value;
  }
  return Object.keys(out).length > 0 ? Object.freeze(out) : undefined;
}

/**
 * Resolve a localized field from a manifest's `title_i18n` /
 * `description_i18n` map. Manifest authors store keys using the long codes
 * preferred by the `LocalizedText` schema (`zh-CN`, `zh-TW`, `pt-BR`, `ja`),
 * while landing pages thread the short `LandingLocaleCode` (`zh`, `zh-tw`,
 * `pt-br`, `ja`). The lookup chain mirrors `resolveLocalizedText` from
 * `packages/contracts/src/plugins/manifest.ts`: long code → short code →
 * primary language tag → English → caller-supplied fallback.
 */
function resolveLocalized(
  map: Readonly<Record<string, string>> | undefined,
  fallback: string,
  locale: LandingLocaleCode,
): string {
  if (!map) return fallback;
  const def = getLocaleDefinition(locale);
  const candidates = [
    def?.htmlLang,
    locale,
    def?.htmlLang?.split('-')[0],
    'en',
  ].filter((c): c is string => Boolean(c));
  for (const candidate of candidates) {
    const value = map[candidate];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return fallback;
}

/** Resolve a bundled plugin's title for a given locale, falling back to English. */
export function resolveBundledTitle(
  record: BundledPluginRecord,
  locale: LandingLocaleCode = DEFAULT_LOCALE,
): string {
  return resolveLocalized(record.titleI18n, record.title, locale);
}

/** Resolve a bundled plugin's description for a given locale. */
export function resolveBundledDescription(
  record: BundledPluginRecord,
  locale: LandingLocaleCode = DEFAULT_LOCALE,
): string {
  return resolveLocalized(record.descriptionI18n, record.description, locale);
}

function REPO_FOR_BUCKET(bucket: BundledBucket): string {
  return `https://github.com/nexu-io/open-design/tree/main/plugins/_official/${bucket}`;
}

const PREVIEW_OUT_CANDIDATES = [
  path.resolve(process.cwd(), 'apps/landing-page/public/previews/plugins'),
  path.resolve(process.cwd(), 'public/previews/plugins'),
  path.resolve(fileURLToPath(new URL('../../public/previews/plugins', import.meta.url))),
] as const;

function localPreviewRoot(): string | null {
  return PREVIEW_OUT_CANDIDATES.find((d) => existsSync(d)) ?? null;
}

let cachedLocalPreviewSet: Set<string> | null = null;

/**
 * Quickly check whether `generate-previews.ts` produced a local PNG
 * for a given manifest id. Built once per build run, then reused for
 * every record so we don't fs-stat 400+ files in a tight loop.
 */
function hasLocalPreview(manifestId: string): boolean {
  if (cachedLocalPreviewSet) {
    return cachedLocalPreviewSet.has(`${manifestId}.png`);
  }
  const root = localPreviewRoot();
  if (!root) {
    cachedLocalPreviewSet = new Set();
    return false;
  }
  cachedLocalPreviewSet = new Set(readdirSync(root));
  return cachedLocalPreviewSet.has(`${manifestId}.png`);
}

function loadOne(opts: {
  manifestPath: string;
  slugDir: string;
  slug: string;
  bucket: DetailBucket;
  sourceUrl: string;
  /**
   * Catalog-consistent id to derive the detail slug from. _official manifest
   * names already match their catalog last segment, but community plugins
   * carry a `community-` manifest name while the catalog/listing keys off the
   * folder name. Passing `community/<folder>` here keeps the detail page, the
   * list card, and the share link on one slug. Defaults to the manifest id.
   */
  routeId?: string;
}): BundledPluginRecord | null {
  const { manifestPath, slugDir, slug, bucket, sourceUrl, routeId } = opts;
  if (!existsSync(manifestPath)) return null;
  let raw: BundledManifestRaw;
  try {
    raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as BundledManifestRaw;
  } catch {
    return null;
  }

  const manifestId = asString(raw.name) ?? slug;
  const slugBasis = routeId ?? manifestId;
  const title = asString(raw.title) ?? manifestId;
  const titleI18n = asLocaleMap(raw.title_i18n);
  const description = asString(raw.description) ?? '';
  const descriptionI18n = asLocaleMap(raw.description_i18n);

  // Preference order:
  //   1. Manifest poster URL (R2/CDN, fastest, already bandwidth-paid).
  //   2. Local screenshot at /previews/plugins/<id>.png that
  //      `generate-previews.ts` produced from the entry HTML.
  //   3. Local fallback typographic card at the same path.
  // Whichever exists first wins; the catalog row sees a single
  // `previewPoster` URL and doesn't have to know which path it came
  // from.
  const remotePoster = asString(raw.od?.preview?.poster);
  const previewPoster =
    remotePoster ??
    (hasLocalPreview(manifestId) ? `/previews/plugins/${manifestId}.png` : undefined);

  return {
    slug,
    manifestId,
    bucket,
    title,
    titleI18n,
    description,
    descriptionI18n,
    tags: asStringArray(raw.tags),
    authorName: asString(raw.author?.name),
    authorUrl: asString(raw.author?.url),
    homepage: asString(raw.homepage),
    mode: asString(raw.od?.mode),
    scenario: asString(raw.od?.scenario),
    platform: asString(raw.od?.platform),
    surface: asString(raw.od?.surface),
    kind: asString(raw.od?.kind),
    previewPoster,
    previewType: asString(raw.od?.preview?.type),
    previewVideo: asString(raw.od?.preview?.video),
    previewEntryUrl:
      asString(raw.od?.preview?.type) === 'html'
        ? entryRelativeUrl(manifestId, asString(raw.od?.preview?.entry), slugDir)
        : undefined,
    detailSlug: pluginDetailSlug(slugBasis),
    detailHref: pluginDetailPath(slugBasis),
    sourceUrl,
  };
}

let cachedAll: ReadonlyArray<BundledPluginRecord> | null = null;

/**
 * Read every bundled plugin from `plugins/_official/`. Atoms
 * (`od.kind === 'atom'`) are dropped — they’re infrastructure,
 * not user-facing entries. Cached per build because the source
 * tree never changes during a single Astro build.
 */
export function getBundledPlugins(): ReadonlyArray<BundledPluginRecord> {
  if (cachedAll) return cachedAll;
  const root = pluginsRoot();
  if (!root) {
    cachedAll = [];
    return cachedAll;
  }

  const out: BundledPluginRecord[] = [];
  for (const bucket of BUNDLED_BUCKETS) {
    const dir = path.join(root, bucket);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (name.startsWith('_') || name.startsWith('.')) continue;
      const full = path.join(dir, name);
      if (!statSync(full).isDirectory()) continue;
      const record = loadOne({
        manifestPath: path.join(root, bucket, name, 'open-design.json'),
        slugDir: path.join(root, bucket, name),
        slug: name,
        bucket,
        sourceUrl: `${REPO_FOR_BUCKET(bucket)}/${name}`,
      });
      if (!record) continue;
      // Atoms are infrastructure plugins (`code-import`, `patch-edit`,
      // …) that the daemon needs but the in-app Plugins home filters
      // out. Mirror that filter here so our public-library counts
      // match what users see in the picker.
      if (record.kind === 'atom') continue;
      out.push(record);
    }
  }

  out.sort((a, b) => a.title.localeCompare(b.title));
  cachedAll = out;
  return cachedAll;
}

let cachedDetail: ReadonlyArray<BundledPluginRecord> | null = null;

/**
 * Every locally-shipped plugin that gets a detail page. Unlike
 * `getBundledPlugins` (the in-app library view), this is the FULL set:
 *   - all `_official/<bucket>/` plugins, atoms INCLUDED — they are
 *     installable registry entries, so a shared link must resolve;
 *   - every `plugins/community/<slug>/` folder (bucket = `community`).
 * The route slug is the single-segment `pluginDetailSlug(manifestId)`;
 * ids are globally unique on their last segment so there are no clashes.
 */
export function getDetailPlugins(): ReadonlyArray<BundledPluginRecord> {
  if (cachedDetail) return cachedDetail;
  const out: BundledPluginRecord[] = [];

  const root = pluginsRoot();
  if (root) {
    for (const bucket of BUNDLED_BUCKETS) {
      const dir = path.join(root, bucket);
      if (!existsSync(dir)) continue;
      for (const name of readdirSync(dir)) {
        if (name.startsWith('_') || name.startsWith('.')) continue;
        if (!statSync(path.join(dir, name)).isDirectory()) continue;
        const record = loadOne({
          manifestPath: path.join(dir, name, 'open-design.json'),
          slugDir: path.join(dir, name),
          slug: name,
          bucket,
          sourceUrl: `${REPO_FOR_BUCKET(bucket)}/${name}`,
        });
        if (record) out.push(record);
      }
    }
  }

  const community = communityRoot();
  if (community) {
    for (const name of readdirSync(community)) {
      if (name.startsWith('_') || name.startsWith('.')) continue;
      const dir = path.join(community, name);
      if (!statSync(dir).isDirectory()) continue;
      const record = loadOne({
        manifestPath: path.join(dir, 'open-design.json'),
        slugDir: dir,
        slug: name,
        bucket: 'community',
        routeId: `community/${name}`,
        sourceUrl: `https://github.com/nexu-io/open-design/tree/main/plugins/community/${name}`,
      });
      if (record) out.push(record);
    }
  }

  out.sort((a, b) => a.title.localeCompare(b.title));
  cachedDetail = out;
  return cachedDetail;
}

export function getBundledPluginById(
  manifestId: string,
): BundledPluginRecord | null {
  return getBundledPlugins().find((p) => p.manifestId === manifestId) ?? null;
}

// SystemRecord (from the `design-systems/` content collection) and the
// design-system detail pages (from `plugins/_official/design-systems/`)
// overlap on the folder name but not on the URL: a system folder `stripe`
// becomes detail page `/plugins/design-system-stripe/`. ~8 of the ~150
// systems ship no manifest, so they have no detail page. Resolve the link
// here: callers link straight to the detail page when one exists, and
// degrade to the `/plugins/systems/` index otherwise — same outcome the
// `/systems/<slug>/` 301 redirects produce, but without the extra hop.
export function detailHrefForSystemSlug(folderSlug: string): string | null {
  const match = getDetailPlugins().find(
    (p) => p.bucket === 'design-systems' && p.slug === folderSlug,
  );
  return match?.detailHref ?? null;
}
