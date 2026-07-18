---
name: ve-midnight-editorial
en_name: "Present a Financial Review like a Startup CFO"
zh_name: "像创业公司 CFO 一样做财务复盘"
description: |
  Open Design's financial review: runway, burn, and the sustainability plan that keeps the project independent. Built as a decision-grade data & finance deck for board, leadership.
en_description: |
  Open Design's financial review: runway, burn, and the sustainability plan that keeps the project independent. Built as a decision-grade data & finance deck for board, leadership.
zh_description: |
  像创业公司 CFO 一样做财务复盘——一份可商业交付的数据财务 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "data-finance"
  - "product-analytics-deck"
  - "finance"
  - "kpi"
  - "metrics"
  - "decision-deck"
  - "commercial-slide-agent"
  - "ve-midnight-editorial"
triggers:
  - "product-analytics-deck"
  - "data-finance"
  - "Present a Financial Review like a Startup CFO"
  - "像创业公司 CFO 一样做财务复盘"
  - "kpi"
  - "finance"
  - "metrics"
  - "html deck"
  - "html slides"
od:
  mode: deck
  surface: web
  upstream: "https://github.com/nicobailon/visual-explainer"
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
  speaker_notes: false
  animations: true
  example_prompt_i18n:
    zh-CN: "用「午夜金辉」把我的内容做成一套电影级编辑刊风格的深色单文件 HTML 幻灯片。先确认主题、观众和页数，然后从种子 example.html 出发——完整保留 navy+金的明暗双主题 token 表、Instrument Serif 戏剧 display 字阶、金色光晕与角标装饰、交错转场和 SlideEngine 运行时，只替换幻灯片内容，使用真实内容，不要 lorem ipsum。"
  category: "data-finance"
  scenario: "finance"
  example_prompt: "Create \"Present a Financial Review like a Startup CFO\" as a decision-grade Data, KPI & finance deck in this template's own visual system. Subject: Open Design's financial review: runway, burn, and the sustainability plan that keeps the project independent. Audience: board, leadership. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: does every chart have a decision above it."
---

# Midnight Editorial（午夜金辉）

