/**
 * Legacy fixed deck framework retained for the `current` and
 * `current_outcome` experiment / rollback variants. The production vNext
 * directive is defined below as a minimal delivery contract plus outcome
 * quality rules.
 *
 * The legacy framework's purpose was to stop regenerating the scale-to-fit JS,
 * keyboard handler, slide visibility toggle, counter, and print rules each turn
 * — every regeneration has subtly different bugs (focus is wrong, scaling
 * drifts inside the iframe wrapper, arrow keys swallowed).
 *
 * Two pieces ship together:
 *   - DECK_SKELETON_HTML : the literal scaffold the model copies verbatim.
 *   - DECK_FRAMEWORK_DIRECTIVE : the prompt fragment that tells the model
 *     what is fixed and what they're allowed to change.
 *
 * Pattern: 1920×1080 fixed canvas anchored at the shell's top-left,
 * centered into the viewport by `fit()` with `transform-origin: top left`
 * and an explicit `translate(tx, ty) scale(s)` whose factor is recomputed
 * on every resize. The shell is intentionally NOT a grid/flex container —
 * any extra centering layer would stack with the explicit translate and
 * push the scaled stage off-screen (see the OD srcdoc bridge's deck-fix
 * placement note in `apps/web/src/runtime/srcdoc.ts:injectDeckBridge`).
 * Slides are `<section class="slide">` inside the stage, only
 * `.slide.active` is visible. Prev/next + counter live OUTSIDE the scaled
 * stage so they don't shrink with it.
 *
 * Why this pattern (not horizontal scroll-snap):
 *   - It matches what the model has the strongest prior on, so the framework
 *     gets adopted verbatim instead of being "blended" with the model's own
 *     instincts (which is what produced the drift in the first place).
 *   - 1920×1080 is the canonical slide canvas. Designs scale predictably.
 *   - Print becomes trivial: render every slide as block, page-break between.
 *
 * Drift fixes baked in:
 *   - `transform-origin: top left` with an explicit
 *     `translate(tx, ty) scale(s)`. The shell is plain block flow (no
 *     grid/flex/place-content), so the stage's natural top-left is (0, 0)
 *     and the translate centers it correctly even inside the OD viewer's
 *     nested transform wrapper.
 *   - Capture-phase keydown on BOTH window and document so iframe focus
 *     quirks can't swallow arrow keys.
 *   - Auto-focus body on load and on every click.
 *   - localStorage position restored on load.
 *   - Print stylesheet shows every slide as a 1920×1080 page-broken block,
 *     producing a multi-page vertical PDF on Save-as-PDF.
 */

import type { ExecutionProfile } from '../execution-profile.js';

export type DeckPromptVariant =
  | 'current'
  | 'current_outcome'
  | 'outcome_only';

export const DEFAULT_DECK_PROMPT_VARIANT: DeckPromptVariant = 'outcome_only';

