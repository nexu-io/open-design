// @ts-nocheck
/**
 * artifacts/_shared — the bits every artifact (or 2+ of them) needs: the HTML
 * document shell, the brand-font resolver, the derived-copy helpers (tagline /
 * blurb / pillars / feature & FAQ & pricing copy) and a couple of small markup
 * helpers (wordmark / inverse button / section head). Kept pure: every export
 * is a deterministic `(brand, …) -> string` with no network / Date / random.
 */

import {
  pricingCard,
  KIT_CSS,
} from "../kit.js";
import type { Brand } from "../../schema.js";
import { type DesignTokens, varRef, flattenTokens } from "../types.js";

// ─────────────────────────── small html helpers ─────────────────────────────

/** Minimal HTML-escape for text injected into markup / attributes. */
export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Build the inlined `:root { --brand-*: … }` style block from the tokens. */
export function rootVars(tokens: DesignTokens): string {
  const lines = flattenTokens(tokens)
    .map((d) => `      ${d.name}: ${d.value};`)
    .join("\n");
  return `:root {\n${lines}\n    }`;
}

// ─────────────────────────── brand fonts ────────────────────────────────────

/**
 * Resolve the brand's web fonts into ready-to-inline `<link>` tags plus a
 * display-face font stack. Used by every artifact document and (via build.ts)
 * by the kit showcase, so headings actually render in the brand's typeface.
 */