A single-aesthetic deck plugin: the **midnight-editorial** preset from the
upstream MIT-licensed
[`nicobailon/visual-explainer`](https://github.com/nicobailon/visual-explainer)
skill (`templates/slide-deck.html`), pinned and shipped as one self-contained
seed — `example.html`. The upstream mermaid diagram slide has been replaced by
a pure CSS/SVG pipeline page; the deck has **zero external JS dependencies**
(Google Fonts `@import` is the only external reference).

Signature combination (what makes this skin this skin):

1. **Deep navy + warm gold** — `#0f1729` page, `#d4a73a` accent, parchment
   text `#e8e4d8`. Cinematic, magazine-grade, dramatic.
2. **Serif display → mono label drop** — Instrument Serif at up to 120px
   (`clamp(48px,10vw,120px)`, weight 400, -2px tracking, 0.95 line-height)
   falling directly to 13–14px uppercase JetBrains Mono labels with 1.5px
   letter-spacing. No intermediate sans anywhere.
3. **Gold radial accent glow** — every content slide carries one
   `radial-gradient(ellipse at X% Y%, var(--accent-dim) 0%, transparent ~40%)`
   inline background, with the ellipse anchor moving per slide.
4. **Gold SVG corner marks + ghost numerals** — 2px gold corner line marks at
   opacity 0.15 on the title slide; dividers carry a ghost
   `clamp(100px,22vw,260px)` gold numeral at opacity 0.06.
5. **Cinematic staggered transitions** — slides enter with
   `fade + translateY(40px) + scale(0.98)` on `cubic-bezier(0.16,1,0.3,1)`;
   `.reveal` children stagger at 0.1s increments (max 6).
6. **SlideEngine dual theme** — explicit dark/light toggle (T key + ◐ chrome
   button, `html[data-theme]`), defaulting to the OS preference. The light
   mode is a locked cream/gold skin, not an afterthought.

**Start from `example.html`. Replace content only — never rewrite the design
system or the runtime script, and never introduce colors or fonts outside the
token sheets below.**

## Locked token sheet — dark (default)

```css
:root {
  --font-body: 'Instrument Serif', Georgia, serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
  --bg: #0f1729;
  --surface: #162040;
  --surface2: #1d2b52;
  --surface-elevated: #243362;
  --border: rgba(200, 180, 140, 0.08);
  --border-bright: rgba(200, 180, 140, 0.16);
  --text: #e8e4d8;
  --text-dim: #9a9484;
  --accent: #d4a73a;
  --accent-dim: rgba(212, 167, 58, 0.1);
  --code-bg: #0a0f1e;
  --code-text: #d4d0c4;
  --green: #4ade80;  --green-dim: rgba(74, 222, 128, 0.1);
  --red: #f87171;    --red-dim: rgba(248, 113, 113, 0.1);
  --blue: #60a5fa;   --blue-dim: rgba(96, 165, 250, 0.1);
}
```

## Locked token sheet — light (`html[data-theme="light"]`)

```css
html[data-theme="light"] {
  --bg: #faf8f2;
  --surface: #ffffff;
  --surface2: #f5f0e6;
  --surface-elevated: #fffdf5;
  --border: rgba(30, 30, 50, 0.08);
  --border-bright: rgba(30, 30, 50, 0.16);
  --text: #1a1814;
  --text-dim: #6e685c;
  --accent: #b8860b;
  --accent-dim: rgba(184, 134, 11, 0.08);
  --code-bg: #2a2520;
  --code-text: #e8e4d8;
  --green: #16a34a;  --green-dim: rgba(22, 163, 74, 0.08);
  --red: #dc2626;    --red-dim: rgba(220, 38, 38, 0.08);
  --blue: #2563eb;   --blue-dim: rgba(37, 99, 235, 0.08);
}
```

The same light block is mirrored under
`@media (prefers-color-scheme: light) { html:not([data-theme]) { … } }` as a
no-JS fallback. **Both themes are part of the contract — every slide you
author must read correctly in both.** Semantic colors (`--green/--red/--blue`)
are for status only (trends, before/after labels, diagram node families) —
never decorative.

## Fonts (locked — Google Fonts `@import` only)

| Slot | Font | Usage |
| --- | --- | --- |
| `--font-body` | Instrument Serif (400 + italic), Georgia fallback | display, headings, body, KPI values, quotes |
| `--font-mono` | JetBrains Mono 400/500/600/700 | labels, subtitles, counters, axis/edge labels, code |

No third font. No bold serif — drama comes from size, not weight.

## Typography scale (locked)

| Element | Spec |
| --- | --- |
| `.slide__display` | `clamp(48px,10vw,120px)`, 400, -2px, lh 0.95, gold on title |
| `.slide__heading` | `clamp(28px,5vw,48px)`, 400, -0.5px, lh 1.15 |
| `.slide__body` | `clamp(16px,2.2vw,22px)`, lh 1.6, `--text-dim` |
| `.slide__subtitle` | mono `clamp(12px,1.5vw,18px)`, uppercase, 1px tracking |
| `.slide__label` | mono `clamp(10px,1.2vw,13px)`, 600, uppercase, 1.5px, gold |
| Divider ghost numeral | `clamp(100px,22vw,260px)`, opacity 0.06, gold |

## Layout masters (compose 8–15 pages from these)

| Master | Class | Notes |
| --- | --- | --- |
| Title / cover | `.slide--title` | centered, gold display, corner-mark SVGs, glow at 50% 30% |
| Agenda / TOC | `.slide--toc` | gold mono numbers + serif items + right-aligned mono hints, hairline rules |
| Section divider | `.slide--divider` | ghost gold numeral behind heading + mono subtitle |
| Content (asymmetric) | `.slide--content` | 3fr/2fr grid: gold-dot bullets left, decorative SVG aside right |
| Split (before/after) | `.slide--split` | full-bleed 3fr/2fr surface panels, red "Before" / green "After" labels |
| Diagram | `.slide--diagram` + `.pipeline-wrap` | pure CSS pipeline: 2px accent-bordered nodes, mono edge labels, arrow connectors, legend. Node families: gold (core), blue (process), green (output/storage). **Never mermaid, never any external JS.** |
| Dashboard / big numbers | `.slide--dashboard` | KPI cards: serif `clamp(36px,6vw,64px)` values + mono labels + trend lines |
| Chart | `.slide--chart` + `.bar-chart` | pure CSS bars (gradient gold fill; `--ghost` dashed variant for baselines), mono values + axis labels |
| Table | `.slide--table` + `.data-table` | mono uppercase headers, zebra rows, gold hover (CSS available in seed) |
| Code | `.slide--code` | `--code-bg` block, gold filename tab, `.hl`/`.cm` spans (CSS available in seed) |
| Quote | `.slide--quote` | ghost gold `“` at opacity 0.06, italic serif quote, mono cite |
| Full-bleed closing | `.slide--bleed` | fixed dark `#0a0f1e → #0f1729 → #162040` gradient (code-bg → bg → surface, all in-family navy) + scrim, white text (intentionally stays dark in light mode) |

## Decorative devices (locked)

- One gold radial glow per content slide (inline `background-image`,
  `var(--accent-dim)` ellipse, anchor varies per slide — never two glows).
- Gold corner-mark SVGs (2px lines, opacity 0.15) on the title slide.
- Ghost gold numerals on dividers; ghost quote mark on quote slides.
- Decorative asides are inline SVG only — circles/lines in theme colors with
  a mono caption. No icon fonts, no images, no external assets.
- At most 6 `.reveal` children per slide (stagger delays stop at 0.6s).

## Page structure & runtime (locked)

- Single self-contained HTML file; `<div class="deck">` containing
  `<section class="slide slide--…">` pages; vertical scroll-snap, one
  viewport (100dvh) per slide, no internal scrolling.
- SlideEngine builds all chrome at runtime: gold 3px progress bar, right-edge
  dot rail, mono counter, fading hints, ◐ theme button.
- Navigation: ←/→/Space/PageUp/PageDown/Home/End keys, touch swipe,
  scroll-snap wheel; `#/N` hash routing (restored on load, updated on slide
  change); `T` toggles dark/light.
- `prefers-reduced-motion` disables all transitions; responsive height
  breakpoints (700/600/500px) and a 768px width breakpoint are part of the
  contract.

## Hard rules

1. Start from `example.html`; replace slide content only. Do not rewrite the
   CSS or the SlideEngine script.
2. No colors or fonts outside the two locked token sheets. No new hex values.
3. Both themes must work — check every slide in dark and light.
4. Zero external JS: no mermaid, no Chart.js, no CDN scripts. Diagrams and
   charts are pure CSS/SVG using the masters above. Google Fonts `@import`
   is the only allowed external reference.
5. Real content, real numbers — no lorem ipsum. Replace all fictional
   "Nocturne" demo content.
6. 8–15 slides; always open with `.slide--title` and close with
   `.slide--bleed` or `.slide--quote`.