export const DECK_SKELETON_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title><!-- SLOT: deck title --></title>
  <style>
    /* ===========================================================
       Deck framework — DO NOT EDIT the rules in this <style> block.
       Edit only inside the second <style> block below (per-deck
       styles) and inside <section class="slide"> bodies.

       Contract this framework provides:
         - 1920×1080 fixed canvas, scaled to fit the viewport
         - Only .slide.active is visible at a time
         - Programmatic prev/next + counter elements kept outside the scaled
           stage but hidden by default so the host can render the UI chrome
         - Keyboard (← → space PgUp PgDn Home End R), half-slide click, and stored
           position survive iframe focus quirks
         - "Save as PDF" produces a multi-page vertical PDF, one slide
           per page, by toggling every slide visible under @media print
       =========================================================== */
    :root {
      /* SLOT: theme tokens — the only top-level CSS the agent edits.
         Add or override --bg / --fg / --accent / etc. here. */
      --bg: #ffffff;
      --fg: #1c1b1a;
      --muted: #6b6964;
      --accent: #c96442;
      --surface: #ffffff;
      --shell: #08090d;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--shell);
      color: var(--fg);
      font: 18px/1.5 -apple-system, system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .deck-shell {
      position: fixed;
      inset: 0;
      overflow: hidden;
    }
    .deck-stage {
      width: 1920px;
      height: 1080px;
      background: var(--bg);
      position: relative;
      transform-origin: top left;
      box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
    }
    .slide {
      position: absolute;
      inset: 0;
      overflow: hidden;
    }
    /* Visibility toggle hardened with :not(.active) + !important so cascade
       order can't break it. The previous \`.slide { display:none }\` rule
       lost the cascade whenever a per-slide variant class (e.g.
       \`.s-cold { display:grid }\`) was declared after it on the same
       element — every slide silently became visible at once. The
       \`!important\` is a belt-and-suspenders against agent code that adds
       \`!important\` on variant classes too. */
    .slide:not(.active) { display: none !important; }
    /* The active default uses :where() so it has zero specificity. Per-slide
       variant classes like \`.s-cold { display:grid }\` or
       \`.s-magazine { display:block }\` can override the default flex layout
       just by declaring \`display\` — no need for the variant to be more
       specific. The hide rule above still wins for inactive slides. */
    :where(.slide.active) { display: flex; flex-direction: column; }

    /* Programmatic chrome — counter + prev/next live outside the scaled
       stage so the host bridge can read/update them, but they stay hidden
       in preview, presentation, fullscreen, and new-tab modes. */
    .deck-counter {
      position: fixed;
      bottom: 22px;
      left: 50%;
      transform: translateX(-50%);
      display: none;
      align-items: center;
      gap: 4px;
      background: rgba(10, 14, 26, 0.92);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      padding: 6px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #fff;
      font: 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: 0.18em;
      z-index: 1000;
    }
    .deck-counter button {
      width: 36px; height: 36px;
      background: transparent;
      color: #fff;
      border: 0;
      border-radius: 50%;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      display: grid;
      place-items: center;
      transition: background 0.15s;
    }
    .deck-counter button:hover { background: rgba(255, 255, 255, 0.12); }
    .deck-counter button[disabled] { opacity: 0.3; cursor: default; }
    .deck-counter .deck-count {
      padding: 0 14px;
      letter-spacing: 0.22em;
    }
    .deck-counter .deck-count .total { color: rgba(255, 255, 255, 0.5); }
    .deck-hint {
      position: fixed;
      bottom: 26px;
      right: 28px;
      color: rgba(255, 255, 255, 0.4);
      font: 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      z-index: 999;
      pointer-events: none;
      display: none;
    }

    /* Print / PDF stitching — every slide stacks top-to-bottom, one per
       page. The viewer's "Share → PDF" relies on this; do not remove. */
    @media print {
      @page { size: 1920px 1080px; margin: 0; }
      html, body {
        width: 1920px !important;
        height: auto !important;
        overflow: visible !important;
        background: #fff !important;
      }
      .deck-shell {
        position: static !important;
        display: block !important;
        inset: auto !important;
      }
      .deck-stage {
        width: 1920px !important;
        height: auto !important;
        transform: none !important;
        box-shadow: none !important;
        position: static !important;
      }
      .slide {
        display: flex !important;
        position: relative !important;
        inset: auto !important;
        width: 1920px !important;
        height: 1080px !important;
        page-break-after: always;
        break-after: page;
      }
      .slide:last-child { page-break-after: auto; break-after: auto; }
      .deck-counter, .deck-hint { display: none !important; }
    }
  </style>
  <style>
    /* SLOT: per-deck styles — typography, layout helpers, slide variants.
       Add classes used by the slide content below, e.g. .title, .big-stat,
       .grid-3. Do not redefine .deck-shell / .deck-stage / .slide /
       .deck-counter / .deck-hint or anything inside @media print. */
  </style>
</head>
<body>
  <div class="deck-shell">
    <div class="deck-stage" id="deck-stage">

      <!-- SLOT: slides — one <section class="slide"> per slide. The first
           slide must have class="slide active". The framework auto-counts
           them and toggles .active as the user navigates. -->

      <section class="slide active" data-screen-label="01 Title">
        <!-- SLOT: slide 1 content -->
      </section>

      <section class="slide" data-screen-label="02">
        <!-- SLOT: slide 2 content -->
      </section>

      <!-- ... add as many <section class="slide"> blocks as the brief asks
           for. The first one is .active; the rest are not. -->

    </div>
  </div>

  <!-- Framework chrome — DO NOT EDIT below this line. -->
  <nav class="deck-counter" role="navigation" aria-label="Deck navigation">
    <button type="button" id="deck-prev" aria-label="Previous slide">‹</button>
    <span class="deck-count"><span id="deck-cur">01</span> <span class="total">/ <span id="deck-total">01</span></span></span>
    <button type="button" id="deck-next" aria-label="Next slide">›</button>
  </nav>
  <div class="deck-hint">← / → · space · R reset</div>

  <script>
    (function () {
      var stage = document.getElementById('deck-stage');
      var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
      var prev = document.getElementById('deck-prev');
      var next = document.getElementById('deck-next');
      var cur = document.getElementById('deck-cur');
      var total = document.getElementById('deck-total');
      var STORE = 'deck:idx:' + (location.pathname || '/');
      var idx = 0;

      // ---- scale-to-fit ---------------------------------------------------
      // The stage is 1920×1080 and sits at .deck-shell's (0, 0) in normal
      // block flow — the shell is intentionally NOT a grid/flex container,
      // so the stage's natural top-left is (0, 0). We scale via transform
      // with transform-origin:top-left, then translate by the remainder to
      // center the scaled box in the viewport. This survives nested
      // transforms (e.g. when the OD viewer wraps the iframe in its own
      // scale wrapper at zoom != 100%).
      function fit() {
        var sw = window.innerWidth;
        var sh = window.innerHeight;
        var pad = 32;
        var s = Math.min((sw - pad) / 1920, (sh - pad) / 1080);
        if (!isFinite(s) || s <= 0) s = 1;
        var tx = (sw - 1920 * s) / 2;
        var ty = (sh - 1080 * s) / 2;
        stage.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')';
      }

      // ---- navigation -----------------------------------------------------
      function pad2(n) { return (n < 10 ? '0' : '') + n; }
      function paint() {
        slides.forEach(function (el, i) { el.classList.toggle('active', i === idx); });
        if (cur) cur.textContent = pad2(idx + 1);
        if (total) total.textContent = pad2(slides.length);
        if (prev) prev.toggleAttribute('disabled', idx <= 0);
        if (next) next.toggleAttribute('disabled', idx >= slides.length - 1);
      }
      function go(i) {
        idx = Math.max(0, Math.min(slides.length - 1, i));
        paint();
        try { localStorage.setItem(STORE, String(idx)); } catch (_) {}
      }
      function onKey(e) {
        if (e.__odDeckKeyHandled) return;
        var t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
        if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.__odDeckKeyHandled = true; e.preventDefault(); go(idx + 1); }
        else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.__odDeckKeyHandled = true; e.preventDefault(); go(idx - 1); }
        else if (e.key === 'Home' || String(e.key).toLowerCase() === 'r') { e.__odDeckKeyHandled = true; e.preventDefault(); go(0); }
        else if (e.key === 'End') { e.__odDeckKeyHandled = true; e.preventDefault(); go(slides.length - 1); }
      }
      // Capture phase + listen on both targets — inside the OD iframe,
      // focus may be on window OR document; a single non-capture listener
      // silently misses presses.
      window.addEventListener('keydown', onKey, true);
      document.addEventListener('keydown', onKey, true);
      if (prev) prev.addEventListener('click', function () { go(idx - 1); });
      if (next) next.addEventListener('click', function () { go(idx + 1); });
      document.addEventListener('click', function (e) {
        if (e.defaultPrevented) return;
        if (e.button !== undefined && e.button !== 0) return;
        if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
        var t = e.target;
        while (t && t !== document.body && t !== document.documentElement) {
          var tag = String(t.tagName || '').toUpperCase();
          if (
            tag === 'A' ||
            tag === 'BUTTON' ||
            tag === 'INPUT' ||
            tag === 'TEXTAREA' ||
            tag === 'SELECT' ||
            t.isContentEditable ||
            t.getAttribute('role') === 'button' ||
            t.getAttribute('role') === 'link'
          ) return;
          t = t.parentElement;
        }
        focusDeck();
        if (e.clientX < window.innerWidth / 2) go(idx - 1);
        else go(idx + 1);
      }, true);

      // Auto-focus body so arrow keys work without an initial click.
      document.body.setAttribute('tabindex', '-1');
      document.body.style.outline = 'none';
      function focusDeck() { try { window.focus(); document.body.focus({ preventScroll: true }); } catch (_) {} }
      document.addEventListener('mousedown', focusDeck);
      window.addEventListener('load', focusDeck);

      // Restore last position.
      try {
        var saved = parseInt(localStorage.getItem(STORE) || '0', 10);
        if (!isNaN(saved) && saved >= 0 && saved < slides.length) idx = saved;
      } catch (_) {}

      window.addEventListener('resize', fit);
      fit();
      paint();
      focusDeck();
    })();
  </script>
