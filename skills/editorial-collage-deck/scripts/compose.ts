#!/usr/bin/env -S npx -y tsx
/**
 * editorial-collage-deck — slide deck composer.
 *
 * Reads `inputs.json` (matching `../schema.ts`) and writes a single
 * self-contained HTML file: a scroll-snap deck where every slide
 * occupies one viewport. Reuses the Atelier Zero stylesheet from the
 * sister `editorial-collage` skill, then layers deck-specific rules
 * (snap container, slide layout, HUD, keyboard nav).
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
  EditorialCollageDeckInputs,
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
const SISTER_STYLES = resolve(SKILL_ROOT, '..', 'editorial-collage', 'styles.css');

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
  return /^(https?:|mailto:|\/\/)/i.test(href) ? ` target='_blank' rel='noreferrer noopener'` : '';
}

const ARROW_OUT = `<svg viewBox='0 0 24 24'><path d='M5 19L19 5M19 5H8M19 5v11'/></svg>`;

function imgFor(slot: string | undefined, assets: string): string {
  if (!slot) return '';
  return `<img src='${assets}${slot}.png' alt='' />`;
}

/* ------------------------------------------------------------------ *
 * deck-specific stylesheet (layered on top of editorial-collage CSS)
 * ------------------------------------------------------------------ */

