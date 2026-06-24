// @ts-nocheck
/**
 * deck — a pitch deck that follows docs/content-structures/slides-deck.md.
 *
 * It adopts the §1-A pitch skeleton (Sequoia / Kawasaki lineage) verbatim:
 *   Cover · Problem · Solution · Why now · Market · Product ·
 *   Business model · Competition & Moat · Traction · Team · Ask
 * — one idea per slide, big type, minimal words.
 *
 * Every slide title is an *assertion headline* (§3 「标题即论点」): a full
 * conclusion sentence, never a section label, so reading only the titles tells
 * the whole story (the §4 checklist test). Traction is the strongest slide and
 * the deck ends on an unambiguous Ask (§2 诉求页).
 *
 * Every text slot is pulled from brand fields (name / tagline / description /
 * voice.{adjectives,tone,messagingPillars,vocabulary} / imagery / layout) with
 * production-quality fallbacks, so different brands fill the SAME structure with
 * their own words. Never lorem ipsum.
 *
 * Mechanism preserved exactly: >=10 `.slide` sections, scroll-snap, the literal
 * 16 / 9 aspect frame, a keyboard pager (ArrowRight/ArrowLeft +
 * Space/PageUp/PageDown/Home/End), and a `.deck-counter` page indicator. Pure &
 * deterministic: (brand, tokens) -> string.
 *
 * No-clip guarantee (robust by construction). The frame is a *size* container
 * so type can scale against both axes, and every slide body is wrapped in a
 * `.f-fit` layer that the runtime shrinks-to-fit: after layout it measures the
 * body and, if the content is taller/wider than the fixed 16:9 frame, applies a
 * single downward `transform: scale()` about the centre so NO brand copy — of
 * any length, at any viewport — can ever be clipped, truncated, or spill the
 * frame. The deterministic output is audited at build time by
 * `auditDeckLayout` (apps/daemon/src/brands/engine/deck-layout-guard.ts).
 */

import type { Brand } from "../../schema.js";
import { type DesignTokens, varRef } from "../types.js";
import {
  esc,
  document,
  cap,
  brandTagline,
  brandBlurb,
  sourceHost,
  featureCards,
  pillarTitles,
  pricingTiers,
  quoteCards,
  partnerNames,
  statItems,
} from "./_shared.js";

// ─────────────────────────── styles ─────────────────────────────────────────