</body>
</html>`;

const DECK_HANDOFF_STEP_PLACEHOLDER = '%%OD_DECK_HANDOFF_STEP%%';
const DECK_HANDOFF_CHECK_HEADING_PLACEHOLDER = '%%OD_DECK_HANDOFF_CHECK_HEADING%%';
const DECK_HANDOFF_CHECK_ACTION_PLACEHOLDER = '%%OD_DECK_HANDOFF_CHECK_ACTION%%';

const DECK_FRAMEWORK_DIRECTIVE_TEMPLATE = `# Slide deck — fixed framework (this is non-negotiable for deck mode)

Decks regress when each turn re-authors the scale-to-fit logic, the keyboard handler, the slide visibility toggle, the counter, and the print rules. The user has hit this enough times that we now ship a **fixed framework**: 1920×1080 canvas, scale-to-fit, hidden programmatic prev/next + counter, capture-phase keyboard with R reset-to-first-slide, half-slide click navigation, localStorage position restore, and a print stylesheet that emits a multi-page vertical PDF on Save-as-PDF — all baked in.

**You do not write any of that. You do not modify any of that.** Your job is to fill content slots only.

## Workflow — copy framework first, then fill content

When the user asks for slides, your TodoWrite plan **must** start with "copy the deck framework verbatim" before any content step. The intended order is:

\`\`\`
1.  Bind the active direction's palette + fonts to :root in the framework
2.  Copy the canonical skeleton below as a semantically named deck HTML file, such as \`investor-pitch-deck.html\` (nothing else first)
3.  Plan the slide arc and surface hierarchy (state the dominant surface and each inversion's narrative role aloud before writing)
4.  Add per-deck classes inside the second <style> block
5.  Replace each <section class="slide"> SLOT with real content
6.  Self-check (no rewriting framework chrome / @media print / nav script)
7.  ${DECK_HANDOFF_STEP_PLACEHOLDER}
\`\`\`

If you find yourself writing \`<style>\` rules for \`.deck-shell\`, \`.deck-stage\`, \`.slide\`, \`.canvas\`, \`fit()\`, \`@media print\`, or a keyboard handler — STOP. The framework already has them. Re-read this directive, then keep going from "fill SLOT content".

## The contract

When you start a new deck, your output is a single semantically named HTML file built from the canonical skeleton below. **Copy the skeleton verbatim**, including its first \`<style>\` block, the \`.deck-shell\` / \`.deck-stage\` / hidden \`.deck-counter\` / \`.deck-hint\` programmatic chrome, and the entire trailing \`<script>\`. Do not name every deck \`index.html\`; use \`index.html\` only if the user is editing an existing \`index.html\` deck or a fixed runtime convention requires that path.

You may edit only inside slots marked \`SLOT:\`:
- \`SLOT: deck title\` — the \`<title>\` element.
- \`SLOT: theme tokens\` — the \`:root\` CSS custom properties (\`--bg\`, \`--fg\`, \`--accent\`, \`--shell\`, …). Add new tokens here if needed.
- \`SLOT: per-deck styles\` — the second \`<style>\` block. Define classes used by your slide content (e.g. \`.title\`, \`.big-stat\`, \`.grid-3\`, custom typography). **Never redefine** \`.deck-shell\`, \`.deck-stage\`, \`.slide\`, \`.deck-counter\`, \`.deck-hint\`, or anything inside \`@media print\`.
- \`SLOT: slides\` — the \`<section class="slide">\` blocks. Add as many as the brief calls for. The first slide MUST be \`<section class="slide active" …>\`; the rest are \`<section class="slide" …>\` (no \`active\`). The script auto-counts them.
- \`SLOT: slide N content\` — content inside each \`<section>\`.

## Surface hierarchy — narrative first

Unless the user or active design system explicitly requires a different surface program, choose one dominant slide surface from the active brand or direction. Consecutive slides may share it. Use an inverse surface only when it marks a named narrative role such as a chapter break, key reveal, proof point, or closing. A single-surface deck is valid; never alternate light and dark by slide index or quota. Create rhythm through layout, scale, density, imagery, and typography before changing the background.

## Common drift modes — DO NOT DO THESE

These are the failure patterns we just spent days debugging. Each one looks "equivalent" but breaks something specific:

- ❌ Don't write your own \`fit()\` function or \`transform: scale()\` script. The framework already does it, and ad-hoc versions drift inside the OD viewer's nested transform wrapper.
- ❌ Don't use \`transform-origin: center center\` on the stage. The framework uses \`top left\` plus an explicit translate so scaled content lands at the same place every render.
- ❌ Don't use \`document.addEventListener('keydown', …)\` alone. Inside an iframe, focus is sometimes on window. The framework adds capture-phase listeners on **both** targets — replacing this with a single listener silently swallows arrow keys.
- ❌ Don't replace the localStorage key, the slide-visibility toggle (\`.slide.active\`), or the counter element IDs (\`#deck-cur\`, \`#deck-total\`, \`#deck-prev\`, \`#deck-next\`). The framework reads them by ID.
- ❌ Don't put the prev/next buttons or the counter **inside** \`.deck-stage\`. They must live outside the scaled element so the host bridge can manage slides without scaling or clipping the control surface.
- ❌ Don't redefine \`.slide\`, \`.slide.active\`, or \`.slide:not(.active)\` directly. The framework owns the visibility toggle through those exact selectors. If you want a non-flex layout on a slide, **add a variant class to the same \`<section class="slide …">\` element** (e.g. \`.s-cold\`, \`.s-magazine\`) and declare \`display: grid\` / \`display: block\` on the variant. The framework's active default is wrapped in \`:where(...)\` so it has zero specificity — your variant always wins for the active slide. Variant classes do NOT need to be more specific than \`.slide.active\`. (The inactive-hide rule still wins because it uses \`:not(.active) { display: none !important; }\`.)
- ❌ Don't strip or "tidy" the \`@media print\` block. It is how Share → PDF stitches every slide into a multi-page document. Without it, PDF export collapses to a single screenshot.

## Why this matters (so you can judge edge cases)

The framework is a contract with the host viewer. The OD iframe sits inside a transformed wrapper (the zoom control); the keyboard handler needs capture phase + dual targets; "Share → PDF" reads the print stylesheet; the position survives reloads via localStorage. If a turn rewrites any of these — even with "equivalent" code — the next turn diverges, and three turns in the deck has subtly broken nav and a one-page PDF. Treat the framework as load-bearing infrastructure.

If the user asks for something the framework genuinely doesn't support (vertical decks, custom slide transitions, multi-column simultaneous slides), say so and ask before forking. **Default answer: keep the framework, change the slide content.**

## Each slide

Each \`<section class="slide" data-screen-label="NN Title">\` is one slide rendered onto the 1920×1080 canvas. Inside the section, lay out content with your own \`SLOT: per-deck styles\` classes. Slide labels are 1-indexed (\`01 Title\`, \`02 Problem\`…). The first slide gets \`class="slide active"\`; the others just \`class="slide"\`.

Real copy only — no lorem ipsum, no invented metrics, no generic emoji icon rows. If you don't have a value, leave a short honest placeholder.

## Density and overflow discipline (the #1 cause of ugly decks)

Even with the visibility toggle working, slides go ugly when content overflows the 1920×1080 canvas. Specific failure modes that ship today:

- ❌ Title slides with a display headline ≥ 160px **plus** a multi-line subtitle/deck paragraph **plus** an absolutely-positioned \`.footer\` at \`bottom: ~56px\`. The flow content grows downward, the absolute footer occupies the bottom band, and the two collide in the last ~100px of the slide.
- ❌ Stat slides with three numbers + three captions + a footer. Split into three stat slides — the framework counts slides for you, more slides cost nothing.
- ❌ "Magazine spread" attempts that pack masthead + display headline + body grid + sidebar + absolute footer all into a single 1080px slide.

Rules — non-negotiable:

1. **Display headlines on cover/title slides: max ~140px font-size, max 8 words, max 3 lines.** If the headline doesn't fit those bounds, the slide is the wrong shape — split it, don't shrink the font and pack more in.
2. **Reserve a footer safe-zone.** If you use \`.footer { position: absolute; bottom: Npx; }\`, flow content above the footer must stop at least 80px before \`1080 − footer_height − N\`. Practically: don't let flow content extend into the bottom 200px of the slide. Easiest enforcement: make the slide's main content area its own \`<div style="height: 760px;">\` (or \`max-height\`), and the footer absolute below it.
3. **Body slides: ≤ 3 paragraphs, ≤ 56ch lead text width, ≤ 12 words per line.**
4. **One idea per slide.** Two ideas = two slides.

## Data chart discipline (hand-written bar charts)

Hand-written div/CSS charts fail in two ways users report as "the chart is lying": bar lengths eyeballed as magic numbers that don't match the data, and value labels clipped away inside fixed-height bars. If the active template family ships a chart reference (e.g. the \`html-ppt\` family's Chart.js \`chart-bar.html\` template), prefer it over a hand-written div chart. When you do hand-write a bar chart (horizontal or vertical), build it from this skeleton:

\`\`\`html
<div class="chart" style="--max: 5.0">
  <div class="bar-row">
    <span class="bar-label">2024</span>
    <div class="bar-track"><div class="bar" style="--v: 5.0"></div></div>
    <span class="bar-value">5.0 万亿</span>
  </div>
  <!-- one .bar-row per data point; put the REAL numeric value in --v -->
</div>
\`\`\`

\`\`\`css
.bar { width: calc(var(--v) / var(--max) * 100%); }
\`\`\`

Rules — same weight as the density rules above:

1. **Bar lengths are computed, never eyeballed.** Every bar carries its value as an inline \`--v\`; declare \`--max\` ONCE on the chart container so all bars share one baseline. \`--v\` / \`--max\` must be unitless numbers — \`calc()\` division needs a plain number, so units ("万亿", "%", "$") live only in the \`.bar-value\` text. Vertical variant: \`.bar { height: calc(var(--v) / var(--max) * 100%); }\`, and give \`.bar-track\` an explicit height (a percentage height inside an auto-height parent computes to 0 and every bar collapses).
2. **Every data point gets a visible category label AND value label.** Render the value in its own element outside the bar (like \`.bar-value\` above), never inside a fixed-height \`overflow: hidden\` bar where a short bar clips it away.

- ❌ Don't hand-write eyeballed \`height: 62%\` / \`width: 45%\` magic numbers on bars.
- ❌ Don't let bars in the same chart imply different baselines — one \`--max\` per chart.
- ❌ Don't nest value labels inside a clipping fixed-height bar.
- ❌ Don't omit any data point's label, however short its bar.

## Mermaid diagram theme discipline (dark decks)

Mermaid's default theme is built for white pages: near-black labels (\`#333\`), pale node fills, black strokes, and a TRANSPARENT svg background. Embedded in a dark-themed deck it produces the failure users report as "the diagram text is unreadable in dark mode": dark labels sitting directly on the dark slide background. Prefer a hand-written HTML/CSS/SVG diagram styled with the deck's own tokens (\`--bg\`, \`--fg\`, \`--accent\`) — it never drifts from the theme and needs no external JS. When you do embed Mermaid, pick the theme from the slide background at initialize time — never leave the default (light) theme on a dark deck:

\`\`\`html
<script>
  mermaid.initialize({
    startOnLoad: true,
    theme: 'dark',        // dark slide background
    // theme: 'default',  // light slide background
  });
</script>
\`\`\`

For brand fidelity, \`theme: 'base'\` + \`themeVariables\` reuses the deck palette — pass concrete color values (Mermaid cannot resolve CSS \`var()\` references). \`darkMode: true\` alone does NOT darken node fills — \`base\` keeps its cream \`primaryColor\` default, so always set \`primaryColor\` to a dark surface tone alongside the light text:

\`\`\`js
mermaid.initialize({
  startOnLoad: true,
  theme: 'base',
  themeVariables: {
    darkMode: true,                 // match the slide background
    background: '#101014',          // the deck's --bg value, as a literal
    primaryColor: '#1c1c24',        // node fill — dark surface tone, NOT the cream default
    primaryTextColor: '#e8e8ec',    // the deck's --fg value, as a literal
    primaryBorderColor: '#8a8a94',
    lineColor: '#8a8a94',
  },
});
\`\`\`

Rules — same weight as the density rules above:

1. **Diagram text color follows the slide background, not Mermaid's default.** Dark background → \`theme: 'dark'\` or \`base\` + dark \`themeVariables\`; light background → the default is fine.
2. **Never rely on the SVG bringing its own backdrop.** Mermaid emits a transparent-background SVG, so every label sits directly on the slide. If the diagram cannot be themed, give its container an explicit light plate (e.g. \`background: #fff\`, padding, radius) instead of shipping unreadable labels.

- ❌ Don't call \`mermaid.initialize()\` without a \`theme\` on a dark deck.
- ❌ Don't pass \`var(--fg)\` strings into \`themeVariables\` — Mermaid needs literal colors.
- ❌ Don't hand-recolor a single label to "fix" contrast; theme the whole diagram.

## ${DECK_HANDOFF_CHECK_HEADING_PLACEHOLDER}

For every \`<section class="slide">\`, mentally render at 1920×1080 and answer:

- [ ] Does the slide's content fit inside the canvas without clipping or overflowing the bottom?
- [ ] If there's an absolutely-positioned footer/header, does flow content stop before the footer's reserved band? (See Rule 2 above.)
- [ ] Is the display headline ≤ 140px and ≤ 8 words?
- [ ] Does the slide carry ≤ one big idea? (No mashed-together masthead + display headline + subtitle + absolute footer + sidebar.)
- [ ] If the slide has a chart: does every data point show a visible category label and value label?
- [ ] Are bar lengths computed from \`--v\` / \`--max\` so proportions match the data? (Mentally spot-check two bars.)
- [ ] If the slide embeds a Mermaid diagram: is \`mermaid.initialize\` themed to the slide background (dark background → \`dark\`/\`base\` theme), leaving no dark-on-dark labels?

If any answer is "no", redesign the slide BEFORE ${DECK_HANDOFF_CHECK_ACTION_PLACEHOLDER}. Decks that overflow are the most common single failure mode reported by users; the user has rejected one before and will reject one again.

## Prefer the simple-deck skill's layout vocabulary when reachable

If \`plugins/_official/examples/simple-deck/assets/template.html\` and its \`references/layouts.md\` are readable from the project workspace, **prefer those layouts over inventing your own**. The simple-deck skill ships eight paste-ready slide skeletons (cover, body, big-stat, three-point row, pipeline, dark quote, before/after, closing) with tested type scales, density rules, and a P0/P1/P2 checklist. Re-inventing those layouts is the source of most density / overflow bugs the framework can't catch.

Use the layout vocabulary, not the examples' surface sequence. The deck-level surface hierarchy above remains authoritative unless the user, active design system, or an explicitly selected specialized template defines a different surface program.

## Canonical skeleton (this is exactly what the file you write looks like)

\`\`\`html
${DECK_SKELETON_HTML}
\`\`\`

When the brief is "make me a deck", your output is this skeleton with theme tokens tuned, per-deck classes added, and \`<section class="slide">\` blocks filled in — nothing more, nothing less. Skill-specific guidance (typography, theme presets, layout vocabulary) layers *on top of* this framework, not in place of it.
`;

