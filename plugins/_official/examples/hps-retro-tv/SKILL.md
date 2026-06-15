---
name: hps-retro-tv
description: Retro TV deck — 80s/90s picture-tube nostalgia as a locked single-theme HTML deck. Warm cream canvas with CRT scanlines overlaid on every slide, curved-glass tube vignette, amber #e67e14 / brick-red #c73a1f accents, Playfair Display headlines with heavy offset shadows, test-card color bars and antenna/dial SVG decor. Based on the retro-tv theme from lewislulu/html-ppt-skill. Use when the user wants a warm, nostalgic, broadcast-era presentation, media pitch, retro product launch, or year-in-review deck.
triggers:
  - "retro tv"
  - "crt"
  - "scanlines"
  - "picture tube"
  - "broadcast deck"
  - "nostalgic presentation"
  - "复古电视"
  - "显像管"
  - "扫描线"
  - "老电视"
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
  example_prompt: "Use Retro TV to turn my content into a single-file 80s picture-tube HTML deck: warm cream canvas with CRT scanlines on every slide, amber and brick-red accents, Playfair Display headlines with heavy shadows, test-card color bars and antenna decor. Start from the seed example.html — keep its token sheet, slide scaffold and keyboard runtime exactly as-is, replace slide content only, and use real content with no lorem ipsum."
  example_prompt_i18n:
    zh-CN: "用复古显像管把我的内容做成一套 80 年代老电视机风格的单文件 HTML 幻灯片：暖奶油底每页叠加 CRT 扫描线、琥珀与砖红 accent、Playfair Display 厚重投影大标题、检验图彩条和天线装饰。从种子 example.html 出发——完整保留 token 表、slide 骨架和键盘运行时，只替换幻灯片内容，使用真实内容，不要 lorem ipsum。"
---

# Retro TV（复古显像管）

