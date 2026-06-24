#!/usr/bin/env node
// Bake a looping preview video + poster for each plugin's example.html.
//
// The Home "Community" gallery renders every plugin as a live, scaled
// `example.html` iframe that auto-pans on hover. That is GPU-expensive at
// scale (each tile is its own out-of-process document re-compositing a tall
// page). This script pre-renders the SAME hover-pan as a tiny VP9 .webm plus a
// first-frame .jpg poster, so the gallery can show a cheap `<img>` poster idle
// and play the clip on hover (see MediaSurface) instead of mounting a live
// iframe per tile.
//
// Pipeline (validated end-to-end before productionising):
//   1. Headless Chrome loads the *served* preview URL (so the daemon's
//      asset-cache rewriting + CSP apply, exactly as the gallery sees it).
//   2. Pre-scroll the whole page to trigger lazy-loaded / cross-border-CDN
//      images, then wait for them — otherwise the pan reaches a section before
//      its images load and the frame shows empty boxes.
//   3. CDP screencast captures frames in REAL TIME (so animation plays at true
//      speed) while a constant-velocity (linear) scroll pans top -> bottom.
//   4. ffmpeg encodes the VFR frames to a 60fps VP9 .webm + a poster .jpg.
//
// Runtime deps are provided by the environment, NOT the repo: `puppeteer-core`
// (the CI step `npm i puppeteer-core` ephemerally, or runs inside the
// ghcr.io/puppeteer/puppeteer image), a Chrome/Chromium binary (CHROME env, or
// auto-detected), and `ffmpeg` on PATH. We deliberately keep them out of
// package.json so the daemon/web bundles never pull in a headless browser.
//
// Run against a running daemon/web (the preview endpoint):
//   CHROME=/path/to/chrome BASE_URL=http://127.0.0.1:17579 \
//     node scripts/bake-plugin-previews.mjs --out .tmp/plugin-previews [--id <id>...] [--limit N]
//
// Output: <out>/<id>.mp4, <out>/<id>.poster.jpg, and <out>/manifest.json
// ({ generatedAt, previews: { <id>: { video, poster, durationMs, holdMs } } }).
// Uploading <out> to R2 + committing the manifest is the CI step's job; this
// script only renders + encodes so it stays runnable locally and in CI alike.

import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

// Bump when the bake recipe changes (capture geometry, timing, encoder, waits…)
// so every plugin re-bakes even though its page content is byte-identical.
//   v2: deck mode (slide-walk for fixed-viewport PPT/slideshow pages) +
//       force-load webfonts before capture (CJK templates were baking tofu).
//   v3: bound the slide-walk — cap deckSignal's DOM scan + a wall-time cap — so a
//       deck that renders every slide in one giant rail (#deck{width:10000vw})
//       no longer drags the walk, and the clip, out to 20s+ in CI.
//   v4: honor an `od.preview.motion` ('scroll'|'deck'|'static') declaration;
//       auto-detect deck-vs-scroll by viewport height (not by probing, which
//       misread tall pages with a horizontal marquee as decks); pan via REAL
//       wheel events so scroll-hijack landing pages (custom/transform scroll)
//       actually move.
const BAKE_VERSION = 4;

// ---- config ---------------------------------------------------------------
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:17579';
const RENDER_W = 1440;          // pages lay out at their desktop width
const VIEW_H = 1099;            // 1.31-aspect window showing the FULL width (no clip)
// Decks (PPT/slideshow: a fixed 100vh page navigated by arrow keys or the wheel,
// NOT vertical scroll) are captured at the SAME 1.31 tile aspect as everything
// else — so the clip fills the card with no crop or letterbox — but at a larger
// width. At the normal 1440 width decks hit a width breakpoint and collapse into
// a compact variant (hero headline -> condensed strip); 1760 clears it.
const DECK_W = 1760;
const DECK_H = 1344;            // 1760/1344 = 1.31, the tile aspect
const SLIDE_MS = 1150;          // deck per-slide dwell: ~.9s CSS transition + settle
const MAX_SLIDES = 6;           // advance budget; HOLD + slides stays ~<=9s
const MAX_WALK_MS = 8000;       // hard wall-time cap on the walk: even when signal
                                // reads are slow (huge-DOM decks), the clip stays
                                // bounded (HOLD + walk ~<=10.5s)