export function renderDeckFrameworkDirective(
  executionProfile: ExecutionProfile = 'filesystem',
): string {
  const isTextArtifact = executionProfile === 'text_artifact';
  return DECK_FRAMEWORK_DIRECTIVE_TEMPLATE
    .replace(
      DECK_HANDOFF_STEP_PLACEHOLDER,
      isTextArtifact
        ? 'Emit one complete `<artifact>` block containing the deck HTML'
        : 'Summarize the written or changed deck file in a short ordinary assistant message',
    )
    .replace(
      DECK_HANDOFF_CHECK_HEADING_PLACEHOLDER,
      isTextArtifact
        ? 'Pre-emit self-check — run this BEFORE writing the `<artifact>` tag'
        : 'Pre-handoff self-check — run this BEFORE the final file summary',
    )
    .replace(
      DECK_HANDOFF_CHECK_ACTION_PLACEHOLDER,
      isTextArtifact ? 'emitting the artifact' : 'handoff',
    );
}

export const DECK_DELIVERY_CONTRACT_DIRECTIVE = `# Deck delivery contract

These requirements define only the delivery boundary between the deck and Open Design. They do not prescribe a visual style or slide template.

1. **Deliver a complete artifact.** Following the active execution contract, deliver one complete HTML deck artifact. When editing an existing deck, preserve its compatible runtime structure unless changing it is necessary to fix a real problem; do not rebuild the runtime for an ordinary content edit.
2. **Use a recognizable slide structure.** Represent every slide as one top-level \`<section class="slide" data-screen-label="NN Title">\` in presentation order. Keep every \`data-screen-label\` stable and unique. The first slide must be visible after load, and all slides must remain in the DOM so the host can navigate, thumbnail, annotate, and export them.
3. **Use a standard presentation canvas.** Use a fixed 16:9 slide that renders correctly at 1920×1080. Keep all content inside the slide bounds; the audience must not need to scroll to see the complete slide.
4. **Cooperate with host navigation.** Do not place navigation inside the slide canvas or reserve slide space for it. If the artifact includes standalone previous/next controls, pagination dots, a page counter, reset controls, or keyboard hints, place all of that chrome in one \`data-deck-nav\` container outside the slide canvas. Open Design hides that container when host navigation is present.
5. **Make the static completed state sufficient.** Essential content must not require hover, clicks, or an unfinished entrance animation to become visible. Every slide must be complete, legible, and exportable in its settled static state.
6. **Honor explicit user requirements.** If the user explicitly requests another aspect ratio, a vertical deck, or special interaction, you may depart from these defaults. Preserve slide discoverability where possible and state any preview or export limitation that remains.

Before handoff, verify slide count and order, first-slide visibility, and slide bounds. When the corresponding capability is available, test host navigation, thumbnail discovery, and multi-page export; otherwise inspect the artifact for the standard structure those capabilities require. Fix failures in the artifact; do not substitute an explanation for a fix.`;