const DECK_CSS = `
/* deck container — scroll-snap pagination */
html, body { height: 100%; }
body { overflow: hidden; }
.deck {
  height: 100vh;
  overflow-y: scroll;
  scroll-snap-type: y mandatory;
  scroll-behavior: smooth;
  position: relative;
}
.slide {
  height: 100vh;
  scroll-snap-align: start;
  scroll-snap-stop: always;
  display: grid;
  align-items: stretch;
  position: relative;
  padding: 0;
  border-bottom: 1px solid var(--line-soft);
  /* Clip art / oversized content so it cannot bleed into adjacent slides
   * at narrow / tall viewports (1/1 aspect-ratio art often exceeds 100vh
   * minus padding). */
  overflow: hidden;
}
.slide-inner {
  max-width: 1360px;
  margin: 0 auto;
  padding: 80px 80px 64px;
  width: 100%;
  height: 100%;
  display: grid;
  align-content: center;
  gap: 28px;
  position: relative;
  min-height: 0;
}
/* Cap art panels so they fit inside the slide minus the inner padding. */
.s-cover .art,
.s-content .art,
.s-quote .art {
  max-height: calc(100vh - 160px);
  min-height: 0;
}

/* HUD — fixed top bar + slide counter + keyboard hint */
.deck-hud {
  position: fixed;
  top: 18px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 32px;
  z-index: 50;
  font-family: var(--sans);
  font-size: 10.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-faint);
  pointer-events: none;
}
.deck-hud .left { display: inline-flex; gap: 14px; align-items: center; pointer-events: auto; }
.deck-hud .right { display: inline-flex; gap: 14px; align-items: center; pointer-events: auto; }
.deck-hud .mark {
  width: 24px; height: 24px; border-radius: 50%;
  border: 1px solid var(--ink); display: inline-flex;
  align-items: center; justify-content: center;
  font-family: var(--serif); font-style: italic; font-size: 12px;
  color: var(--ink); background: rgba(239,231,210,0.85);
  backdrop-filter: blur(2px);
}
.deck-hud .counter {
  font-family: var(--mono);
  letter-spacing: 0.04em;
  color: var(--ink);
  background: rgba(239,231,210,0.85);
  padding: 4px 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  backdrop-filter: blur(2px);
}
.deck-hud .keys {
  background: rgba(239,231,210,0.85);
  padding: 4px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  backdrop-filter: blur(2px);
}

/* progress bar at bottom */
.deck-progress {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  height: 2px;
  background: var(--line-soft);
  z-index: 50;
}
.deck-progress .bar {
  height: 100%;
  background: var(--coral);
  width: 0%;
  transition: width 240ms ease;
}

/* ---------- COVER slide ---------- */
.s-cover .slide-inner {
  grid-template-columns: 1.1fr 0.9fr;
  align-content: center;
  gap: 60px;
}
.s-cover .copy {
  display: flex; flex-direction: column; gap: 22px;
}
.s-cover .eyebrow {
  font-family: var(--sans); font-size: 11px; font-weight: 600;
  letter-spacing: 0.22em; text-transform: uppercase;
  color: var(--coral); display: inline-flex; align-items: center; gap: 12px;
}
.s-cover .eyebrow::before {
  content: ''; width: 18px; height: 1px;
  background: var(--coral); display: inline-block;
}
.s-cover h1 {
  font-family: var(--sans);
  font-weight: 800;
  font-size: clamp(40px, 5.2vw, 80px);
  line-height: 1.02;
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
  font-size: 22px; color: var(--ink-soft); margin-top: -8px;
}
.s-cover .lead {
  font-family: var(--body); font-size: 17px;
  color: var(--ink-soft); max-width: 42ch; line-height: 1.55;
}
.s-cover .meta {
  margin-top: 32px;
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em;
  color: var(--ink-faint);
}
.s-cover .art {
  position: relative; aspect-ratio: 1 / 1; max-width: 620px;
  margin-left: auto; margin-right: 0;
  border: 1px solid var(--line-soft); border-radius: 14px;
  overflow: hidden; background: var(--bone);
}
.s-cover .art img { width: 100%; height: 100%; object-fit: contain; }

/* ---------- SECTION divider slide ---------- */
.s-section .slide-inner {
  grid-template-columns: 1fr;
  align-content: center;
  text-align: center;
  gap: 32px;
}
.s-section .roman {
  font-family: var(--serif); font-style: italic; font-weight: 500;
  font-size: clamp(80px, 10vw, 160px);
  color: var(--coral); line-height: 1; letter-spacing: -0.02em;
}
.s-section h2 {
  font-family: var(--sans); font-weight: 800;
  font-size: clamp(54px, 6.6vw, 100px);
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
  font-size: clamp(40px, 4.6vw, 64px);
  letter-spacing: -0.024em; line-height: 1.05;
  color: var(--ink); margin: 0;
}
.s-content h2 em { font-family: var(--serif); font-style: italic; font-weight: 500; }
.s-content h2 .dot { color: var(--coral); }
.s-content .body {
  font-family: var(--body); font-size: 16px;
  color: var(--ink-soft); max-width: 56ch; line-height: 1.55;
}
.s-content .body code { font-family: var(--mono); font-size: 14px; background: var(--bone); padding: 1px 6px; border-radius: 4px; }
.s-content ul {
  list-style: none; padding: 0; margin: 0;
  display: flex; flex-direction: column; gap: 12px;
}
.s-content li {
  font-family: var(--sans); font-size: 15px;
  color: var(--ink-soft); display: flex; gap: 14px; align-items: flex-start;
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
.s-stats .slide-inner { grid-template-columns: 1fr; gap: 60px; }
.s-stats .head { display: flex; flex-direction: column; gap: 22px; }
.s-stats .eyebrow {
  font-family: var(--sans); font-size: 11px; font-weight: 600;
  letter-spacing: 0.22em; text-transform: uppercase; color: var(--coral);
  display: inline-flex; align-items: center; gap: 12px;
}
.s-stats .eyebrow::before { content: ''; width: 18px; height: 1px; background: var(--coral); display: inline-block; }
.s-stats h2 {
  font-family: var(--sans); font-weight: 800;
  font-size: clamp(44px, 5vw, 72px);
  letter-spacing: -0.026em; line-height: 1.05; max-width: 18ch; margin: 0;
}
.s-stats h2 em { font-family: var(--serif); font-style: italic; font-weight: 500; }
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
  font-size: clamp(80px, 9vw, 140px); line-height: 1;
  letter-spacing: -0.04em; color: var(--ink);
}
.s-stats .stat .num em { color: var(--coral); font-family: var(--serif); font-style: italic; font-weight: 500; }
.s-stats .stat .label {
  font-family: var(--sans); font-size: 12px;
  letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--ink); font-weight: 600;
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
.s-quote .slide-inner { grid-template-columns: 1.4fr 0.8fr; gap: 60px; align-items: center; }
.s-quote.no-art .slide-inner { grid-template-columns: 1fr; max-width: 980px; }
.s-quote blockquote {
  font-family: var(--sans); font-weight: 700;
  font-size: clamp(36px, 4vw, 56px);
  letter-spacing: -0.022em; line-height: 1.15;
  color: var(--ink); margin: 0;
  position: relative;
}
.s-quote blockquote em { font-family: var(--serif); font-style: italic; font-weight: 500; }
.s-quote .author {
  margin-top: 38px; display: flex; align-items: center; gap: 16px;
}
.s-quote .author .avatar {
  width: 48px; height: 48px; border-radius: 50%; background: var(--ink);
  color: var(--paper); font-family: var(--serif); font-style: italic; font-size: 22px;
  display: inline-flex; align-items: center; justify-content: center;
}
.s-quote .author p { font-family: var(--sans); font-size: 14px; font-weight: 600; }
.s-quote .author p span { display: block; color: var(--ink-mute); font-weight: 400; }
.s-quote .art {
  position: relative; aspect-ratio: 1 / 1;
  border: 1px solid var(--line-soft); border-radius: 14px;
  overflow: hidden; background: var(--bone);
}
.s-quote .art img { width: 100%; height: 100%; object-fit: contain; }

/* ---------- CTA slide ---------- */
.s-cta .slide-inner { grid-template-columns: 1fr; max-width: 980px; gap: 32px; text-align: left; }
.s-cta .eyebrow {
  font-family: var(--sans); font-size: 11px; font-weight: 600;
  letter-spacing: 0.22em; text-transform: uppercase; color: var(--coral);
  display: inline-flex; align-items: center; gap: 12px;
}
.s-cta .eyebrow::before { content: ''; width: 18px; height: 1px; background: var(--coral); display: inline-block; }
.s-cta h2 {
  font-family: var(--sans); font-weight: 800;
  font-size: clamp(54px, 6.4vw, 96px);
  letter-spacing: -0.028em; line-height: 1.0; color: var(--ink); margin: 0;
}
.s-cta h2 em { font-family: var(--serif); font-style: italic; font-weight: 500; }
.s-cta h2 .dot { color: var(--coral); }
.s-cta .body { font-family: var(--body); font-size: 17px; color: var(--ink-soft); max-width: 50ch; line-height: 1.55; }
.s-cta .actions { display: inline-flex; gap: 14px; margin-top: 12px; }

/* ---------- END slide ---------- */
.s-end .slide-inner {
  grid-template-columns: 1fr;
  align-content: end;
  padding-bottom: 72px;
  text-align: left;
  gap: 16px;
  max-width: none;
  padding-left: 64px; padding-right: 64px;
}
.s-end .word {
  font-family: var(--sans); font-weight: 900;
  font-size: clamp(80px, 14vw, 220px);
  letter-spacing: -0.04em; line-height: 1.05;
  color: var(--ink); white-space: nowrap;
  overflow-x: hidden;
  padding-bottom: 0.18em;
}
.s-end .word em { font-family: var(--serif); font-style: italic; font-weight: 500; color: var(--coral); }
.s-end .footer {
  border-top: 1px solid var(--line);
  padding-top: 22px;
  font-family: var(--sans); font-size: 11px;
  letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--ink-faint);
}

/* responsive */
@media (max-width: 1080px) {
  .slide-inner { padding: 48px 56px; }
  .s-cover .slide-inner,
  .s-content.layout-left .slide-inner,
  .s-content.layout-right .slide-inner,
  .s-quote .slide-inner { grid-template-columns: 1fr; gap: 36px; }
  .s-content.layout-right .copy { order: 1; }
  .s-content.layout-right .art { order: 2; }
}
@media (max-width: 640px) {
  .slide-inner { padding: 36px 24px; }
  .deck-hud { padding: 0 16px; font-size: 9.5px; letter-spacing: 0.14em; }
  .deck-hud .keys { display: none; }
}
`;

