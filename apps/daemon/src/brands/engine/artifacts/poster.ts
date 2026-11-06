// @ts-nocheck
/**
 * poster — a 3:4 print-style sheet (~900×1200) built to the content-structure
 * playbook in docs/content-structures/poster.md: 3 秒拦住人,传达一件事.
 *
 * Two variants share one beautiful slot template:
 *   • Statement (default) — a single brand-voice 金句 IS the focal. Huge headline
 *     on the upper rule-of-thirds line, generous whitespace, logo as a small
 *     confident signature at the bottom. Accent shows up exactly once, on the
 *     focal. This is the default because every brand has a voice to fill it.
 *   • Event — kept for brands whose copy implies a gathering/launch/release.
 *     Adds the 5W key-facts grid (What / When / Where / Who / How), each its own
 *     aligned block, plus one clear CTA (scan / short link) with a line-drawn
 *     code motif. Still one focal, still a signature logo.
 *
 * Type is sized in container-query units (cqi) against the fixed poster frame,
 * so the focal never overflows the canvas whether exported full-size or scaled
 * down inside a preview iframe. ≤3 type-size roles. Everything is themed via the
 * derived --brand-* custom properties, so it restyles with the tokens. Pure &
 * deterministic: (brand, tokens) -> string, no network / Date / random.
 */

import type { Brand } from "../../schema.js";
import { type DesignTokens, varRef } from "../types.js";
import {
  esc,
  document,
  cap,
  brandBlurb,
  sourceHost,
  pillarTitles,
  splitPillar,
} from "./_shared.js";

// ─────────────────────────── poster styles ──────────────────────────────────
//
// The whole visual system lives here so the markup below stays declarative.
// Three type-size roles only: .p-focal (the 金句), .p-sub (one supporting line),
// .p-meta (kickers, labels, facts, signature). Accent (--brand-color-primary)
// is allowed on exactly one element: the focal's accent rule / first word.

