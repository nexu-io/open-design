// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import { chromeDumpDom, chromeScreenshot, findChrome } from "./chrome.js";
import { harvestFonts, type FontFile } from "./fonts.js";

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
  /** Path (relative to the brand dir) of a headless-Chrome page screenshot,
   *  captured when no logo could be downloaded — vision material for the
   *  synthesis agent. */
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

async function fetchText(
  url: string,
  cap: number,
  opts?: {
    /** Return the body of a non-2xx response too. Bot walls (Cloudflare…)
     *  serve their challenge page with a 403/503 — for the main page fetch
     *  that body is signal (it routes us into the blocked-mode pipeline),
     *  not an error. */
    allowHttpError?: boolean;
  },
): Promise<{ text: string; finalUrl: string; contentType: string; ok: boolean } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,text/css,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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
): Promise<{ buf: Buffer; contentType: string } | null> {
  const attempt = async (): Promise<{ buf: Buffer; contentType: string } | null> => {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Sec-Fetch-Dest": "image",
          "Sec-Fetch-Mode": "no-cors",
          "Sec-Fetch-Site": "cross-site",
          ...(referer ? { Referer: referer } : {}),
        },
        redirect: "follow",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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
const CHALLENGE_BODY_RE =
  /challenges\.cloudflare\.com|cf-browser-verification|_cf_chl_opt|cf-turnstile|this website uses a security service|enable javascript and cookies to continue|verify you are human|px-captcha|datadome|_incapsula_|EO_Bot_Ssid|__tst_status/i;

/** True when the HTML is a bot-protection interstitial (Cloudflare, DataDome,
 *  PerimeterX, …) rather than the real site. Harvesting one of these poisons
 *  every downstream field — "Just a moment…" becomes the brand name. */
export function isChallengePage(html: string): boolean {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
  if (CHALLENGE_TITLE_RE.test(title)) return true;
  return CHALLENGE_BODY_RE.test(html.slice(0, 60_000));
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

export function extractColors(css: string): ColorCandidate[] {
  const counts = new Map<string, number>();
  const re = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]{1,48}\)|hsla?\([^)]{1,48}\)|oklch\([^)]{1,64}\)/g;
  for (const m of css.matchAll(re)) {
    const norm = normalizeColor(m[0]) ?? m[0].trim().toLowerCase();
    counts.set(norm, (counts.get(norm) ?? 0) + 1);
  }
  const all = [...counts.entries()]
    .map(([hex, count]): ColorCandidate => {
      const isHex = hex.startsWith("#") && hex.length === 7;
      const extreme = isHex ? luma(hex) > 0.96 || luma(hex) < 0.04 : false;
      return extreme ? { hex, count, extreme } : { hex, count };
    })
    .sort((a, b) => b.count - a.count);
  // Chromatic colors first (capped), then a couple of extremes so the agent
  // still sees the site's actual black/white.
  const chromatic = all.filter((c) => !c.extreme).slice(0, 15);
  const extremes = all.filter((c) => c.extreme).slice(0, 4);
  return [...chromatic, ...extremes];
}

// ─── fonts ───────────────────────────────────────────────────────────

const GENERIC_FONTS = new Set([
  "sans-serif", "serif", "monospace", "system-ui", "ui-sans-serif", "ui-serif",
  "ui-monospace", "cursive", "fantasy", "inherit", "initial", "unset",
  "-apple-system", "blinkmacsystemfont", "segoe ui", "arial", "helvetica",
  "helvetica neue", "times new roman", "courier new", "emoji",
  "apple color emoji", "segoe ui emoji", "segoe ui symbol", "noto color emoji",
]);

