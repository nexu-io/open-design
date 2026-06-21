---
name: hps-memphis-pop
description: Memphis Pop deck — 80s Memphis design as a locked single-theme HTML deck. Warm cream canvas tiled edge-to-edge with a pink/teal/yellow confetti-dot pattern, 2.5px black-outlined cards with hard offset shadows, hot-pink #ff3d8b lead accent, Archivo Black display type. Based on the memphis-pop theme from lewislulu/html-ppt-skill. Use when the user wants a playful, loud, retro-80s presentation, product launch deck, creative pitch, or community talk.
triggers:
  - "memphis"
  - "memphis pop"
  - "80s deck"
  - "retro presentation"
  - "confetti"
  - "playful deck"
  - "孟菲斯"
  - "波普"
  - "复古幻灯片"
od:
  mode: deck
  surface: web
  scenario: product
  upstream: "https://github.com/lewislulu/html-ppt-skill"
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
  speaker_notes: true
  animations: true
  example_prompt: "Use Memphis Pop to turn my content into a single-file 80s Memphis-design HTML deck: cream confetti-dot canvas, black-outlined cards with hard shadows, hot-pink accents and Archivo Black headlines. Start from the seed example.html — keep its token sheet, slide scaffold and keyboard runtime exactly as-is, replace slide content only, and use real content with no lorem ipsum."
  example_prompt_i18n:
    zh-CN: "用孟菲斯波普把我的内容做成一套 80 年代孟菲斯风格的单文件 HTML 幻灯片：奶油色 confetti 圆点画布、黑描边硬阴影卡片、热粉 accent 和 Archivo Black 大标题。从种子 example.html 出发——完整保留 token 表、slide 骨架和键盘运行时，只替换幻灯片内容，使用真实内容，不要 lorem ipsum。"
---

# Memphis Pop（孟菲斯波普）