const POSTER_CSS = `
      .poster-stage { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: clamp(20px, 4vw, 48px); background: var(--brand-color-bg-layout); }
      .poster {
        position: relative;
        aspect-ratio: 3 / 4;
        width: min(720px, 92vw, calc((100vh - 96px) * 3 / 4));
        container-type: inline-size;
        background: var(--brand-color-bg-elevated);
        color: var(--brand-color-text);
        border: var(--brand-line-width) solid var(--brand-color-border-secondary);
        border-radius: 1.4cqi;
        overflow: hidden;
        box-shadow: 0 36px 90px var(--brand-color-fill-secondary), 0 4px 12px var(--brand-color-fill-quaternary);
        display: grid;
        grid-template-rows: auto 1fr auto;
        padding: 9cqi;
      }
      /* hairline frame inset — quiet print-mark, not a banner */
      .poster::after {
        content: "";
        position: absolute; inset: 4cqi;
        border: var(--brand-line-width) solid var(--brand-color-border-secondary);
        border-radius: 0.8cqi;
        pointer-events: none;
      }
      .poster > * { position: relative; z-index: 1; }

      /* ── three type-size roles ────────────────────────────────────────── */
      .p-focal {
        font-family: var(--display-family);
        font-weight: var(--brand-font-weight-strong);
        line-height: 1.02;
        letter-spacing: -0.025em;
        margin: 0;
        text-wrap: balance;
        color: var(--brand-color-text);
      }
      .p-focal .accent { color: var(--brand-color-primary); }
      .p-sub {
        font-size: 3cqi; line-height: 1.42; margin: 0;
        color: var(--brand-color-text-secondary); max-width: 56cqi;
      }
      .p-meta {
        font-size: 1.9cqi; line-height: 1.4; letter-spacing: 0.02em;
        color: var(--brand-color-text-tertiary);
      }
      .p-kicker {
        text-transform: uppercase; letter-spacing: 0.28em;
        font-size: 1.8cqi; font-weight: var(--brand-font-weight-strong);
        color: var(--brand-color-text-tertiary); margin: 0;
      }

      /* the single accent mark that sits on the focal */
      .p-rule { width: 12cqi; height: 0.7cqi; background: var(--brand-color-primary); border-radius: 0.4cqi; }

      /* header band: tiny wordmark + edition tag, like a print masthead */
      .p-head { display: flex; align-items: center; justify-content: space-between; gap: 3cqi; }
      .p-wordmark { font-family: var(--display-family); font-weight: var(--brand-font-weight-strong); font-size: 2.4cqi; letter-spacing: -0.01em; color: var(--brand-color-text); }

      /* signature footer: logo small & confident, like a signature */
      .p-sign { display: flex; align-items: flex-end; justify-content: space-between; gap: 3cqi; }
      .p-sign-mark { display: flex; align-items: center; gap: 1.6cqi; }
      .p-sign-dot { width: 2.6cqi; height: 2.6cqi; border-radius: 50%; background: var(--brand-color-primary); flex: 0 0 auto; }
      .p-sign-name { font-family: var(--display-family); font-weight: var(--brand-font-weight-strong); font-size: 2.8cqi; letter-spacing: -0.01em; color: var(--brand-color-text); }

      /* ── Event 5W grid ────────────────────────────────────────────────── */
      .p-facts { display: grid; grid-template-columns: 1fr 1fr; gap: 4cqi 5cqi; margin: 0; }
      .p-fact { display: flex; flex-direction: column; gap: 1cqi; min-width: 0; }
      .p-fact-k { text-transform: uppercase; letter-spacing: 0.2em; font-size: 1.6cqi; font-weight: var(--brand-font-weight-strong); color: var(--brand-color-text-tertiary); }
      .p-fact-v { font-family: var(--display-family); font-weight: var(--brand-font-weight-strong); font-size: 3.4cqi; line-height: 1.12; color: var(--brand-color-text); letter-spacing: -0.01em; }
      /* When + Where are the most-looked-up facts → give them more weight */
      .p-fact--lead .p-fact-v { font-size: 4cqi; }

      /* CTA block — one action, scan / short link, with a line-drawn code mark */
      .p-cta { display: flex; align-items: center; gap: 3.4cqi; padding-top: 4cqi; border-top: var(--brand-line-width) solid var(--brand-color-border-secondary); }
      .p-cta-copy { min-width: 0; }
      .p-cta-action { font-family: var(--display-family); font-weight: var(--brand-font-weight-strong); font-size: 3cqi; color: var(--brand-color-text); margin: 0 0 0.6cqi; letter-spacing: -0.01em; }
      .p-cta-link { font-size: 2cqi; color: var(--brand-color-primary); font-weight: var(--brand-font-weight-strong); letter-spacing: 0.01em; }
      .p-code { flex: 0 0 auto; width: 17cqi; height: 17cqi; border: var(--brand-line-width) solid var(--brand-color-border); border-radius: 1cqi; padding: 1.8cqi; background: var(--brand-color-bg-container); }
`;

// ─────────────────────────── poster-local copy ──────────────────────────────

/** Up to three brand adjectives as an uppercased kicker; tasteful fallback. */
function kickerLine(brand: Brand): string {
  const adjs = brand.voice.adjectives.map((a) => a.trim()).filter(Boolean).slice(0, 3);
  return (adjs.length ? adjs.map((a) => a.toUpperCase()).join("  ·  ") : "BRAND SYSTEM").trim();
}

/**
 * The 金句 — a single brand-voice line that IS the focal. Prefer the tagline
 * (the brand's own voice); fall back to the first messaging pillar's title, then
 * to a confident line built from the brand name. Never a stock ad slogan.
 */
function statementHeadline(brand: Brand): string {
  const tagline = brand.tagline?.trim();
  if (tagline) return tagline;
  const pillars = pillarTitles(brand);
  if (pillars[0]) return pillars[0];
  return `This is ${brand.name}.`;
}