/* ------------------------------------------------------------------ *
 * slide renderers
 * ------------------------------------------------------------------ */

function renderCover(s: CoverSlide, assets: string): string {
  return `<section class='slide s-cover' data-slide-kind='cover'>
  <div class='slide-inner'>
    <div class='copy'>
      <span class='eyebrow'>${s.eyebrow}</span>
      <h1>${mixed(s.title)}</h1>
      ${s.subtitle ? `<div class='subtitle'>${s.subtitle}</div>` : ''}
      <p class='lead'>${s.lead}</p>
      ${s.meta ? `<div class='meta'>${s.meta}</div>` : ''}
    </div>
    <div class='art'>${imgFor(s.image_slot, assets)}</div>
  </div>
</section>`;
}

function renderSection(s: SectionSlide): string {
  return `<section class='slide s-section' data-slide-kind='section'>
  <div class='slide-inner'>
    <div class='roman'>${s.roman}</div>
    <h2>${mixed(s.title)}</h2>
    ${s.lead ? `<p class='lead'>${s.lead}</p>` : ''}
  </div>
</section>`;
}

function renderContent(s: ContentSlide, assets: string): string {
  const layout = s.layout ?? 'left';
  const hasArt = !!s.image_slot;
  return `<section class='slide s-content layout-${layout}${hasArt ? '' : ' no-art'}' data-slide-kind='content'>
  <div class='slide-inner'>
    <div class='copy'>
      ${s.eyebrow ? `<span class='eyebrow'>${s.eyebrow}</span>` : ''}
      <h2>${mixed(s.title)}</h2>
      ${s.body ? `<p class='body'>${s.body}</p>` : ''}
      ${s.bullets && s.bullets.length ? `<ul>${s.bullets.map((b) => `<li>${b}</li>`).join('')}</ul>` : ''}
    </div>
    ${hasArt ? `<div class='art'>${imgFor(s.image_slot, assets)}</div>` : ''}
  </div>
</section>`;
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
  return `<section class='slide s-stats' data-slide-kind='stats'>
  <div class='slide-inner'>
    <div class='head'>
      ${s.eyebrow ? `<span class='eyebrow'>${s.eyebrow}</span>` : ''}
      <h2>${mixed(s.title)}</h2>
    </div>
    <div class='grid'>
      ${stats}
    </div>
    ${s.caption ? `<div class='caption'>${s.caption}</div>` : ''}
  </div>
</section>`;
}

