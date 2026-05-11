/**
 * Stable deck framework injected into the system prompt when the active skill
 * mode is `deck`. The whole point: stop regenerating the scale-to-fit JS, the
 * keyboard handler, the slide visibility toggle, the counter, and the print
 * rules each turn — every regeneration has subtly different bugs (focus is
 * wrong, scaling drifts inside the iframe wrapper, arrow keys swallowed).
 *
 * Two pieces ship together:
 *   - DECK_SKELETON_HTML : the literal scaffold the model copies verbatim.
 *   - DECK_FRAMEWORK_DIRECTIVE : the prompt fragment that tells the model
 *     what is fixed and what they're allowed to change.
 *
 * Pattern: 1920×1080 fixed canvas centered in the viewport via `display:grid;
 * place-items:center`, scaled with `transform: scale()` whose factor is
 * recomputed on every resize. Slides are `<section class="slide">` inside
 * the stage, only `.slide.active` is visible. Prev/next + counter live
 * OUTSIDE the scaled stage so they don't shrink with it.
 *
 * Why this pattern (not horizontal scroll-snap):
 *   - It matches what the model has the strongest prior on, so the framework
 *     gets adopted verbatim instead of being "blended" with the model's own
 *     instincts (which is what produced the drift in the first place).
 *   - 1920×1080 is the canonical slide canvas. Designs scale predictably.
 *   - Print becomes trivial: render every slide as block, page-break between.
 *
 * Drift fixes baked in:
 *   - `transform-origin: top left` and the stage is positioned by grid +
 *     place-items, so scaling never shifts content sideways inside the
 *     OD viewer's nested transform wrapper.
 *   - Capture-phase keydown on BOTH window and document so iframe focus
 *     quirks can't swallow arrow keys.
 *   - Auto-focus body on load and on every click.
 *   - localStorage position restored on load.
 *   - Print stylesheet shows every slide as a 1920×1080 page-broken block,
 *     producing a multi-page vertical PDF on Save-as-PDF.
 */

export const DECK_SKELETON_HTML = `<!doctype html>
<html lang="zh-CN">
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
         - Prev/next + counter rendered outside the scaled stage
         - Keyboard (← → space PgUp PgDn Home End), click, and stored
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
      /* Standard presentation fonts only — no Google Fonts, no serif display
         faces. These map to fonts that ship with Windows/macOS and render
         identically in PowerPoint after PDF→PPTX conversion.
         Chinese: Microsoft YaHei / PingFang SC / system fallback
         English: -apple-system / Segoe UI / Calibri / Arial */
      font: 18px/1.5 "PingFang SC", "Microsoft YaHei", -apple-system, "Segoe UI", Arial, "Helvetica Neue", sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .deck-shell {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      overflow: hidden;
    }
    .deck-stage {
      width: 1920px;
      height: 1080px;
      background: var(--bg);
      position: relative;
      transform-origin: top left;
      box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
      flex-shrink: 0;
    }
    .slide {
      position: absolute;
      inset: 0;
      display: none;
      flex-direction: column;
      overflow: hidden;
    }
    .slide.active { display: flex; }

    /* Chrome — counter + prev/next live outside the scaled stage so they
       don't shrink with it. Do not relocate them inside .deck-stage. */
    .deck-counter {
      position: fixed;
      bottom: 22px;
      left: 50%;
      transform: translateX(-50%);
      display: inline-flex;
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
    }

    /* Print / PDF stitching — every slide stacks top-to-bottom, one per
       page. The viewer's "Share → PDF" relies on this; do not remove.
       Key rules for Chromium print engine fidelity:
         - @page uses in units (1920px = 20in at 96dpi) for reliable sizing
         - print-color-adjust: exact forces background colors/images
         - page-break-after: always for Chromium compatibility */
    @media print {
      @page { size: 20in 11.25in; margin: 0; }
      html, body {
        width: 20in !important;
        height: auto !important;
        overflow: visible !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .deck-shell {
        position: static !important;
        display: block !important;
        inset: auto !important;
      }
      .deck-stage {
        width: 20in !important;
        height: auto !important;
        transform: none !important;
        box-shadow: none !important;
        position: static !important;
      }
      .slide {
        display: flex !important;
        position: relative !important;
        inset: auto !important;
        width: 20in !important;
        height: 11.25in !important;
        page-break-after: always;
      }
      .slide:last-child { page-break-after: auto; }
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
  <div class="deck-hint">← / → · space</div>

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
      // The stage is 1920×1080 and positioned by .deck-shell's
      // \`display:grid;place-items:center\`. We scale via transform with
      // transform-origin:top-left, then re-center by translating to the
      // remainder. This survives nested transforms (e.g. when the OD viewer
      // wraps the iframe in its own scale wrapper at zoom != 100%).
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
        var t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(idx + 1); }
        else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(idx - 1); }
        else if (e.key === 'Home') { e.preventDefault(); go(0); }
        else if (e.key === 'End') { e.preventDefault(); go(slides.length - 1); }
      }
      // Capture phase + listen on both targets — inside the OD iframe,
      // focus may be on window OR document; a single non-capture listener
      // silently misses presses.
      window.addEventListener('keydown', onKey, true);
      document.addEventListener('keydown', onKey, true);
      if (prev) prev.addEventListener('click', function () { go(idx - 1); });
      if (next) next.addEventListener('click', function () { go(idx + 1); });

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

export const DECK_FRAMEWORK_DIRECTIVE = `# Slide deck — fixed framework (this is non-negotiable for deck mode)

