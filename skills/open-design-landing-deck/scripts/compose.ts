#!/usr/bin/env -S npx -y tsx
/**
 * open-design-landing-deck — slide deck composer.
 *
 * Reads `inputs.json` (matching `../schema.ts`) and writes a single
 * self-contained HTML file: a horizontal magazine-style swipe deck
 * where every slide occupies one viewport. Reuses the Atelier Zero
 * stylesheet from the sister `open-design-landing` skill, then layers
 * deck-specific rules (horizontal flex track, slide layouts, HUD,
 * keyboard / wheel / touch nav, ESC overview).
 *
 * Inspired by `skills/guizang-ppt/assets/template.html`: same horizontal
 * pagination model, same nav primitives — but the visual system is
 * Atelier Zero (warm paper, italic-serif emphasis, coral dots) instead
 * of Monocle dark/light WebGL.
 *
 * Usage:
 *   npx tsx scripts/compose.ts <inputs.json> <output.html>
 *
 * Re-generate the canonical example:
 *   npx tsx scripts/compose.ts inputs.example.json example.html
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  OpenDesignLandingDeckInputs,
  Slide,
  CoverSlide,
  SectionSlide,
  ContentSlide,
  StatsSlide,
  QuoteSlide,
  CTASlide,
  EndSlide,
  MixedText,
} from '../schema';

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SISTER_STYLES = resolve(SKILL_ROOT, '..', 'open-design-landing', 'styles.css');

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

function mixed(text: MixedText): string {
  return text
    .map((seg) => {
      if (seg.dot) return `<span class='dot'>${seg.text}</span>`;
      if (seg.em) return `<em>${seg.text}</em>`;
      return seg.text;
    })
    .join('');
}

function ext(href: string): string {
  return /^(https?:|mailto:|\/\/)/i.test(href)
    ? ` target='_blank' rel='noreferrer noopener'`
    : '';
}

const ARROW_OUT = `<svg viewBox='0 0 24 24'><path d='M5 19L19 5M19 5H8M19 5v11'/></svg>`;

function imgFor(slot: string | undefined, assets: string): string {
  if (!slot) return '';
  return `<img src='${assets}${slot}.png' alt='' />`;
}

/* ------------------------------------------------------------------ *
 * deck-specific stylesheet (layered on top of open-design-landing CSS).
 *
 * Strategy: keep tokens, type scale, paper texture from the base CSS.
 * Override only the things a horizontal deck demands — body overflow,
 * the .deck flex track, the .slide frame, the HUD, the dot nav, the
 * ESC overview grid. The .hero / .nav / .topbar rules from the base
 * stylesheet are unused here (we don't render those sections).
 * ------------------------------------------------------------------ */