export function brandFontAssets(brand: Brand): { links: string; displayFamily: string } {
  const urls = [
    brand.typography?.display?.googleFontsUrl,
    brand.typography?.body?.googleFontsUrl,
    brand.typography?.mono?.googleFontsUrl,
  ].filter((u): u is string => Boolean(u && /^https:\/\//.test(u)));
  const unique = [...new Set(urls)];

  const links = unique.length
    ? [
        `<link rel="preconnect" href="https://fonts.googleapis.com" />`,
        `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />`,
        ...unique.map((u) => `<link rel="stylesheet" href="${esc(u)}" />`),
      ].join("\n    ")
    : "";

  const quote = (f: string) => (/[^a-zA-Z0-9-]/.test(f) ? `'${f.replace(/'/g, "")}'` : f);
  const families = [
    brand.typography?.display?.family,
    ...(brand.typography?.display?.fallbacks ?? []),
  ].filter((f): f is string => Boolean(f && f.trim()));
  const displayFamily = families.length
    ? [...new Set(families)].map(quote).join(", ") + ", " + varRef("fontFamily")
    : varRef("fontFamily");

  return { links, displayFamily };
}

// ─────────────────────────── document shell ─────────────────────────────────

/**
 * Wrap a body in a complete HTML document. The base page styles only reference
 * `--brand-*` vars so the whole artifact restyles when the tokens change.
 * Headings pick up the brand's display face via `--display-family`.
 */
export function document(opts: {
  title: string;
  tokens: DesignTokens;
  brand: Brand;
  body: string;
  css?: string;
  script?: string;
}): string {
  const { title, tokens, brand, body } = opts;
  const fonts = brandFontAssets(brand);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    ${fonts.links}
    <style>
    ${rootVars(tokens)}
      :root { --display-family: ${fonts.displayFamily}; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body {
        font-family: ${varRef("fontFamily")};
        font-size: ${varRef("fontSize")};
        line-height: ${varRef("lineHeight")};
        color: ${varRef("colorText")};
        background: ${varRef("colorBgLayout")};
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
      }
      a { color: ${varRef("colorLink")}; text-decoration: none; }
      h1, h2, h3, h4 {
        margin: 0;
        font-family: var(--display-family);
        line-height: ${varRef("lineHeightHeading")};
        font-weight: ${varRef("fontWeightStrong")};
        color: ${varRef("colorText")};
        overflow-wrap: break-word;
      }
      p { margin: 0; overflow-wrap: break-word; }
      img, svg { max-width: 100%; display: block; }
      .wrap { max-width: 1120px; margin: 0 auto; padding-left: clamp(20px, 4vw, 40px); padding-right: clamp(20px, 4vw, 40px); }
      .kicker {
        display: block;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        font-size: ${varRef("fontSizeSM")};
        font-weight: ${varRef("fontWeightStrong")};
        color: ${varRef("colorPrimary")};
        margin-bottom: ${varRef("sizeSM")};
      }
      .clamp-2, .clamp-3 { display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; }
      .clamp-2 { -webkit-line-clamp: 2; }
      .clamp-3 { -webkit-line-clamp: 3; }
      ${KIT_CSS}
      ${opts.css ?? ""}
    </style>
  </head>
  <body>
${body}
${opts.script ? `    <script>${opts.script}</script>` : ""}
  </body>
</html>`;
}

// ─────────────────────────── derived copy helpers ───────────────────────────

export const fallbackTagline = "Built from your brand, in one command.";

export function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function brandTagline(brand: Brand): string {
  return brand.tagline?.trim() || brand.voice.messagingPillars[0] || fallbackTagline;
}

export function brandBlurb(brand: Brand): string {
  return (
    brand.description?.trim() ||
    brand.voice.tone?.trim() ||
    `${brand.name} — a brand system derived from a single source.`
  );
}

export function sourceHost(brand: Brand): string {
  try {
    return new URL(brand.sourceUrl).host || brand.name.toLowerCase();
  } catch {
    return brand.sourceUrl?.trim() || brand.name.toLowerCase();
  }
}

export function pillarList(brand: Brand): string[] {
  return brand.voice.messagingPillars.map((p) => p.trim()).filter(Boolean);
}

/**
 * Pillars are often written as "Title — longer explanation" (or with ":" / "·").
 * Split on the first such separator so cards get a short title and a real body
 * instead of a truncated sentence as the title.
 */
export function splitPillar(pillar: string): { title: string; body?: string } {
  const m = pillar.match(/^(.{2,60}?)\s*(?:—|–|:|·)\s+(.{12,})$/);
  if (m) return { title: cap(m[1].trim()), body: cap(m[2].trim()) };
  return { title: cap(pillar) };
}

/** Short pillar labels (title part only) for checklists and tag rows. */
export function pillarTitles(brand: Brand): string[] {
  return pillarList(brand).map((p) => splitPillar(p).title);
}

export const FEATURE_FALLBACKS: Array<{ title: string; body: string }> = [
  { title: "Set up in minutes", body: "Connect your existing stack and go live without a migration project." },
  { title: "Designed for teams", body: "One shared source of truth, so everyone ships from the same page." },
  { title: "Fast by default", body: "Every interaction is tuned to feel instant, even at scale." },
  { title: "Secure from day one", body: "SSO, audit logs and granular permissions are built in, not bolted on." },
  { title: "Works where you work", body: "Integrates with the tools your team already relies on every day." },
  { title: "Insight you can act on", body: "Reporting that reads like a story, not a spreadsheet." },
];

/** Six feature blurbs: brand pillars first, quality fallbacks filling the rest. */
export function featureCards(brand: Brand): Array<{ title: string; body: string }> {
  const pillars = pillarList(brand);
  const adjectives = brand.voice.adjectives.map((a) => a.trim()).filter(Boolean);
  const out: Array<{ title: string; body: string }> = [];
  for (let i = 0; i < 6; i++) {
    if (pillars[i]) {
      const split = splitPillar(pillars[i]);
      const adj = adjectives[i % Math.max(1, adjectives.length)];
      out.push({
        title: split.title,
        body:
          split.body ??
          (adj
            ? `${cap(adj)} by design — and built into every surface ${brand.name} ships.`
            : FEATURE_FALLBACKS[i].body),
      });
    } else {
      out.push(FEATURE_FALLBACKS[i]);
    }
  }
  return out;
}

export function howSteps(brand: Brand): Array<{ title: string; body: string }> {
  return [
    { title: "Connect", body: `Point ${brand.name} at what you already have — no rebuild required.` },
    { title: "Make it yours", body: "Adjust the defaults until they fit the way your team works." },
    { title: "Launch", body: "Go live with confidence, then iterate from real feedback." },
  ];
}

export function faqItems(brand: Brand): Array<{ title: string; body: string }> {
  return [
    { title: `What is ${brand.name}?`, body: brandBlurb(brand) },
    {
      title: "How long does it take to get started?",
      body: "Most teams are up and running in under an hour. There is nothing to install and no migration to plan — connect, customize, launch.",
    },
    {
      title: "Can I try it before committing?",
      body: "Yes. Start on the free plan, invite your team, and upgrade only when you need more. No credit card required.",
    },
    {
      title: "How does pricing work?",
      body: "Plans scale with your team. Start free, move to Pro when you need unlimited usage, and talk to us about Enterprise for custom needs.",
    },
    {
      title: "What about security and privacy?",
      body: "Your data stays yours. Access is encrypted in transit and at rest, and granular permissions keep the right things with the right people.",
    },
  ];
}

export function pricingTiers(brand: Brand): Array<Parameters<typeof pricingCard>[0]> {
  const pillars = pillarTitles(brand);
  const named = (i: number, fallback: string) => pillars[i] ?? fallback;
  return [
    {
      plan: "Starter",
      price: "$0",
      period: "/ mo",
      blurb: "For trying things out.",
      features: ["Up to 3 projects", named(0, "Core features included"), "Community support"],
      cta: "Start for free",
    },
    {
      plan: "Pro",
      price: "$29",
      period: "/ mo",
      blurb: "For growing teams.",
      features: [
        "Unlimited projects",
        named(1, "Everything in Starter"),
        named(2, "Advanced controls"),
        "Priority support",
      ],
      cta: "Start free trial",
      highlighted: true,
    },
    {
      plan: "Enterprise",
      price: "Custom",
      blurb: "For organizations at scale.",
      features: ["SSO & audit logs", "Dedicated success manager", "Custom contracts & SLA"],
      cta: "Talk to sales",
    },
  ];
}

export function quoteCards(brand: Brand): Array<{ quote: string; name: string; role: string }> {
  const adj = brand.voice.adjectives.map((a) => a.trim()).filter(Boolean);
  const a0 = adj[0] ?? "polished";
  const a1 = adj[1] ?? "fast";
  return [
    {
      quote: `${brand.name} is the first tool in this space that actually feels ${a0}. It became part of our daily flow within a week.`,
      name: "Maya Chen",
      role: "Head of Design, Northwind",
    },
    {
      quote: `We were skeptical, then we shipped our first project ${a1 ? `— genuinely ${a1} — ` : ""}in a single afternoon. The team never looked back.`,
      name: "Jonas Weber",
      role: "Engineering Lead, Lumen Labs",
    },
    {
      quote: `The quality bar out of the box is what sold us. ${brandTagline(brand).replace(/\.$/, "")} is not just a slogan here.`,
      name: "Priya Natarajan",
      role: "Founder, Fieldnote",
    },
  ];
}

export function partnerNames(brand: Brand): string[] {
  const fromVocab = brand.voice.vocabulary.use.map((w) => w.trim()).filter((w) => w.length > 2);
  const fallbacks = ["Northwind", "Lumen Labs", "Fieldnote", "Arcadia", "Helios"];
  return [...fromVocab.slice(0, 2).map(cap), ...fallbacks].slice(0, 5);
}

export function statItems(): Array<{ value: string; label: string }> {
  return [
    { value: "10k+", label: "Teams onboard" },
    { value: "99.9%", label: "Uptime SLA" },
    { value: "4.9/5", label: "Average rating" },
    { value: "120+", label: "Integrations" },
  ];
}

/** A short logo wordmark — uses the brand name (the engine works text-only). */
export function wordmark(brand: Brand, opts?: { color?: string }): string {
  const color = opts?.color ?? varRef("colorText");
  return `<span style="font-family:var(--display-family);font-weight:${varRef(
    "fontWeightStrong",
  )};font-size:${varRef("fontSizeLG")};letter-spacing:-0.01em;color:${color};white-space:nowrap;">${esc(
    brand.name,
  )}</span>`;
}

/** Inverse (white) button for use on solid-primary surfaces. */
export function inverseButton(label: string): string {
  return `<a role="button" tabindex="0" style="display:inline-flex;align-items:center;justify-content:center;cursor:pointer;white-space:nowrap;user-select:none;font-family:${varRef(
    "fontFamily",
  )};font-weight:${varRef("fontWeightStrong")};line-height:1;text-decoration:none;height:${varRef(
    "controlHeightLG",
  )};padding:0 ${varRef("sizeLG")};font-size:${varRef("fontSizeLG")};border-radius:${varRef(
    "borderRadius",
  )};background:#fff;color:${varRef("colorPrimary")};border:none;">${esc(label)}</a>`;
}