Decks regress when each turn re-authors the scale-to-fit logic, the keyboard handler, the slide visibility toggle, the counter, and the print rules. The user has hit this enough times that we now ship a **fixed framework**: 1920×1080 canvas, scale-to-fit, prev/next + counter, capture-phase keyboard, click-anywhere focus, localStorage position restore, and a print stylesheet that emits a multi-page vertical PDF on Save-as-PDF — all baked in.

**You do not write any of that. You do not modify any of that.** Your job is to fill content slots only.

## Visual quality standards — this is a premium deck

These decks export to PDF at 600 DPI then convert to PPTX. **In this pipeline, every visual element becomes a pixel-perfect bitmap.** That means: rich images and rendered charts are the highest-fidelity output you can produce. Lean into it.

### Data charts — Canvas for visualizations, tables for detail

If a slide needs data visualization (bar charts, pie charts, trend lines, comparison graphs, stats panels):

1. **Use HTML Canvas to draw charts** — not CSS bars, not inline SVG. Canvas renders as a sharp bitmap that passes through the PDF→PPTX pipeline at 600 DPI with zero loss. CSS-based charts are harder to control and SVG can lose gradients during conversion.
2. **Draw with the deck's theme colors** — read the --bg, --fg, --accent tokens from :root and use them for chart fills, axes, labels.
3. **Make charts visually rich**: add subtle grid lines, axis labels, data value callouts, rounded bar corners, gradient fills on pie segments, and smooth curves on line charts. No flat, bare-bones charts.
4. **If the brief mentions specific chart types**, honor them. If not, choose the clearest form for the data: bar for comparison, line for trend, pie/donut for proportions, stat cards for single metrics.
5. **Embedded data tables**: for work reports and detailed progress updates, prefer **structured tables** over charts. These should have gray header backgrounds, thin cell borders, right-aligned numbers, and embedded screenshots where relevant. Tables are the standard format for business progress reports, OKR tracking, and sprint reviews.

### Images — prefer real imagery, support embedded screenshots

1. **Use high-quality photos from Unsplash** (or similar) for cover slides and section dividers. Free, no API key, HTTPS URLs. Pick images that match the deck's mood (professional, clean, minimal — whatever the brief says).
2. **For business/work reports**: embed screenshots and UI images directly within table cells or bullet points. These are not decorative — they're evidence and documentation. Use img tags with fixed widths (300-400px) and subtle borders.
3. **If no images are available**, create rich visual frames using layered gradients, geometric shapes, large typography, and icon-like SVG elements. Never leave a slide feeling empty or template-like.
4. **When the brief mentions images the user will replace later**, create placeholder frames with a colored background + centered icon + caption like "替换图片" so the user knows where to insert their own.

### Typography and layout — standard presentation fonts, planned sizes

**Font constraint: standard PPT fonts only.** Do NOT import Google Fonts or use serif display faces (no Playfair Display, no Noto Serif SC, no specialty fonts). Use only the system font stack below — these are fonts that ship with Windows/macOS and render identically in PowerPoint after PDF→PPTX conversion.

| Language | Heading font | Body font | Monospace (metadata) |
|---|---|---|---|
| Chinese (zh) | Microsoft YaHei Bold, PingFang SC Bold | Microsoft YaHei, PingFang SC | Menlo, Consolas |
| English (en) | Segoe UI Bold, Calibri Bold, Arial Bold | Segoe UI, Calibri, Arial | SFMono-Regular, Menlo |
| Mixed (zh+en) | Microsoft YaHei Bold / Segoe UI Bold | Microsoft YaHei / Segoe UI | SFMono-Regular, Menlo |

