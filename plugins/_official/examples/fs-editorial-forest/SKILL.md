---
name: fs-editorial-forest
description: "Editorial Forest — a quiet, literary HTML deck theme: deep forest green #2e4a2a, dusty pink #e89cb1, and warm cream #efe7d4 paper set in Source Serif 4 with JetBrains Mono kickers. Mixed light/dark scheme, 8-slide quarterly-review rhythm, fixed 1920×1080 stage scaled to any viewport."
triggers:
  - "editorial forest"
  - "forest green deck"
  - "quiet editorial slides"
  - "quarterly review deck"
  - "林间编辑部"
od:
  mode: deck
  surface: web
  category: slides
  upstream: "https://github.com/zarazhangrui/beautiful-html-templates"
  preview:
    type: html
    entry: example.html
  example_prompt: "Use Editorial Forest to turn my content into a quiet, literary single-file HTML deck: forest green, dusty pink, and warm cream in Source Serif 4, on a fixed 1920×1080 stage that scales to any viewport. Start from example.html and replace only the content — keep the design system and the inline deck-stage runtime."
  example_prompt_i18n:
    zh-CN: "用林间编辑部（Editorial Forest）把我的内容做成一套安静、文学气质的单文件 HTML 幻灯片：森林绿 × 尘粉 × 暖奶油配色、Source Serif 4 字体、固定 1920×1080 舞台等比缩放。从 example.html 出发只替换内容，保留设计系统和内联 deck-stage 运行时。"
---

# Editorial Forest (林间编辑部)

A quiet, considered editorial deck theme — deep forest green, dusty pink, and warm cream paper meet Source Serif 4. Built for quarterly reviews, internal readouts, studio updates, research recaps, and anything that should feel warm and unhurried rather than corporate. Avoid it for content that needs to feel urgent, punchy, or sales-driven.

Ported from the MIT-licensed [zarazhangrui/beautiful-html-templates](https://github.com/zarazhangrui/beautiful-html-templates) `editorial-forest` template.

**Start from `example.html` in this plugin folder. It is the locked seed: keep the inline `<deck-stage>` runtime script, the `:root` token block, and every layout skin verbatim — replace only slide content. Do not rewrite the design, do not introduce colors or fonts outside the spec below.**

## Design tokens (locked — list verbatim in `:root`)

```css
:root {
  --green: #2e4a2a;        /* forest green — dark canvas + primary text on cream */
  --green-deep: #243a21;   /* text on pink surfaces */
  --green-lite: #3a5a36;   /* lighter green tile variant */
  --pink: #e89cb1;         /* dusty pink — accent, text on green, bar series A */
  --pink-deep: #d27e96;    /* pink tile border */
  --cream: #efe7d4;        /* warm cream paper — light canvas, text on green */
  --cream-2: #e6dcc4;      /* secondary cream tile */
  --ink: #1a1a17;          /* body text on cream */
  --serif: "Source Serif 4", "Source Serif Pro", Georgia, serif;
  --mono: "JetBrains Mono", ui-monospace, Menlo, monospace;
}
```

- **No other colors.** No gradients, no shadows, no purple/indigo, no pure white or black surfaces. `rgba(239,231,212,0.18)` (cream at 18%) is the only permitted alpha, used for chart grid lines.
- **No other fonts.** `Source Serif 4` (weights 300–800, weight 500 is the display default) for all headings and body; `JetBrains Mono` (400/500/700, weight 500 default) for kickers, numbers, captions, and axis labels. Load via the Google Fonts `<link>` already in the seed.

## Typography & signature devices

- Display sizes: cover/summary h1 220px at `line-height: 0.92–0.94`, section h2 80–96px, statement quote 140px, KPI numerals 220px (unit 110px in cream). Tracking −0.02em on serif display; mono labels run uppercase at `letter-spacing: 0.12–0.18em`, 24–28px.
- `.label` mono uppercase kickers anchor every slide's top edge; paired left/right labels are the header signature.
- The circular `.mark` monogram (130px, 2px border) on the cover; the bottom `.footline` running foot; 2px rule lines (`border-top: 2px solid`) above meta rows, KPI rows, and summary columns; cards with 6–8px radius and 2–2.5px borders. These devices are the theme — keep them.

## Mixed scheme rhythm (8 slides)

Alternate dark, light, and pink canvases — never run more than two same-tone slides in a row:

| # | Master | Class | Canvas | Role |
|---|--------|-------|--------|------|
| 1 | Cover | `.cover` | green | monogram topbar, 220px serif title, mono footline |
| 2 | Agenda | `.agenda` | cream | 5-tile mosaic grid (`t-green` spans 2 rows, `t-pink`/`t-cream`/`t-greenLite`) |
| 3 | Statement | `.statement` | pink | 140px serif quote + mono attribution row |
| 4 | Two-column | `.two-col` | cream | green figure panel (880px) + serif narrative + 3-col `dl.meta` |
| 5 | Data | `.data` | green | pure-CSS grouped bar chart (pink/cream bars, mono axes, grid-lines) |
| 6 | Framework | `.framework` | cream | 4 step cards: outline → `pinkfill` → `fill` → outline |
| 7 | Stats | `.stats` | green | 3 KPI callouts, 220px pink numerals over a pink rule |
| 8 | Summary | `.summary` | green | 220px pink closing word + 3-column takeaways |

Reuse these masters for longer decks (a second `.two-col` or `.data`, another `.statement`); keep the tone alternation. Charts stay pure CSS/HTML (percentage-height `.bar` divs); diagrams and icons are inline SVG stroked in token colors only — never Chart.js, mermaid, or remote images.

## Stage system & runtime (locked)

- Every slide is one `<section class="…" data-screen-label="NN Label">` authored at a fixed **1920×1080** (`width: 1920px; height: 1080px; overflow: hidden`), a direct child of `<deck-stage aspect="1920/1080" no-rail>`.
- The inlined `deck-stage` web component scales the whole stage uniformly to the viewport: `factor = min(viewportWidth/1920, viewportHeight/1080)`, applied as one `transform: scale()` with letterbox/pillarbox centering, recomputed on resize. Never reflow content per device, never add responsive breakpoints inside slides; all measurements are fixed px at design size.
- Inactive slides stay mounted and are hidden with `visibility`/`opacity` — never `display: none`.
- Navigation ships with the runtime: `←`/`→`, Space, PgUp/PgDn, Home/End, number keys; `#<n>` hash deep-link restore and write-back (plus the small `hashchange` supplement script at the end of the seed); print → one page per slide.
- Keep the `deck-stage:not(:defined){visibility:hidden}` guard and the whole inline runtime `<script>` verbatim. No external JS, no build step — the output is one self-contained `.html` file.

## Content guardrails

- No scrolling, no overflow, no overlapping panels. Split content into more slides instead of shrinking type.
- Quiet density: one idea per slide; agenda tiles get a 2–6 word headline + mono foot tag; body paragraphs 30px serif, max ~2 per column; KPI rows max 3; step rows max 4.
- Voice matches the design: literary, warm, low-pressure. Sentence-case headlines ending in a period ("Agenda.", "Fewer titles, finer paper.") are part of the look.

## Attribution

Template design, palette, and the `deck-stage` runtime come from the upstream MIT-licensed [zarazhangrui/beautiful-html-templates](https://github.com/zarazhangrui/beautiful-html-templates) (© 2026 Zara Zhang), template `editorial-forest`. The LICENSE file ships in this plugin folder; keep it in place when redistributing.
