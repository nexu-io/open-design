// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import { harvestFonts, type FontFile } from "./fonts.js";
import { fetchExternalBrandAsset } from "./safe-fetch.js";

/**
 * Deterministic brand-material prefetch. Given a site URL, fetch the HTML +
 * linked CSS server-side and harvest everything the synthesis agent needs:
 * ranked color candidates, font stacks, logo candidate files, and copy for
 * voice analysis. The output is a compact `material.md` digest that gets
 * inlined into a SINGLE agent prompt — the agent never needs WebFetch/Bash
 * in the happy path. This is what makes extraction take ~30s instead of the
 * 2–3 min multi-turn agent-driven flow in open-design.
 *
 * No headless browser, no cheerio — regex over HTML at this fidelity is
 * fine; the LLM downstream is tolerant of harvest noise.
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const HTML_CAP = 6_000_000; // Large SSR payloads can put megabytes of JSON before <body>.
const CSS_CAP = 400_000; // 400KB per file
const MAX_CSS_FILES = 6;
const MAX_LOGOS = 6;
const MAX_EXTRA_PAGES = 2;
const FETCH_TIMEOUT_MS = 8_000;

export type ColorCandidate = {
  /** Normalized lowercase hex (#rrggbb) when derivable, else raw value. */
  hex: string;
  /** Raw declarations folded into this candidate. */
  count: number;
  /** True for near-white / near-black — listed but de-prioritized. */
  extreme?: boolean;
  /** Compact evidence strings such as css-var:--accent, prop:background, logo-svg:mark.svg. */
  sources?: string[];
};

export type FontCandidate = { family: string; count: number };

export type LogoCandidate = {
  /** Filename inside the brand dir's logos/ folder. */
  file: string;
  sourceUrl: string;
  kind: "favicon" | "apple-touch-icon" | "og-image" | "header-img" | "inline-svg";
  bytes: number;
  contentType?: string;
};

export type PrefetchResult = {
  url: string;
  finalUrl: string;
  siteName: string;
  title: string;
  description: string;
  colors: ColorCandidate[];
  fonts: FontCandidate[];
  fontFaceFamilies: string[];
  googleFontsUrls: string[];
  /** Webfont files downloaded into the brand dir's fonts/ folder. */
  fontFiles: FontFile[];
  logos: LogoCandidate[];
  headings: string[];
  paragraphs: string[];
  navLabels: string[];
  extraPages: Array<{ url: string; title: string; text: string }>;
  /** Path (relative to the brand dir) of a page screenshot used as vision
   *  material for the synthesis agent. Always null server-side now that the
   *  headless-Chrome capture was removed (it could not be constrained to public
   *  hosts — SSRF). */
  screenshot: string | null;
  /** True when the harvest looks too thin to synthesize from (likely a
   *  bot-blocked or fully JS-rendered site). The synthesis prompt switches
   *  to "you may WebFetch once" mode. */
  thin: boolean;
  /** True when every fetch path returned an anti-bot challenge page
   *  (Cloudflare "Just a moment…" etc.). The challenge page's own content is
   *  DISCARDED — colors/fonts/copy stay empty rather than polluting the brand
   *  with the interstitial's text and palette. */
  blocked: boolean;
  materialMd: string;
};

export type PrefetchProgress = (step: string, detail?: string) => void;

/** Per-fetch deadline, also abortable by the caller's signal (a user Stop on the
 *  programmatic pass) so an in-flight request tears down promptly instead of
 *  running out its full timeout. */
