// @ts-nocheck
import fs from "node:fs";
import path from "node:path";

import type { Brand } from "./schema.js";
import { fetchExternalBrandAsset } from "./safe-fetch.js";

/**
 * Webfont self-hosting for a brand workspace.
 *
 * `harvestFonts` parses `@font-face` rules out of harvested CSS, downloads the
 * best source per face (woff2 preferred) into `<brandDir>/fonts/`, and keeps a
 * `fonts/manifest.json` + portable `fonts/fonts.css` in sync. The engine then
 * inlines matching `@font-face` rules into every system document (kit,
 * artifacts, index) so previews — and the exported .brandpack — render in the
 * brand's real typefaces instead of fallbacks.
 *
 * Two ingestion moments feed the same manifest:
 *  - prefetch time: faces declared by the site's own CSS (incl. Google Fonts
 *    stylesheets the page links);
 *  - enrichment time: `selfHostGoogleFonts` fetches the Google Fonts CSS the
 *    synthesis agent picked (real face or visual stand-in) so even brands
 *    behind bot walls ship with loadable font files.
 */

export type FontFile = {
  family: string;
  /** Raw CSS font-weight value — "400", "700", or a variable range "100 900". */
  weight: string;
  style: string;
  /** Filename inside the brand dir's fonts/ folder. */
  file: string;
  format: string;
  sourceUrl: string;
  bytes: number;
  unicodeRange?: string;
};

export type FontManifest = { format: "brand-fonts/1"; files: FontFile[] };

export type FontFaceRef = {
  family: string;
  weight: string;
  style: string;
  url: string;
  format: string;
  unicodeRange?: string;
};

const MAX_FONT_FILES = 16;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 12 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8_000;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** Icon/symbol faces are UI chrome, not brand typography. */
const ICON_FAMILY_RE = /icon|awesome|glyph|symbols|emoji|icomoon|fontello|pictogram/i;

const FORMAT_RANK: Record<string, number> = { woff2: 0, woff: 1, opentype: 2, truetype: 3 };

const FORMAT_EXT: Record<string, string> = {
  woff2: ".woff2",
  woff: ".woff",
  opentype: ".otf",
  truetype: ".ttf",
};

function formatFromUrl(url: string): string | null {
  const m = /\.(woff2|woff|otf|ttf)(?:[?#]|$)/i.exec(url);
  if (!m) return null;
  const ext = m[1].toLowerCase();
  return ext === "otf" ? "opentype" : ext === "ttf" ? "truetype" : ext;
}

/** Parse every usable @font-face rule out of a CSS blob. Pure. */
export function parseFontFaces(css: string, baseUrl: string): FontFaceRef[] {
  const out: FontFaceRef[] = [];
  for (const block of css.matchAll(/@font-face\s*\{([^}]+)\}/gi)) {
    const body = block[1];
    const family = /font-family\s*:\s*["']?([^;"'}]+?)["']?\s*(?:;|$)/i.exec(body)?.[1]?.trim();
    if (!family || ICON_FAMILY_RE.test(family)) continue;
    const weight = /font-weight\s*:\s*([^;}]+)/i.exec(body)?.[1]?.trim() ?? "400";
    const style = /font-style\s*:\s*([^;}]+)/i.exec(body)?.[1]?.trim() ?? "normal";
    const unicodeRange = /unicode-range\s*:\s*([^;}]+)/i.exec(body)?.[1]?.trim();
    if (!/src\s*:/i.test(body)) continue;

    // Collect every url(...) [format(...)] pair, pick the best-ranked format.
    // Scanned over the whole block body (url() only appears in src here)
    // because a naive `src: [^;]+` slice truncates `data:...;base64,` URIs.
    let best: { url: string; format: string; rank: number } | null = null;
    for (const m of body.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)(?:\s*format\(\s*["']?([^"')]+)["']?\s*\))?/gi)) {
      const rawUrl = m[1].trim();
      const fmt = (m[2]?.trim().toLowerCase() ?? formatFromUrl(rawUrl)) || null;
      if (!fmt || !(fmt in FORMAT_RANK)) continue;
      const rank = FORMAT_RANK[fmt];
      if (best && best.rank <= rank) continue;
      if (rawUrl.startsWith("data:")) {
        best = { url: rawUrl, format: fmt, rank };
        continue;
      }
      try {
        best = { url: new URL(rawUrl, baseUrl).href, format: fmt, rank };
      } catch {
        /* unresolvable url */
      }
    }
    if (!best) continue;
    out.push({ family, weight, style, url: best.url, format: best.format, unicodeRange });
  }
  return out;
}

