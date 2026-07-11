---
name: fs-electric-studio
en_name: "Write a B2B SaaS Sales Proposal like a Tier-1 Enterprise AE"
zh_name: "像一线企业客户 AE 一样写 B2B SaaS 销售提案"
description: |
  Open Design as an enterprise design platform: a buyer-forwardable proposal for a design-org's economic buyer — pain, value, ROI, rollout. Built as a decision-grade B2B sales deck for economic buyer, design VP, procurement.
en_description: |
  Open Design as an enterprise design platform: a buyer-forwardable proposal for a design-org's economic buyer — pain, value, ROI, rollout. Built as a decision-grade B2B sales deck for economic buyer, design VP, procurement.
zh_description: |
  像一线企业客户 AE 一样写 B2B SaaS 销售提案——一份可商业交付的B2B 销售 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "b2b-sales"
  - "b2b-saas-sales-proposal"
  - "sales"
  - "renewal"
  - "customer"
  - "decision-deck"
  - "commercial-slide-agent"
  - "fs-electric-studio"
triggers:
  - "b2b-saas-sales-proposal"
  - "b2b-sales"
  - "Write a B2B SaaS Sales Proposal like a Tier-1 Enterprise AE"
  - "像一线企业客户 AE 一样写 B2B SaaS 销售提案"
  - "sales"
  - "renewal"
  - "customer"
  - "html deck"
  - "html slides"
od:
  mode: deck
  surface: web
  upstream: "https://github.com/zarazhangrui/frontend-slides"
  preview:
    type: html
    entry: example.html
  example_prompt_i18n:
    zh-CN: "用钴蓝工作室（Electric Studio）把我的内容做成一套大胆干净的上下分割面板单文件 HTML 幻灯片：白上 × 钴蓝 #4361ee 下、四角 brand marks、面板接缝深色 accent bar、引文排印为主视觉、全 Manrope。从 example.html 出发只替换内容，保留设计系统。"
  category: "b2b-sales"
  scenario: "sales"
  example_prompt: "Create \"Write a B2B SaaS Sales Proposal like a Tier-1 Enterprise AE\" as a decision-grade B2B sales deck in this template's own visual system. Subject: Open Design as an enterprise design platform: a buyer-forwardable proposal for a design-org's economic buyer — pain, value, ROI, rollout. Audience: economic buyer, design VP, procurement. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: can the champion forward this internally without rewriting it."
---

# Electric Studio · 钴蓝工作室

