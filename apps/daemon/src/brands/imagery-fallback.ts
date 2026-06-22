// Deterministic, server-side imagery fallback for brand extraction.
//
// The agent is expected to save the site's real cover / hero / representative
// images under the project `imagery/` dir and list them in
// `imagery.samples`, but it often captures few or none (it forgets, the page
// is JS-rendered, or an anti-bot wall blocks it). To make sure the brand kit's
// Images gallery actually populates, this module harvests the page itself:
// `og:image` / `twitter:image`, large `<img>` (filtered by declared/decoded
// size so icons, sprites and tracking pixels drop out), `<picture>`/`srcset`
// highest-res sources, `<link rel=preload as=image>`, and CSS hero
// `background-image` blocks. It saves the largest, most representative ones
// into `imagery/`, deduped, and fills in `imagery.samples`.
//
// Everything is timeout-bounded and failure-tolerant: offline or a hostile
// origin just yields an empty result, preserving the prior (empty) behavior —
// it never throws. It mirrors `logo-fallback.ts` and is injectable so tests
// run offline.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { BrandImagerySample } from '@open-design/contracts';

import { chromeDumpDom, findChrome } from './chrome.js';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const HTML_TIMEOUT_MS = 7_000;
const ASSET_TIMEOUT_MS = 7_000;
/** Skip tiny assets (sprites/icons) and refuse to buffer anything huge. */
const MIN_ASSET_BYTES = 3 * 1024;
const MAX_ASSET_BYTES = 6 * 1024 * 1024;
/** Largest dimension we still treat as decorative chrome rather than content. */
const MIN_LONG_EDGE = 320;
const MIN_SHORT_EDGE = 160;
/** How many representative images to save into `imagery/`. */
const TARGET_SAVED = 8;
/** Below this many usable samples, the network harvest kicks in at finalize. */
const MIN_SAMPLES = 4;
/** Cap how many candidate URLs we will actually fetch + size-check. */
const MAX_FETCH_CANDIDATES = 28;

/** The mutable imagery shape the fallback fills in (a subset of `BrandImagery`). */
export interface ImagerySlot {
  samples?: BrandImagerySample[];
}

/** Signature of {@link ensureImageryFallback}; injectable so tests avoid network. */
export type ImageryFallbackFn = (
  siteUrl: string,
  imageryDir: string,
  imagery: ImagerySlot,
) => Promise<{ changed: boolean }>;

/** An image file written into the `imagery/` dir by the fallback. */
export interface FallbackImage {
  /** Path relative to the dir owner, e.g. `imagery/hero-0.jpg`. */
  rel: string;
  /** Bare filename inside `imagery/`. */
  file: string;
  kind: string;
  sourceUrl: string;
  /** Decoded pixel area, used for largest-first ranking. */
  area: number;
}

interface ImageRef {
  url: string;
  /** Lower number = stronger representative candidate. */
  rank: number;
  kind: string;
}

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|avif)(?:[?#]|$)/i;
const IMAGE_FILE_RE = /\.(png|jpe?g|webp|gif|avif)$/i;

// URL substrings that mark an asset as chrome (icons, sprites, logos, tracking
// pixels, avatars, loaders) rather than a representative cover/hero image.
const JUNK_URL_RE =
  /sprite|favicon|\bicons?\b|\blogo\b|wordmark|avatar|\bpixel\b|tracking|beacon|analytics|spacer|1x1|\bloader\b|loading|placeholder|\bbadge\b|emoji|\bflag\b|\bqr\b/i;

const decodeEntities = (s: string): string =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/gi, '/')
    .replace(/&#47;/g, '/')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

function metaContent(html: string, nameOrProp: string): string {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${nameOrProp.replace(/[:.]/g, '\\$&')}["'][^>]*>`,
    'i',
  );
  const tag = re.exec(html)?.[0];
  if (!tag) return '';
  return decodeEntities(/content=["']([^"']*)["']/i.exec(tag)?.[1] ?? '');
}

/** Pick the highest-resolution URL from a `srcset` value (largest `w` or `x`
 *  descriptor, falling back to the last entry). Returns null when empty. */
function pickFromSrcset(srcset: string): string | null {
  const entries = srcset
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const segments = part.split(/\s+/);
      const url = segments[0] ?? '';
      const descriptor = segments[1];
      let weight = 1;
      if (descriptor) {
        const w = /^(\d+)w$/.exec(descriptor);
        const x = /^([\d.]+)x$/.exec(descriptor);
        if (w) weight = Number(w[1]);
        else if (x) weight = Number(x[1]) * 1000;
      }
      return { url, weight };
    })
    .filter((e) => e.url && !e.url.startsWith('data:'));
  if (entries.length === 0) return null;
  entries.sort((a, b) => b.weight - a.weight);
  return entries[0]?.url ?? null;
}