A locked single-theme deck plugin: the `memphis-pop` skin from the upstream
MIT-licensed [`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill)
(36 themes × 31 layouts), shipped as one self-contained seed — `example.html` —
that carries the full token sheet, the Memphis decor devices, the slide
scaffold, and the keyboard runtime.

**Start from `example.html`. Replace content only. Never rewrite the design
system or the runtime script. Never introduce colors or fonts outside this
spec.**

Positioning vs. sibling Memphis-adjacent plugins: this is the **full-bleed
scattered confetti-dot pattern** Memphis. `daisy-days` is hand-drawn daisy
childlike (flower illustration devices), `block-frame` is big-color-block
neobrutalist (no pattern). The three decor systems are mutually exclusive —
do not mix.

## Locked token sheet (do not deviate)

Every variable below is defined in the seed's `:root`. Slides reference
tokens only — never hard-code a color in slide markup.

```css
:root{
  --bg:#fef6e8;            /* warm cream canvas */
  --bg-soft:#fdebc7;
  --surface:#ffffff;       /* card face */
  --surface-2:#fff1d1;
  --border:#111111;        /* everything outlines in near-black */
  --border-strong:#111111;
  --text-1:#111111; --text-2:#333333; --text-3:#666666;
  --accent:#ff3d8b;        /* hot pink — the lead */
  --accent-2:#37c2d7;      /* teal */
  --accent-3:#ffcc00;      /* yellow */
  --good:#6ac04c; --warn:#ffcc00; --bad:#ff3d8b;
  --grad:linear-gradient(135deg,#ff3d8b,#ffcc00 50%,#37c2d7);
  --grad-soft:linear-gradient(135deg,#fdebc7,#fff1d1);
  --radius:10px; --radius-sm:6px; --radius-lg:18px;
  --shadow:5px 5px 0 #111;     /* hard offset, never blurred */
  --shadow-lg:9px 9px 0 #111;
  --font-sans:'Space Grotesk','Inter','Noto Sans SC',sans-serif;
  --font-serif:'Space Grotesk','Noto Sans SC',sans-serif;
  --font-mono:'JetBrains Mono',SFMono-Regular,Menlo,monospace;
  --font-display:'Archivo Black','Space Grotesk',sans-serif;
  --letter-tight:-.01em; --letter-normal:0;
  --ease:cubic-bezier(.4,0,.2,1);
}
```

Fonts come from Google Fonts `@import` only (Archivo Black, Space Grotesk,
Noto Sans SC, JetBrains Mono). No other external resource of any kind.

## Signature decor devices (the Memphis kit)

1. **Confetti-dot canvas** — the `body` background tiles three offset
   `radial-gradient` layers of 3px dots (pink / teal / yellow at
   200 / 220 / 260px tile sizes) over `--bg`. It is full-bleed on every
   slide; slides stay transparent so the pattern always shows through.
   Never paint an opaque slide background.
2. **Black-outlined cards** — `.card` is `2.5px solid #111` with
   `--shadow` (hard offset, zero blur). Hero cards may use `--shadow-lg`.
3. **Geometric SVG confetti** — inline SVG triangles, squiggle zigzags,
   circles, plus signs and half-tone arcs, each stroked in `#111` and
   filled with one accent, scattered absolutely behind/around content
   (`.memphis-shape`). 2–4 per slide maximum.
4. **Tilted sticker pills** — `.pill` carries a 2px black border, an accent
   fill and a slight `rotate(±2deg)`; used as tags and badges.
5. **Thick black divider bars** — `.divider-accent` is a hot-pink bar with
   a black outline; section dividers pair it with a giant outlined numeral.
6. **Gradient display numerals** — `.gradient-text` (the tri-color
   `--grad`) is reserved for big numbers and 1–2 highlight words.

## Layout system (shared upstream 31-layout catalog)

The upstream catalog is shared across the html-ppt family; compose pages
from these master categories:

| group | layouts |
|---|---|
| Openers & transitions | cover · toc · section-divider |
| Text-centric | bullets · two-column · three-column · big-quote |
| Numbers & data | stat-highlight · kpi-grid · table · chart-bar/line/pie/radar |
| Code & terminal | code · diff · terminal |
| Diagrams & flows | flow-diagram · arch-diagram · process-steps · mindmap |
| Plans & comparisons | timeline · roadmap · gantt · comparison · pros-cons · todo-checklist |
| Visuals | image-hero · image-grid |
| Closers | cta · thanks |

Default sequence: `cover → toc → (section-divider → 2–4 content pages) × N
→ thanks`. Charts are always pure CSS or inline SVG — never Chart.js or any
external library. The seed demonstrates: cover, toc, section-divider,
two-column, kpi-grid, stat-highlight, chart-bar, process-steps, big-quote,
thanks.

## Page structure & runtime contract (keep the seed script verbatim)

- Every page is `<section class="slide" data-title="...">` inside
  `<div class="deck" id="deck">` — a horizontal scroll-snap strip, each
  slide exactly `100vw × 100vh` (one screen, no internal scrolling),
  16:9 / 1280×720 baseline with `clamp()` type scales, padding `72px 96px`.
- Fixed chrome: `.deck-header` (deck title + theme chip), `.deck-footer`
  (attribution + `N / total` counter), `.progress-bar`.
- Keyboard: `←` `→` `Space` `PageUp` `PageDown` `Home` `End` navigate.
- Hash routing: `#/N` (1-based) deep-links a slide; navigation syncs the
  hash via `history.replaceState` wrapped in try/catch (srcdoc-safe).
- The script dedupes dual window/document capture-phase key listeners by
  Event identity and auto-focuses `<body>` so keys work without a click —
  these solve real iframe-host bugs; do not "simplify" them away.
- Speaker notes: one hidden `<div class="notes">…</div>` per slide.

## Authoring checklist

1. Copy `example.html`; keep all `<style>` blocks and the `<script>`
   verbatim.
2. Replace the 10 demo slides with the planned layout sequence; real
   content, real numbers — no lorem ipsum, no placeholder images.
3. Keep the confetti-dot canvas visible on every slide; scatter at most
   2–4 geometric SVG shapes per slide.
4. Stay inside the locked palette: pink leads, teal/yellow support,
   near-black `#111` outlines, white card faces — nothing else.
5. Write 1–3 sentence speaker notes per slide in `.notes`.
6. Verify: arrows + Space navigate, `#/5` deep-links, no slide overflows
   vertically, every shadow is a hard offset (no blur anywhere).

## Attribution

Visual system, token vocabulary, theme palette, and layout taxonomy come
from the upstream MIT-licensed
[`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill)
(© lewis &lt;sudolewis@gmail.com&gt;), theme `memphis-pop`. The LICENSE
file ships alongside this skill — keep it in place when redistributing.
