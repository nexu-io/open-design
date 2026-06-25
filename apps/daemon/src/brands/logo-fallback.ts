// Deterministic, server-side logo fallback for brand extraction.
//
// The agent is expected to save real logo markup under the project `logos/`
// dir, but it sometimes fails to (proprietary inline SVG, anti-bot wall, or it
// simply forgets). To make sure `brand.html` almost never shows "No logo
// found", this module fetches the site's icon assets directly — the
// `apple-touch-icon`, `<link rel=icon>`/favicon, `og:image`, `/favicon.ico`,
// and finally public favicon services — and saves whatever it can into
// `logos/`. Everything is timeout-bounded and failure-tolerant: offline or a
// hostile origin just yields an empty result, preserving the prior behavior.

import fs from 'node:fs';
import path from 'node:path';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const HTML_TIMEOUT_MS = 7_000;
const ASSET_TIMEOUT_MS = 7_000;
const MAX_ASSET_BYTES = 2 * 1024 * 1024;
const MAX_SAVED = 6;

/** The mutable logo shape the fallback fills in (matches `Brand['logo']`). */
export interface LogoSlot {
  primary: string | null;
  alternates: string[];
  notes: string;
}

/** Signature of {@link ensureLogoFallback}; injectable so tests avoid network. */
export type LogoFallbackFn = (
  siteUrl: string,
  logosDir: string,
  logo: LogoSlot,
) => Promise<{ changed: boolean }>;

/** A logo file written into the project/brand `logos/` dir by the fallback. */
export interface FallbackLogo {
  /** Path relative to the dir owner, e.g. `logos/apple-touch-icon.png`. */
  rel: string;
  /** Bare filename inside `logos/`. */
  file: string;
  kind: string;
  sourceUrl: string;
}

interface LogoRef {
  url: string;
  /** Lower number = stronger primary candidate. */
  rank: number;
  kind: string;
}

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

/** Discover icon/og refs from the page HTML, ranked best-primary-first. */
export function findLogoRefs(html: string, baseUrl: string): LogoRef[] {
  const refs: LogoRef[] = [];
  const seen = new Set<string>();
  const push = (href: string | undefined, rank: number, kind: string) => {
    if (!href || href.startsWith('data:')) return;
    let abs: string;
    try {
      abs = new URL(decodeEntities(href), baseUrl).href;
    } catch {
      return;
    }
    if (seen.has(abs)) return;
    seen.add(abs);
    refs.push({ url: abs, rank, kind });
  };

  for (const m of html.matchAll(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*>/gi)) {
    const href = /href=["']([^"']+)["']/i.exec(m[0])?.[1];
    if (/apple-touch/i.test(m[0])) push(href, 0, 'apple-touch-icon');
    else push(href, 2, 'favicon');
  }
  push(metaContent(html, 'og:image') || metaContent(html, 'twitter:image'), 4, 'og-image');

  refs.sort((a, b) => a.rank - b.rank);
  return refs;
}

function extFor(contentType: string, url: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes('svg')) return '.svg';
  if (ct.includes('png')) return '.png';
  if (ct.includes('jpeg') || ct.includes('jpg')) return '.jpg';
  if (ct.includes('webp')) return '.webp';
  if (ct.includes('gif')) return '.gif';
  if (ct.includes('icon') || ct.includes('ico')) return '.ico';
  const m = /\.(svg|png|jpe?g|webp|gif|ico)(?:[?#]|$)/i.exec(url);
  const ext = m?.[1];
  return ext ? `.${ext.toLowerCase()}` : '.png';
}

/** Width/height of a PNG buffer (IHDR), or null when it isn't a PNG. */
function pngSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
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
): Promise<{ buf: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'image/*,*/*;q=0.8' },
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

/** True when an image buffer is large enough to be a real mark, not a 1px /
 *  16px generic placeholder. SVGs (text) and small icos pass by length. */
function isUsableImage(buf: Buffer, contentType: string, url: string): boolean {
  const ext = extFor(contentType, url);
  if (ext === '.svg') return buf.length > 80;
  const size = pngSize(buf);
  if (size) return size.w >= 32 && size.h >= 32;
  return buf.length > 700;
}

function fileSlug(kind: string, index: number, ext: string): string {
  const base = kind.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'logo';
  return index === 0 ? `${base}${ext}` : `${base}-${index}${ext}`;
}

/**
 * Fetch the site's icon/og assets and save any usable ones into `logosDir`.
 * Returns the saved files ranked best-primary-first. Best-effort: any failure
 * (offline, blocked, non-image) yields whatever was salvageable, possibly an
 * empty array — never throws.
 */