A locked single-theme deck plugin: the `retro-tv` skin from the upstream
MIT-licensed [`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill)
(36 themes × 31 layouts), shipped as one self-contained seed — `example.html` —
that carries the full token sheet, the broadcast decor devices, the slide
scaffold, and the keyboard runtime.

**Start from `example.html`. Replace content only. Never rewrite the design
system or the runtime script. Never introduce colors or fonts outside this
spec.**

Positioning vs. sibling retro-skeuomorphic plugins: this is the **light
warm-cream picture-tube** device — scanlines on a cream canvas, not on a black
screen. `retro-windows` is Win95 grey window chrome (title bars, bevels);
`hermes` is dark-background green-phosphor terminal CRT. The three device
systems are mutually exclusive — no dark backgrounds, no terminal language,
no window chrome here. Do not mix.

## Locked token sheet (do not deviate)

Every variable below is defined in the seed's `:root`. Slides reference
tokens only — never hard-code a color in slide markup.

```css
:root{
  --bg:#f5ecd7;            /* warm cream canvas */
  --bg-soft:#efe4c6;
  --surface:#fbf5e2;       /* parchment card face */
  --surface-2:#efe3c2;
  --border:rgba(120,70,20,.22);        /* warm brown hairlines */
  --border-strong:rgba(120,70,20,.45);
  --text-1:#2a1a08; --text-2:#6b4a22; --text-3:#a68656;
  --accent:#e67e14;        /* amber — the lead */
  --accent-2:#c73a1f;      /* brick red — headlines & emphasis */
  --accent-3:#f2b544;      /* gold — support */
  --good:#3e8940; --warn:#e67e14; --bad:#c73a1f;
  --grad:linear-gradient(135deg,#c73a1f,#e67e14 55%,#f2b544);
  --grad-soft:linear-gradient(135deg,#fde6c4,#fbd9a0);
  --radius:10px; --radius-sm:6px; --radius-lg:16px;
  --shadow:0 6px 0 rgba(80,40,0,.12),0 12px 28px rgba(80,40,0,.15);
  --shadow-lg:0 10px 0 rgba(80,40,0,.15),0 24px 50px rgba(80,40,0,.2);
  --font-sans:'Inter','Noto Sans SC',sans-serif;
  --font-serif:'Playfair Display','Noto Serif SC',serif;
  --font-mono:'JetBrains Mono',SFMono-Regular,Menlo,monospace;
  --font-display:'Playfair Display','Noto Serif SC',serif;
  --letter-tight:-.01em; --letter-normal:0;
  --ease:cubic-bezier(.4,0,.2,1);
}
```

Shadows are always the chunky tube pair — a hard `0 Npx 0` offset plus a
soft warm blur together. Never a plain flat or pure-black shadow.

Fonts come from Google Fonts `@import` only (Playfair Display, Inter,
Noto Sans SC, JetBrains Mono). No other external resource of any kind.

## Signature decor devices (the broadcast kit)

1. **Picture-tube canvas** — the `body` background layers faint horizontal
   scanlines `repeating-linear-gradient(0deg,rgba(80,40,0,.06) 0 2px,
   transparent 2px 4px)` over a curved-glass vignette
   `radial-gradient(ellipse at center,#f7ecd0 0%,#e8d9b0 85%,#c9b888 100%)`
   that darkens toward the edges like a powered-on CRT. Slides stay
   transparent so it shows through everywhere. Never paint an opaque
   slide background.
2. **Per-slide CRT scanline overlay** — `.slide::before` adds
   `repeating-linear-gradient(0deg,rgba(0,0,0,.035) 0 2px,transparent 2px 4px)`
   at `z-index:1`; all slide content sits at `z-index:2`. Every page reads
   as a broadcast frame. Never remove or dim it.
3. **Test-card color bars** — `.test-bars` is an SMPTE-style strip of six
   bars in the locked palette (brick / amber / gold / green / parchment /
   brown). One per slide maximum, as a garnish.
4. **Playfair headlines with heavy shadows** — `.h1` is brick red
   `#c73a1f` with `text-shadow:3px 3px 0 rgba(80,40,0,.18)`; `.h2` is warm
   ink with a 2px offset shadow. Quotes and the giant section numeral go
   *italic* Playfair.
5. **Antenna / dial / tiny-TV inline SVG** — rabbit-ear antennas, dial
   knobs and little TV sets stroked in warm browns (`#6b4a22`/`#a68656`)
   with amber/brick tips (`.tv-shape`). 1–2 per slide maximum.
6. **ON AIR lamp & channel badges** — `.on-air` is a brick pill with a
   pulsing gold dot; step cards get an automatic `CH 01…04` mono badge;
   pills are mono-type rounded chips with a soft drop ledge.
7. **Gradient display numerals** — `.gradient-text` (the brick→amber→gold
   `--grad`) is reserved for big numbers and 1–2 highlight words.
8. **Tube-on entry** — `.anim-tube-on` flickers a headline or stat in like
   a CRT warming up (vertical-collapse scale). Use on cover and stat pages.

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
3. Keep the picture-tube canvas and the per-slide scanline overlay on
   every page; place at most 1–2 `.tv-shape` SVGs (plus optionally one
   `.test-bars` strip) per slide.
4. Stay inside the locked palette: amber leads, brick red for headlines
   and emphasis, gold support, warm-brown ink — no dark backgrounds, no
   green-terminal or window-chrome language, nothing else.
5. Write 1–3 sentence speaker notes per slide in `.notes`.
6. Verify: arrows + Space navigate, `#/5` deep-links, no slide overflows
   vertically, every shadow is the chunky offset-plus-warm-blur pair.

## Attribution

Visual system, token vocabulary, theme palette, and layout taxonomy come
from the upstream MIT-licensed
[`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill)
(© lewis &lt;sudolewis@gmail.com&gt;), theme `retro-tv`. The LICENSE
file ships alongside this skill — keep it in place when redistributing.
