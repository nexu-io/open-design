#!/usr/bin/env node
// Bake self-contained example.html files for each html-ppt full-deck template.
//
// The Examples gallery in apps/web renders each skill's example via an iframe
// `srcdoc`, which has no opener path and can't reach companion CSS files.
// The upstream `templates/full-decks/<name>/index.html` references shared
// assets via `../../../assets/...` paths — we inline those + the per-deck
// `style.css`, drop the runtime <script> (the gallery only shows a static
// snapshot of slide 1), and write the result to:
//
//   skills/html-ppt-<name>/example.html
//
// Each per-template skill folder must already exist with a SKILL.md.

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML_PPT = path.join(ROOT, 'skills', 'html-ppt');
const ASSETS = path.join(HTML_PPT, 'assets');
const FULL_DECKS = path.join(HTML_PPT, 'templates', 'full-decks');
const SKILLS = path.join(ROOT, 'skills');

async function readMaybe(p) {
  try {
    return await readFile(p, 'utf8');
  } catch {
    return '';
  }
}

const sharedFonts = await readMaybe(path.join(ASSETS, 'fonts.css'));
const sharedBase = await readMaybe(path.join(ASSETS, 'base.css'));
const sharedAnimations = await readMaybe(
  path.join(ASSETS, 'animations', 'animations.css'),
);

// Without runtime.js, no slide gets `.is-active`, so the deck would render
// blank. For a static preview we surface every slide and stack them in
// print-style flow: each slide is 100vh, so the gallery thumbnail iframe
// (fixed viewport) naturally lands on slide 1, while the modal/export and
// print-to-PDF flows scroll/page through the full deck. We deliberately do
// not hide later slides — this artifact is also served via
// `/api/skills/:id/example` and reused by share/export, where dropping
// everything past slide 1 would silently truncate the deck.
const STATIC_FALLBACK_CSS = `
/* Static-preview fallback (runtime.js is absent — keep every slide visible) */
.deck{height:auto;min-height:100vh;overflow:visible}
.slide{position:relative;inset:auto;opacity:1;pointer-events:auto;transform:none;height:100vh;page-break-after:always}
.deck-header,.deck-footer,.slide-number,.progress-bar,.notes-overlay,.overview{pointer-events:none}
.notes{display:none!important}
`;

function inlineLink(html, href, content) {
  // Replace <link rel="stylesheet" href="..."> regardless of attribute order.
  const re = new RegExp(
    `<link[^>]*href=["']${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`,
    'g',
  );
  return html.replace(re, `<style>${content}\n</style>`);
}

async function bakeOne(name) {
  const indexPath = path.join(FULL_DECKS, name, 'index.html');
  const stylePath = path.join(FULL_DECKS, name, 'style.css');
  let html = await readMaybe(indexPath);
  if (!html) {
    console.warn(`[bake] missing ${indexPath}`);
    return false;
  }
  const style = await readMaybe(stylePath);

  html = inlineLink(html, '../../../assets/fonts.css', sharedFonts);
  html = inlineLink(html, '../../../assets/base.css', sharedBase);
  html = inlineLink(
    html,
    '../../../assets/animations/animations.css',
    sharedAnimations,
  );
  html = inlineLink(html, 'style.css', style);

  // Some templates ship a `<link id="theme-link" href="../../../assets/themes/<theme>.css">`
  // so the runtime can cycle themes via `T`. The static gallery has no runtime
  // and srcdoc can't follow `../../../`, so inline whatever theme the template
  // shipped with — that's the look the upstream README screenshots show.
  html = html.replace(
    /<link[^>]*href=["']\.\.\/\.\.\/\.\.\/assets\/themes\/([\w-]+)\.css["'][^>]*>/g,
    (_match, themeName) => {
      try {
        const css = readFileSync(
          path.join(ASSETS, 'themes', `${themeName}.css`),
          'utf8',
        );
        return `<style data-theme="${themeName}">${css}\n</style>`;
      } catch {
        return '';
      }
    },
  );

  // Drop the runtime + any FX runtime references — the static gallery only
  // shows slide 1 and these scripts would 404 inside the srcdoc sandbox.
  html = html.replace(
    /<script[^>]*src=["'][^"']*runtime\.js["'][^>]*><\/script>/g,
    '',
  );
  html = html.replace(
    /<script[^>]*src=["'][^"']*fx-runtime\.js["'][^>]*><\/script>/g,
    '',
  );

  // Append the static fallback at the very end of <head> so it overrides
  // base.css's `.slide{opacity:0}`. We append rather than prepend to win
  // specificity ties without bumping selectors.
  html = html.replace(/<\/head>/i, `<style>${STATIC_FALLBACK_CSS}</style></head>`);

  const outDir = path.join(SKILLS, `html-ppt-${name}`);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'example.html'), html, 'utf8');
  return true;
}

const entries = await readdir(FULL_DECKS, { withFileTypes: true });
const names = entries.filter((e) => e.isDirectory()).map((e) => e.name);

let baked = 0;
for (const name of names) {
  if (await bakeOne(name)) baked++;
}
console.log(`[bake] wrote ${baked}/${names.length} example.html files`);
console.log(`[bake] templates: ${names.join(', ')}`);
