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
  /** Manifest `title`. */
  title: string;
  /** Manifest `description`. */
  description: string;
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
  /** Detail page URL on this site (`/plugins/<manifest-id>/`). */
  detailHref: string;
  /** GitHub source folder URL. */
  sourceUrl: string;
}

interface BundledManifestRaw {
  name?: unknown;
  title?: unknown;
  description?: unknown;
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

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function asStringArray(v: unknown): ReadonlyArray<string> {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
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
  const description = asString(raw.description) ?? '';

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
    description,
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