export async function harvestFallbackLogos(
  siteUrl: string,
  logosDir: string,
): Promise<FallbackLogo[]> {
  let origin: string;
  let host: string;
  try {
    const u = new URL(siteUrl);
    origin = u.origin;
    host = u.hostname;
  } catch {
    return [];
  }

  const refs: LogoRef[] = [];
  const html = await fetchText(siteUrl);
  if (html) refs.push(...findLogoRefs(html, siteUrl));
  // Always consider the conventional favicon location too.
  if (!refs.some((r) => r.url === `${origin}/favicon.ico`)) {
    refs.push({ url: `${origin}/favicon.ico`, rank: 3, kind: 'favicon' });
  }
  refs.sort((a, b) => a.rank - b.rank);

  const saved: FallbackLogo[] = [];
  const writeAsset = (buf: Buffer, contentType: string, url: string, kind: string) => {
    const ext = extFor(contentType, url);
    fs.mkdirSync(logosDir, { recursive: true });
    let file = fileSlug(kind, saved.length, ext);
    if (fs.existsSync(path.join(logosDir, file))) file = fileSlug(kind, saved.length + 1, ext);
    fs.writeFileSync(path.join(logosDir, file), buf);
    saved.push({ rel: `logos/${file}`, file, kind, sourceUrl: url });
  };

  for (const ref of refs) {
    if (saved.length >= MAX_SAVED) break;
    const bin = await fetchBinary(ref.url);
    if (!bin || !isUsableImage(bin.buf, bin.contentType, ref.url)) continue;
    writeAsset(bin.buf, bin.contentType, ref.url, ref.kind);
  }

  // Last resort: public favicon services keyed by hostname (never touch the
  // origin, so they survive hotlink protection / bot walls). Google falls back
  // to a tiny generic globe for unknown domains — the size check rejects that.
  if (saved.length === 0) {
    const services: Array<{ url: string; accept: (buf: Buffer) => boolean }> = [
      {
        url: `https://www.google.com/s2/favicons?domain=${host}&sz=256`,
        accept: (buf) => {
          const size = pngSize(buf);
          return size !== null && size.w >= 64 && size.h >= 64;
        },
      },
      {
        url: `https://icons.duckduckgo.com/ip3/${host}.ico`,
        accept: (buf) => buf.length > 1_000,
      },
    ];
    for (const svc of services) {
      const bin = await fetchBinary(svc.url);
      if (!bin || !svc.accept(bin.buf)) continue;
      writeAsset(bin.buf, bin.contentType, svc.url, 'favicon');
      break;
    }
  }

  return saved;
}

/**
 * Ensure `logosDir` has at least one logo and `logo` carries a primary. When
 * `logo.primary` is already set this is a no-op. When logo files already sit on
 * disk (agent-saved or seed-harvested) but `logo.primary` is empty, those files
 * are adopted into `logo.primary`/`logo.alternates` — otherwise the kit page
 * would report "No logo found" despite real marks living in `logos/`. Only when
 * the dir is genuinely empty does it harvest fallback marks over the network.
 * Mutates and returns `logo`. Best-effort.
 */
export async function ensureLogoFallback(
  siteUrl: string,
  logosDir: string,
  logo: LogoSlot,
): Promise<{ changed: boolean }> {
  if (logo.primary) return { changed: false };
  // Adopt existing files first so a populated `logos/` dir always resolves to a
  // primary, even when the agent's brand.json left `logo.primary` empty.
  if (hasAnyFile(logosDir)) {
    const adopted = adoptExistingLogos(logosDir, logo);
    if (adopted.changed) return adopted;
    // Files exist but none look like usable marks — fall through and try the
    // network harvest below as a last resort.
  }
  let harvested: FallbackLogo[] = [];
  try {
    harvested = await harvestFallbackLogos(siteUrl, logosDir);
  } catch {
    harvested = [];
  }
  const primary = harvested[0];
  if (!primary) return { changed: false };
  logo.primary = primary.rel;
  logo.alternates = harvested.slice(1).map((l) => l.rel);
  if (!logo.notes) logo.notes = 'Auto-fetched site icon (no logo markup was saved during extraction).';
  return { changed: true };
}

/** Extension priority for ranking on-disk logo files: vector/transparent marks
 *  before raster, raster before icons. Mirrors `resolveBrandLogoPath`. */
const LOGO_EXT_PRIORITY = ['.svg', '.png', '.webp', '.jpg', '.jpeg', '.gif', '.ico'];
const LOGO_FILE_RE = /\.(svg|png|webp|jpe?g|gif|ico)$/i;

function logoExtRank(name: string): number {
  const i = LOGO_EXT_PRIORITY.indexOf(path.extname(name).toLowerCase());
  return i === -1 ? LOGO_EXT_PRIORITY.length : i;
}

/**
 * Wire the image files already present in `logosDir` into an empty `logo` slot:
 * the best mark (by extension priority, then name) becomes `logo.primary` and
 * the rest become `logo.alternates`, each as a `logos/<file>` path relative to
 * the dir owner. No-op when `logo.primary` is set or the dir holds no image
 * files. Mutates and returns the slot. Pure filesystem — never touches the
 * network.
 */
export function adoptExistingLogos(logosDir: string, logo: LogoSlot): { changed: boolean } {
  if (logo.primary) return { changed: false };
  let names: string[];
  try {
    names = fs.readdirSync(logosDir);
  } catch {
    return { changed: false };
  }
  const ranked = names
    .filter((n) => LOGO_FILE_RE.test(n) && isFileIn(logosDir, n))
    .sort((a, b) => logoExtRank(a) - logoExtRank(b) || a.localeCompare(b));
  if (ranked.length === 0) return { changed: false };
  const rels = ranked.map((n) => `logos/${n}`);
  logo.primary = rels[0] ?? null;
  // Keep any alternates the agent already declared, then append the on-disk
  // files, de-duped and excluding whatever became the primary.
  const merged = [...logo.alternates, ...rels.slice(1)];
  logo.alternates = Array.from(new Set(merged)).filter((rel) => rel !== logo.primary);
  if (!logo.notes) logo.notes = 'Logo files saved during extraction.';
  return { changed: true };
}

function isFileIn(dir: string, name: string): boolean {
  try {
    return fs.statSync(path.join(dir, name)).isFile();
  } catch {
    return false;
  }
}

function hasAnyFile(dir: string): boolean {
  try {
    return fs.readdirSync(dir).some((n) => {
      try {
        return fs.statSync(path.join(dir, n)).isFile();
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}