/** True when a unicode-range covers basic latin (or none is declared). */
function coversLatin(range?: string): boolean {
  if (!range) return true;
  return /u\+0(?:0|1)?[0-9a-f]{2}\b|u\+0000/i.test(range);
}

function fontMagicOk(buf: Buffer, format: string): boolean {
  if (buf.length < 8) return false;
  const tag = buf.toString("latin1", 0, 4);
  if (format === "woff2") return tag === "wOF2";
  if (format === "woff") return tag === "wOFF";
  if (format === "opentype") return tag === "OTTO";
  if (format === "truetype") return buf.readUInt32BE(0) === 0x00010000 || tag === "true";
  return false;
}

async function fetchFont(url: string, referer?: string): Promise<Buffer | null> {
  if (url.startsWith("data:")) {
    const m = /^data:[^,;]*(;base64)?,([\s\S]*)$/.exec(url);
    if (!m) return null;
    try {
      return m[1] ? Buffer.from(m[2], "base64") : Buffer.from(decodeURIComponent(m[2]), "utf8");
    } catch {
      return null;
    }
  }
  try {
    const res = await fetchExternalBrandAsset(url, {
      headers: {
        "User-Agent": UA,
        Accept: "*/*",
        "Sec-Fetch-Dest": "font",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "cross-site",
        ...(referer ? { Referer: referer } : {}),
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_FILE_BYTES) return null;
    return buf;
  } catch {
    return null;
  }
}

function fontsDir(brandDir: string): string {
  return path.join(brandDir, "fonts");
}

export function readFontManifest(brandDir: string): FontFile[] {
  try {
    const m = JSON.parse(
      fs.readFileSync(path.join(fontsDir(brandDir), "manifest.json"), "utf8"),
    ) as FontManifest;
    return Array.isArray(m.files) ? m.files : [];
  } catch {
    return [];
  }
}

function faceKey(f: { family: string; weight: string; style: string }): string {
  return `${f.family.toLowerCase()}|${f.weight}|${f.style}`;
}

function fileSlug(family: string, weight: string, style: string): string {
  const fam = family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "font";
  const w = weight.replace(/\s+/g, "-");
  return `${fam}-${w}${style !== "normal" ? `-${style.replace(/[^a-z]/gi, "")}` : ""}`;
}

/** Re-emit @font-face rules for the manifest, urls prefixed by `urlPrefix`. */
export function fontFaceCss(files: FontFile[], urlPrefix: string): string {
  return files
    .map((f) =>
      [
        "@font-face {",
        `  font-family: "${f.family.replace(/"/g, "")}";`,
        `  src: url("${urlPrefix}${f.file}") format("${f.format}");`,
        `  font-weight: ${f.weight};`,
        `  font-style: ${f.style};`,
        ...(f.unicodeRange ? [`  unicode-range: ${f.unicodeRange};`] : []),
        "  font-display: swap;",
        "}",
      ].join("\n"),
    )
    .join("\n");
}

/** Inline self-hosted @font-face rules into a rendered HTML document. */
export function injectFontFaces(html: string, files: FontFile[], urlPrefix: string): string {
  if (files.length === 0) return html;
  const css = fontFaceCss(files, urlPrefix);
  const tag = `<style data-brand-fonts>\n${css}\n</style>`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}\n${tag}`);
  return tag + html;
}

function writeManifest(brandDir: string, files: FontFile[]): void {
  const dir = fontsDir(brandDir);
  fs.mkdirSync(dir, { recursive: true });
  const manifest: FontManifest = { format: "brand-fonts/1", files };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  // Portable stylesheet for external consumers (and the in-app aha page):
  // urls are relative to fonts/ itself.
  fs.writeFileSync(path.join(dir, "fonts.css"), fontFaceCss(files, "./") + "\n");
}

/**
 * Download the webfonts declared by `css` into `<brandDir>/fonts/` and merge
 * them into the manifest. Faces whose (family, weight, style) is already
 * self-hosted are skipped; icon fonts are dropped; for subsetted faces only
 * the latin slice is taken. Families in `preferFamilies` (the site's actually
 * *used* stacks) download first so caps cut the long tail, not the brand face.
 */
export async function harvestFonts(
  css: string,
  baseUrl: string,
  brandDir: string,
  opts?: { preferFamilies?: string[]; referer?: string },
): Promise<FontFile[]> {
  const existing = readFontManifest(brandDir);
  const seen = new Set(existing.map(faceKey));

  // One face per (family, weight, style): prefer the latin subset.
  const byKey = new Map<string, FontFaceRef>();
  for (const ref of parseFontFaces(css, baseUrl)) {
    const key = faceKey(ref);
    if (seen.has(key)) continue;
    const cur = byKey.get(key);
    if (!cur || (!coversLatin(cur.unicodeRange) && coversLatin(ref.unicodeRange))) {
      byKey.set(key, ref);
    }
  }

  const prefer = (opts?.preferFamilies ?? []).map((f) => f.toLowerCase());
  const rank = (ref: FontFaceRef) => {
    const i = prefer.indexOf(ref.family.toLowerCase());
    return i === -1 ? prefer.length : i;
  };
  const queue = [...byKey.values()].sort((a, b) => rank(a) - rank(b));

  let total = existing.reduce((n, f) => n + f.bytes, 0);
  const added: FontFile[] = [];
  for (const ref of queue) {
    if (existing.length + added.length >= MAX_FONT_FILES || total >= MAX_TOTAL_BYTES) break;
    const buf = await fetchFont(ref.url, opts?.referer ?? baseUrl);
    if (!buf || !fontMagicOk(buf, ref.format)) continue;
    if (total + buf.length > MAX_TOTAL_BYTES) continue;
    const ext = FORMAT_EXT[ref.format] ?? ".woff2";
    let file = `${fileSlug(ref.family, ref.weight, ref.style)}${ext}`;
    // Same key can't collide (deduped above), but a slugged name still can.
    if (fs.existsSync(path.join(fontsDir(brandDir), file))) {
      file = `${fileSlug(ref.family, ref.weight, ref.style)}-${existing.length + added.length}${ext}`;
    }
    fs.mkdirSync(fontsDir(brandDir), { recursive: true });
    fs.writeFileSync(path.join(fontsDir(brandDir), file), buf);
    total += buf.length;
    added.push({
      family: ref.family,
      weight: ref.weight,
      style: ref.style,
      file,
      format: ref.format,
      sourceUrl: ref.url.startsWith("data:") ? "data:(inlined in site CSS)" : ref.url,
      bytes: buf.length,
      ...(ref.unicodeRange ? { unicodeRange: ref.unicodeRange } : {}),
    });
  }

  if (added.length === 0) return existing;
  const all = [...existing, ...added];
  writeManifest(brandDir, all);
  return all;
}

const GF_CSS_RE = /^https:\/\/fonts\.googleapis\.com\//i;

/**
 * Self-host the Google Fonts faces the synthesized brand declares
 * (`typography.*.googleFontsUrl`) — fetches each stylesheet with a modern-
 * browser UA (so Google serves woff2) and harvests the files into fonts/.
 * Families already in the manifest are skipped by the harvest's dedupe.
 */
export async function selfHostGoogleFonts(brand: Brand, brandDir: string): Promise<FontFile[]> {
  const specs = [brand.typography?.display, brand.typography?.body, brand.typography?.mono];
  const urls = [...new Set(specs.map((s) => s?.googleFontsUrl).filter((u): u is string => Boolean(u && GF_CSS_RE.test(u))))];
  if (urls.length === 0) return readFontManifest(brandDir);

  const families = specs.flatMap((s) => (s ? [s.family, ...(s.fallbacks ?? [])] : []));
  const chunks: string[] = [];
  for (const url of urls) {
    try {
      const res = await fetchExternalBrandAsset(url, {
        headers: { "User-Agent": UA, Accept: "text/css,*/*;q=0.1" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (res.ok) chunks.push(await res.text());
    } catch {
      /* unreachable stylesheet — skip */
    }
  }
  if (chunks.length === 0) return readFontManifest(brandDir);
  return harvestFonts(chunks.join("\n"), "https://fonts.gstatic.com/", brandDir, {
    preferFamilies: families,
  });
}