export function sectionHead(kicker: string, title: string, lede?: string): string {
  return `<div class="section-head">
        <span class="kicker">${esc(kicker)}</span>
        <h2 style="font-size:clamp(26px, 3.2vw, 38px);letter-spacing:-0.015em;margin-bottom:${varRef(
          "sizeSM",
        )};">${esc(title)}</h2>
        ${lede ? `<p style="color:${varRef("colorTextSecondary")};font-size:${varRef("fontSizeLG")};">${esc(lede)}</p>` : ""}
      </div>`;
}

// ─────────────────────────── email footer (email + newsletter) ──────────────

export function emailFooter(brand: Brand): string {
  const link = (label: string) =>
    `<a href="#" style="color:${varRef("colorTextTertiary")};text-decoration:underline;">${esc(label)}</a>`;
  return `<div style="padding:${varRef("sizeLG")} ${varRef("sizeXL")};background:${varRef(
    "colorFillQuaternary",
  )};color:${varRef("colorTextTertiary")};font-size:${varRef("fontSizeSM")};border-top:${varRef(
    "lineWidth",
  )} solid ${varRef("colorBorderSecondary")};text-align:center;">
        <p style="margin-bottom:${varRef("sizeXS")};">You're receiving this because you follow ${esc(
          brand.name,
        )}.</p>
        <p>${link("View in browser")} &nbsp;&middot;&nbsp; ${link("Preferences")} &nbsp;&middot;&nbsp; ${link(
          "Unsubscribe",
        )}</p>
        <p style="margin-top:${varRef("sizeXS")};">&copy; ${esc(brand.name)} &middot; ${esc(
          sourceHost(brand),
        )}</p>
      </div>`;
}