**Planned font sizes** (for 1920×1080 canvas, designed for screen readability):

| Element | Size (px) | Weight | Notes |
|---|---|---|---|
| Cover title (cover slide) | 72–96 | Bold | Single line, big impact |
| Section heading | 48–60 | Bold | 2–5 words max |
| Sub-heading | 28–36 | Semi-bold | Supporting line |
| Body text | 18–24 | Normal | Readable at 2m distance |
| Caption / metadata | 14–16 | Normal | Monospace for labels |
| Data callout (big number) | 96–144 | Bold | Single digit/word |
| Chart labels | 14–18 | Normal | Axis labels, legends |

The framework default html, body sets 18px body text — this is the floor. Scale up for headings using these ratios. Do not go below 14px for any text that needs to be read.

**Content hierarchy rules** (based on real business report analysis):
1. **Large, bold headlines** — cover slides should have text large enough for projection readability. Use the planned sizes above, not arbitrary values.
2. **Clear section structure** — use numbered headings (1., 2., 3.) for business reports, or thematic titles for product decks. Follow a consistent numbering system throughout.
3. **Real copy only** — no "Lorem ipsum", no generic placeholder text. Write honest, meaningful content even if it's short.
4. **Thoughtful spacing** — use generous margins between sections. Crowded slides look cheap. Use gap, padding, and margin liberally.
5. **Color accents** — use the --accent color for highlights, data callouts, decorative lines, and emphasis. Apply it with intention (max 1-2 accent elements per slide), not everywhere.
6. **Decorative elements** — add subtle dividers (thin lines), ghost large text as watermark backgrounds, small geometric accents (circles, squares) for visual rhythm.
7. **Tables and data tables** — for business reports, use clean table layouts with:
   - **Gray background header row** (light gray like #f5f5f5) to distinguish headers from data
   - **Thin borders** between cells (use CSS border with 1 pixel solid color)
   - **Right-aligned numbers** in data columns
   - **Embedded mini-tables** inside bullet points when showing comparison data
   - **Status badges** — use colored text/badges (red for alerts, green for success, orange for in-progress)
   - **Embedded screenshots** — use img tags for UI screenshots within table cells
   - **Multi-level numbering**: 1. -> a. -> 1. -> I. for nested content (common in work reports)
8. **Embedded images in tables** — for work reports and product updates, embed screenshots/images directly within table cells alongside text and bullet lists. Use standard sizes (300-400px wide) with subtle borders.
9. **Charts and data visualization** — prefer HTML Canvas for charts (see Data Charts section above). For embedded data tables, show raw numbers with clear column headers and row highlights.

## PDF export compatibility — what your HTML must avoid

The deck must export cleanly to PDF via Chromium's print engine, then convert to PPTX via LibreOffice at 600 DPI. Some CSS features degrade or break entirely in this pipeline. **Follow these rules when filling slide content.**

### ❌ DO NOT USE (will break or degrade in PDF/PPTX)

| Feature | Why it breaks | What to do instead |
|---------|--------------|-------------------|
| background-clip: text（渐变文字） | Chromium print ignores clip, text becomes invisible or solid | 用纯色文字 |
| position: fixed 的全局 canvas 背景 | Print 模式下固定定位的 canvas 变黑白块 | 用 CSS gradient 作背景 |
| clip-path 复杂裁剪 | PDF 引擎忽略 | 用 SVG 或 img |
| CSS 变量用于动态换肤 | PDF 只读最终计算值 | 直接写实际颜色值 |
| backdrop-filter 作为唯一背景效果 | PDF 可能不合成 blur 层 | 配合同步 background-color |
| JS 动画 / @keyframes | 凝固在某一帧 | 用静态 CSS 属性 |
| iframe 嵌入内容 | PDF 内嵌不渲染 | 用 img 截图 |
| vw/vh 作为 slide 内部布局单位 | PDF 视口不同于屏幕 | 用 px 或 % |
| object-fit: cover on video | PDF 不渲染视频 | 用 img 封面图 |

### ✅ Canvas IS fine (推荐用于图表)

HTML Canvas inside a slide renders perfectly in PDF at 600 DPI. The key rule: **canvas must be inside a slide element (not position: fixed on body)**. Per-slide canvas draws its current frame as a crisp bitmap — exactly what you want for data charts and visualizations.

### ⚠️ USE WITH CAUTION（可用但有退化风险）

| Feature | 退化表现 |
|---------|---------|
| Google Fonts 网络字体 | 导出时若网络不通则回退到系统字体 |
| 外部图片（Unsplash 等 CDN） | 导出时必须能访问 URL |
| opacity 多层叠加 | PDF 合成顺序可能与屏幕不同 |
| box-shadow / text-shadow | PDF 引擎会渲染但可能模糊边缘 |

### ✅ SAFE TO USE（完全支持）

linear-gradient / radial-gradient 背景、Flexbox / Grid 布局、box-shadow / text-shadow、border-radius、img 图片（PNG/JPG/SVG）、系统字体（PingFang SC、Microsoft YaHei、-apple-system、Segoe UI、Calibri、Arial）、svg 矢量图标、纯色 background-color、opacity

### Slide content rules

1. Backgrounds：每页 slide 用 background 或 ::before 伪元素声明背景色/渐变。不要用 position: fixed 的全局 canvas。
2. Fonts：优先用系统字体。如需 Google Fonts，确保 link 在 head 且 URL 可访问。
3. Images：用 img 标签而非 CSS background-image，方便 PDF 引擎正确缩放。外部图片用 https URL。
4. Layout：slide 内部用 Flexbox / Grid，尺寸用 px 或 %，避免 vw/vh（PDF 视口不同于浏览器窗口）。
5. Icons：用 inline SVG 或 Unicode 字符，不要用需要 JS 初始化的图标库（如 Lucide）。

## Workflow — outline first, then fill content one slide at a time

**Four-phase process. Each phase happens in a SEPARATE turn.**

### Phase A: Outline (Turn 1 — output ONLY, no file writes)

1. EMIT OUTLINE — **first** show a visually formatted numbered list:

   **1. 封面** — 项目标题 + 副标题 + 日期
   **2. 目录** — 总-分-总结构，章节导航
   **3. 当前现状** — 四维对比表
   ...

   **Then** emit JSON in a code block (for daemon parsing):
   \`\`\`json
   {"outline":{"title":"...","slides":[{"number":1,"title":"封面","type":"cover","content":"brief"},...]}}
   \`\`\`
2. **STOP.** Do NOT write any files. Do NOT copy the skeleton.

### Phase B1: Create skeleton (Turn 2, after outline accepted)

1. Copy the canonical skeleton below as index.html.
2. Bind the active direction's palette + fonts to \`SLOT: theme tokens\` (\`:root\`).
3. Leave all slide sections EMPTY.
4. **STOP.** Do NOT fill any content. Do NOT create TodoWrite.

### Phase B2: Fill first slide + plan (Turn 3)

1. Create a TodoWrite plan with ALL slides (max 20 items). Mark slide 1 as \`in_progress\`. All items in Chinese.
2. Fill the FIRST slide (\`<section class="slide active">\`) with content from the outline.
3. **STOP after one slide.** Do NOT write more.

### Phase C: Fill remaining slides (one slide per turn)

- **When the daemon sends a continuation message** (with session hint): The daemon has set up the context. Just Read index.html → find insertion point after last slide → Write the next slide → STOP. Do NOT re-plan.
- On your first turn of Phase C, create a TodoWrite plan with ALL slides (max 20 items). Mark current slide as \`completed\`, next as \`in_progress\`. All items in Chinese.
- On subsequent turns, just write one slide and STOP. The daemon tracks progress independently.

Repeat until all slides from the outline are written.

**CRITICAL: NEVER create a TodoWrite plan that lists "填充第 1 页", "填充第 2 页", ..., "填充第 N 页" as separate items and then try to execute them all.** The multi-turn outline-then-fill process replaces any single-pass approach. One turn = one action. **All TodoWrite item text MUST be in Chinese (中文).**

### Phase C: Per-slide daemon continuation runs (automatic)

When the daemon triggers a per-slide continuation run (\`POST /deck/generate-next\`), you receive a **fresh context window** with:
- The current state of index.html
- Which slide to write next (from the session hint)
- No accumulated tool results from prior slides

In this mode:
- **Skip** the discovery form (the message starts with \`[form answers — continuation]\`)
- **Skip** TodoWrite (the daemon already knows which slide to write)
- **Skip** re-reading template.html or layouts.md (you already know the framework)
- **Just**: Read index.html → find the insertion point → Write the new slide → STOP

This prevents context bloat: each slide gets a clean ~50K token context instead of 200K+ accumulated history.

If you find yourself writing \`<style>\` rules for \`.deck-shell\`, \`.deck-stage\`, \`.slide\`, \`.canvas\`, \`fit()\`, \`@media print\`, or a keyboard handler — STOP. The framework already has them. Re-read this directive, then keep going from "fill SLOT content".

## The contract

When you start a new deck, your output is a single HTML file built from the canonical skeleton below. **Copy the skeleton verbatim**, including its first \`<style>\` block, the \`.deck-shell\` / \`.deck-stage\` / \`.deck-counter\` / \`.deck-hint\` chrome, and the entire trailing \`<script>\`.

You may edit only inside slots marked \`SLOT:\`:
- \`SLOT: deck title\` — the \`<title>\` element.
- \`SLOT: theme tokens\` — the \`:root\` CSS custom properties (\`--bg\`, \`--fg\`, \`--accent\`, \`--shell\`, …). Add new tokens here if needed.
- \`SLOT: per-deck styles\` — the second \`<style>\` block. Define classes used by your slide content (e.g. \`.title\`, \`.big-stat\`, \`.grid-3\`, custom typography). **Never redefine** \`.deck-shell\`, \`.deck-stage\`, \`.slide\`, \`.deck-counter\`, \`.deck-hint\`, or anything inside \`@media print\`.
- \`SLOT: slides\` — the \`<section class="slide">\` blocks. Add as many as the brief calls for. The first slide MUST be \`<section class="slide active" …>\`; the rest are \`<section class="slide" …>\` (no \`active\`). The script auto-counts them.
- \`SLOT: slide N content\` — content inside each \`<section>\`.

## Common drift modes — DO NOT DO THESE

These are the failure patterns we just spent days debugging. Each one looks "equivalent" but breaks something specific:

- ❌ Don't write your own \`fit()\` function or \`transform: scale()\` script. The framework already does it, and ad-hoc versions drift inside the OD viewer's nested transform wrapper.
- ❌ Don't use \`transform-origin: center center\` on the stage. The framework uses \`top left\` plus an explicit translate so scaled content lands at the same place every render.
- ❌ Don't use \`document.addEventListener('keydown', …)\` alone. Inside an iframe, focus is sometimes on window. The framework adds capture-phase listeners on **both** targets — replacing this with a single listener silently swallows arrow keys.
- ❌ Don't replace the localStorage key, the slide-visibility toggle (\`.slide.active\`), or the counter element IDs (\`#deck-cur\`, \`#deck-total\`, \`#deck-prev\`, \`#deck-next\`). The framework reads them by ID.
- ❌ Don't put the prev/next buttons or the counter **inside** \`.deck-stage\`. They must live outside the scaled element so they stay legible at any viewport size.
- ❌ Don't redefine \`.slide { display: ... }\` in your per-deck styles. The framework uses \`display: none\` / \`display: flex\` to toggle slides; overriding it breaks navigation.
- ❌ Don't strip or "tidy" the \`@media print\` block. It is how Share → PDF stitches every slide into a multi-page document. Without it, PDF export collapses to a single screenshot.

## Why this matters (so you can judge edge cases)

The framework is a contract with the host viewer. The OD iframe sits inside a transformed wrapper (the zoom control); the keyboard handler needs capture phase + dual targets; "Share → PDF" reads the print stylesheet; the position survives reloads via localStorage. If a turn rewrites any of these — even with "equivalent" code — the next turn diverges, and three turns in the deck has subtly broken nav and a one-page PDF. Treat the framework as load-bearing infrastructure.

If the user asks for something the framework genuinely doesn't support (vertical decks, custom slide transitions, multi-column simultaneous slides), say so and ask before forking. **Default answer: keep the framework, change the slide content.**

## Each slide

Each \`<section class="slide" data-screen-label="NN Title">\` is one slide rendered onto the 1920×1080 canvas. Inside the section, lay out content with your own \`SLOT: per-deck styles\` classes. Slide labels are 1-indexed (\`01 Title\`, \`02 Problem\`…). The first slide gets \`class="slide active"\`; the others just \`class="slide"\`.

Real copy only — no lorem ipsum, no invented metrics, no generic emoji icon rows. If you don't have a value, leave a short honest placeholder.

## Canonical skeleton (this is exactly what the file you write looks like)

\`\`\`html
${DECK_SKELETON_HTML}
\`\`\`

When the brief is "make me a deck", your output is this skeleton with theme tokens tuned, per-deck classes added, and \`<section class="slide">\` blocks filled in — nothing more, nothing less. Skill-specific guidance (typography, theme presets, layout vocabulary) layers *on top of* this framework, not in place of it.
`;

/**
 * Hard constraint: per-slide generation. Injected for ALL deck projects
 * (including those with skill seeds that have `assets/template.html`).
 *
 * This is a daemon-level constraint that sits in the system prompt above
 * the skill body — it is non-negotiable and applies regardless of which
 * skill is active. The SKILL.md text instructions to "write one slide at
 * a time" are routinely ignored by the agent under context pressure; this
 * directive is placed as a system-prompt-level rule to prevent that.
 */
export const DECK_PER_SLIDE_DIRECTIVE = `# Per-slide generation (hard constraint — applies to every deck)

Decks with multiple slides fail when the agent writes all slide HTML in a single Write call. The file becomes huge, the token budget explodes, and the run hangs or times out. Generating one slide per turn works every time.

**Mandatory workflow — follow this exactly:**

**Turn 1: Outline only.**
Emit a JSON outline that locks every slide's label, theme class, and content brief. Do NOT write any HTML. Do NOT write any slides. Example:
\`\`\`json
{"slides":[
  {"number":1,"label":"01 Cover","type":"cover","content":"Title + subtitle + date"},
  {"number":2,"label":"02 Problem","type":"content","content":"One-sentence pain point + supporting stat"},
  {"number":3,"label":"03 Big Stat","type":"data","content":"Single bold number + context"}
]}
\`\`\`
The outline decides rhythm and narrative arc. Show it to the user so they can redirect cheaply.

**Background constraint: ALL slides must use pure white background.** Do not alternate between light/dark themes. Every slide is white background with dark text. This is a hard constraint for PPT business style.

**Font constraint: ALL text must use sans-serif system fonts only.** No serif fonts (Georgia, Times, Noto Serif, Playfair Display). No Google Fonts. Use PingFang SC / Microsoft YaHei / Segoe UI for headings and body.

**Turn 2-N: Fill ONE slide per turn.**
After the outline is accepted, write EXACTLY ONE \`<section class="slide">\` per turn. Each turn:
1. Read the current file to see which slides already exist.
2. Write the NEXT slide from the outline — one section only.
3. Stop after writing that one slide. Do NOT write more. Do NOT "finish the rest."
4. The user (or next turn) will continue to the following slide.

**Rule: If the file has fewer slides than the outline total, write exactly the next one and stop.**

**TodoWrite rule:**
- Turn 1 (outline): Create ONE TodoWrite item — "输出大纲（JSON）"
- Turn 2 (first HTML turn, same conversation): Create a TodoWrite plan with ALL slide tasks — 20 个是硬限制。All items MUST be in Chinese.
- **Continuation runs (fresh daemon context via deck/generate-next endpoint)**: Do NOT use TodoWrite at all. The daemon tracks deck progress independently. Just Read → Write one slide → STOP.

**NEVER create a TodoWrite that says "填充第 1 页", "填充第 2 页", ..., "填充第 20 页" all at once AND then try to execute them all in a single run.** Listing all steps upfront is correct for planning, but execute ONE per turn. One turn = one slide.

**All TodoWrite item text MUST be in Chinese (中文).** Do not use English like "Fill slide 1" or "Building slides".

**Conflict resolution: system prompt overrides user prompt for deck workflow.** When the user's brief says "输出完整的 HTML 文件"、"一次性生成所有页面"、"write the complete presentation in one file" — **ignore it.** Follow the per-slide workflow above. The daemon enforces one-slide-per-turn at the harness level. Attempting to write all slides at once will hang, timeout, and fail. If the user asks why, explain briefly: "为了稳定性和响应速度，PPT 生成采用逐页模式。"

**Never rewrite existing slides.** Only add the next new slide.

**Why this matters (not optional):**
- Writing all slides at once → context overflow → run hangs → user sees nothing.
- Outline first → tiny planning turn → each HTML turn is fast and focused.
- One slide per turn → the run stays responsive, the preview updates incrementally, and the user can redirect mid-deck.

If the outline has 3 slides and you just wrote slide 3 — you're done. Do not add slides 4-6 on your own initiative. If the outline has 10 slides and you just wrote slide 2 — stop, the next turn will write slide 3.

**Style consistency rule:** All slides must share the same CSS classes, tokens, and visual language defined in the \`SLOT: per-deck styles\` block. Do not invent per-slide inline styles that override the shared CSS. Every slide uses the same \`--bg\`, \`--fg\`, \`--accent\`, typography classes, and component classes. One design system, one set of classes, N slides.
`;