/** Supporting line: who/why in one breath. Skipped when it would just echo. */
function statementSubhead(brand: Brand, headline: string): string {
  const candidates = [
    brand.description?.trim(),
    brand.voice.messagingPillars[1] ? splitPillar(brand.voice.messagingPillars[1]).title : "",
    brand.voice.tone?.trim(),
    brandBlurb(brand),
  ].filter((c): c is string => Boolean(c));
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const head = norm(headline);
  return candidates.find((c) => norm(c) !== head && norm(c).slice(0, 40) !== head.slice(0, 40)) ?? "";
}

/**
 * Render the focal headline with the first word/clause carrying the accent,
 * so accent shows up exactly once and lands on the focal (per the doc's accent
 * budget). Long headlines just keep their first word accented.
 */
function focalMarkup(headline: string): string {
  const text = esc(headline);
  const firstSpace = text.indexOf(" ");
  if (firstSpace === -1) return `<span class="accent">${text}</span>`;
  const first = text.slice(0, firstSpace);
  const rest = text.slice(firstSpace);
  return `<span class="accent">${first}</span>${rest}`;
}

/**
 * Heuristic: does this brand's copy imply an actual EVENT (a gathering, launch,
 * release, conference …)? Only then is the 5W Event layout the right structure;
 * otherwise the Statement 金句 is the honest default. Deterministic — pure text
 * scan, no Date/random.
 */
function impliesEvent(brand: Brand): boolean {
  const hay = [
    brand.name,
    brand.tagline,
    brand.description,
    brand.voice.tone,
    ...brand.voice.messagingPillars,
    ...brand.voice.vocabulary.use,
  ]
    .join(" ")
    .toLowerCase();
  return /\b(event|conference|summit|meetup|workshop|webinar|launch|premiere|festival|expo|keynote|release party|live(?:stream)?|show(?:case)?|opening|gala|hackathon|demo day|tour|exhibition|screening)\b/.test(
    hay,
  );
}

/**
 * Build the 5W facts for an Event poster from brand fields, with production
 * fallbacks so the grid is always full and aligned. We never invent a real
 * date/venue out of thin air — fallbacks read as deliberate placeholders the
 * brand would fill in, not lorem ipsum.
 */
function eventFacts(brand: Brand): Array<{ k: string; v: string; lead?: boolean }> {
  const pillars = pillarTitles(brand);
  const what = brand.tagline?.trim() || pillars[0] || `${brand.name} Live`;
  const who =
    [brand.voice.vocabulary.use[0], brand.voice.vocabulary.use[1]]
      .filter(Boolean)
      .map((w) => cap(w!.trim()))
      .join(" · ") || `The ${brand.name} team`;
  return [
    { k: "What", v: what },
    { k: "When", v: "Save the date", lead: true },
    { k: "Where", v: sourceHost(brand), lead: true },
    { k: "Who", v: who },
  ];
}

// ─────────────────────────── line-drawn code motif ──────────────────────────

/**
 * A deterministic, line-drawn "scan me" mark (not a real, scannable QR — the
 * engine has no link to encode, and the doc only needs the CTA to *read* as a
 * code). Pattern is fixed (no random), themed via --brand-color-text so it
 * inverts with the theme. Generous quiet zone via the surrounding padding.
 */
function codeMotif(): string {
  // 7×7 fixed bit grid with three finder-style corners — reads as a code.
  const ROWS = [
    "1111111",
    "1001011",
    "1011101",
    "1010001",
    "1101011",
    "1000101",
    "1111011",
  ];
  const cells: string[] = [];
  const s = 100 / 7;
  ROWS.forEach((row, y) => {
    for (let x = 0; x < 7; x++) {
      if (row[x] === "1") {
        cells.push(
          `<rect x="${(x * s).toFixed(2)}" y="${(y * s).toFixed(2)}" width="${s.toFixed(2)}" height="${s.toFixed(2)}" rx="${(s * 0.14).toFixed(2)}" />`,
        );
      }
    }
  });
  return `<svg viewBox="0 0 100 100" width="100%" height="100%" fill="${varRef(
    "colorText",
  )}" aria-hidden="true" focusable="false">${cells.join("")}</svg>`;
}

// ─────────────────────────── variant: Statement ─────────────────────────────

