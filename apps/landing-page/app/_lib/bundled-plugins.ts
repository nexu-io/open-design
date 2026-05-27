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

export interface BundledPluginRecord {
  /** Folder name, e.g. `3d-stone-staircase-evolution-infographic`. */
  slug: string;
  /** Manifest `name`, e.g. `image-template-3d-stone-staircase-evolution-infographic`. */
  manifestId: string;
  /** Source bucket. */
  bucket: BundledBucket;
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
  /** Detail page URL on this site (`/plugins/<manifest-id>/`). */
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

function loadOne(
  root: string,
  bucket: BundledBucket,
  slug: string,
): BundledPluginRecord | null {
  const manifestPath = path.join(root, bucket, slug, 'open-design.json');
  if (!existsSync(manifestPath)) return null;
  let raw: BundledManifestRaw;
  try {
    raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as BundledManifestRaw;
  } catch {
    return null;
  }

  const manifestId = asString(raw.name) ?? slug;
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
        ? entryRelativeUrl(
            manifestId,
            asString(raw.od?.preview?.entry),
            path.join(root, bucket, slug),
          )
        : undefined,
    detailHref: `/plugins/${manifestId}/`,
    sourceUrl: `${REPO_FOR_BUCKET(bucket)}/${slug}`,
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
      const record = loadOne(root, bucket, name);
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

export function getBundledPluginById(
  manifestId: string,
): BundledPluginRecord | null {
  return getBundledPlugins().find((p) => p.manifestId === manifestId) ?? null;
}