export const DECK_OUTCOME_RULES_DIRECTIVE = `# Deck outcome quality rules

Apply these as result criteria for the deck and for every slide. They constrain the outcome, not the implementation technique.

1. **Give every slide one narrative job.** The deck must move through a deliberate argument, not a pile of independently attractive pages. If removing a slide does not weaken the story, remove or rewrite it.
2. **Make the title the slide's claim.** A title should state the conclusion the audience should retain, not merely name the topic. Keep one primary idea per slide.
3. **Close the claim–evidence–implication loop.** The body must visibly support the title with the most relevant fact, example, comparison, mechanism, or proof, then make clear why that evidence matters. Do not present unsupported conclusions or evidence with no takeaway.
4. **Let structure express reasoning.** Use parallel groups for peers, flows for causality, timelines for sequence, comparisons for choices, and charts for quantitative relationships. Do not force unrelated ideas into equal cards or decorate prose with a diagram that adds no meaning.
5. **Make whitespace functional.** Empty space should establish hierarchy, pacing, grouping, or emphasis. If a slide feels unfinished because content is stranded in one corner, either enlarge the key message, add the missing evidence, or choose a structure that uses the canvas deliberately.
6. **Design for presentation distance.** At thumbnail size, the claim, primary evidence, and reading order must still be apparent. Use a clear type hierarchy, sufficient contrast, and no more detail than the audience can absorb while listening.
7. **Create one visual center of gravity.** Each slide needs a dominant element — a statement, number, chart, product view, or diagram. Supporting elements must reinforce it rather than compete with it.
8. **Vary composition only for narrative reasons.** Keep a coherent deck-wide system. Change surface, density, or layout when the story changes mode — opening, evidence, transition, reveal, or close — never by slide index or for arbitrary variety.
9. **End with a purposeful close.** The final slide must reinforce the core takeaway and make the intended next step explicit. Choose the closing format for the deck's purpose — ask, call to action, recommendation, decision request, contact details, Q&A, or a thank-you page only when gratitude itself has clear relationship, ritual, or brand value. Do not add a generic "Thank you" slide that contributes no information.
10. **Preserve epistemic honesty.** Distinguish sourced facts, user-provided facts, assumptions, and recommendations. Never invent metrics, traction, quotes, customers, or research to make a slide look complete; use an explicit placeholder or qualitative framing when evidence is missing.
11. **Make every visual element earn its place.** Every line, border, container, icon, and decoration must clarify hierarchy, grouping, comparison, scale, or meaning. If removing it does not reduce comprehension, remove it. Never stack multiple boundaries to express the same separation; prefer whitespace, alignment, type, and surface before adding boxes or rules.

Only when relevant:

- **Quantitative charts:** Derive visual proportions from the actual values and show both category and value labels. Never eyeball bar lengths, areas, or ratios.
- **Charts and diagrams:** Theme them for the slide's actual background and verify that every label remains legible at presentation distance.

Before handoff, review the deck once at thumbnail scale and once slide by slide. Rewrite any slide whose claim is unclear, whose evidence does not support it, whose layout hides the reading order, whose content does not advance the narrative, or whose content clips, overflows, or requires scrolling.`;

export const DECK_VNEXT_DIRECTIVE = `${DECK_DELIVERY_CONTRACT_DIRECTIVE}

---

${DECK_OUTCOME_RULES_DIRECTIVE}`;

export function renderDeckPromptDirective(
  variant: DeckPromptVariant = DEFAULT_DECK_PROMPT_VARIANT,
  executionProfile: ExecutionProfile = 'filesystem',
): string {
  if (variant === 'outcome_only') return DECK_VNEXT_DIRECTIVE;
  const current = renderDeckFrameworkDirective(executionProfile);
  if (variant === 'current_outcome') {
    return `${current}\n\n---\n\n${DECK_OUTCOME_RULES_DIRECTIVE}`;
  }
  return current;
}

/** Filesystem compatibility constant for existing imports. */
export const DECK_FRAMEWORK_DIRECTIVE = renderDeckFrameworkDirective('filesystem');