const DECK_SCAN_CAP = 600;      // deckSignal scans only the first N elements — the
                                // slide rail/track is a structural element near the
                                // DOM top, so this stays cheap on decks that render
                                // every slide in one giant rail
const OUT_W = Number(process.env.PREVIEW_W || 640); // small — tile renders ~393px
const FPS = Number(process.env.PREVIEW_FPS || 30);  // 30 is smooth for a gentle pan, half the bytes of 60
const VELOCITY = 0.30;          // px/ms — base pan pace (snappy but readable)
const MAX_PAN = 7500;           // hard cap on the pan; tall pages get auto-sped-up
                                // beyond VELOCITY so the pan always finishes within
                                // it, keeping the whole clip (HOLD + pan) <= ~10s.
const HOLD_MS = 2500;           // dwell at the top first, capturing in-place
                                // animation — the gallery loops THIS span while
                                // idle, then plays on past it (the pan) on hover.
const CRF = Number(process.env.PREVIEW_CRF || 28);  // H.264 CRF — higher = smaller; 28 stays readable at tile size

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function argList(name) {
  const out = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1]);
  }
  return out;
}
const OUT = path.resolve(arg('out', '.tmp/plugin-previews'));
const LIMIT = Number(arg('limit', '0')) || 0;
const ONLY = argList('id');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function resolveChrome() {
  if (process.env.CHROME && existsSync(process.env.CHROME)) return process.env.CHROME;
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium',
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error('No Chrome found. Set CHROME=/path/to/chrome.');
}

// ---- discover the html-preview plugins ------------------------------------
async function discoverIds() {
  if (ONLY.length) return ONLY;
  const res = await fetch(`${BASE_URL}/api/plugins`);
  const data = await res.json();
  const items = Array.isArray(data) ? data : (data.plugins || data.items || data.available || []);
  const ids = items
    .map((it) => (typeof it === 'string' ? it : it.id || it.slug))
    .filter(Boolean);
  return LIMIT ? ids.slice(0, LIMIT) : ids;
}

// Authors can declare how their preview should be captured via
// `od.preview.motion` ('scroll' | 'deck' | 'static'); we honor it and only
// auto-detect when it's absent. Returns an id -> motion map (missing => null).
async function loadMotionMap() {
  const map = {};
  try {
    const res = await fetch(`${BASE_URL}/api/plugins`);
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.plugins || data.items || data.available || []);
    for (const it of items) {
      if (!it || typeof it !== 'object') continue;
      const id = it.id || it.slug;
      const m = it.manifest?.od?.preview?.motion;
      if (id && (m === 'scroll' || m === 'deck' || m === 'static')) map[id] = m;
    }
  } catch {}
  return map;
}

// ---- deck (PPT/slideshow) driving -----------------------------------------
// A structural fingerprint of the current slide, robust across deck styles:
// the transform of any slide-rail wider/taller than the viewport, the scroll
// offset of a horizontal track, and any active-slide marker. Deliberately does
// NOT read canvas pixels, so a continuously-animating WebGL background doesn't
// look like a slide change. Runs in the page; must stay self-contained.
function deckSignal(cap) {
  const parts = [location.hash];
  // getBoundingClientRect + getComputedStyle force layout/style per element, so
  // scanning ALL of them is pathological on a deck that renders every slide in
  // one rail (thousands of nodes). The rail/track is structural and near the top
  // of the DOM, so the first `cap` elements in document order suffice.
  const els = document.querySelectorAll('*');
  const n = Math.min(els.length, cap || 600);
  for (let i = 0; i < n; i += 1) {
    const el = els[i];
    const r = el.getBoundingClientRect();
    if (r.width > window.innerWidth * 1.5 || r.height > window.innerHeight * 1.5) {
      parts.push(getComputedStyle(el).transform);
    }
    if (el.scrollWidth > el.clientWidth + 4) parts.push(`sl${el.scrollLeft}`);
  }
  const a = document.querySelector('.active,.is-active,[aria-current="true"],[data-active="true"]');
  if (a) parts.push((a.id || '') + (a.className || ''));
  return parts.join('|').slice(0, 4000);
}