/** Read a numeric attribute (`width`/`height`) off a tag, or null. */
function numAttr(tag: string, name: string): number | null {
  const m = new RegExp(`${name}=["']?(\\d{1,5})`, 'i').exec(tag);
  return m ? Number(m[1]) : null;
}

/**
 * Discover representative-image refs from the page HTML, ranked best-first.
 * Pure (no I/O) so it is unit-testable offline. Order: social card images,
 * then large hero `<img>`/`<picture>`/preload sources, then CSS hero
 * backgrounds, then the remaining content images.
 */
export function findImageRefs(html: string, baseUrl: string): ImageRef[] {
  const refs: ImageRef[] = [];
  const seen = new Set<string>();
  const push = (href: string | undefined | null, rank: number, kind: string) => {
    if (!href) return;
    const raw = href.trim();
    if (!raw || raw.startsWith('data:')) return;
    let abs: string;
    try {
      abs = new URL(decodeEntities(raw), baseUrl).href;
    } catch {
      return;
    }
    if (seen.has(abs)) return;
    // Keep only raster image URLs and drop obvious chrome. We deliberately skip
    // .svg here — they are almost always icons/logos, not cover images.
    if (!IMAGE_EXT_RE.test(abs)) return;
    if (JUNK_URL_RE.test(abs)) return;
    seen.add(abs);
    refs.push({ url: abs, rank, kind });
  };

  // 1. Social card images — the site's hand-picked representative image.
  push(
    metaContent(html, 'og:image:secure_url') ||
      metaContent(html, 'og:image:url') ||
      metaContent(html, 'og:image'),
    0,
    'cover',
  );
  push(metaContent(html, 'twitter:image:src') || metaContent(html, 'twitter:image'), 0, 'cover');

  // 2. <link rel=preload as=image> — the LCP / hero image the page prioritizes.
  for (const m of html.matchAll(/<link[^>]+rel=["']preload["'][^>]*>/gi)) {
    if (!/as=["']image["']/i.test(m[0])) continue;
    const href = /href=["']([^"']+)["']/i.exec(m[0])?.[1];
    const imageSrcset = /imagesrcset=["']([^"']+)["']/i.exec(m[0])?.[1];
    push(imageSrcset ? pickFromSrcset(imageSrcset) : href, 1, 'hero');
  }

  // 3. <picture><source srcset> — pick the highest-res candidate per source.
  for (const m of html.matchAll(/<source[^>]+srcset=["']([^"']+)["'][^>]*>/gi)) {
    push(pickFromSrcset(m[1] ?? ''), 1, 'hero');
  }

  // 4. <img> — prefer srcset's largest, else src; rank by declared size when
  //    available so big hero imgs sort ahead of small inline thumbnails.
  for (const m of html.matchAll(/<img[^>]+>/gi)) {
    const tag = m[0];
    const srcset =
      /srcset=["']([^"']+)["']/i.exec(tag)?.[1] ?? /data-srcset=["']([^"']+)["']/i.exec(tag)?.[1];
    const src =
      /\bsrc=["']([^"']+)["']/i.exec(tag)?.[1] ?? /data-src=["']([^"']+)["']/i.exec(tag)?.[1];
    const chosen = (srcset && pickFromSrcset(srcset)) || src;
    const w = numAttr(tag, 'width');
    const h = numAttr(tag, 'height');
    // Drop assets the markup declares as small (icons, inline glyphs).
    if ((w !== null && w < 100) || (h !== null && h < 100)) continue;
    const large = (w !== null && w >= 480) || (h !== null && h >= 360);
    push(chosen, large ? 2 : 4, large ? 'hero' : 'image');
  }

  // 5. CSS hero backgrounds — inline style="" and <style> url(...) references.
  for (const m of html.matchAll(/background(?:-image)?\s*:[^;"']*url\(\s*['"]?([^"')]+)['"]?\s*\)/gi)) {
    push(m[1], 3, 'hero');
  }

  refs.sort((a, b) => a.rank - b.rank);
  return refs;
}

function extFor(contentType: string, url: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes('png')) return '.png';
  if (ct.includes('jpeg') || ct.includes('jpg')) return '.jpg';
  if (ct.includes('webp')) return '.webp';
  if (ct.includes('gif')) return '.gif';
  if (ct.includes('avif')) return '.avif';
  const m = IMAGE_EXT_RE.exec(url);
  const ext = m?.[1];
  return ext ? `.${ext.toLowerCase().replace('jpeg', 'jpg')}` : '.jpg';
}

function read24LE(buf: Buffer, off: number): number {
  return buf.readUIntLE(off, 3);
}

/**
 * Decode the pixel dimensions of a PNG / GIF / JPEG / WebP buffer from its
 * header, or null when the format is unrecognized (AVIF and anything else just
 * fails the size gate gracefully). Header-only — never decodes pixel data.
 */
export function imageSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 24) return null;
  // PNG: 8-byte signature, then IHDR width/height as big-endian uint32.
  if (buf.readUInt32BE(0) === 0x89504e47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  // GIF: 'GIF8', then logical screen width/height as little-endian uint16.
  if (buf.toString('ascii', 0, 4) === 'GIF8') {
    return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  }
  // WebP: 'RIFF' .... 'WEBP' <fourcc>.
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const fourcc = buf.toString('ascii', 12, 16);
    if (fourcc === 'VP8 ' && buf.length >= 30) {
      return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    }
    if (fourcc === 'VP8L' && buf.length >= 25) {
      const b = buf.readUInt32LE(21);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
    }
    if (fourcc === 'VP8X' && buf.length >= 30) {
      return { w: read24LE(buf, 24) + 1, h: read24LE(buf, 27) + 1 };
    }
    return null;
  }
  // JPEG: scan marker segments for a Start-Of-Frame (SOFn) and read its size.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) {
        off++;
        continue;
      }
      const marker = buf[off + 1];
      if (marker === undefined) break;
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        off += 2;
        continue;
      }
      const len = buf.readUInt16BE(off + 2);
      const isSof =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        return { h: buf.readUInt16BE(off + 5), w: buf.readUInt16BE(off + 7) };
      }
      if (len <= 0) break;
      off += 2 + len;
    }
  }
  return null;
}