function renderQuote(s: QuoteSlide, assets: string): string {
  const hasArt = !!s.image_slot;
  return `<section class='slide s-quote${hasArt ? '' : ' no-art'}' data-slide-kind='quote'>
  <div class='slide-inner'>
    <div>
      <blockquote>&ldquo;${mixed(s.quote)}&rdquo;</blockquote>
      <div class='author'>
        <span class='avatar'>${s.author.initial}</span>
        <p>${s.author.name}<br/><span>${s.author.title}</span></p>
      </div>
    </div>
    ${hasArt ? `<div class='art'>${imgFor(s.image_slot, assets)}</div>` : ''}
  </div>
</section>`;
}

function renderCTA(s: CTASlide): string {
  return `<section class='slide s-cta' data-slide-kind='cta'>
  <div class='slide-inner'>
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
  </div>
</section>`;
}

function renderEnd(s: EndSlide): string {
  return `<section class='slide s-end' data-slide-kind='end'>
  <div class='slide-inner'>
    <div class='word'>${mixed(s.mega)}</div>
    ${s.footer ? `<div class='footer'>${s.footer}</div>` : ''}
  </div>
</section>`;
}

function renderSlide(s: Slide, assets: string): string {
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

/* ------------------------------------------------------------------ *
 * runtime script (keyboard nav + counter + progress)
 * ------------------------------------------------------------------ */

const RUNTIME_SCRIPT = `
<script>
  /*
   * Deck runtime — keyboard nav, counter update, progress bar.
   *
   * • ←/PageUp/k  → previous slide
   * • →/PageDown/Space/j → next slide
   * • Home/End    → first / last slide
   * • Updates .deck-hud .counter and .deck-progress .bar live as the
   *   user scrolls or paginates.
   */
  (function () {
    var deck = document.querySelector('.deck');
    if (!deck) return;
    var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
    var counter = document.querySelector('.deck-hud .counter');
    var bar = document.querySelector('.deck-progress .bar');
    var total = slides.length;

    function indexFromScroll() {
      var y = deck.scrollTop;
      var h = deck.clientHeight;
      var i = Math.round(y / h);
      if (i < 0) i = 0;
      if (i > total - 1) i = total - 1;
      return i;
    }
    function update() {
      var i = indexFromScroll();
      if (counter) counter.textContent = String(i + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0');
      if (bar) bar.style.width = ((i + 1) / total * 100) + '%';
    }
    function goto(i) {
      if (i < 0) i = 0;
      if (i > total - 1) i = total - 1;
      slides[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    deck.addEventListener('scroll', update, { passive: true });
    document.addEventListener('keydown', function (e) {
      var i = indexFromScroll();
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ' || e.key === 'j') {
        e.preventDefault(); goto(i + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'k') {
        e.preventDefault(); goto(i - 1);
      } else if (e.key === 'Home') {
        e.preventDefault(); goto(0);
      } else if (e.key === 'End') {
        e.preventDefault(); goto(total - 1);
      }
    });
    update();
  })();
</script>`;

/* ------------------------------------------------------------------ *
 * top-level
 * ------------------------------------------------------------------ */

export function renderDeck(inputs: EditorialCollageDeckInputs, baseCss: string): string {
  const assets = inputs.imagery.assets_path.replace(/\/?$/, '/');
  const slides = inputs.slides.map((s) => renderSlide(s, assets)).join('\n  ');
  const total = inputs.slides.length;
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
    `<div class='deck-hud'>`,
    `  <div class='left'>`,
    `    <span class='mark'>${inputs.brand.mark}</span>`,
    `    <span>${inputs.deck_title}</span>`,
    `  </div>`,
    `  <div class='right'>`,
    `    <span class='keys'>← / → · Space</span>`,
    `    <span class='counter'>01 / ${String(total).padStart(2, '0')}</span>`,
    `  </div>`,
    `</div>`,
    `<div class='deck'>`,
    `  ${slides}`,
    `</div>`,
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
  const inputs = JSON.parse(inputsRaw) as EditorialCollageDeckInputs;
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