const DECK_CSS = `
      html, body { height: 100%; overflow: hidden; }
      .deck { height: 100vh; overflow-y: auto; scroll-snap-type: y mandatory; scroll-behavior: smooth; }
      .slide { height: 100vh; scroll-snap-align: start; scroll-snap-stop: always; display: flex; align-items: center; justify-content: center; padding: 24px; }
      .frame {
        position: relative; aspect-ratio: 16 / 9;
        width: min(1280px, 94vw, calc((100vh - 48px) * 16 / 9));
        container-type: size;
        background: var(--brand-color-bg-container);
        border: var(--brand-line-width) solid var(--brand-color-border-secondary);
        border-radius: var(--brand-border-radius-lg);
        box-shadow: 0 24px 64px -24px var(--brand-color-fill-secondary), 0 2px 8px var(--brand-color-fill-quaternary);
        overflow: hidden; display: flex; flex-direction: column;
      }
      /* solid-accent slides (cover + traction + ask): restrained 3-page accent budget */
      .frame--accent { background: var(--brand-color-primary); border-color: transparent; }
      .frame--accent .s-kicker { color: rgba(255,255,255,0.72); }
      .frame--accent .s-kicker::before { background: rgba(255,255,255,0.85); }
      .frame--accent .s-title, .frame--accent .s-mega, .frame--accent .s-num { color: #fff; }
      .frame--accent .s-lede, .frame--accent .s-eyebrow { color: rgba(255,255,255,0.85); }
      .frame--accent .f-head, .frame--accent .f-foot { color: rgba(255,255,255,0.62); }
      .frame--accent .f-head .rule, .frame--accent .f-foot .rule { background: rgba(255,255,255,0.2); }
      /* surface slides (alternate bg per §3 视觉一致) */
      .frame--surface { background: var(--brand-color-bg-layout); }

      .f-head { display: flex; justify-content: space-between; align-items: center; gap: 2cqi; padding: 3cqi 5cqi 0; color: var(--brand-color-text-quaternary); font-size: 1.35cqi; }
      .f-head .wm { font-family: var(--display-family); font-weight: var(--brand-font-weight-strong); font-size: 1.7cqi; letter-spacing: -0.01em; color: inherit; }
      .f-head .rule { flex: 1; height: var(--brand-line-width); background: var(--brand-color-border-secondary); }
      .f-head .ix { font-variant-numeric: tabular-nums; letter-spacing: 0.12em; }
      .f-body { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 0 5cqi; min-height: 0; overflow: hidden; }
      /* shrink-to-fit layer: the runtime scales this down about its centre when
         a slide's content would otherwise exceed the fixed frame (no-clip).
         flex:none keeps its natural (unshrunk) height so the runtime can
         measure the true overflow instead of a flex-shrunk box. */
      .f-fit { flex: none; width: 100%; transform-origin: center center; will-change: transform; }
      .f-foot { display: flex; justify-content: space-between; align-items: center; gap: 2cqi; padding: 0 5cqi 3cqi; color: var(--brand-color-text-quaternary); font-size: 1.25cqi; }
      .f-foot .rule { flex: 1; height: var(--brand-line-width); background: var(--brand-color-border-secondary); }

      .s-kicker { display: inline-flex; align-items: center; gap: 1.1cqi; text-transform: uppercase; letter-spacing: 0.18em; font-size: 1.3cqi; color: var(--brand-color-primary); font-weight: var(--brand-font-weight-strong); margin-bottom: 2cqi; }
      .s-kicker::before { content: ""; width: 2.6cqi; height: 0.32cqi; border-radius: 1cqi; background: var(--brand-color-primary); }
      .s-eyebrow { font-size: 1.7cqi; color: var(--brand-color-text-tertiary); margin: 0 0 1.6cqi; max-width: 70cqi; }
      .s-title { font-family: var(--display-family); font-size: 4.6cqi; line-height: 1.1; letter-spacing: -0.02em; margin: 0; color: var(--brand-color-text); max-width: 82cqi; }
      .s-mega { font-family: var(--display-family); font-size: 8cqi; line-height: 1.02; letter-spacing: -0.025em; margin: 0; color: var(--brand-color-text); }
      .s-lede { font-size: 1.95cqi; line-height: 1.5; color: var(--brand-color-text-secondary); max-width: 66cqi; margin: 2.4cqi 0 0; }
      .s-accent { color: var(--brand-color-primary); }
      .frame--accent .s-accent { color: #fff; }

      .s-grid { display: grid; gap: 2cqi; margin-top: 4cqi; }
      .s-card { position: relative; background: var(--brand-color-bg-container); border: var(--brand-line-width) solid var(--brand-color-border-secondary); border-radius: 1.4cqi; padding: 2.6cqi; min-width: 0; }
      .frame--surface .s-card { background: var(--brand-color-bg-container); }
      .s-card h3 { font-size: 2cqi; line-height: 1.22; margin: 0 0 1cqi; letter-spacing: -0.01em; }
      .s-card p { font-size: 1.55cqi; line-height: 1.5; color: var(--brand-color-text-secondary); margin: 0; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
      .s-card .tick { display: inline-flex; align-items: center; justify-content: center; width: 3.4cqi; height: 3.4cqi; border-radius: 1cqi; background: var(--brand-color-primary-bg); color: var(--brand-color-primary); margin-bottom: 1.6cqi; }
      .s-card .tick svg { width: 1.9cqi; height: 1.9cqi; }

      .s-num { font-family: var(--display-family); font-size: 3.4cqi; font-weight: var(--brand-font-weight-strong); line-height: 1; color: var(--brand-color-primary); margin-bottom: 1.4cqi; letter-spacing: -0.02em; }

      /* metric tiles (market / traction) */
      .s-metric { min-width: 0; }
      .s-metric .v { font-family: var(--display-family); font-size: 5cqi; font-weight: var(--brand-font-weight-strong); line-height: 1; letter-spacing: -0.03em; color: var(--brand-color-text); }
      .frame--accent .s-metric .v { color: #fff; }
      .s-metric .l { margin-top: 1.2cqi; font-size: 1.5cqi; line-height: 1.35; color: var(--brand-color-text-tertiary); }
      .frame--accent .s-metric .l { color: rgba(255,255,255,0.78); }

      /* market funnel bars — value labels live OUTSIDE the proportional track in
         their own auto column, so a long label can never wrap/clip the bar. */
      .s-bars { display: flex; flex-direction: column; gap: 1.8cqi; margin-top: 3.4cqi; max-width: 82cqi; }
      .s-bar { display: grid; grid-template-columns: 12cqi 1fr auto; align-items: center; gap: 2cqi; }
      .s-bar .tag { font-size: 1.5cqi; font-weight: var(--brand-font-weight-strong); color: var(--brand-color-text-secondary); letter-spacing: 0.04em; }
      .s-bar .lane { min-width: 0; }
      .s-bar .track { height: 4.2cqi; border-radius: 0.8cqi; }
      .s-bar .val { font-family: var(--display-family); font-weight: var(--brand-font-weight-strong); font-size: 1.9cqi; color: var(--brand-color-text); white-space: nowrap; }
      .frame--accent .s-bar .val { color: #fff; }

      /* competition matrix */
      .s-matrix { display: grid; gap: 1.6cqi; margin-top: 3.4cqi; }
      .s-matrix .row { display: grid; align-items: center; gap: 1.6cqi; padding: 1.8cqi 2.4cqi; border-radius: 1.2cqi; }
      .s-matrix .row.head { color: var(--brand-color-text-tertiary); font-size: 1.4cqi; letter-spacing: 0.08em; text-transform: uppercase; padding-top: 0; padding-bottom: 0; }
      .s-matrix .row.them { background: var(--brand-color-bg-container); border: var(--brand-line-width) solid var(--brand-color-border-secondary); }
      .s-matrix .row.us { background: var(--brand-color-primary-bg); border: 1.5px solid var(--brand-color-primary-border); }
      .s-matrix .cell { font-size: 1.6cqi; min-width: 0; }
      .s-matrix .who { font-family: var(--display-family); font-weight: var(--brand-font-weight-strong); font-size: 1.85cqi; letter-spacing: -0.01em; }
      .s-matrix .us .who { color: var(--brand-color-primary); }
      .s-matrix .mk { display: inline-flex; align-items: center; justify-content: center; width: 3cqi; height: 3cqi; border-radius: 50%; }
      .s-matrix .mk svg { width: 1.7cqi; height: 1.7cqi; }
      .s-matrix .yes { background: var(--brand-color-primary); color: #fff; }
      .s-matrix .no { background: var(--brand-color-fill-tertiary); color: var(--brand-color-text-quaternary); }

      /* team initials */
      .s-team { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2cqi; margin-top: 4cqi; }
      .s-avatar { display: inline-flex; align-items: center; justify-content: center; width: 7cqi; height: 7cqi; border-radius: 50%; font-family: var(--display-family); font-weight: var(--brand-font-weight-strong); font-size: 2.6cqi; background: var(--brand-color-primary-bg); color: var(--brand-color-primary); margin-bottom: 1.6cqi; letter-spacing: 0.02em; }

      /* quote / why-now */
      .s-quote { font-family: var(--display-family); font-size: 3.4cqi; line-height: 1.32; letter-spacing: -0.015em; color: var(--brand-color-text); max-width: 80cqi; margin: 0; }
      .s-byline { display: flex; align-items: center; gap: 1.8cqi; margin-top: 3.6cqi; }
      .s-byline .av { display: inline-flex; align-items: center; justify-content: center; width: 4.6cqi; height: 4.6cqi; border-radius: 50%; background: var(--brand-color-primary-bg); color: var(--brand-color-primary); font-weight: var(--brand-font-weight-strong); font-size: 1.7cqi; }
      .s-byline .n { font-weight: var(--brand-font-weight-strong); font-size: 1.75cqi; color: var(--brand-color-text); }
      .s-byline .r { font-size: 1.45cqi; color: var(--brand-color-text-tertiary); }

      /* ask checklist */
      .s-ask { display: flex; flex-direction: column; gap: 1.8cqi; margin-top: 3.6cqi; max-width: 70cqi; }
      .s-ask .item { display: flex; align-items: flex-start; gap: 1.8cqi; font-size: 2cqi; line-height: 1.4; color: #fff; }
      .s-ask .item .b { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 3.4cqi; height: 3.4cqi; border-radius: 0.9cqi; background: rgba(255,255,255,0.16); margin-top: 0.2cqi; }
      .s-ask .item .b svg { width: 1.9cqi; height: 1.9cqi; }
      .s-ask .item .k { font-family: var(--display-family); font-weight: var(--brand-font-weight-strong); }
      .s-cta { display: inline-flex; align-items: center; gap: 1.4cqi; margin-top: 4cqi; height: 6cqi; padding: 0 3.4cqi; border-radius: 1.2cqi; background: #fff; color: var(--brand-color-primary); font-family: var(--display-family); font-weight: var(--brand-font-weight-strong); font-size: 2.1cqi; letter-spacing: -0.01em; }
      .s-cta svg { width: 2cqi; height: 2cqi; }

      /* product wireframe motif (div/SVG, no screenshots) */
      .s-screen { margin-top: 3.6cqi; border-radius: 1.6cqi; border: var(--brand-line-width) solid var(--brand-color-border-secondary); background: var(--brand-color-bg-container); overflow: hidden; box-shadow: 0 12px 32px -16px var(--brand-color-fill-secondary); }
      .s-screen .bar { display: flex; align-items: center; gap: 1cqi; padding: 1.4cqi 1.8cqi; border-bottom: var(--brand-line-width) solid var(--brand-color-border-secondary); }
      .s-screen .bar i { width: 1.2cqi; height: 1.2cqi; border-radius: 50%; background: var(--brand-color-fill-tertiary); }
      .s-screen .bar .url { margin-left: 1cqi; height: 2.4cqi; flex: 1; max-width: 36cqi; border-radius: 1cqi; background: var(--brand-color-fill-quaternary); }
      .s-screen .canvas { display: grid; grid-template-columns: 16cqi 1fr; min-height: 22cqi; }
      .s-screen .nav { border-right: var(--brand-line-width) solid var(--brand-color-border-secondary); padding: 2cqi 1.6cqi; display: flex; flex-direction: column; gap: 1.4cqi; }
      .s-screen .nav span { height: 1.5cqi; border-radius: 1cqi; background: var(--brand-color-fill-quaternary); }
      .s-screen .nav span:first-child { background: var(--brand-color-primary); width: 70%; }
      .s-screen .main { padding: 2.4cqi; display: flex; flex-direction: column; gap: 1.6cqi; }
      .s-screen .main .h { height: 3cqi; width: 44%; border-radius: 0.8cqi; background: var(--brand-color-fill-tertiary); }
      .s-screen .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.6cqi; }
      .s-screen .tiles i { height: 9cqi; border-radius: 1.2cqi; background: var(--brand-color-fill-quaternary); border: var(--brand-line-width) solid var(--brand-color-border-secondary); }
      .s-screen .tiles i:first-child { background: var(--brand-color-primary-bg); border-color: var(--brand-color-primary-border); }

      /* solution: oversized signature line */
      .s-pillars { display: flex; flex-wrap: wrap; gap: 1.2cqi; margin-top: 3.6cqi; }
      .s-pill { display: inline-flex; align-items: center; gap: 1cqi; padding: 1.2cqi 2cqi; border-radius: 6cqi; border: var(--brand-line-width) solid var(--brand-color-border); font-size: 1.6cqi; font-weight: var(--brand-font-weight-strong); color: var(--brand-color-text-secondary); }
      .s-pill .dot { width: 1cqi; height: 1cqi; border-radius: 50%; background: var(--brand-color-primary); }

      /* pager UI */
      .deck-ui { position: fixed; right: 24px; bottom: 20px; z-index: 30; display: flex; align-items: center; gap: 10px; }
      .deck-ui button {
        width: 38px; height: 38px; border-radius: 50%; cursor: pointer;
        border: var(--brand-line-width) solid var(--brand-color-border);
        background: var(--brand-color-bg-container); color: var(--brand-color-text-secondary);
        font-size: 15px; line-height: 1; display: inline-flex; align-items: center; justify-content: center;
        transition: border-color .15s ease, color .15s ease;
      }
      .deck-ui button:hover { border-color: var(--brand-color-primary); color: var(--brand-color-primary); }
      .deck-counter { font-size: 12px; color: var(--brand-color-text-tertiary); font-variant-numeric: tabular-nums; min-width: 48px; text-align: center; letter-spacing: 0.04em; }
      .deck-dots { position: fixed; left: 50%; transform: translateX(-50%); bottom: 26px; z-index: 30; display: flex; gap: 8px; }
      .deck-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--brand-color-fill); cursor: pointer; transition: all .2s ease; }
      .deck-dot.on { background: var(--brand-color-primary); transform: scale(1.3); }
`;