async function driveDeck(page, driver) {
  if (driver === 'arrow') { await page.keyboard.press('ArrowRight'); return; }
  if (driver === 'wheel') {
    await page.evaluate(() => {
      const mk = () => new WheelEvent('wheel', { deltaY: 800, bubbles: true, cancelable: true });
      (document.querySelector('#deck,main,section') || document.body).dispatchEvent(mk());
      window.dispatchEvent(mk());
    });
    return;
  }
  await page.evaluate(() => {
    const b = document.querySelector('[class*="next" i],[aria-label*="next" i],[data-dir="next"],.arrow-right,.next');
    if (b) b.click();
  });
}

// Walk a deck through its slides with the driver detection already found (arrow
// or wheel), played past the HOLD on hover. Stops at the last slide (an input
// that no longer changes deckSignal). A null driver is a fixed single slide with
// no navigation — just hold. Returns the wall-clock span (the manifest durationMs).
async function walkSlides(page, driver) {
  if (!driver) return SLIDE_MS;
  let moved = 0;
  const t0 = Date.now();
  for (let s = 0; s < MAX_SLIDES; s += 1) {
    if (Date.now() - t0 > MAX_WALK_MS) break; // backstop so the clip never runs long
    const before = await page.evaluate(deckSignal, DECK_SCAN_CAP);
    await driveDeck(page, driver);
    await sleep(SLIDE_MS);
    if ((await page.evaluate(deckSignal, DECK_SCAN_CAP)) === before) break; // last slide
    moved += 1;
  }
  return Math.max(SLIDE_MS, Date.now() - t0);
}

// Probe which input advances a fixed-viewport deck: press the arrow key, then
// nudge the wheel, watching deckSignal for a real slide change. Returns 'arrow',
// 'wheel', or null when nothing moves it (a single static screen). Advances the
// deck as a side effect, so callers that go on to capture reload first.
async function probeDeckDriver(page) {
  const sig0 = await page.evaluate(deckSignal, DECK_SCAN_CAP);
  await driveDeck(page, 'arrow');
  await sleep(900);
  if ((await page.evaluate(deckSignal, DECK_SCAN_CAP)) !== sig0) return 'arrow';
  await driveDeck(page, 'wheel');
  await sleep(900);
  if ((await page.evaluate(deckSignal, DECK_SCAN_CAP)) !== sig0) return 'wheel';
  return null;
}