Bold, clean, professional, high-contrast split-panel decks. Theme locked to the **Electric Studio** preset (section 2 of `STYLE_PRESETS.md`) from the MIT-licensed [zarazhangrui/frontend-slides](https://github.com/zarazhangrui/frontend-slides).

**Start from `example.html` in this plugin folder. It is the proven seed: keep its stage CSS (full viewport-base.css contents), the split-panel shell, the corner-marks chrome, the `:root` tokens, and the entire `SlidePresentation` controller script verbatim — replace slide content only. Do not rewrite the design; do not introduce any color or font outside this spec.**

## Locked design tokens (`:root` — complete list, no additions)

```css
:root {
    --bg-dark: #0a0a0a;                          /* edge bar, dark text, stage letterbox */
    --bg-white: #ffffff;                         /* upper panel */
    --accent-blue: #4361ee;                      /* cobalt panel, chips, bars, numerals */
    --text-dark: #0a0a0a;
    --text-light: #ffffff;
    --text-dark-soft: rgba(10, 10, 10, 0.58);
    --text-light-soft: rgba(255, 255, 255, 0.72);
    --line-dark: rgba(10, 10, 10, 0.14);
    --line-light: rgba(255, 255, 255, 0.28);
    --blue-soft: rgba(67, 97, 238, 0.10);        /* tick boxes, outline bar fills */

    --stage-bg: var(--bg-dark);
    --slide-bg: var(--bg-white);

    --font: 'Manrope', sans-serif;               /* the ONLY typeface */
    --title-size: 152px;
    --h2-size: 88px;
    --lede-size: 33px;
    --body-size: 27px;

    --slide-pad-x: 110px;
    --edge-bar-h: 14px;

    --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
    --duration-normal: 0.7s;
}
```

Forbidden: any other hue, gradients, purple/indigo (#6366f1), warm accents, photography, illustrations, drop shadows, rounded hero cards. The palette is exactly white / cobalt / near-black plus their soft alphas.

## Typography (all Manrope, Google Fonts weights 400/500/800)

- **Display / H2** — Manrope 800, tight negative letter-spacing (`-0.025em` to `-0.035em`), line-height ≤ 1.08. Title ~152px, H2 60–88px. A terminal period in `--accent-blue` (`<span class="blue">.</span>`) is a signature flourish.
- **Quote hero** — Manrope 800 at ~92px with an oversized cobalt `“` mark (~220px): **quote typography is the deck's hero visual.**
- **Kicker** — 22px, 800, uppercase, `letter-spacing: 0.34em`, cobalt on white / white on cobalt.
- **Body / lede** — 400/500, 25–33px. Support copy on the white panel uses `--text-dark-soft`; body copy on the cobalt panel stays full `--text-light` for WCAG AA contrast (the soft light alpha is reserved for bold uppercase chrome: marks, hints, separators).
- **Marks** — 19px, 800, uppercase, `letter-spacing: 0.22em`.
- Never substitute Inter, Roboto, Arial, serifs, or any second typeface.

## Locked layout system — vertical split panels

Every slide is the same shell:

```html
<section class="slide s-<master>">
  <div class="split">
    <div class="panel panel-white panel-pad"> … </div>
    <div class="edge-bar"></div>            <!-- 14px #0a0a0a accent bar on the panel seam -->
    <div class="panel panel-blue panel-pad"> … </div>
  </div>
  <div class="mark mark-tl dark"><span class="chip"></span>Brand</div>
  <div class="mark mark-tr dark"><span class="soft">Section</span></div>
  <div class="mark mark-bl light"><span class="soft">Deck label</span></div>
  <div class="mark mark-br light">NN / NN</div>
</section>
```

- **White above, cobalt #4361ee below — always.** Vary only the split ratio per master; never side-by-side splits, never blue-over-white.
- **Edge bar** (`.edge-bar`, 14px, `--bg-dark`) sits on the seam of every slide; use `.edge-bar.light` (white) only when a slide reads as cobalt-dominant and needs the inverse.
- **Brand marks in corners** are the chrome (no breadcrumbs, no baseline rule): top-left cobalt chip (16px square) + wordmark; top-right section label; bottom-left deck label; bottom-right `NN / NN` page mark. Marks over the white panel use `.dark`, marks over the cobalt panel use `.light`.
- Horizontal padding is `--slide-pad-x` (110px) on both panels; spacing stays confident and restrained — generous margins, no cramming.

## Master pages (compose decks from these; all present in the seed)

| Master | Split | Content |
| ------ | ----- | ------- |
| `s-title` | 50/50 | Kicker + giant statement title on white; lede + meta row on blue |
| `s-agenda` | 348px / rest | H2 on white; numbered hairline rows (`--line-light`) on blue with idx + hint |
| `s-divider` | 150px / rest | Empty white strip; giant outlined number (`-webkit-text-stroke: 3px var(--bg-white)`) + label on cobalt |
| `s-bullets` | deep / 240px | Kicker + H2 + ≤3 tick points (cobalt-bordered `.tick` with inline-SVG check) on white; one bold takeaway on blue |
| `s-stat` | deep / 300px | Oversized cobalt number (~400px, 800) on white; label + note on blue |
| `s-quote` | deep / 220px | Cobalt `“` + 92px statement quote on white; attribution on blue |
| `s-compare` | 50/50 | The split IS the contrast: "their way" on white vs "our way" on cobalt, dash-topped list items |
| `s-grid` | 300px / rest | H2 on white; 2×2 `.gcard` grid (2px `--line-light` borders) on cobalt |
| `s-chart` | deep / 200px | Pure-CSS bar chart on white: cobalt bars (`.solid` fill or `--blue-soft` + cobalt border), `scaleY(0)→1` entrance; takeaway on blue |
| `s-close` | 150px / rest | Cobalt-dominant statement ("Let's make something electric.") + inline-SVG contact links |

## Fixed 16:9 stage — NON-NEGOTIABLE scaling system

- Author every slide on a fixed **1920×1080** canvas: `.deck-viewport` (fills the window) wraps `.deck-stage` (1920×1080, `transform-origin: 0 0`).
- JavaScript scales the whole stage uniformly: `factor = min(innerWidth/1920, innerHeight/1080)`, then `translate(x, y) scale(factor)` to center with letterbox/pillarbox; re-run on `resize`.
- Never reflow content per device; no responsive breakpoints inside slides; all measurements are fixed px at design size.
- Keep the FULL viewport-base.css block from the seed (stage, slide stacking, print styles, `prefers-reduced-motion`).
- Slide switching toggles `.active`/`.visible` (visibility/opacity/pointer-events) — **never `display: none`**.
- Navigation runtime (keep the seed's `SlidePresentation` controller verbatim): `←`/`→`/`↑`/`↓`/`Space`/`PageUp`/`PageDown`/`Home`/`End`, debounced wheel (~650ms), touch swipe (≥40px), `#/<index>` hash routing with deep-link restore, page counter pill in `.deck-controls` fixed **outside** the scaled stage.

## Motion

- Entrances only: `.reveal` elements transition when the slide gains `.visible`; stagger via `transition-delay` in ~0.1s steps.
- One signature easing: `cubic-bezier(0.16, 1, 0.3, 1)`. Animate only `transform` and `opacity`. Chart bars enter via `scaleY`.
- `prefers-reduced-motion` support is mandatory (in the base CSS).

## Output contract

- Single self-contained `.html`: all CSS/JS inline, zero build, zero external JS, no CDN scripts. Google Fonts link for Manrope is the only external reference.
- Icons are inline SVG (stroke `#4361ee` on white, `#ffffff` on cobalt). Charts are pure CSS. No remote images.
- No scrolling, no overflow: split content into more slides instead of shrinking type. Low-density speaker-led decks: one idea per slide, 1–3 bullets. High-density reading-first decks: structured grids, max 4–6 cards.
- Comment every section: `/* === SECTION NAME === */`. Never negate CSS functions directly (`-clamp()` is silently ignored) — use `calc(-1 * clamp(...))`.

## Attribution

Theme, fixed-stage model, and workflow come from the upstream MIT-licensed [zarazhangrui/frontend-slides](https://github.com/zarazhangrui/frontend-slides) (© 2025 Zara Zhang), Electric Studio preset (STYLE_PRESETS.md section 2). The LICENSE file ships in this plugin folder; keep it in place when redistributing.