const DECK_CSS = `
/* ---------- base host ---------- */
html, body { width: 100%; height: 100%; overflow: hidden; }
body { background: var(--paper); color: var(--ink); }
/* the base stylesheet's body::before paper texture sits at z-index:3
 * which is above our slide content. Re-pin it to behind the deck. */
body::before { z-index: 0; }

/* ---------- deck flex track (horizontal pagination) ---------- */
#deck {
  position: fixed;
  inset: 0;
  height: 100vh;
  display: flex;
  flex-wrap: nowrap;
  transition: transform 0.9s cubic-bezier(0.77, 0, 0.175, 1);
  z-index: 5;
  will-change: transform;
}
.slide {
  width: 100vw;
  height: 100vh;
  flex: 0 0 100vw;
  position: relative;
  padding: 64px 80px 80px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.slide-inner {
  max-width: 1360px;
  margin: 0 auto;
  width: 100%;
  height: 100%;
  display: grid;
  align-content: center;
  gap: 28px;
  position: relative;
  min-height: 0;
}
/* keep art panels inside the slide footprint */
.s-cover .art,
.s-content .art,
.s-quote .art {
  max-height: calc(100vh - 200px);
  min-height: 0;
}

/* ---------- magazine chrome (top + bottom strips on every slide) ---------- */
.slide-chrome {
  position: absolute;
  top: 22px; left: 0; right: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 80px;
  font-family: var(--sans);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--ink-faint);
  z-index: 4;
  pointer-events: none;
}
.slide-chrome .left,
.slide-chrome .right {
  display: inline-flex;
  align-items: center;
  gap: 14px;
}
.slide-chrome .mark {
  width: 22px; height: 22px;
  border-radius: 50%;
  border: 1px solid var(--ink);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--serif);
  font-style: italic;
  font-size: 12px;
  color: var(--ink);
  background: rgba(239, 231, 210, 0.85);
}
.slide-chrome .coral { color: var(--coral); }
.slide-foot {
  position: absolute;
  bottom: 22px; left: 0; right: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 80px;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-faint);
  z-index: 4;
  pointer-events: none;
}
.slide-foot .counter {
  font-family: var(--mono);
  letter-spacing: 0.04em;
  color: var(--ink);
  background: rgba(239, 231, 210, 0.85);
  padding: 4px 8px;
  border: 1px solid var(--line);
  border-radius: 4px;
}

/* ---------- progress bar ---------- */
.deck-progress {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  height: 2px;
  background: var(--line-soft);
  z-index: 30;
}
.deck-progress .bar {
  height: 100%;
  background: var(--coral);
  width: 0%;
  transition: width 0.6s cubic-bezier(0.77, 0, 0.175, 1);
}

/* ---------- dot nav ---------- */
#nav {
  position: fixed;
  left: 50%;
  bottom: 40px;
  transform: translateX(-50%);
  z-index: 30;
  display: flex;
  gap: 10px;
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(239, 231, 210, 0.78);
  border: 1px solid var(--line-soft);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
#nav .dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: rgba(21, 20, 15, 0.22);
  cursor: pointer;
  transition: all 0.3s ease;
  border: 0;
  padding: 0;
}
#nav .dot:hover {
  background: rgba(21, 20, 15, 0.45);
  transform: scale(1.15);
}
#nav .dot.active {
  background: var(--coral);
  width: 22px;
  border-radius: 999px;
}

/* ---------- key hint ---------- */
#hint {
  position: fixed;
  bottom: 36px; right: 28px;
  z-index: 30;
  font-family: var(--mono);
  font-size: 9.5px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--ink-faint);
  opacity: 0.75;
}

/* ---------- COVER slide ---------- */
.s-cover .slide-inner {
  grid-template-columns: 1.05fr 0.95fr;
  align-content: center;
  gap: 60px;
}
.s-cover .copy { display: flex; flex-direction: column; gap: 22px; }
.s-cover .eyebrow {
  font-family: var(--sans); font-size: 11px; font-weight: 600;
  letter-spacing: 0.22em; text-transform: uppercase;
  color: var(--coral);
  display: inline-flex; align-items: center; gap: 12px;
}
.s-cover .eyebrow::before {
  content: ''; width: 18px; height: 1px;
  background: var(--coral); display: inline-block;
}
.s-cover h1 {
  font-family: var(--sans);
  font-weight: 800;
  font-size: clamp(40px, 5.6vw, 84px);
  line-height: 1.0;
  letter-spacing: -0.028em;
  color: var(--ink);
  margin: 0;
}
.s-cover h1 em {
  font-family: var(--serif);
  font-style: italic; font-weight: 500;
  letter-spacing: -0.018em;
}
.s-cover h1 .dot { color: var(--coral); }
.s-cover .subtitle {
  font-family: var(--serif); font-style: italic; font-weight: 500;
  font-size: 22px; color: var(--ink-soft); margin-top: -6px;
}
.s-cover .lead {
  font-family: var(--body); font-size: 17px;
  color: var(--ink-soft); max-width: 42ch; line-height: 1.6;
}
.s-cover .meta {
  margin-top: 28px;
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em;
  color: var(--ink-faint);
}
.s-cover .art {
  position: relative; aspect-ratio: 1 / 1; max-width: 600px;
  margin-left: auto; margin-right: 0;
  border: 1px solid var(--line-soft); border-radius: 14px;
  overflow: hidden; background: var(--bone);
}
.s-cover .art img { width: 100%; height: 100%; object-fit: contain; }
.s-cover .art .corner {
  position: absolute;
  width: 22px; height: 22px;
  border-color: var(--ink-faint);
  border-style: solid;
  border-width: 0;
}
.s-cover .art .corner.tl { top: 0; left: 0; border-top-width: 1px; border-left-width: 1px; }
.s-cover .art .corner.tr { top: 0; right: 0; border-top-width: 1px; border-right-width: 1px; }
.s-cover .art .corner.bl { bottom: 0; left: 0; border-bottom-width: 1px; border-left-width: 1px; }
.s-cover .art .corner.br { bottom: 0; right: 0; border-bottom-width: 1px; border-right-width: 1px; }

/* ---------- SECTION divider slide ---------- */
.s-section .slide-inner {
  grid-template-columns: 1fr;
  align-content: center;
  text-align: center;
  gap: 28px;
}
.s-section .roman {
  font-family: var(--serif); font-style: italic; font-weight: 500;
  font-size: clamp(80px, 10vw, 160px);
  color: var(--coral); line-height: 1; letter-spacing: -0.02em;
}
.s-section h2 {
  font-family: var(--sans); font-weight: 800;
  font-size: clamp(54px, 7vw, 110px);
  letter-spacing: -0.028em; line-height: 1.0; color: var(--ink);
  max-width: 18ch; margin: 0 auto;
}
.s-section h2 em {
  font-family: var(--serif); font-style: italic; font-weight: 500;
}
.s-section h2 .dot { color: var(--coral); }
.s-section .lead {
  font-family: var(--body); font-size: 17px;
  color: var(--ink-soft); max-width: 50ch; margin: 0 auto;
  line-height: 1.6;
}

/* ---------- CONTENT slide ---------- */
.s-content .slide-inner { gap: 48px; }
.s-content.layout-left .slide-inner { grid-template-columns: 1fr 0.9fr; }
.s-content.layout-right .slide-inner { grid-template-columns: 0.9fr 1fr; }
.s-content.layout-right .copy { order: 2; }
.s-content.layout-right .art { order: 1; }
.s-content.layout-full .slide-inner { grid-template-columns: 1fr; max-width: 980px; }
.s-content .copy { display: flex; flex-direction: column; gap: 22px; }
.s-content .eyebrow {
  font-family: var(--sans); font-size: 11px; font-weight: 600;
  letter-spacing: 0.22em; text-transform: uppercase; color: var(--coral);
  display: inline-flex; align-items: center; gap: 12px;
}
.s-content .eyebrow::before {
  content: ''; width: 18px; height: 1px;
  background: var(--coral); display: inline-block;
}
.s-content h2 {
  font-family: var(--sans); font-weight: 800;
  font-size: clamp(40px, 4.8vw, 64px);
  letter-spacing: -0.024em; line-height: 1.05;
  color: var(--ink); margin: 0;
}
.s-content h2 em {
  font-family: var(--serif); font-style: italic; font-weight: 500;
}
.s-content h2 .dot { color: var(--coral); }
.s-content .body {
  font-family: var(--body); font-size: 16px;
  color: var(--ink-soft); max-width: 56ch; line-height: 1.6;
}
.s-content .body code {
  font-family: var(--mono); font-size: 14px;
  background: var(--bone); padding: 1px 6px; border-radius: 4px;
}
.s-content ul {
  list-style: none; padding: 0; margin: 0;
  display: flex; flex-direction: column; gap: 12px;
}
.s-content li {
  font-family: var(--sans); font-size: 15px;
  color: var(--ink-soft); display: flex; gap: 14px; align-items: flex-start;
  line-height: 1.5;
}
.s-content li::before {
  content: ''; width: 12px; height: 1px;
  background: var(--coral); margin-top: 11px; flex-shrink: 0;
}
.s-content .art {
  position: relative; aspect-ratio: 1 / 1;
  border: 1px solid var(--line-soft); border-radius: 14px;
  overflow: hidden; background: var(--bone);
}
.s-content .art img { width: 100%; height: 100%; object-fit: contain; }

/* ---------- STATS slide ---------- */
.s-stats .slide-inner { grid-template-columns: 1fr; gap: 56px; }
.s-stats .head { display: flex; flex-direction: column; gap: 22px; }
.s-stats .eyebrow {
  font-family: var(--sans); font-size: 11px; font-weight: 600;
  letter-spacing: 0.22em; text-transform: uppercase; color: var(--coral);
  display: inline-flex; align-items: center; gap: 12px;
}
.s-stats .eyebrow::before {
  content: ''; width: 18px; height: 1px; background: var(--coral); display: inline-block;
}
.s-stats h2 {
  font-family: var(--sans); font-weight: 800;
  font-size: clamp(44px, 5vw, 72px);
  letter-spacing: -0.026em; line-height: 1.05; max-width: 18ch; margin: 0;
}
.s-stats h2 em {
  font-family: var(--serif); font-style: italic; font-weight: 500;
}
.s-stats h2 .dot { color: var(--coral); }
.s-stats .grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 36px;
  border-top: 1px solid var(--line);
  padding-top: 36px;
}
.s-stats .stat { display: flex; flex-direction: column; gap: 10px; }
.s-stats .stat .num {
  font-family: var(--sans); font-weight: 800;
  font-size: clamp(72px, 8vw, 128px); line-height: 1;
  letter-spacing: -0.04em; color: var(--ink);
  font-feature-settings: 'tnum';
}
.s-stats .stat .num em {
  color: var(--coral); font-family: var(--serif); font-style: italic; font-weight: 500;
}
.s-stats .stat .label {
  font-family: var(--sans); font-size: 11.5px;
  letter-spacing: 0.22em; text-transform: uppercase;
  color: var(--ink); font-weight: 700;
}
.s-stats .stat .sub {
  font-family: var(--body); font-size: 13px;
  color: var(--ink-mute); max-width: 26ch; line-height: 1.5;
}
.s-stats .caption {
  font-family: var(--mono); font-size: 11px;
  color: var(--ink-faint); letter-spacing: 0.04em;
}

/* ---------- QUOTE slide ---------- */
.s-quote .slide-inner {
  grid-template-columns: 1.4fr 0.8fr;
  gap: 60px; align-items: center;
}
.s-quote.no-art .slide-inner { grid-template-columns: 1fr; max-width: 980px; }
.s-quote blockquote {
  font-family: var(--sans); font-weight: 700;
  font-size: clamp(34px, 4vw, 56px);
  letter-spacing: -0.022em; line-height: 1.18;
  color: var(--ink); margin: 0;
  position: relative;
}
.s-quote blockquote em {
  font-family: var(--serif); font-style: italic; font-weight: 500;
}
.s-quote .author {
  margin-top: 38px; display: flex; align-items: center; gap: 16px;
}
.s-quote .author .avatar {
  width: 48px; height: 48px; border-radius: 50%;
  background: var(--ink); color: var(--paper);
  font-family: var(--serif); font-style: italic; font-size: 22px;
  display: inline-flex; align-items: center; justify-content: center;
}
.s-quote .author p {
  font-family: var(--sans); font-size: 14px; font-weight: 600;
  color: var(--ink);
}
.s-quote .author p span {
  display: block; color: var(--ink-mute); font-weight: 400;
  margin-top: 2px;
}
.s-quote .art {
  position: relative; aspect-ratio: 1 / 1;
  border: 1px solid var(--line-soft); border-radius: 14px;
  overflow: hidden; background: var(--bone);
}
.s-quote .art img { width: 100%; height: 100%; object-fit: contain; }

/* ---------- CTA slide ---------- */
.s-cta .slide-inner {
  grid-template-columns: 1fr; max-width: 980px;
  gap: 32px; text-align: left;
}
.s-cta .eyebrow {
  font-family: var(--sans); font-size: 11px; font-weight: 600;
  letter-spacing: 0.22em; text-transform: uppercase; color: var(--coral);
  display: inline-flex; align-items: center; gap: 12px;
}
.s-cta .eyebrow::before {
  content: ''; width: 18px; height: 1px;
  background: var(--coral); display: inline-block;
}
.s-cta h2 {
  font-family: var(--sans); font-weight: 800;
  font-size: clamp(54px, 6.4vw, 96px);
  letter-spacing: -0.028em; line-height: 1.0;
  color: var(--ink); margin: 0;
}
.s-cta h2 em {
  font-family: var(--serif); font-style: italic; font-weight: 500;
}
.s-cta h2 .dot { color: var(--coral); }
.s-cta .body {
  font-family: var(--body); font-size: 17px;
  color: var(--ink-soft); max-width: 50ch; line-height: 1.6;
}
.s-cta .actions {
  display: inline-flex; gap: 14px; margin-top: 12px;
  align-items: center; flex-wrap: wrap;
}

/* ---------- END slide ---------- */
.s-end .slide-inner {
  grid-template-columns: 1fr;
  align-content: end;
  padding-bottom: 32px;
  text-align: left;
  gap: 16px;
  max-width: none;
}
.s-end .word {
  font-family: var(--sans); font-weight: 900;
  font-size: clamp(96px, 16vw, 240px);
  letter-spacing: -0.04em; line-height: 1.0;
  color: var(--ink); white-space: nowrap;
  overflow-x: hidden;
  padding-bottom: 0.18em;
}
.s-end .word em {
  font-family: var(--serif); font-style: italic; font-weight: 500;
  color: var(--coral);
}
.s-end .footer {
  border-top: 1px solid var(--line);
  padding-top: 22px;
  font-family: var(--sans); font-size: 11px;
  letter-spacing: 0.22em; text-transform: uppercase;
  color: var(--ink-faint);
}

/* ---------- ESC overview grid ---------- */
#overview {
  position: fixed; inset: 0;
  z-index: 100;
  background: rgba(239, 231, 210, 0.96);
  backdrop-filter: blur(12px);
  display: none;
  overflow-y: auto;
  padding: 60px 56px;
}
#overview .ov-head {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 32px;
  font-family: var(--sans); font-size: 11px;
  letter-spacing: 0.22em; text-transform: uppercase; color: var(--ink-faint);
}
#overview .ov-head b { color: var(--ink); font-weight: 700; }
#overview .ov-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 22px;
  max-width: 1280px;
  margin: 0 auto;
}
#overview .ov-card {
  cursor: pointer;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--line);
  transition: border-color 0.2s, transform 0.2s;
  background: var(--bone);
}
#overview .ov-card:hover {
  border-color: var(--coral);
  transform: translateY(-2px);
}
#overview .ov-card.active { border-color: var(--coral); border-width: 2px; }
#overview .ov-thumb {
  width: 100%;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  position: relative;
  pointer-events: none;
  background: var(--paper);
}
#overview .ov-thumb .clone {
  width: 100vw; height: 100vh;
  transform: scale(0.18);
  transform-origin: top left;
  position: absolute;
  top: 0; left: 0;
  pointer-events: none;
}
#overview .ov-label {
  padding: 8px 12px;
  font-family: var(--mono); font-size: 10px;
  letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--ink-mute);
  display: flex; justify-content: space-between; align-items: center;
}
#overview .ov-label b { color: var(--ink); font-weight: 600; }

/* ---------- responsive ---------- */
@media (max-width: 1080px) {
  .slide { padding: 56px 48px 64px; }
  .slide-chrome, .slide-foot { padding: 0 48px; }
  .s-cover .slide-inner,
  .s-content.layout-left .slide-inner,
  .s-content.layout-right .slide-inner,
  .s-quote .slide-inner {
    grid-template-columns: 1fr; gap: 36px;
  }
  .s-content.layout-right .copy { order: 1; }
  .s-content.layout-right .art { order: 2; }
}
@media (max-width: 640px) {
  .slide { padding: 36px 24px 56px; }
  .slide-chrome, .slide-foot { padding: 0 24px; font-size: 9px; letter-spacing: 0.18em; }
  #hint { display: none; }
}
`;