// ---- render + encode one plugin -------------------------------------------
async function bakeOne(browser, id, hash, motion) {
  const page = await browser.newPage();
  await page.setViewport({ width: RENDER_W, height: VIEW_H, deviceScaleFactor: 1 });
  try {
    const res = await page.goto(`${BASE_URL}/api/plugins/${encodeURIComponent(id)}/preview`,
      { waitUntil: 'domcontentloaded', timeout: 25000 });
    if (!res || !res.ok()) { await page.close(); return { id, skipped: `status ${res ? res.status() : 'none'}` }; }
  } catch (e) { await page.close(); return { id, skipped: `load ${e.message}` }; }
  await sleep(1000);

  // Capture mode: an explicit `od.preview.motion` declaration wins; otherwise
  // auto-detect.
  let mode = motion;
  let deckDriver = null;
  if (mode === 'scroll' || mode === 'deck' || mode === 'static') {
    // Explicit declaration: a deck still needs its advancing input probed.
    if (mode === 'deck') deckDriver = await probeDeckDriver(page);
  } else {
    // A vertically-scrollable page is a landing page (pan it) — even with a
    // horizontal marquee/carousel sub-component; classifying by scroll height,
    // not by probing, keeps a tall page off the deck path (a wheel probe would
    // scroll it and the scroll-driven animation reads as a slide change, which
    // walked precision-farming pages sideways). A fixed-viewport page is a deck
    // only if an input actually advances it; otherwise it's a single static
    // screen that just holds its in-place animation (default viewport, no walk).
    const vScrollable = await page.evaluate(
      () => document.documentElement.scrollHeight > window.innerHeight * 1.15,
    );
    if (vScrollable) {
      mode = 'scroll';
    } else {
      deckDriver = await probeDeckDriver(page);
      mode = deckDriver ? 'deck' : 'static';
    }
  }
  const isDeck = mode === 'deck';
  const isStatic = mode === 'static';
  let capW = RENDER_W, capH = VIEW_H;
  if (isDeck) {
    capW = DECK_W; capH = DECK_H;
    await page.setViewport({ width: capW, height: capH, deviceScaleFactor: 1 });
    try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 }); } catch {}
    await sleep(1000);
  }

  // Trigger lazy images by scrolling through, then wait for them, then reset.
  await page.evaluate(async () => {
    const h = document.documentElement.scrollHeight;
    for (let y = 0; y <= h; y += Math.round(window.innerHeight * 0.8)) {
      window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  // Wait for the page's VISUAL resources to settle before recording — capped so
  // rAF-driven animation loops (which never "finish") don't hang the bake:
  //   - web fonts (document.fonts.ready) — else the clip bakes in a fallback
  //     font that swaps the instant a real user opens the page;
  //   - every <img> (incl. the lazy ones the pre-scroll just triggered);
  //   - CSS background-images — heroes routinely use these and they are NOT in
  //     document.images, so they'd otherwise be captured half-loaded/blank;
  //   - <video> backgrounds (.mp4/CloudFront): force muted playback + a frame.
  try {
    await page.evaluate((capMs) => {
      const cap = new Promise((r) => setTimeout(r, capMs));
      // CJK-heavy templates pull Noto Serif/Sans SC from Google Fonts with
      // display=swap; awaiting fonts.ready alone can resolve on the swap
      // fallback. Force every registered face to load, THEN await ready, so the
      // capture isn't a fallback/tofu render. (The CI bake also installs
      // fonts-noto-cjk so the fallback itself carries CJK glyphs if a webfont is
      // slow or blocked, instead of rendering missing-glyph boxes.)
      // Double-pass: await ready FIRST so faces registered by a late-arriving
      // Google Fonts stylesheet are present, force-load any still unloaded, then
      // await ready again — a single pass can enumerate before display=swap
      // faces exist and capture the fallback (e.g. a Shrikhand/Playfair heading).
      const fonts = document.fonts
        ? document.fonts.ready
            .catch(() => {})
            .then(() => Promise.all(
              Array.from(document.fonts).map((f) =>
                f.status === 'loaded' ? null : f.load().catch(() => {}),
              ),
            ))
            .then(() => document.fonts.ready)
            .catch(() => {})
        : Promise.resolve();
      const imgs = Array.from(document.images)
        .filter((i) => !i.complete)
        .map((i) => new Promise((res) => {
          i.addEventListener('load', res, { once: true });
          i.addEventListener('error', res, { once: true });
        }));
      const vids = Array.from(document.querySelectorAll('video')).map((v) => {
        try { v.muted = true; const p = v.play(); if (p && p.catch) p.catch(() => {}); } catch {}
        return v.readyState >= 2 ? Promise.resolve() : new Promise((res) => {
          v.addEventListener('loadeddata', res, { once: true });
          v.addEventListener('error', res, { once: true });
        });
      });
      const bgUrls = new Set();
      document.querySelectorAll('*').forEach((el) => {
        const bg = getComputedStyle(el).backgroundImage;
        if (!bg || bg === 'none') return;
        const re = /url\((['"]?)(.*?)\1\)/g;
        let m;
        while ((m = re.exec(bg))) if (m[2] && !m[2].startsWith('data:')) bgUrls.add(m[2]);
      });
      const bgs = Array.from(bgUrls).map((u) => new Promise((res) => {
        const im = new Image();
        im.onload = im.onerror = res;
        im.src = u;
      }));
      return Promise.race([cap, Promise.all([fonts, ...imgs, ...vids, ...bgs])]);
    }, 12000);
  } catch {}
  await sleep(600);

  const frameDir = path.join(OUT, `.frames-${id}`);
  rmSync(frameDir, { recursive: true, force: true }); mkdirSync(frameDir, { recursive: true });

  const client = await page.createCDPSession();
  const frames = [];
  client.on('Page.screencastFrame', async (e) => {
    frames.push({ data: e.data, ts: e.metadata.timestamp });
    try { await client.send('Page.screencastFrameAck', { sessionId: e.sessionId }); } catch {}
  });

  const maxY = (isDeck || isStatic) ? 0 : await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollHeight - window.innerHeight));
  // Detect the scroll mechanism BEFORE recording: this probe jumps the page
  // (scrollTo 160 -> 0), which once the screencast is running would bake a
  // visible lurch at the head of the pan. Ordinary pages scroll via
  // window.scrollTo; scroll-hijack landing pages (custom / transform scroll)
  // ignore it and need real wheel events to drive their own scroll handler.
  const windowScrolls = maxY > 0 && (await page.evaluate(() => {
    const before = window.scrollY || document.documentElement.scrollTop;
    window.scrollTo(0, 160);
    const moved = (window.scrollY || document.documentElement.scrollTop) > before + 40;
    window.scrollTo(0, 0);
    return moved;
  }));

  await client.send('Page.startScreencast',
    { format: 'jpeg', quality: 80, everyNthFrame: 1, maxWidth: capW, maxHeight: capH });
  // Phase 1 — HOLD on the first slide / page top, capturing in-place animation.
  // The gallery loops this leading span while idle (no advance), so animated
  // pages still look alive without auto-playing.
  await sleep(HOLD_MS);
  // Phase 2 — played past the hold on hover: decks walk their slides; scrollable
  // pages linear-pan (constant velocity) top -> bottom.
  let durMs;
  if (isDeck) {
    durMs = await walkSlides(page, deckDriver);
  } else if (maxY <= 0) {
    // Static / single-screen page: just hold, capturing its in-place animation.
    durMs = 2500;
    await sleep(durMs);
  } else {
    // Pre-computed from the measured page height so the pan always reaches the
    // bottom within MAX_PAN (whole clip stays ~<=10s): base VELOCITY for normal
    // pages, auto-sped-up (capped duration) for tall ones.
    durMs = Math.min(MAX_PAN, Math.round(maxY / VELOCITY));
    // Smooth rAF window.scrollTo for ordinary pages; real wheel events for
    // scroll-hijack pages (windowScrolls probed above, before recording).
    if (windowScrolls) {
      await page.evaluate((dur, my) => new Promise((res) => {
        let start = null;
        function step(t) {
          if (start === null) start = t;
          const e = Math.min(1, (t - start) / dur);
          window.scrollTo(0, Math.round(my * e)); // linear = constant velocity
          if (e < 1) requestAnimationFrame(step); else res();
        }
        requestAnimationFrame(step);
      }), durMs, maxY);
    } else {
      await page.mouse.move(Math.round(capW / 2), Math.round(capH / 2));
      const tick = 40;
      const perTick = Math.max(8, Math.round(maxY / (durMs / tick)));
      const t0 = Date.now();
      while (Date.now() - t0 < durMs) {
        await page.mouse.wheel({ deltaY: perTick });
        await sleep(tick);
      }
    }
  }
  await client.send('Page.stopScreencast');
  await page.close();

  if (frames.length < 5) { rmSync(frameDir, { recursive: true, force: true }); return { id, skipped: `frames ${frames.length}` }; }

  // VFR concat list (real per-frame durations) -> correct real-time speed.
  const lines = [];
  for (let i = 0; i < frames.length; i += 1) {
    const fp = path.join(frameDir, `f-${String(i).padStart(4, '0')}.jpg`);
    writeFileSync(fp, Buffer.from(frames[i].data, 'base64'));
    if (i > 0) lines.push(`duration ${(frames[i].ts - frames[i - 1].ts).toFixed(4)}`);
    lines.push(`file '${fp}'`);
  }
  lines.push(`file '${path.join(frameDir, `f-${String(frames.length - 1).padStart(4, '0')}.jpg`)}'`);
  const listPath = path.join(frameDir, 'list.txt');
  writeFileSync(listPath, lines.join('\n'));

  // Directory-layered, content-addressed keys: `<id>/<fingerprint>/preview.mp4`
  // (+ `poster.jpg`). Immutable — a content change yields a NEW `<fingerprint>`
  // directory (hence a new URL the CDN can cache forever), while a re-bake of the
  // same source resolves to the same keys. The manifest stores these
  // PREFIX-RELATIVE keys; it must NOT repeat the `plugin-previews/` segment that
  // the base URL already carries, or `${base}/${key}` would double it and 404
  // (see specs/change/20260618-plugin-preview-bake-pipeline/spec.md §0). The
  // daemon resolves both `${base}/${key}` and `path.join(dir, key)`, which handle
  // the nested path transparently — no consumer change needed. Existing flat
  // `<id>.<hash>.mp4` entries are left untouched on reuse (additive migration).
  const dirKey = hash ? `${id}/${hash}` : id;
  const videoKey = `${dirKey}/preview.mp4`;
  const posterKey = `${dirKey}/poster.jpg`;
  const video = path.join(OUT, videoKey);
  const poster = path.join(OUT, posterKey);
  mkdirSync(path.dirname(video), { recursive: true });
  const ff = (a) => execFileSync('ffmpeg', ['-y', ...a], { stdio: 'ignore' });
  // H.264 MP4, constant frame rate (the fps filter resamples the concat's
  // real-time timeline to a constant FPS). H.264 decodes reliably in both
  // browsers and Electron — VP9 encoded from this frame pipeline intermittently
  // tripped Chromium/Electron's decoder (PIPELINE_ERROR_DECODE). `+faststart`
  // moves the moov atom up front so playback can begin before the full download.
  ff(['-f', 'concat', '-safe', '0', '-i', listPath,
    '-vf', `scale=${OUT_W}:-2,fps=${FPS}`, '-c:v', 'libx264', '-crf', String(CRF),
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-r', String(FPS), '-an', video]);
  ff(['-i', path.join(frameDir, 'f-0000.jpg'), '-vf', `scale=${OUT_W}:-2`,
    '-q:v', '5', '-frames:v', '1', poster]);
  rmSync(frameDir, { recursive: true, force: true });

  return { id, durationMs: durMs, holdMs: HOLD_MS, video: videoKey, poster: posterKey,
    bytes: statSync(video).size, posterBytes: statSync(poster).size };
}

// ---- main -----------------------------------------------------------------
mkdirSync(OUT, { recursive: true });
const ids = await discoverIds();
const motionMap = await loadMotionMap();
console.log(`baking ${ids.length} plugin previews from ${BASE_URL} -> ${OUT}`);
const browser = await puppeteer.launch({
  executablePath: resolveChrome(), headless: 'new',
  // Let muted hero background videos (.mp4/CloudFront, common on premium
  // landing pages) autoplay so the capture isn't a frozen first frame.
  args: ['--no-sandbox', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
});

const manifestPath = path.join(OUT, 'manifest.json');
const previews = existsSync(manifestPath)
  ? (JSON.parse(readFileSync(manifestPath, 'utf8')).previews || {}) : {};
let ok = 0, skip = 0, reused = 0;
for (const id of ids) {
  const t0 = Date.now();
  // Content-hash skip: a plugin whose preview HTML (and the bake recipe) is
  // unchanged reuses its existing clip — no render, and the CI step re-uploads
  // nothing. Editing the page or bumping BAKE_VERSION invalidates the hash.
  let hash = null;
  try {
    const html = await (await fetch(`${BASE_URL}/api/plugins/${encodeURIComponent(id)}/preview`)).text();
    hash = createHash('sha256').update(html).update(` ${BAKE_VERSION} ${motionMap[id] || ''}`).digest('hex').slice(0, 16);
  } catch {}
  const prev = previews[id];
  // In CI the unchanged clips already live on R2 (not on disk), so PREVIEW_REMOTE
  // trusts the manifest hash without a local-file check; locally we also confirm
  // the files are actually present before reusing.
  const filesPresent = process.env.PREVIEW_REMOTE === '1'
    || (prev && existsSync(path.join(OUT, prev.video)) && existsSync(path.join(OUT, prev.poster)));
  if (hash && prev && prev.hash === hash && filesPresent) {
    reused += 1;
    console.log(`  = ${id}: unchanged, reused`);
    continue;
  }
  let r;
  try { r = await bakeOne(browser, id, hash, motionMap[id]); } catch (e) { r = { id, skipped: `error ${e.message}` }; }
  if (r.skipped) { skip += 1; console.log(`  ~ ${id}: skip (${r.skipped})`); continue; }
  previews[id] = { video: r.video, poster: r.poster, durationMs: r.durationMs, holdMs: r.holdMs, hash };
  ok += 1;
  console.log(`  + ${id}: ${(r.bytes / 1024).toFixed(0)}KB mp4, ${(r.posterBytes / 1024).toFixed(0)}KB poster (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  writeFileSync(manifestPath, JSON.stringify({ generatedAt: null, previews }, null, 2));
}
await browser.close();
console.log(`done: ${ok} baked, ${reused} reused (unchanged), ${skip} skipped -> ${manifestPath}`);