export function extractFonts(css: string): { fonts: FontCandidate[]; fontFaceFamilies: string[] } {
  const counts = new Map<string, number>();
  for (const m of css.matchAll(/font-family\s*:\s*([^;}{!]+)/gi)) {
    // First non-generic family in the stack is the intended face.
    for (const partRaw of m[1].split(",")) {
      const part = partRaw.trim().replace(/^["']|["']$/g, "").trim();
      if (!part || part.startsWith("var(")) continue;
      if (GENERIC_FONTS.has(part.toLowerCase())) continue;
      counts.set(part, (counts.get(part) ?? 0) + 1);
      break;
    }
  }
  const fontFace = new Set<string>();
  for (const m of css.matchAll(/@font-face\s*{[^}]*font-family\s*:\s*["']?([^;"'}]+)/gi)) {
    fontFace.add(m[1].trim());
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
    lines.push(`- \`${c.hex}\` ×${c.count}${c.extreme ? " (near-white/black)" : ""}`);
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
  onProgress: PrefetchProgress = () => {},
): Promise<PrefetchResult | null> {
  onProgress("fetch", url);
  let page = await fetchText(url, HTML_CAP, { allowHttpError: true });
  // A non-2xx body is only useful when it's a bot-wall challenge page (it
  // routes into blocked mode below). A site's own 404/500 page is not the
  // brand — treat that as a failed fetch.
  if (page && !page.ok && !isChallengePage(page.text)) page = null;
  let html: string;
  let baseUrl: string;
  let renderedDom: string | null = null; // set once Chrome has rendered the page
  if (page && !isChallengePage(page.text)) {
    html = page.text;
    baseUrl = page.finalUrl;
  } else {
    // Plain fetch blocked or answered with a bot challenge → headless-Chrome
    // fallback (real browser fingerprint).
    onProgress(
      "chrome",
      page
        ? "bot challenge detected — rendering with headless Chrome"
        : "plain fetch blocked — rendering with headless Chrome",
    );
    renderedDom = await chromeDumpDom(url);
    if (renderedDom) {
      html = renderedDom.slice(0, HTML_CAP);
      baseUrl = page?.finalUrl ?? url;
    } else if (page) {
      // Challenge page and no Chrome render — keep going in blocked mode so
      // the favicon-service logo tier still runs; the page content itself is
      // discarded below.
      html = page.text;
      baseUrl = page.finalUrl;
    } else {
      return null;
    }
  }
  // Chrome can render a challenge page too (interactive Turnstile etc.) —
  // re-check the HTML we actually ended up with.
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
    for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) cssChunks.push(m[1]);
    for (const m of html.matchAll(/style=["']([^"']{1,2000})["']/gi)) cssChunks.push(m[1] + ";");

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
      cssLinks.slice(0, MAX_CSS_FILES).map((u) => fetchText(u, CSS_CAP)),
    );
    for (const r of cssResults) if (r) cssChunks.push(r.text);
    // Google Fonts CSS carries the canonical family names — fetch those too.
    const gfResults = await Promise.all(
      googleFontsUrls.slice(0, 2).map((u) => fetchText(u, CSS_CAP)),
    );
    for (const r of gfResults) if (r) cssChunks.push(r.text);
    allCss = cssChunks.join("\n");

    colors = extractColors(allCss);
    ({ fonts, fontFaceFamilies } = extractFonts(allCss));

    // CSS-in-JS rescue: a thin static harvest usually means styles are injected
    // at runtime. Render once with headless Chrome — the dumped DOM carries the
    // injected <style> tags and inline styles — and re-extract.
    if (colors.filter((c) => !c.extreme).length < 3 && !renderedDom && findChrome()) {
      onProgress("chrome", "thin static CSS — re-harvesting from the rendered DOM");
      renderedDom = await chromeDumpDom(baseUrl);
      if (renderedDom) {
        const domCss: string[] = [];
        for (const m of renderedDom.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) domCss.push(m[1]);
        for (const m of renderedDom.matchAll(/style=["']([^"']{1,2000})["']/gi)) domCss.push(m[1] + ";");
        if (domCss.length) {
          allCss = [allCss, ...domCss].join("\n");
          colors = extractColors(allCss);
          ({ fonts, fontFaceFamilies } = extractFonts(allCss));
        }
      }
    }
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
  // The rendered DOM sees lazily-injected header logos the raw HTML may miss.
  let refs = blocked ? [] : findLogoRefs(html, baseUrl);
  if (refs.length === 0 && renderedDom && !blocked) refs = findLogoRefs(renderedDom, baseUrl);
  for (const ref of refs) {
    if (logos.length >= MAX_LOGOS) break;
    const bin = await fetchBinary(ref.url, baseUrl);
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
  // Still nothing → grab a page screenshot instead; the synthesis agent Reads
  // it with vision to locate the logo and judge visual style. Pointless for a
  // challenge page — the screenshot would show the interstitial.
  const prefetchDir = path.join(brandDir, "prefetch");
  fs.mkdirSync(prefetchDir, { recursive: true });
  let screenshot: string | null = null;
  if (logos.length === 0 && !blocked && findChrome()) {
    onProgress("chrome", "no logo downloadable — capturing a page screenshot");
    const shotPath = path.join(prefetchDir, "screenshot.png");
    if (await chromeScreenshot(baseUrl, shotPath)) screenshot = "prefetch/screenshot.png";
  }
  onProgress("logos-done", `${logos.length} candidates${screenshot ? " + page screenshot" : ""}`);

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
    const extra = await fetchText(cand.url, HTML_CAP);
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
  fs.writeFileSync(path.join(prefetchDir, "page.html"), html.slice(0, HTML_CAP));
  fs.writeFileSync(path.join(prefetchDir, "page-preview.html"), previewablePrefetchHtml(html));
  fs.writeFileSync(path.join(prefetchDir, "styles.css"), allCss.slice(0, 2_000_000));

  return { ...partial, thin, materialMd };
}