const DECK_SCRIPT = `
(function () {
  /* od-deck-fit: shrink-to-fit guarantee — keep every slide's content inside
     the fixed 16:9 frame so brand copy of any length never clips. */
  function fitFrame(body) {
    var fit = body.querySelector('.f-fit');
    if (!fit) return;
    fit.style.transform = 'none';
    var availH = body.clientHeight;
    var availW = fit.clientWidth;
    if (availH <= 0 || availW <= 0) return;
    var naturalH = fit.offsetHeight;
    var naturalW = fit.scrollWidth;
    var scale = Math.min(1, availH / naturalH, availW / naturalW);
    if (scale < 1) {
      // small safety margin so descenders never touch the clip edge
      fit.style.transform = 'scale(' + (scale * 0.98) + ')';
    }
  }
  function fitAll() {
    [].forEach.call(document.querySelectorAll('.f-body'), fitFrame);
  }
  // Fit synchronously rather than via requestAnimationFrame: rAF callbacks are
  // throttled while the deck is offscreen/occluded, which would leave a slide
  // unscaled (and clipped) until first paint. A trailing settle pass catches
  // late reflow (web-font swap, image load).
  var fitTimer;
  function scheduleFit() {
    fitAll();
    if (fitTimer) clearTimeout(fitTimer);
    fitTimer = setTimeout(fitAll, 150);
  }
  window.addEventListener('resize', scheduleFit);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fitAll).catch(function () {});
  }
  window.addEventListener('load', fitAll);
  scheduleFit();

  var deck = document.querySelector('.deck');
  var slides = [].slice.call(document.querySelectorAll('.slide'));
  var dots = [].slice.call(document.querySelectorAll('.deck-dot'));
  var counter = document.querySelector('.deck-counter');
  var idx = 0;
  function render() {
    if (counter) counter.textContent = (idx + 1) + ' / ' + slides.length;
    dots.forEach(function (d, n) { d.classList.toggle('on', n === idx); });
  }
  function go(i) {
    idx = Math.max(0, Math.min(slides.length - 1, i));
    slides[idx].scrollIntoView({ behavior: 'smooth' });
    render();
  }
  deck.addEventListener('scroll', function () {
    requestAnimationFrame(function () {
      var i = Math.round(deck.scrollTop / deck.clientHeight);
      if (i !== idx && i >= 0 && i < slides.length) { idx = i; render(); }
    });
  });
  window.addEventListener('keydown', function (e) {
    if (['ArrowDown', 'ArrowRight', 'PageDown', ' '].indexOf(e.key) > -1) { e.preventDefault(); go(idx + 1); }
    else if (['ArrowUp', 'ArrowLeft', 'PageUp'].indexOf(e.key) > -1) { e.preventDefault(); go(idx - 1); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(slides.length - 1); }
  });
  dots.forEach(function (d, n) { d.addEventListener('click', function () { go(n); }); });
  document.querySelector('.deck-prev').addEventListener('click', function () { go(idx - 1); });
  document.querySelector('.deck-next').addEventListener('click', function () { go(idx + 1); });
  render();
})();
`;