function fetchDeadline(signal?: AbortSignal | null): AbortSignal {
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function throwIfPrefetchAborted(signal?: AbortSignal | null): void {
  if (!signal?.aborted) return;
  if (typeof signal.throwIfAborted === "function") signal.throwIfAborted();
  throw signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError");
}

async function fetchText(
  url: string,
  cap: number,
  opts?: {
    /** Return the body of a non-2xx response too. Bot walls (Cloudflare…)
     *  serve their challenge page with a 403/503 — for the main page fetch
     *  that body is signal (it routes us into the blocked-mode pipeline),
     *  not an error. */
    allowHttpError?: boolean;
    /** Caller cancellation (user Stop) layered onto the per-fetch timeout. */
    signal?: AbortSignal;
  },
): Promise<{ text: string; finalUrl: string; contentType: string; ok: boolean } | null> {
  try {
    const res = await fetchExternalBrandAsset(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,text/css,*/*" },
      signal: fetchDeadline(opts?.signal),
    });
    if (!res.ok && !opts?.allowHttpError) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      text: buf.subarray(0, cap).toString("utf8"),
      finalUrl: res.url || url,
      contentType: res.headers.get("content-type") ?? "",
      ok: res.ok,
    };
  } catch {
    return null;
  }
}

/**
 * Download an image. CDNs commonly hotlink-protect brand assets, so we send
 * the full browser-shaped header set (Referer to the page that embeds the
 * image + Sec-Fetch-* + image Accept) and retry once — that defeats most
 * referer checks without needing a real browser.
 */
async function fetchBinary(
  url: string,
  referer?: string,
  signal?: AbortSignal,
): Promise<{ buf: Buffer; contentType: string } | null> {
  const attempt = async (): Promise<{ buf: Buffer; contentType: string } | null> => {
    try {
      const res = await fetchExternalBrandAsset(url, {
        headers: {
          "User-Agent": UA,
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Sec-Fetch-Dest": "image",
          "Sec-Fetch-Mode": "no-cors",
          "Sec-Fetch-Site": "cross-site",
          ...(referer ? { Referer: referer } : {}),
        },
        signal: fetchDeadline(signal),
      });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > 5_000_000) return null;
      return { buf, contentType: res.headers.get("content-type") ?? "" };
    } catch {
      return null;
    }
  };
  const first = await attempt();
  if (first) return first;
  await new Promise((r) => setTimeout(r, 400));
  return attempt();
}

// ─── anti-bot challenge detection ────────────────────────────────────

const CHALLENGE_TITLE_RE =
  /just a moment|attention required|access denied|verifying you are human|checking your browser|security check|please verify|are you a robot|ddos[- ]guard|captcha/i;
// Markers that only ever appear on the interstitial itself — the legacy CF
// verification shell, the challenge opt blob, the "turn on JS and cookies"
// copy, the PerimeterX/Imperva/EdgeOne block-page resources. Their presence is
// proof the body IS the wall, never the real site.
const CHALLENGE_DEFINITIVE_RE =
  /cf-browser-verification|_cf_chl_opt|this website uses a security service|enable javascript and cookies to continue|verify you are human|px-captcha|_incapsula_|EO_Bot_Ssid|__tst_status/i;
// Markers a *real* page can legitimately carry: a Cloudflare Turnstile or
// DataDome widget embedded on a login / subscribe / comment surface. The
// Economist's homepage, for instance, still references challenges.cloudflare.com
// once you are past the wall. These count as a challenge ONLY when the page is
// otherwise content-sparse (a bare verification widget and little else).
const CHALLENGE_AMBIGUOUS_RE = /challenges\.cloudflare\.com|cf-turnstile|datadome/i;

/** A real interstitial is content-sparse: a verification widget and not much
 *  else. A real page that merely embeds an anti-bot widget still ships a full
 *  nav and body. Count the cheap structural signals a harvest feeds on — links,
 *  headings, paragraphs — to tell the two apart. */
function looksContentRich(html: string): boolean {
  const scan = html.slice(0, 400_000);
  const anchors = (scan.match(/<a\s[^>]*\bhref=/gi) ?? []).length;
  const headings = (scan.match(/<h[1-3][\s/>]/gi) ?? []).length;
  const paragraphs = (scan.match(/<p[\s/>]/gi) ?? []).length;
  return anchors >= 8 || headings >= 3 || (anchors >= 3 && paragraphs >= 3);
}

/** True when the HTML is a bot-protection interstitial (Cloudflare, DataDome,
 *  PerimeterX, …) rather than the real site. Harvesting one of these poisons
 *  every downstream field — "Just a moment…" becomes the brand name.
 *
 *  The check is deliberately asymmetric: a challenge *title* or a challenge-only
 *  body marker blocks unconditionally, but an embeddable widget marker
 *  (Turnstile / DataDome) blocks only when the page is also sparse. That
 *  asymmetry is what lets the in-app browser's post-wall DOM — a real,
 *  content-rich page that still references the widget — survive the harvest
 *  instead of being discarded as if it were the wall itself. */
export function isChallengePage(html: string): boolean {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
  if (CHALLENGE_TITLE_RE.test(title)) return true;
  const head = html.slice(0, 60_000);
  if (CHALLENGE_DEFINITIVE_RE.test(head)) return true;
  if (CHALLENGE_AMBIGUOUS_RE.test(head)) return !looksContentRich(html);
  return false;
}

export function previewablePrefetchHtml(html: string, cap = HTML_CAP): string {
  const out = html.slice(0, cap);
  if (/<body\b/i.test(out) || out.length < cap) return out;
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(out)?.[1] ?? "").trim();
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title || "Prefetch HTML truncated")}</title>`,
    "<style>",
    "body{font:14px/1.5 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;background:#fff;color:#202124}",
    "main{max-width:760px;margin:64px auto;padding:0 24px}",
    "h1{font-size:22px;margin:0 0 12px}",
    "p{margin:0 0 10px;color:#5f6368}",
    "code{background:#f1f3f4;border-radius:4px;padding:2px 4px;color:#202124}",
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    "<h1>Prefetch HTML was truncated before the page body.</h1>",
    `<p>The fetched document exceeded the ${cap.toLocaleString("en-US")} byte preview cap before <code>&lt;body&gt;</code> appeared.</p>`,
    "<p>Use <code>prefetch/material.md</code>, <code>prefetch/styles.css</code>, and saved brand assets for extraction evidence.</p>",
    "</main>",
    "</body>",
    "</html>",
  ].join("");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
}

// ─── colors ──────────────────────────────────────────────────────────

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function toHexPair(n: number): string {
  return clamp255(n).toString(16).padStart(2, "0");
}

/** Normalize a CSS color literal to #rrggbb. Returns null for unsupported
 *  syntaxes (oklch, var() refs, named colors) — those are counted raw. */
export function normalizeColor(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(v);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) {
      h = h.slice(0, 3).split("").map((c) => c + c).join("");
    } else if (h.length === 8) {
      h = h.slice(0, 6);
    } else if (h.length !== 6) {
      return null;
    }
    return `#${h}`;
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/.exec(v);
  if (rgb) {
    return `#${toHexPair(Number(rgb[1]))}${toHexPair(Number(rgb[2]))}${toHexPair(Number(rgb[3]))}`;
  }
  const hsl = /^hsla?\(\s*([\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%/.exec(v);
  if (hsl) {
    const [h, s, l] = [Number(hsl[1]) / 360, Number(hsl[2]) / 100, Number(hsl[3]) / 100];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue = (t: number) => {
      let x = t;
      if (x < 0) x += 1;
      if (x > 1) x -= 1;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    };
    return `#${toHexPair(hue(h + 1 / 3) * 255)}${toHexPair(hue(h) * 255)}${toHexPair(hue(h - 1 / 3) * 255)}`;
  }
  return null;
}

function luma(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function addColorCandidate(
  counts: Map<string, { count: number; sources: Set<string> }>,
  raw: string,
  source?: string,
  weight = 1,
): void {
  const norm = normalizeColor(raw) ?? raw.trim().toLowerCase();
  const existing = counts.get(norm) ?? { count: 0, sources: new Set<string>() };
  existing.count += weight;
  if (source) existing.sources.add(source);
  counts.set(norm, existing);
}

function colorSourceForMatch(css: string, index: number): string | undefined {
  const before = css.slice(Math.max(0, index - 900), index);
  const declStart = Math.max(before.lastIndexOf(';'), before.lastIndexOf('{'));
  const declaration = before.slice(declStart + 1);
  const prop = /([-\w]+)\s*:\s*[^:]*$/i.exec(declaration)?.[1]?.trim();

  const selectorStart = before.lastIndexOf('}');
  const blockStart = before.lastIndexOf('{');
  const selector =
    blockStart > selectorStart
      ? before.slice(selectorStart + 1, blockStart).replace(/\s+/g, ' ').trim().slice(-160)
      : '';

  const parts: string[] = [];
  if (prop) parts.push(prop.startsWith('--') ? `css-var:${prop}` : `prop:${prop}`);
  if (selector) parts.push(`selector:${selector}`);
  return parts.length ? parts.join(' ') : undefined;
}

function mergeColorCandidates(...groups: ColorCandidate[][]): ColorCandidate[] {
  const counts = new Map<string, { count: number; sources: Set<string>; extreme?: boolean }>();
  for (const group of groups) {
    for (const candidate of group) {
      const existing = counts.get(candidate.hex) ?? { count: 0, sources: new Set<string>() };
      existing.count += candidate.count;
      existing.extreme ||= candidate.extreme;
      for (const source of candidate.sources ?? []) existing.sources.add(source);
      counts.set(candidate.hex, existing);
    }
  }
  return sortColorCandidates(counts);
}

function hasHighSignalColorSource(candidate: ColorCandidate): boolean {
  const source = (candidate.sources ?? []).join(' ').toLowerCase();
  if (/logo-svg:/.test(source)) return true;
  return /css-var:--(?!token-|framer-)[-\w]*(?:brand|primary|accent|coral|mustard|olive|cta|action|highlight|link)/i.test(source);
}

function sortColorCandidates(
  counts: Map<string, { count: number; sources: Set<string>; extreme?: boolean }>,
): ColorCandidate[] {
  const all = [...counts.entries()]
    .map(([hex, value]): ColorCandidate => {
      const isHex = hex.startsWith("#") && hex.length === 7;
      const extreme = value.extreme ?? (isHex ? luma(hex) > 0.96 || luma(hex) < 0.04 : false);
      const sources = [...value.sources].slice(0, 12);
      return {
        hex,
        count: value.count,
        ...(extreme ? { extreme } : {}),
        ...(sources.length ? { sources } : {}),
      };
    })
    .sort((a, b) => b.count - a.count);
  // Keep high-signal brand evidence even when its literal appears only once or
  // twice. Then add the frequency-ranked chromatic set and a few extremes so
  // the agent still sees the site's actual black/white.
  const highSignal = all.filter((c) => !c.extreme && hasHighSignalColorSource(c)).slice(0, 8);
  const chromatic = all.filter((c) => !c.extreme).slice(0, 15);
  const extremes = all.filter((c) => c.extreme).slice(0, 4);
  const out: ColorCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of [...highSignal, ...chromatic, ...extremes]) {
    if (seen.has(candidate.hex)) continue;
    seen.add(candidate.hex);
    out.push(candidate);
  }
  return out;
}

export function extractColors(css: string): ColorCandidate[] {
  const counts = new Map<string, { count: number; sources: Set<string> }>();
  const re = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]{1,48}\)|hsla?\([^)]{1,48}\)|oklch\([^)]{1,64}\)/g;
  for (const m of css.matchAll(re)) {
    addColorCandidate(counts, m[0], colorSourceForMatch(css, m.index ?? 0));
  }
  return sortColorCandidates(counts);
}