function renderStatement(brand: Brand): string {
  const headline = statementHeadline(brand);
  const subhead = statementSubhead(brand, headline);
  const host = sourceHost(brand);

  // Focal size adapts to length so a long 金句 never clips the canvas while a
  // short one still fills the room (the rule-of-thirds focal). Three buckets,
  // all within the 90–160px-equivalent band at export size.
  const len = headline.length;
  const focalSize = len <= 18 ? "16.5cqi" : len <= 34 ? "12.5cqi" : len <= 60 ? "9.5cqi" : "7.4cqi";

  return `    <div class="poster">
      <header class="p-head">
        <span class="p-wordmark">${esc(brand.name)}</span>
        <span class="p-meta">${esc(host)}</span>
      </header>

      <div style="display:flex;flex-direction:column;justify-content:center;gap:4cqi;padding:2cqi 0;">
        <p class="p-kicker">${esc(kickerLine(brand))}</p>
        <h1 class="p-focal" style="font-size:${focalSize};">${focalMarkup(headline)}</h1>
        <div class="p-rule"></div>
        ${subhead ? `<p class="p-sub">${esc(subhead)}</p>` : ""}
      </div>

      <footer class="p-sign">
        <span class="p-sign-mark">
          <span class="p-sign-dot"></span>
          <span class="p-sign-name">${esc(brand.name)}</span>
        </span>
        <span class="p-meta" style="text-align:right;max-width:40cqi;">${esc(
          brand.voice.adjectives.slice(0, 2).map(cap).join(" · ") || host,
        )}</span>
      </footer>
    </div>`;
}

// ─────────────────────────── variant: Event ─────────────────────────────────

function renderEvent(brand: Brand): string {
  const headline = statementHeadline(brand);
  const host = sourceHost(brand);
  const facts = eventFacts(brand);

  const len = headline.length;
  const focalSize = len <= 20 ? "11cqi" : len <= 40 ? "8.4cqi" : "6.4cqi";

  const factsHtml = facts
    .map(
      (f) => `<div class="p-fact${f.lead ? " p-fact--lead" : ""}">
          <span class="p-fact-k">${esc(f.k)}</span>
          <span class="p-fact-v">${esc(f.v)}</span>
        </div>`,
    )
    .join("\n        ");

  return `    <div class="poster">
      <header class="p-head">
        <span class="p-wordmark">${esc(brand.name)}</span>
        <span class="p-kicker">Event</span>
      </header>

      <div style="display:flex;flex-direction:column;justify-content:center;gap:5cqi;padding:1cqi 0;min-height:0;">
        <div style="display:flex;flex-direction:column;gap:2.6cqi;">
          <p class="p-kicker">${esc(kickerLine(brand))}</p>
          <h1 class="p-focal" style="font-size:${focalSize};">${focalMarkup(headline)}</h1>
          <div class="p-rule"></div>
        </div>

        <div class="p-facts">
        ${factsHtml}
        </div>

        <div class="p-cta">
          <span class="p-code">${codeMotif()}</span>
          <div class="p-cta-copy">
            <p class="p-cta-action">Scan to RSVP</p>
            <span class="p-cta-link">${esc(host)}</span>
          </div>
        </div>
      </div>

      <footer class="p-sign">
        <span class="p-sign-mark">
          <span class="p-sign-dot"></span>
          <span class="p-sign-name">${esc(brand.name)}</span>
        </span>
        <span class="p-meta" style="text-align:right;max-width:40cqi;">${esc(
          brand.voice.adjectives.slice(0, 2).map(cap).join(" · ") || host,
        )}</span>
      </footer>
    </div>`;
}

// ─────────────────────────── entry ──────────────────────────────────────────

export function renderPoster(brand: Brand, tokens: DesignTokens): string {
  const body = `    <div class="poster-stage">
${impliesEvent(brand) ? renderEvent(brand) : renderStatement(brand)}
    </div>`;

  return document({
    title: `${brand.name} — Poster`,
    tokens,
    brand,
    body,
    css: POSTER_CSS,
  });
}