/** True when a decoded image is large enough to be a real cover/hero image
 *  rather than an icon, logo chip, or tracking pixel. */
function isRepresentative(buf: Buffer): { ok: boolean; area: number } {
  if (buf.length < MIN_ASSET_BYTES) return { ok: false, area: 0 };
  const size = imageSize(buf);
  if (!size) {
    // Undecodable (e.g. AVIF): accept only when the byte size is clearly a
    // photo rather than a sprite, so the gallery is never icon-stuffed.
    return buf.length > 20 * 1024 ? { ok: true, area: buf.length } : { ok: false, area: 0 };
  }
  const longEdge = Math.max(size.w, size.h);
  const shortEdge = Math.min(size.w, size.h);
  const ok = longEdge >= MIN_LONG_EDGE && shortEdge >= MIN_SHORT_EDGE;
  return { ok, area: size.w * size.h };
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
      redirect: 'follow',
      signal: AbortSignal.timeout(HTML_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchBinary(
  url: string,
  referer: string,
): Promise<{ buf: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        // Browser-shaped headers defeat most hotlink / referer protection.
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site',
        Referer: referer,
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(ASSET_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_ASSET_BYTES) return null;
    return { buf, contentType: res.headers.get('content-type') ?? '' };
  } catch {
    return null;
  }
}

function fileSlug(kind: string, index: number, ext: string): string {
  const base =
    kind.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'image';
  return `${base}-${index}${ext}`;
}

/**
 * Fetch the site's representative images and save the largest usable ones into
 * `imageryDir`, deduped by content hash. Returns the saved files ranked by
 * candidate strength then decoded area. Best-effort: any failure (offline,
 * blocked, non-image) yields whatever was salvageable, possibly an empty array
 * — never throws.
 */
export async function harvestSiteImagery(
  siteUrl: string,
  imageryDir: string,
  alreadySaved = 0,
): Promise<FallbackImage[]> {
  try {
    new URL(siteUrl);
  } catch {
    return [];
  }

  let html = await fetchText(siteUrl);
  let refs = html ? findImageRefs(html, siteUrl) : [];
  // JS-rendered sites often inject hero <img>/srcset at runtime. When the
  // static HTML is thin and a headless Chrome is available, re-harvest from the
  // rendered DOM (mirrors the prefetch path). Best-effort and skipped offline.
  if (refs.length < MIN_SAMPLES && findChrome()) {
    const dom = await chromeDumpDom(siteUrl);
    if (dom) {
      html = dom;
      const merged = findImageRefs(dom, siteUrl);
      const seen = new Set(refs.map((r) => r.url));
      for (const r of merged) if (!seen.has(r.url)) refs.push(r);
      refs.sort((a, b) => a.rank - b.rank);
    }
  }
  if (refs.length === 0) return [];

  const saved: FallbackImage[] = [];
  const hashes = new Set<string>();
  fs.mkdirSync(imageryDir, { recursive: true });

  for (const ref of refs) {
    if (saved.length + alreadySaved >= TARGET_SAVED) break;
    if (saved.length >= MAX_FETCH_CANDIDATES) break;
    const bin = await fetchBinary(ref.url, siteUrl);
    if (!bin) continue;
    const verdict = isRepresentative(bin.buf);
    if (!verdict.ok) continue;
    const hash = createHash('sha1').update(bin.buf).digest('hex');
    if (hashes.has(hash)) continue;
    hashes.add(hash);
    const ext = extFor(bin.contentType, ref.url);
    let file = fileSlug(ref.kind, alreadySaved + saved.length, ext);
    while (fs.existsSync(path.join(imageryDir, file))) {
      file = fileSlug(ref.kind, alreadySaved + saved.length + saved.length + 1, ext);
    }
    fs.writeFileSync(path.join(imageryDir, file), bin.buf);
    saved.push({ rel: `imagery/${file}`, file, kind: ref.kind, sourceUrl: ref.url, area: verdict.area });
  }

  return saved;
}

/**
 * Wire image files already present in `imageryDir` into `imagery.samples` when
 * they are not referenced yet. Pure filesystem — never touches the network — so
 * an agent that downloaded images but forgot to list them still gets a gallery.
 * Mutates and returns `{ changed }`.
 */
export function adoptExistingImagery(imageryDir: string, imagery: ImagerySlot): { changed: boolean } {
  let names: string[];
  try {
    names = fs.readdirSync(imageryDir);
  } catch {
    return { changed: false };
  }
  const existing = normalizeSamples(imagery);
  const referenced = new Set(existing.map((s) => s.file));
  const files = names
    .filter((n) => IMAGE_FILE_RE.test(n) && isFileIn(imageryDir, n))
    .map((n) => ({ name: n, area: decodedArea(path.join(imageryDir, n)) }))
    .filter((f) => !referenced.has(`imagery/${f.name}`))
    .sort((a, b) => b.area - a.area);
  if (files.length === 0) return { changed: false };
  const added: BrandImagerySample[] = files
    .slice(0, TARGET_SAVED - existing.length)
    .map((f) => ({ file: `imagery/${f.name}`, kind: 'image' }));
  if (added.length === 0) return { changed: false };
  imagery.samples = [...existing, ...added];
  return { changed: true };
}

/**
 * Ensure `imagery.samples` carries enough representative images for the kit
 * gallery. No-op when the agent already listed at least {@link MIN_SAMPLES}.
 * Otherwise it first adopts any image files already on disk (offline), then —
 * if still short — harvests the site's cover/hero images over the network and
 * appends them. Mutates and returns `imagery`. Best-effort; never throws.
 */
export async function ensureImageryFallback(
  siteUrl: string,
  imageryDir: string,
  imagery: ImagerySlot,
): Promise<{ changed: boolean }> {
  const initial = normalizeSamples(imagery);
  imagery.samples = initial;
  if (initial.length >= MIN_SAMPLES) return { changed: false };

  let changed = false;
  // Cheap offline step: adopt any images sitting in imagery/ already.
  if (adoptExistingImagery(imageryDir, imagery).changed) changed = true;
  if (normalizeSamples(imagery).length >= MIN_SAMPLES) {
    return { changed };
  }

  // Still short — harvest the live site's representative images.
  let harvested: FallbackImage[] = [];
  try {
    harvested = await harvestSiteImagery(siteUrl, imageryDir, normalizeSamples(imagery).length);
  } catch {
    harvested = [];
  }
  if (harvested.length === 0) return { changed };

  const current = normalizeSamples(imagery);
  const referenced = new Set(current.map((s) => s.file));
  // `harvested` already arrives in candidate-strength order (cover → hero →
  // background → content); keep that ordering for the gallery.
  const added: BrandImagerySample[] = [];
  const perKind = new Map<string, number>();
  for (const img of harvested) {
    if (referenced.has(img.rel)) continue;
    referenced.add(img.rel);
    const ordinal = perKind.get(img.kind) ?? 0;
    perKind.set(img.kind, ordinal + 1);
    added.push({ file: img.rel, kind: img.kind, caption: captionFor(img.kind, ordinal) });
  }
  if (added.length === 0) return { changed };
  imagery.samples = [...current, ...added];
  return { changed: true };
}

/** Human-friendly caption per harvested kind, kept short for the thumbnail. */
function captionFor(kind: string, index: number): string {
  if (kind === 'cover') return 'Social cover image';
  if (kind === 'hero') return index === 0 ? 'Hero image' : `Hero image ${index + 1}`;
  return `Site image ${index + 1}`;
}

/** Read + sanitize `imagery.samples` into a clean array (drops malformed
 *  entries, dedupes by file path). */
function normalizeSamples(imagery: ImagerySlot): BrandImagerySample[] {
  const raw = Array.isArray(imagery.samples) ? imagery.samples : [];
  const out: BrandImagerySample[] = [];
  const seen = new Set<string>();
  for (const s of raw) {
    if (!s || typeof s.file !== 'string' || !s.file.trim()) continue;
    const file = s.file.trim();
    if (seen.has(file)) continue;
    seen.add(file);
    out.push({
      file,
      ...(s.kind ? { kind: s.kind } : {}),
      ...(s.caption ? { caption: s.caption } : {}),
    });
  }
  return out;
}

function decodedArea(absPath: string): number {
  try {
    const size = imageSize(fs.readFileSync(absPath));
    return size ? size.w * size.h : 0;
  } catch {
    return 0;
  }
}

function isFileIn(dir: string, name: string): boolean {
  try {
    return fs.statSync(path.join(dir, name)).isFile();
  } catch {
    return false;
  }
}