function extractSvgLogoColors(svg: string, label: string): ColorCandidate[] {
  const counts = new Map<string, { count: number; sources: Set<string> }>();
  const addFromValue = (value: string) => {
    if (/^(none|currentcolor|transparent|inherit)$/i.test(value.trim())) return;
    const colorRe = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]{1,48}\)|hsla?\([^)]{1,48}\)|oklch\([^)]{1,64}\)/g;
    for (const match of value.matchAll(colorRe)) {
      addColorCandidate(counts, match[0], `logo-svg:${label}`, 18);
    }
  };
  for (const match of svg.matchAll(/(?:fill|stroke|stop-color|color)=["']([^"']+)["']/gi)) {
    addFromValue(match[1] ?? '');
  }
  for (const match of svg.matchAll(/style=["']([^"']+)["']/gi)) {
    addFromValue(match[1] ?? '');
  }
  return sortColorCandidates(counts);
}

function extractLogoSvgColorCandidates(logosDir: string, logos: LogoCandidate[]): ColorCandidate[] {
  const groups: ColorCandidate[][] = [];
  for (const logo of logos) {
    if (!/\.svg$/i.test(logo.file)) continue;
    try {
      const svg = fs.readFileSync(path.join(logosDir, logo.file), 'utf8');
      groups.push(extractSvgLogoColors(svg, logo.file));
    } catch {
      /* best-effort evidence only */
    }
  }
  return groups.length ? mergeColorCandidates(...groups) : [];
}