/* ------------------------------------------------------------------ *
 * slide renderers
 * ------------------------------------------------------------------ */

function chromeStrip(brand: OpenDesignLandingDeckInputs['brand'], deckTitle: string): string {
  return `<div class='slide-chrome'>
  <div class='left'>
    <span class='mark'>${brand.mark}</span>
    <span><b>${brand.name}</b> · ${brand.edition ?? ''}</span>
  </div>
  <div class='right'>
    <span class='coral'>•</span>
    <span>${deckTitle}</span>
  </div>
</div>`;
}

function footStrip(idx: number, total: number, brand: OpenDesignLandingDeckInputs['brand']): string {
  const counter = `${String(idx + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
  return `<div class='slide-foot'>
  <span>${brand.year_roman ?? brand.year ?? ''} · ${brand.location ?? ''}</span>
  <span class='counter'>${counter}</span>
</div>`;
}

function renderCover(s: CoverSlide, assets: string): string {
  return `<div class='slide-inner'>
  <div class='copy'>
    <span class='eyebrow'>${s.eyebrow}</span>
    <h1>${mixed(s.title)}</h1>
    ${s.subtitle ? `<div class='subtitle'>${s.subtitle}</div>` : ''}
    <p class='lead'>${s.lead}</p>
    ${s.meta ? `<div class='meta'>${s.meta}</div>` : ''}
  </div>
  <div class='art'>
    <span class='corner tl'></span>
    <span class='corner tr'></span>
    <span class='corner bl'></span>
    <span class='corner br'></span>
    ${imgFor(s.image_slot, assets)}
  </div>
</div>`;
}

function renderSection(s: SectionSlide): string {
  return `<div class='slide-inner'>
  <div class='roman'>${s.roman}</div>
  <h2>${mixed(s.title)}</h2>
  ${s.lead ? `<p class='lead'>${s.lead}</p>` : ''}
</div>`;
}

function renderContent(s: ContentSlide, assets: string): string {
  const layout = s.layout ?? 'left';
  const hasArt = !!s.image_slot;
  return `<div class='slide-inner'>
  <div class='copy'>
    ${s.eyebrow ? `<span class='eyebrow'>${s.eyebrow}</span>` : ''}
    <h2>${mixed(s.title)}</h2>
    ${s.body ? `<p class='body'>${s.body}</p>` : ''}
    ${s.bullets && s.bullets.length ? `<ul>${s.bullets.map((b) => `<li>${b}</li>`).join('')}</ul>` : ''}
  </div>
  ${hasArt ? `<div class='art'>${imgFor(s.image_slot, assets)}</div>` : ''}
</div>`;
}

function renderStats(s: StatsSlide): string {
  const stats = s.stats
    .map(
      (st) =>
        `<div class='stat'>
          <div class='num'>${st.value}</div>
          <div class='label'>${st.label}</div>
          ${st.sub ? `<div class='sub'>${st.sub}</div>` : ''}
        </div>`,
    )
    .join('\n      ');
  return `<div class='slide-inner'>
  <div class='head'>
    ${s.eyebrow ? `<span class='eyebrow'>${s.eyebrow}</span>` : ''}
    <h2>${mixed(s.title)}</h2>
  </div>
  <div class='grid'>
    ${stats}
  </div>
  ${s.caption ? `<div class='caption'>${s.caption}</div>` : ''}
</div>`;
}

function renderQuote(s: QuoteSlide, assets: string): string {
  const hasArt = !!s.image_slot;
  return `<div class='slide-inner'>
  <div>
    <blockquote>&ldquo;${mixed(s.quote)}&rdquo;</blockquote>
    <div class='author'>
      <span class='avatar'>${s.author.initial}</span>
      <p>${s.author.name}<span>${s.author.title}</span></p>
    </div>
  </div>
  ${hasArt ? `<div class='art'>${imgFor(s.image_slot, assets)}</div>` : ''}
</div>`;
}

function renderCTA(s: CTASlide): string {
  return `<div class='slide-inner'>
  ${s.eyebrow ? `<span class='eyebrow'>${s.eyebrow}</span>` : ''}
  <h2>${mixed(s.title)}</h2>
  ${s.body ? `<p class='body'>${s.body}</p>` : ''}
  <div class='actions'>
    <a class='btn btn-primary' href='${s.primary.href}'${ext(s.primary.href)}>
      ${s.primary.label}
      <span class='arrow'>${ARROW_OUT}</span>
    </a>
    ${
      s.secondary
        ? `<a class='btn btn-ghost' href='${s.secondary.href}'${ext(s.secondary.href)}>
            ${s.secondary.label}
            <span class='arrow'>${ARROW_OUT}</span>
          </a>`
        : ''
    }
  </div>
</div>`;
}

function renderEnd(s: EndSlide): string {
  return `<div class='slide-inner'>
  <div class='word'>${mixed(s.mega)}</div>
  ${s.footer ? `<div class='footer'>${s.footer}</div>` : ''}
</div>`;
}

function renderSlideBody(s: Slide, assets: string): string {
  switch (s.kind) {
    case 'cover':   return renderCover(s, assets);
    case 'section': return renderSection(s);
    case 'content': return renderContent(s, assets);
    case 'stats':   return renderStats(s);
    case 'quote':   return renderQuote(s, assets);
    case 'cta':     return renderCTA(s);
    case 'end':     return renderEnd(s);
  }
}

function classFor(s: Slide): string {
  switch (s.kind) {
    case 'cover':   return 's-cover';
    case 'section': return 's-section';
    case 'content': {
      const layout = s.layout ?? 'left';
      const noArt = !s.image_slot;
      return `s-content layout-${layout}${noArt ? ' no-art' : ''}`;
    }
    case 'stats':   return 's-stats';
    case 'quote':   return `s-quote${s.image_slot ? '' : ' no-art'}`;
    case 'cta':     return 's-cta';
    case 'end':     return 's-end';
  }
}

function renderSlide(
  s: Slide,
  i: number,
  total: number,
  inputs: OpenDesignLandingDeckInputs,
  assets: string,
): string {
  return `<section class='slide ${classFor(s)}' data-slide-kind='${s.kind}'>
${chromeStrip(inputs.brand, inputs.deck_title)}
${renderSlideBody(s, assets)}
${footStrip(i, total, inputs.brand)}
</section>`;
}

/* ------------------------------------------------------------------ *
 * runtime script — keyboard / wheel / touch nav, dot indicator,
 * progress bar, ESC overview. Mirrors `guizang-ppt`'s navigation
 * model so it feels like a real magazine deck (←/→, ESC, swipe).
 * ------------------------------------------------------------------ */

const RUNTIME_SCRIPT = `
<script>
(function () {
  var deck = document.getElementById('deck');
  if (!deck) return;
  var slides = Array.prototype.slice.call(deck.querySelectorAll('.slide'));
  var nav = document.getElementById('nav');
  var bar = document.querySelector('.deck-progress .bar');
  var total = slides.length;
  var idx = 0, lock = false;

  /* match deck width to slide count so transform translateX works */
  deck.style.width = (total * 100) + 'vw';

  /* build dot nav */
  slides.forEach(function (s, i) {
    var b = document.createElement('button');
    b.className = 'dot';
    b.dataset.i = i;
    b.setAttribute('aria-label', 'Slide ' + (i + 1));
    b.onclick = function () { go(i); };
    nav.appendChild(b);
  });

  /* Unthrottled state update. The interaction throttle (\`lock\`) only
     guards wheel/key/touch so a fast input burst doesn't overshoot the
     transition; host- and observer-driven sync must bypass it, otherwise
     a host message or restoreInitialSlide that lands inside the 700ms
     window after go(0) silently no-ops and the deck stays on slide 1
     while the host counter advances. */
  function applySlide(n) {
    idx = Math.max(0, Math.min(total - 1, n));
    deck.style.transform = 'translateX(' + (-idx * 100) + 'vw)';
    /* load-bearing: .slide.active is read by Open Design's host bridge
       (src/runtime/srcdoc.ts findActiveByClass) to drive the slide
       counter. No CSS targets it — do not remove. */
    slides.forEach(function (s, i) { s.classList.toggle('active', i === idx); });
    nav.querySelectorAll('.dot').forEach(function (d, i) {
      d.classList.toggle('active', i === idx);
    });
    if (bar) bar.style.width = (((idx + 1) / total) * 100) + '%';
  }

  function go(n) {
    if (lock) return;
    applySlide(n);
    lock = true;
    setTimeout(function () { lock = false; }, 700);
  }

  /* ESC overview */
  var overviewOn = false;
  var ov = document.createElement('div');
  ov.id = 'overview';
  document.body.appendChild(ov);

  function buildOverview() {
    ov.innerHTML = '';
    var head = document.createElement('div');
    head.className = 'ov-head';
    head.innerHTML = '<span><b>Slide overview</b> · esc to close</span><span>' +
      String(idx + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0') + '</span>';
    ov.appendChild(head);
    var grid = document.createElement('div');
    grid.className = 'ov-grid';
    slides.forEach(function (s, i) {
      var card = document.createElement('div');
      card.className = 'ov-card' + (i === idx ? ' active' : '');
      var thumb = document.createElement('div');
      thumb.className = 'ov-thumb';
      var clone = s.cloneNode(true);
      clone.className = clone.className + ' clone';
      clone.style.transform = 'scale(0.18)';
      thumb.appendChild(clone);
      var label = document.createElement('div');
      label.className = 'ov-label';
      label.innerHTML = '<b>' + String(i + 1).padStart(2, '0') + '</b><span>' +
        (s.dataset.slideKind || '') + '</span>';
      card.appendChild(thumb);
      card.appendChild(label);
      card.onclick = function () { toggleOverview(); go(i); };
      grid.appendChild(card);
    });
    ov.appendChild(grid);
  }

  function toggleOverview() {
    overviewOn = !overviewOn;
    if (overviewOn) { buildOverview(); ov.style.display = 'block'; }
    else { ov.style.display = 'none'; }
  }

  /* keyboard nav */
  addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); toggleOverview(); return; }
    if (overviewOn) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault(); go(idx + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'ArrowUp') {
      e.preventDefault(); go(idx - 1);
    } else if (e.key === 'Home') {
      e.preventDefault(); go(0);
    } else if (e.key === 'End') {
      e.preventDefault(); go(total - 1);
    }
  });

  /* wheel nav (horizontal + vertical accumulation) */
  var wheelTO = null, wheelAcc = 0;
  addEventListener('wheel', function (e) {
    if (overviewOn) return;
    wheelAcc += e.deltaY + e.deltaX;
    if (Math.abs(wheelAcc) > 60) {
      go(idx + (wheelAcc > 0 ? 1 : -1));
      wheelAcc = 0;
    }
    clearTimeout(wheelTO);
    wheelTO = setTimeout(function () { wheelAcc = 0; }, 150);
  }, { passive: true });

  /* touch nav */
  var tx = 0, ty = 0;
  addEventListener('touchstart', function (e) {
    tx = e.touches[0].clientX; ty = e.touches[0].clientY;
  }, { passive: true });
  addEventListener('touchend', function (e) {
    if (overviewOn) return;
    var dx = e.changedTouches[0].clientX - tx;
    var dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      go(idx + (dx < 0 ? 1 : -1));
    }
  }, { passive: true });

  /* Host-driven navigation: Open Design's host bridge classifies this deck
     as class-driven (because go() toggles .slide.active) but the visible
     slide is moved by deck.style.transform, which the bridge can't drive.
     Two cooperating handlers keep the deck in sync with the host:
       1. An od:slide message listener routes host nav through go() and
          calls stopImmediatePropagation() so the bridge's own listener
          (registered after this one) doesn't run a second time and
          overshoot by re-reading the freshly-toggled .active class.
       2. A MutationObserver on each slide watches .active and pulls the
          deck transform onto the active index for class changes that
          don't come through a message — chiefly the bridge's
          restoreInitialSlide path, which calls setActive() directly. */
  addEventListener('message', function (e) {
    var data = e && e.data;
    if (!data || data.type !== 'od:slide') return;
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    if (data.action === 'go' && typeof data.index === 'number') applySlide(data.index);
    else if (data.action === 'next') applySlide(idx + 1);
    else if (data.action === 'prev') applySlide(idx - 1);
    else if (data.action === 'first') applySlide(0);
    else if (data.action === 'last') applySlide(total - 1);
  });

  if (typeof MutationObserver !== 'undefined') {
    var syncFromActiveClass = function () {
      for (var i = 0; i < slides.length; i++) {
        if (slides[i].classList && slides[i].classList.contains('active') && i !== idx) {
          applySlide(i);
          return;
        }
      }
    };
    var mo = new MutationObserver(syncFromActiveClass);
    slides.forEach(function (s) { mo.observe(s, { attributes: true, attributeFilter: ['class'] }); });
  }

  applySlide(0);
})();
</script>`;

/* ------------------------------------------------------------------ *
 * top-level
 * ------------------------------------------------------------------ */

export function renderDeck(inputs: OpenDesignLandingDeckInputs, baseCss: string): string {
  const assets = inputs.imagery.assets_path.replace(/\/?$/, '/');
  const total = inputs.slides.length;
  const slides = inputs.slides
    .map((s, i) => renderSlide(s, i, total, inputs, assets))
    .join('\n  ');
  return [
    `<!DOCTYPE html>`,
    `<html lang='${inputs.brand.locale ?? 'en'}'>`,
    `<head>`,
    `<meta charset='utf-8' />`,
    `<meta name='viewport' content='width=device-width, initial-scale=1' />`,
    `<title>${inputs.deck_title}</title>`,
    `<meta name='description' content='${inputs.brand.description}' />`,
    `<link rel='preconnect' href='https://fonts.googleapis.com' />`,
    `<link rel='preconnect' href='https://fonts.gstatic.com' crossorigin />`,
    `<link href='https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,500;0,600;1,400;1,500;1,600;1,700&family=JetBrains+Mono:wght@400;500&display=swap' rel='stylesheet' />`,
    `<style>${baseCss}${DECK_CSS}</style>`,
    `</head>`,
    `<body>`,
    `<div id='deck'>`,
    `  ${slides}`,
    `</div>`,
    `<div id='nav'></div>`,
    `<div id='hint'>← / → · esc · swipe</div>`,
    `<div class='deck-progress'><div class='bar'></div></div>`,
    RUNTIME_SCRIPT,
    `</body>`,
    `</html>`,
    ``,
  ].join('\n');
}

async function main(): Promise<void> {
  const [, , inputsArg, outputArg] = process.argv;
  if (!inputsArg || !outputArg) {
    console.error('Usage: npx tsx scripts/compose.ts <inputs.json> <output.html>');
    process.exit(1);
  }

  const inputsPath = isAbsolute(inputsArg) ? inputsArg : resolve(process.cwd(), inputsArg);
  const outputPath = isAbsolute(outputArg) ? outputArg : resolve(process.cwd(), outputArg);

  const [inputsRaw, css] = await Promise.all([
    readFile(inputsPath, 'utf8'),
    readFile(SISTER_STYLES, 'utf8'),
  ]);
  const inputs = JSON.parse(inputsRaw) as OpenDesignLandingDeckInputs;
  const html = renderDeck(inputs, css);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, 'utf8');
  console.log(
    `✓ wrote ${outputPath} (${(html.length / 1024).toFixed(1)} KB, ${inputs.slides.length} slides)`,
  );
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