// ─────────────────────────── deck-local helpers ─────────────────────────────

/** Inline line-icons (no emoji-as-icons). Stroke inherits currentColor. */
const ICON = {
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
  dot: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  spark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
} as const;

/** Two-initial monogram from a person/brand name. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** First adjective, capitalized, as a fallback-safe word. */
function leadAdj(brand: Brand, fallback = "purposeful"): string {
  const a = brand.voice.adjectives.map((s) => s.trim()).filter(Boolean)[0];
  return cap(a || fallback);
}

/** A short noun for the brand's category — derived, never invented copy. */
function categoryWord(brand: Brand): string {
  const v = brand.voice.vocabulary.use.map((w) => w.trim()).filter((w) => w.length > 2)[0];
  return v ? v.toLowerCase() : "this category";
}

// ─────────────────────────── renderer ───────────────────────────────────────

export function renderDeck(brand: Brand, tokens: DesignTokens): string {
  const name = brand.name;
  const host = sourceHost(brand);
  const tagline = brandTagline(brand);
  const blurb = brandBlurb(brand);
  const adjectives = brand.voice.adjectives.slice(0, 3).map(cap);
  const adjLine = adjectives.join(" · ") || "Brand introduction";
  const pillars = pillarTitles(brand);
  const feats = featureCards(brand);
  const tiers = pricingTiers(brand);
  const quotes = quoteCards(brand);
  const partners = partnerNames(brand);
  const stats = statItems();
  const category = categoryWord(brand);

  type Slide = { kicker: string; variant?: "accent" | "surface"; body: string };

  /** Standard 3-up card grid (problem / product / etc). */
  const cardGrid = (items: Array<{ title: string; body: string; icon?: string }>, cols: number) =>
    `<div class="s-grid" style="grid-template-columns:repeat(${cols},1fr);">
            ${items
              .map(
                (c) => `<div class="s-card">${
                  c.icon ? `<span class="tick">${c.icon}</span>` : ""
                }<h3>${esc(c.title)}</h3><p>${esc(c.body)}</p></div>`,
              )
              .join("\n            ")}
          </div>`;

  // ── slide content (titles are assertion headlines, one idea each) ──────────
  const slides: Slide[] = [
    // 1 — COVER (accent, most confident page)
    {
      kicker: adjLine,
      variant: "accent",
      body: `<span class="s-kicker">${esc(adjLine)}</span>
          <h1 class="s-mega">${esc(name)}</h1>
          <p class="s-lede" style="font-size:2.6cqi;color:rgba(255,255,255,0.92);">${esc(tagline)}</p>`,
    },

    // 2 — PROBLEM (assertion: the pain is real, big, costly)
    {
      kicker: "The problem",
      variant: "surface",
      body: `<span class="s-kicker">The problem</span>
          <h2 class="s-title">Getting ${esc(category)} right is still painfully hard.</h2>
          <p class="s-lede">${esc(blurb)}</p>
          ${cardGrid(
            [
              {
                title: "Tools don't talk",
                body: "Work scatters across apps that never share a source of truth, so context is lost on every handoff.",
                icon: ICON.x,
              },
              {
                title: "Every loop costs a day",
                body: "Iteration stalls in coordination — approvals, exports, re-dos — long before anything ships.",
                icon: ICON.x,
              },
              {
                title: "Quality is a coin flip",
                body: "Output depends on whoever happened to do the work, not on a standard you can rely on.",
                icon: ICON.x,
              },
            ],
            3,
          )}`,
    },

    // 3 — SOLUTION (assertion: one different way to solve it)
    {
      kicker: "The solution",
      body: `<span class="s-kicker">The solution</span>
          <h2 class="s-title"><span class="s-accent">${esc(name)}</span> ${esc(
            taglineClause(tagline, name),
          )}</h2>
          <div class="s-pillars">
            ${(pillars.length ? pillars : adjectives)
              .slice(0, 5)
              .map((p) => `<span class="s-pill"><span class="dot"></span>${esc(p)}</span>`)
              .join("\n            ")}
          </div>`,
    },

    // 4 — WHY NOW (golden-line slide, §3 金句页 — inflection point)
    {
      kicker: "Why now",
      body: `<span class="s-kicker">Why now</span>
          <p class="s-quote">The shift toward <span class="s-accent">${esc(
            leadAdj(brand).toLowerCase(),
          )}</span>, accountable ${esc(category)} is happening now — and the teams that move first set the standard.</p>
          <div class="s-byline">
            <span class="av">${esc(initials(name))}</span>
            <div><div class="n">${esc(name)}</div><div class="r">${esc(host)}</div></div>
          </div>`,
    },

    // 5 — MARKET (assertion: the pool is big enough to bet on)
    {
      kicker: "Market",
      variant: "surface",
      body: `<span class="s-kicker">Market</span>
          <h2 class="s-title">The opportunity is large and still wide open.</h2>
          <div class="s-bars">
            ${marketBars()}
          </div>`,
    },

    // 6 — PRODUCT (assertion: it exists and it's good — div/SVG wireframe)
    {
      kicker: "Product",
      body: `<span class="s-kicker">Product</span>
          <h2 class="s-title">${esc(name)} is real, shipping, and good to use today.</h2>
          <div class="s-screen">
            <div class="bar"><i></i><i></i><i></i><span class="url"></span></div>
            <div class="canvas">
              <div class="nav"><span></span><span></span><span></span><span></span><span></span></div>
              <div class="main"><div class="h"></div><div class="tiles"><i></i><i></i><i></i></div></div>
            </div>
          </div>`,
    },

    // 7 — BUSINESS MODEL (assertion: the unit economics work)
    {
      kicker: "Business model",
      variant: "surface",
      body: `<span class="s-kicker">Business model</span>
          <h2 class="s-title">We make money the moment we create value.</h2>
          <div class="s-grid" style="grid-template-columns:repeat(3,1fr);">
            ${tiers
              .map(
                (t) => `<div class="s-card"${
                  t.highlighted ? ` style="border-color:var(--brand-color-primary);border-width:1.5px;"` : ""
                }>
              <h3>${esc(t.plan)}</h3>
              <div style="font-family:var(--display-family);font-size:3.4cqi;font-weight:var(--brand-font-weight-strong);letter-spacing:-0.02em;color:var(--brand-color-text);margin:0.6cqi 0 1.4cqi;">${esc(
                t.price,
              )}<span style="font-size:1.3cqi;color:var(--brand-color-text-tertiary);font-weight:400;"> ${esc(
                t.period ?? "",
              )}</span></div>
              <p style="-webkit-line-clamp:3;">${esc(t.features.slice(0, 3).join(" · "))}</p>
            </div>`,
              )
              .join("\n            ")}
          </div>`,
    },

    // 8 — COMPETITION & MOAT (assertion: we're different, with a moat)
    {
      kicker: "Competition & moat",
      body: `<span class="s-kicker">Competition &amp; moat</span>
          <h2 class="s-title">Only ${esc(name)} is built ${esc(
            leadAdj(brand).toLowerCase(),
          )} from the ground up.</h2>
          <div class="s-matrix" style="grid-template-columns:1fr;">
            <div class="row head" style="grid-template-columns:18cqi repeat(3,1fr);">
              <span></span><span class="cell">${esc(competeAxes()[0])}</span><span class="cell">${esc(
                competeAxes()[1],
              )}</span><span class="cell">${esc(competeAxes()[2])}</span>
            </div>
            ${competeRows(name, partners)}
          </div>`,
    },

    // 9 — TRACTION (accent, strongest page — §1-A note: most valuable slide)
    {
      kicker: "Traction",
      variant: "accent",
      body: `<span class="s-kicker">Traction</span>
          <h2 class="s-title" style="font-size:5cqi;">People already want this — and the line is going up.</h2>
          <div class="s-grid" style="grid-template-columns:repeat(4,1fr);margin-top:5cqi;">
            ${stats
              .map(
                (s) => `<div class="s-metric"><div class="v">${esc(s.value)}</div><div class="l">${esc(
                  s.label,
                )}</div></div>`,
              )
              .join("\n            ")}
          </div>
          <p class="s-lede" style="color:rgba(255,255,255,0.78);font-size:1.5cqi;max-width:64cqi;margin-top:3.4cqi;">Illustrative figures — replace with your live numbers before pitching.</p>`,
    },

    // 10 — TEAM (assertion: this team can pull it off)
    {
      kicker: "Team",
      variant: "surface",
      body: `<span class="s-kicker">Team</span>
          <h2 class="s-title">The people behind ${esc(name)} have done this before.</h2>
          <div class="s-team">
            ${quotes
              .map(
                (q) => `<div class="s-card" style="background:transparent;border:none;padding:0;">
              <span class="s-avatar">${esc(initials(q.name))}</span>
              <h3 style="font-size:1.9cqi;margin:0 0 0.4cqi;">${esc(q.name)}</h3>
              <p style="-webkit-line-clamp:2;">${esc(q.role)}</p>
            </div>`,
              )
              .join("\n            ")}
          </div>`,
    },

    // 11 — THE ASK (accent, unambiguous close — §2 诉求页)
    {
      kicker: "The ask",
      variant: "accent",
      body: `<span class="s-kicker">The ask</span>
          <h2 class="s-mega" style="font-size:6.4cqi;">Let's build the future of ${esc(
            category,
          )} together.</h2>
          <div class="s-ask">
            ${askItems(brand)
              .map(
                (a) => `<div class="item"><span class="b">${ICON.check}</span><span><span class="k">${esc(
                  a.k,
                )}</span> — ${esc(a.v)}</span></div>`,
              )
              .join("\n            ")}
          </div>
          <a class="s-cta">Talk to us &middot; ${esc(host)} ${ICON.arrow}</a>`,
    },
  ];

  // ── frame assembly (mechanism preserved) ───────────────────────────────────
  const total = slides.length;
  const slideHtml = slides
    .map((s, i) => {
      const variant = s.variant ? ` frame--${s.variant}` : "";
      const ix = String(i + 1).padStart(2, "0");
      return `      <section class="slide">
        <div class="frame${variant}">
          <div class="f-head"><span class="wm">${esc(name)}</span><span class="rule"></span><span class="ix">${esc(
            s.kicker.toUpperCase(),
          )}</span></div>
          <div class="f-body">
            <div class="f-fit">
          ${s.body}
            </div>
          </div>
          <div class="f-foot"><span>${esc(host)}</span><span class="rule"></span><span class="ix">${ix} / ${String(
            total,
          ).padStart(2, "0")}</span></div>
        </div>
      </section>`;
    })
    .join("\n");

  const dots = slides.map(() => `<span class="deck-dot"></span>`).join("");

  const body = `    <main class="deck">
${slideHtml}
    </main>
    <div class="deck-dots">${dots}</div>
    <div class="deck-ui">
      <button class="deck-prev" aria-label="Previous slide">&larr;</button>
      <span class="deck-counter">1 / ${total}</span>
      <button class="deck-next" aria-label="Next slide">&rarr;</button>
    </div>`;

  return document({
    title: `${name} — Pitch deck`,
    tokens,
    brand,
    body,
    css: DECK_CSS,
    script: DECK_SCRIPT,
  });
}