// ─── fonts ───────────────────────────────────────────────────────────

const GENERIC_FONTS = new Set([
  "sans-serif", "serif", "monospace", "system-ui", "ui-sans-serif", "ui-serif",
  "ui-monospace", "cursive", "fantasy", "inherit", "initial", "unset",
  "-apple-system", "blinkmacsystemfont", "segoe ui", "arial", "helvetica",
  "helvetica neue", "times new roman", "courier new", "emoji",
  "apple color emoji", "segoe ui emoji", "segoe ui symbol", "noto color emoji",
]);

function isIconFontFamily(family: string): boolean {
  return /\b(icon|icons|symbol|symbols|fontawesome|remix|material icons|material symbols|lucide)\b/i.test(family);
}

export function extractFonts(css: string): { fonts: FontCandidate[]; fontFaceFamilies: string[] } {
  const counts = new Map<string, number>();
  for (const m of css.matchAll(/font-family\s*:\s*([^;}{!]+)/gi)) {
    // First non-generic family in the stack is the intended face.
    for (const partRaw of m[1].split(",")) {
      const part = decodeEntities(partRaw).trim().replace(/^["']|["']$/g, "").trim();
      if (!part || part.startsWith("var(")) continue;
      if (part.includes('&quot') || /placeholder$/i.test(part)) continue;
      if (GENERIC_FONTS.has(part.toLowerCase())) continue;
      if (isIconFontFamily(part)) continue;
      counts.set(part, (counts.get(part) ?? 0) + 1);
      break;
    }
  }
  const fontFace = new Set<string>();
  for (const m of css.matchAll(/@font-face\s*{[^}]*font-family\s*:\s*["']?([^;"'}]+)/gi)) {
    const family = decodeEntities(m[1]).trim().replace(/^["']|["']$/g, "").trim();
    if (!family || /placeholder$/i.test(family) || isIconFontFamily(family)) continue;
    fontFace.add(family);
  }
  return {
    fonts: [...counts.entries()]
      .map(([family, count]) => ({ family, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    fontFaceFamilies: [...fontFace].slice(0, 10),
  };
}

// ─── html harvesting helpers ─────────────────────────────────────────

function matchAll1(html: string, re: RegExp): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(re)) {
    const t = stripTags(m[1]).trim();
    if (t) out.push(t);
  }
  return out;
}

function metaContent(html: string, nameOrProp: string): string {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${nameOrProp.replace(/[:.]/g, "\\$&")}["'][^>]*>`,
    "i",
  );
  const tag = re.exec(html)?.[0];
  if (!tag) return "";
  return decodeEntities(/content=["']([^"']*)["']/i.exec(tag)?.[1] ?? "");
}

function extFor(contentType: string, url: string): string {
  if (contentType.includes("svg")) return ".svg";
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("gif")) return ".gif";
  if (contentType.includes("icon") || contentType.includes("ico")) return ".ico";
  const m = /\.(svg|png|jpe?g|webp|gif|ico)(?:[?#]|$)/i.exec(url);
  return m ? `.${m[1].toLowerCase()}` : ".png";
}

/** Width/height of a PNG buffer (IHDR), or null when it isn't a PNG. */
function pngSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/**
 * Last-resort logo tier: public favicon services keyed by hostname. These
 * never touch the origin, so they work even when the site itself is behind
 * hotlink protection or a bot challenge. Google's service falls back to a
 * 16×16 generic globe for unknown domains — the PNG-dimension check rejects
 * that so a placeholder never becomes the brand mark.
 */
async function fetchServiceFavicons(host: string, logosDir: string): Promise<LogoCandidate[]> {
  const out: LogoCandidate[] = [];
  const services = [
    {
      url: `https://www.google.com/s2/favicons?domain=${host}&sz=256`,
      file: "service-google.png",
      accept: (buf: Buffer) => {
        const size = pngSize(buf);
        return size !== null && size.w >= 64 && size.h >= 64;
      },
    },
    {
      url: `https://icons.duckduckgo.com/ip3/${host}.ico`,
      file: "service-ddg.ico",
      accept: (buf: Buffer) => buf.length > 1_000,
    },
  ];
  for (const svc of services) {
    const bin = await fetchBinary(svc.url);
    if (!bin || !svc.accept(bin.buf)) continue;
    fs.writeFileSync(path.join(logosDir, svc.file), bin.buf);
    out.push({
      file: svc.file,
      sourceUrl: svc.url,
      kind: "favicon",
      bytes: bin.buf.length,
      contentType: bin.contentType,
    });
  }
  return out;
}

type LogoRef = { url: string; kind: LogoCandidate["kind"] };

export function findLogoRefs(html: string, baseUrl: string): LogoRef[] {
  const refs: LogoRef[] = [];
  const push = (href: string | undefined, kind: LogoCandidate["kind"]) => {
    if (!href || href.startsWith("data:")) return;
    try {
      refs.push({ url: new URL(decodeEntities(href), baseUrl).href, kind });
    } catch {
      /* unresolvable */
    }
  };

  for (const m of html.matchAll(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*>/gi)) {
    const href = /href=["']([^"']+)["']/i.exec(m[0])?.[1];
    const isApple = /apple-touch/i.test(m[0]);
    push(href, isApple ? "apple-touch-icon" : "favicon");
  }
  const og = metaContent(html, "og:image") || metaContent(html, "twitter:image");
  if (og) push(og, "og-image");

  // <img> inside <header>/<nav>, or anywhere with "logo" in src/alt/class.
  const headerHtml = (/<header[\s\S]{0,8000}?<\/header>/i.exec(html)?.[0] ?? "") +
    (/<nav[\s\S]{0,8000}?<\/nav>/i.exec(html)?.[0] ?? "");
  for (const m of (headerHtml + html).matchAll(/<img[^>]+>/gi)) {
    const tag = m[0];
    const src = /src=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!src) continue;
    const inHeader = headerHtml.includes(tag);
    const looksLogo = /logo/i.test(tag);
    if (inHeader || looksLogo) push(src, "header-img");
  }
  // Dedupe by URL, preserve order (favicon → og → header imgs).
  const seen = new Set<string>();
  return refs.filter((r) => !seen.has(r.url) && (seen.add(r.url), true));
}

/** First inline <svg> inside <header>/<nav> — very often the wordmark. */
export function extractInlineHeaderSvg(html: string): string | null {
  const header = /<header[\s\S]{0,12000}?<\/header>/i.exec(html)?.[0] ??
    /<nav[\s\S]{0,12000}?<\/nav>/i.exec(html)?.[0];
  if (!header) return null;
  const svg = /<svg[\s\S]{0,20000}?<\/svg>/i.exec(header)?.[0];
  if (!svg || svg.length < 80) return null;
  return svg.includes("xmlns")
    ? svg
    : svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
}

function extractNavLinks(html: string, baseUrl: string): Array<{ label: string; url: string }> {
  const out: Array<{ label: string; url: string }> = [];
  const scope = /<nav[\s\S]{0,12000}?<\/nav>/i.exec(html)?.[0] ?? html.slice(0, 30000);
  for (const m of scope.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const label = stripTags(m[2]);
    if (!label || label.length > 40) continue;
    try {
      out.push({ label, url: new URL(decodeEntities(m[1]), baseUrl).href });
    } catch {
      /* skip */
    }
  }
  return out.slice(0, 20);
}

function inlineStyleSelector(tagName: string, attrs: string): string {
  const tag = tagName.toLowerCase();
  const classAttr = /class=["']([^"']+)["']/i.exec(attrs)?.[1] ?? '';
  const classes = classAttr
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((name) => `.${name.replace(/[^\w-]/g, '')}`)
    .join('');
  const framerName = /data-framer-name=["']([^"']+)["']/i.exec(attrs)?.[1];
  const ariaLabel = /aria-label=["']([^"']+)["']/i.exec(attrs)?.[1];
  const role = /role=["']([^"']+)["']/i.exec(attrs)?.[1];
  const extras = [
    framerName ? `[data-framer-name="${framerName.replace(/["\\]/g, '')}"]` : '',
    ariaLabel ? `[aria-label="${ariaLabel.replace(/["\\]/g, '')}"]` : '',
    role ? `[role="${role.replace(/["\\]/g, '')}"]` : '',
    /\sdata-highlight=["']?true["']?/i.test(attrs) ? '[data-highlight="true"]' : '',
  ].join('');
  return `${tag}${classes}${extras}`.slice(0, 220) || tag;
}

// ─── material.md ─────────────────────────────────────────────────────

function buildMaterialMd(r: Omit<PrefetchResult, "materialMd" | "thin">): string {
  const lines: string[] = [];
  lines.push(`# Brand material — ${r.finalUrl}`, "");
  if (r.blocked) {
    lines.push(
      "⚠️ BLOCKED: the site answered every fetch with an anti-bot challenge page",
      "(Cloudflare or similar). The interstitial's own content was DISCARDED, so",
      "the sections below are empty or come from public favicon services — they",
      "do NOT describe the real site.",
      "",
    );
  }
  lines.push(`- site name: ${r.siteName || "(unknown)"}`);
  lines.push(`- title: ${r.title || "(none)"}`);
  lines.push(`- description: ${r.description || "(none)"}`, "");

  lines.push("## Measured colors (frequency-ranked from the site's actual CSS)", "");
  if (r.colors.length === 0) lines.push("(none found)");
  for (const c of r.colors) {
    const sources = c.sources?.length ? ` — ${c.sources.slice(0, 3).join("; ")}` : "";
    lines.push(`- \`${c.hex}\` ×${c.count}${c.extreme ? " (near-white/black)" : ""}${sources}`);
  }
  lines.push("");

  lines.push("## Measured fonts (frequency-ranked font-family declarations)", "");
  if (r.fonts.length === 0) lines.push("(none found)");
  for (const f of r.fonts) lines.push(`- ${f.family} ×${f.count}`);
  if (r.fontFaceFamilies.length) {
    lines.push("", `@font-face families: ${r.fontFaceFamilies.join(", ")}`);
  }
  if (r.googleFontsUrls.length) {
    lines.push("", `Google Fonts links: ${r.googleFontsUrls.join(" ")}`);
  }
  lines.push("");

  if (r.fontFiles.length) {
    lines.push("## Self-hosted webfonts (downloaded into ./fonts/)", "");
    for (const f of r.fontFiles) {
      lines.push(`- "${f.family}" ${f.weight} ${f.style} — fonts/${f.file} (${f.format}, ${f.bytes} bytes)`);
    }
    lines.push(
      "",
      "These font FILES are already saved locally. In brand.json, keep each",
      "typography `family` spelled EXACTLY as listed above so the self-hosted",
      "@font-face declarations apply to every generated asset.",
      "",
    );
  }

  lines.push("## Logo candidates (downloaded into ./logos/)", "");
  if (r.logos.length === 0) lines.push("(none downloadable)");
  for (const l of r.logos) {
    lines.push(`- logos/${l.file} — ${l.kind}, ${l.bytes} bytes, from ${l.sourceUrl}`);
  }
  if (r.screenshot) {
    lines.push(
      "",
      `A full-page screenshot was captured at \`${r.screenshot}\` — Read it with vision to locate the logo and judge the visual style.`,
    );
  }
  lines.push("");

  lines.push("## Copy harvested from the site (for voice & tone analysis)", "");
  if (r.headings.length) {
    lines.push("### Headings", "");
    for (const h of r.headings.slice(0, 20)) lines.push(`- ${h}`);
    lines.push("");
  }
  if (r.paragraphs.length) {
    lines.push("### Body copy", "");
    for (const p of r.paragraphs.slice(0, 10)) lines.push(`> ${p}`);
    lines.push("");
  }
  if (r.navLabels.length) lines.push(`### Nav labels`, "", r.navLabels.join(" · "), "");
  for (const page of r.extraPages) {
    lines.push(`### Extra page: ${page.title || page.url}`, "", page.text.slice(0, 1500), "");
  }
  return lines.join("\n");
}

// ─── main entry ──────────────────────────────────────────────────────

const EXTRA_PAGE_HINTS = /\/(about|company|pricing|product|features|story|mission)\b/i;

export async function prefetchBrand(
  url: string,
  brandDir: string,
  opts: { onProgress?: PrefetchProgress; signal?: AbortSignal } = {},
): Promise<PrefetchResult | null> {
  const onProgress = opts.onProgress ?? (() => {});
  const { signal } = opts;
  throwIfPrefetchAborted(signal);
  onProgress("fetch", url);
  let page = await fetchText(url, HTML_CAP, { allowHttpError: true, signal });
  throwIfPrefetchAborted(signal);
  // A non-2xx body is only useful when it's a bot-wall challenge page (it
  // routes into blocked mode below). A site's own 404/500 page is not the
  // brand — treat that as a failed fetch.
  if (page && !page.ok && !isChallengePage(page.text)) page = null;
  throwIfPrefetchAborted(signal);
  let html: string;
  let baseUrl: string;
  if (page && !isChallengePage(page.text)) {
    html = page.text;
    baseUrl = page.finalUrl;
  } else if (page) {
    // Bot-challenge page. The system-Chrome render fallback was removed (a
    // spawned browser can't be constrained to public hosts — SSRF), so keep
    // going in blocked mode: the favicon-service logo tier still runs and the
    // challenge content is discarded below. JS-heavy sites are rendered by the
    // in-app browser path (prefetchFromHtml), not here.
    html = page.text;
    baseUrl = page.finalUrl;
  } else {
    // Plain fetch blocked outright with nothing usable.
    return null;
  }
  return harvestFromHtml(html, baseUrl, brandDir, { url, onProgress, signal });
}

interface HarvestFromHtmlOptions {
  /** Original input URL recorded as `result.url`. */
  url: string;
  /** Extra CSS folded into the harvest before parsing (e.g. stylesheet text the
   *  web read out of the rendered browser page). */
  cssSeed?: string;
  onProgress?: PrefetchProgress;
  /** Caller cancellation (user Stop) threaded into the harvest's sub-fetches. */
  signal?: AbortSignal;
}

/** Turn page HTML (+ optional seed CSS) into a PrefetchResult: harvest colors,
 *  fonts, logos, and copy, self-host webfonts, and build the material digest.
 *  `prefetchBrand` feeds server-fetched HTML; `prefetchFromHtml`
 *  feeds the DOM the web read out of the unblocked in-app browser tab. */
async function harvestFromHtml(
  html: string,
  baseUrl: string,
  brandDir: string,
  opts: HarvestFromHtmlOptions,
): Promise<PrefetchResult> {
  const { url, signal } = opts;
  const onProgress: PrefetchProgress = opts.onProgress ?? (() => {});
  throwIfPrefetchAborted(signal);
  // Re-check the HTML we actually ended up with (a challenge page can slip
  // through when the caller supplies pre-rendered DOM).
  const blocked = isChallengePage(html);
  if (blocked) {
    onProgress("blocked", "anti-bot challenge page — discarding its content from the harvest");
  }

  // ── CSS: linked stylesheets + inline <style> + style="" attributes ──
  // A challenge page's palette/fonts belong to Cloudflare, not the brand —
  // skip the whole stage so nothing of it leaks into the measured material.
  let allCss = "";
  let colors: ColorCandidate[] = [];
  let fonts: FontCandidate[] = [];
  let fontFaceFamilies: string[] = [];
  const googleFontsUrls: string[] = [];
  if (!blocked) {
    onProgress("css");
    const cssChunks: string[] = [];
    if (opts.cssSeed && opts.cssSeed.trim()) cssChunks.push(opts.cssSeed);
    for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) cssChunks.push(m[1]);
    for (const m of html.matchAll(/<([a-z][\w:-]*)([^>]{0,2000}?)\sstyle=["']([^"']{1,2000})["'][^>]*>/gi)) {
      cssChunks.push(`${inlineStyleSelector(m[1], m[2] ?? '')}{${m[3]};}`);
    }

    const cssLinks: string[] = [];
    for (const m of html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>|<link[^>]+href=["'][^"']+["'][^>]+rel=["']stylesheet["'][^>]*>/gi)) {
      const href = /href=["']([^"']+)["']/i.exec(m[0])?.[1];
      if (!href) continue;
      try {
        const abs = new URL(decodeEntities(href), baseUrl).href;
        if (/fonts\.googleapis\.com/.test(abs)) googleFontsUrls.push(abs);
        else cssLinks.push(abs);
      } catch {
        /* skip */
      }
    }
    const cssResults = await Promise.all(
      cssLinks.slice(0, MAX_CSS_FILES).map((u) => fetchText(u, CSS_CAP, { signal })),
    );
    for (const r of cssResults) if (r) cssChunks.push(r.text);
    // Google Fonts CSS carries the canonical family names — fetch those too.
    const gfResults = await Promise.all(
      googleFontsUrls.slice(0, 2).map((u) => fetchText(u, CSS_CAP, { signal })),
    );
    for (const r of gfResults) if (r) cssChunks.push(r.text);
    allCss = cssChunks.join("\n");

    colors = extractColors(allCss);
    ({ fonts, fontFaceFamilies } = extractFonts(allCss));
  }
  onProgress("styles", `${colors.length} colors, ${fonts.length} fonts`);

  // ── webfont files ──
  // Self-host the faces the site's CSS declares (origin-hosted and Google
  // Fonts alike) so previews and the exported .brandpack render in the real
  // typefaces. The used-stack families download first; caps cut the tail.
  let fontFiles: FontFile[] = [];
  if (!blocked && allCss) {
    onProgress("fonts");
    try {
      fontFiles = await harvestFonts(allCss, baseUrl, brandDir, {
        preferFamilies: [...fonts.map((f) => f.family), ...fontFaceFamilies],
      });
    } catch {
      /* font harvest is best-effort */
    }
    onProgress("fonts-done", `${fontFiles.length} font files`);
  }

  // ── logos ──
  onProgress("logos");
  const logosDir = path.join(brandDir, "logos");
  fs.mkdirSync(logosDir, { recursive: true });
  const logos: LogoCandidate[] = [];
  // A challenge page's markup only references Cloudflare assets — never
  // harvest logo refs from it.
  const inlineSvg = blocked ? null : extractInlineHeaderSvg(html);
  if (inlineSvg) {
    fs.writeFileSync(path.join(logosDir, "header-inline.svg"), inlineSvg);
    logos.push({
      file: "header-inline.svg",
      sourceUrl: baseUrl,
      kind: "inline-svg",
      bytes: Buffer.byteLength(inlineSvg),
      contentType: "image/svg+xml",
    });
  }
  const refs = blocked ? [] : findLogoRefs(html, baseUrl);
  for (const ref of refs) {
    if (logos.length >= MAX_LOGOS) break;
    const bin = await fetchBinary(ref.url, baseUrl, signal);
    if (!bin) continue;
    const file = `${ref.kind}-${logos.length}${extFor(bin.contentType, ref.url)}`;
    fs.writeFileSync(path.join(logosDir, file), bin.buf);
    logos.push({
      file,
      sourceUrl: ref.url,
      kind: ref.kind,
      bytes: bin.buf.length,
      contentType: bin.contentType,
    });
  }
  // Origin yielded nothing (challenge page, hotlink-protected CDN, no marks
  // in the markup) → public favicon services, keyed by hostname only.
  if (logos.length === 0) {
    onProgress("logos", "origin logos unavailable — trying public favicon services");
    try {
      logos.push(...(await fetchServiceFavicons(new URL(baseUrl).hostname, logosDir)));
    } catch {
      /* unparseable baseUrl — skip the service tier */
    }
  }
  if (!blocked && logos.length > 0) {
    const logoColors = extractLogoSvgColorCandidates(logosDir, logos);
    if (logoColors.length > 0) colors = mergeColorCandidates(colors, logoColors);
  }
  const prefetchDir = path.join(brandDir, "prefetch");
  fs.mkdirSync(prefetchDir, { recursive: true });
  // The page-screenshot fallback relied on spawning system Chrome, which was
  // removed (it could not be constrained to public hosts — SSRF), so no
  // screenshot is captured on the server side.
  const screenshot: string | null = null;
  onProgress("logos-done", `${logos.length} candidates`);

  // ── copy ──
  // Challenge-page copy ("Just a moment…", "performing security verification")
  // must never become the brand's name/tagline/voice — leave it all empty.
  const title = blocked
    ? ""
    : decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").trim();
  const description = blocked
    ? ""
    : metaContent(html, "description") || metaContent(html, "og:description");
  const siteName = blocked ? "" : metaContent(html, "og:site_name") || metaContent(html, "og:title");
  const headings = blocked
    ? []
    : [
        ...matchAll1(html, /<h1[^>]*>([\s\S]*?)<\/h1>/gi),
        ...matchAll1(html, /<h2[^>]*>([\s\S]*?)<\/h2>/gi),
        ...matchAll1(html, /<h3[^>]*>([\s\S]*?)<\/h3>/gi),
      ];
  const paragraphs = blocked
    ? []
    : matchAll1(html, /<p[^>]*>([\s\S]*?)<\/p>/gi)
        .filter((p) => p.length > 40)
        .slice(0, 12);
  const navLinks = blocked ? [] : extractNavLinks(html, baseUrl);
  const navLabels = navLinks.map((l) => l.label);

  // ── extra pages for voice ──
  const extraPages: PrefetchResult["extraPages"] = [];
  const sameHost = (u: string) => {
    try {
      return new URL(u).host === new URL(baseUrl).host;
    } catch {
      return false;
    }
  };
  const candidates = navLinks.filter((l) => sameHost(l.url) && EXTRA_PAGE_HINTS.test(l.url));
  for (const cand of candidates.slice(0, MAX_EXTRA_PAGES)) {
    onProgress("extra-page", cand.url);
    const extra = await fetchText(cand.url, HTML_CAP, { signal });
    if (!extra) continue;
    const t = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(extra.text)?.[1] ?? "").trim();
    const text = [
      ...matchAll1(extra.text, /<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi),
      ...matchAll1(extra.text, /<p[^>]*>([\s\S]*?)<\/p>/gi).filter((p) => p.length > 40),
    ]
      .join("\n")
      .slice(0, 2000);
    if (text) extraPages.push({ url: cand.url, title: t, text });
  }

  const partial = {
    url,
    finalUrl: baseUrl,
    siteName,
    title,
    description,
    colors,
    fonts,
    fontFaceFamilies,
    googleFontsUrls,
    fontFiles,
    logos,
    headings,
    paragraphs,
    navLabels,
    extraPages,
    screenshot,
    blocked,
  };
  const thin =
    blocked ||
    colors.filter((c) => !c.extreme).length < 3 ||
    (headings.length === 0 && !description);
  const materialMd = buildMaterialMd(partial);

  // Persist raw material for the agent to Read deeper if it wants to.
  fs.writeFileSync(path.join(prefetchDir, "material.md"), materialMd);
  fs.writeFileSync(path.join(prefetchDir, "page.html"), previewablePrefetchHtml(html));
  fs.writeFileSync(path.join(prefetchDir, "styles.css"), allCss.slice(0, 2_000_000));

  return { ...partial, thin, materialMd };
}

/** Harvest a brand from HTML the web already rendered (e.g. the in-app browser
 *  tab after the user cleared an anti-bot wall) instead of fetching it. Skips
 *  main-page network fetching; logo/webfont
 *  downloads still run best-effort against `baseUrl`. Returns null on empty
 *  input. The provided `css` (stylesheet text + computed styles collected from
 *  the rendered page) is folded in alongside the inline `<style>` in `html`. */
export async function prefetchFromHtml(
  html: string,
  css: string,
  baseUrl: string,
  brandDir: string,
  onProgress: PrefetchProgress = () => {},
): Promise<PrefetchResult | null> {
  if (!html || !html.trim()) return null;
  let resolvedBase = baseUrl;
  try {
    resolvedBase = new URL(baseUrl).href;
  } catch {
    // Keep the raw string; downstream `new URL(..., baseUrl)` calls guard themselves.
  }
  return harvestFromHtml(html.slice(0, HTML_CAP), resolvedBase, brandDir, {
    url: baseUrl,
    cssSeed: css ?? "",
    onProgress,
  });
}