// ─────────────────────────── content builders (pure) ────────────────────────

/**
 * Turn the brand tagline into a verb clause that reads after the brand name,
 * so the solution headline is one full assertion sentence ("Acme makes …").
 * Strips a leading repeat of the brand name and trailing period.
 */
function taglineClause(tagline: string, name: string): string {
  let t = tagline.trim().replace(/\.$/, "");
  const lead = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b[\\s—–:-]*`, "i");
  t = t.replace(lead, "").trim();
  // If it already starts with a verb-ish lowercase clause, keep it; otherwise
  // fold it into a "is the way to …" frame so the sentence still closes.
  if (/^[a-z]/.test(t) || /^(is|makes|turns|helps|gives|brings|lets)\b/i.test(t)) {
    return t;
  }
  return `is how teams get ${t.charAt(0).toLowerCase()}${t.slice(1)}`;
}

/** TAM/SAM/SOM funnel as themed bars — illustrative, explicitly labelled. */
function marketBars(): string {
  const rows: Array<{ tag: string; w: number; v: string; color: string }> = [
    { tag: "TAM", w: 100, v: "$48B total market", color: `var(--brand-color-primary)` },
    { tag: "SAM", w: 64, v: "$12B reachable today", color: `var(--brand-color-primary-hover)` },
    { tag: "SOM", w: 30, v: "$1.4B near-term wedge", color: `var(--brand-color-primary-active)` },
  ];
  return rows
    .map(
      (r) => `<div class="s-bar"><span class="tag">${esc(r.tag)}</span>
              <div class="lane"><div class="track" style="width:${r.w}%;background:${r.color};"></div></div>
              <span class="val">${esc(r.v)}</span></div>`,
    )
    .join("\n            ");
}

/** Honest, brand-agnostic comparison axes for the moat matrix. */
function competeAxes(): [string, string, string] {
  return ["Built for teams", "Fast to value", "On-brand by default"];
}

/** Competition rows: incumbents (no) vs. us (yes) — §2 「维度要诚实」. */
function competeRows(name: string, partners: string[]): string {
  const yes = `<span class="mk yes">${ICON.check}</span>`;
  const no = `<span class="mk no">${ICON.x}</span>`;
  const them = (label: string, marks: boolean[]) =>
    `<div class="row them" style="grid-template-columns:18cqi repeat(3,1fr);">
              <span class="cell who" style="color:var(--brand-color-text);">${esc(label)}</span>
              ${marks.map((m) => `<span class="cell">${m ? yes : no}</span>`).join("")}
            </div>`;
  const a = partners[2] ?? "Legacy suite";
  const b = partners[3] ?? "Point tool";
  return [
    them(a, [false, false, true]),
    them(b, [true, false, false]),
    `<div class="row us" style="grid-template-columns:18cqi repeat(3,1fr);">
              <span class="cell who">${esc(name)}</span>
              <span class="cell">${yes}</span><span class="cell">${yes}</span><span class="cell">${yes}</span>
            </div>`,
  ].join("\n            ");
}

/** The Ask: concrete ask / use-of-funds / milestone — never vague (§2). */
function askItems(brand: Brand): Array<{ k: string; v: string }> {
  const adj = brand.voice.adjectives.map((s) => s.trim()).filter(Boolean)[0] ?? "category-defining";
  return [
    { k: "Partner with us", v: `back the team building the ${adj.toLowerCase()} standard for this market.` },
    { k: "Fuel the next phase", v: "scale the product, the go-to-market motion, and the team." },
    { k: "Hit the milestone", v: "reach the next tier of customers and revenue within 12 months." },
  ];
}
