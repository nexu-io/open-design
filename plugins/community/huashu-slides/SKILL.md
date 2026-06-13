---
name: huashu-slides
description: |
  Huashu Slides — publication-grade single-file HTML decks, distilled from the
  slides workflow of 花叔 (alchaincyf)'s huashu-design skill. Editorial grammar
  (masthead / kicker / giant serif H1 / footer), a fixed 1920×1080 canvas with
  auto-fit scaling, keyboard navigation and hash routing, strict anti-AI-slop
  rules, and an optional editable-PPTX export path. Use when the user wants a
  presentation, slides, PPT, deck, 演示文稿, or 幻灯片.
triggers:
  - "slides"
  - "deck"
  - "ppt"
  - "pptx"
  - "presentation"
  - "幻灯片"
  - "演示文稿"
  - "做个 PPT"
  - "花叔"
od:
  mode: deck
  surface: web
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
  example_prompt: "Use the Huashu Slides template to turn my content into a publication-grade HTML deck: 1920×1080 fixed canvas, editorial masthead/kicker/serif-display grammar, one terracotta accent, light/dark rhythm, keyboard ←/→/Space navigation with #/N hash routing. Start from example.html, replace the content only, and keep the design system intact."
  example_prompt_i18n:
    zh-CN: "用「花叔幻灯片」模板把我的内容做成一套出版物级 HTML 幻灯片：1920×1080 固定画布、报刊式 masthead/kicker/衬线大字版式、单一赤陶橙 accent、亮暗节奏交替、键盘 ←/→/空格翻页 + #/N hash 跳页。从 example.html 出发只换内容，不要重写设计。"
---

# Huashu Slides · 花叔幻灯片

Produce a **single-file, publication-grade HTML deck**. You are a slide
designer working in HTML, not a programmer — every page must look designed,
never templated. The visual system, canvas contract, and navigation runtime
are locked by `example.html`. **Start from `example.html`, replace content
only — do not rewrite the design or the script.**

Adapted from the slides line of [huashu-design](https://github.com/alchaincyf/huashu-design)
by 花叔 (alchaincyf), MIT licensed.

## Hard spec (locked — violating any line is a regression)

### Canvas & scaling

- One `<div id="stage">` fixed at **1920 × 1080 px**, centered with
  `position: fixed; top: 50%; left: 50%`.
- A `fit()` function scales the stage to the viewport:
  `scale = min(innerWidth / 1920, innerHeight / 1080)`, applied as
  `translate(-50%, -50%) scale(s)`, re-run on `resize`. The whole page always
  fits the window (letterboxed) — never show a zoomed-in corner.
- All layout inside the stage uses **px** (never `vw`/`vh`/`%` for type) —
  the scaler owns responsiveness.

### Slides

- Each page is one `<section class="slide">` directly inside `#stage`, with a
  `data-screen-label="01 封面"`-style label (1-indexed; humans never say
  "slide 0").
- Exactly one slide carries `.active` (display toggled by the script); dark
  pages add the `.dark` class.
- 10 pages is the default; honor the user's requested count otherwise.

### Navigation runtime (do not rewrite the script)

- Keyboard: `←`/`↑`/`PageUp` previous · `→`/`↓`/`Space`/`PageDown` next ·
  `Home`/`End` first/last.
- Hash routing: `#/N` (1-indexed) read on load and `hashchange`, written via
  `history.replaceState` on every navigation.
- Click: left third of the stage goes back, the rest goes forward.
- Fixed counter pill bottom-right (`03 / 10`), key-hint bottom-left.
- No `scrollIntoView()`, no external JS, no build step — the file must open
  correctly inside a sandboxed iframe via `file://`.

### Design tokens (in `:root`, keep the names)

`--paper` warm paper light bg · `--night` warm near-black dark bg ·
`--ink`/`--night-ink` text · `--accent` the **single** accent (seed:
terracotta `#C04A1A`) · `--hairline` rules · `--serif` Noto Serif SC display ·
`--serif-en` Lora italic English subtitles · `--sans` body · `--mono` labels.
Re-theme by changing token **values** only (from the user's brand or an
active DESIGN.md); never introduce a second accent color.

### Layout enumeration (use 4–5 per deck, never one layout everywhere)

| Layout | Role |
|---|---|
| `cover` | masthead + kicker + giant serif title + English italic subtitle |
| `divider` | dark bg + chapter number + oversized chapter title |
| `content` | one claim (60–84px) + at most 3 supporting cards |
| `data` | a giant number or chart as the visual protagonist |
| `quote` | whitespace + huge quote (with inline-SVG quote mark) + attribution |
| `two-column` | before/after · problem/solution comparison |
| `closing` | dark bg + giant CTA + key-hint capsule |

### Editorial grammar (every page)

- **Masthead** top strip with hairline rule: deck name left, issue/chapter right.
- **Kicker**: 44px accent bar + mono uppercase label above the heading.
- **Footer** hairline rule: section name left, issue/author meta right. Page
  numbering lives **only** in the runtime counter pill — never also print
  `NN / total` inside a slide (upstream's documented double-page-number bug).
- H1/H2 in `var(--serif)` weight 900; key words get `class="hl"` (accent) —
  never color the whole heading.
- Chinese copy uses 「」 quotes, not "".

### Scale (slides are read from 10 meters away)

Body **≥ 24px** (at 1920×1080; ~21px allowed only inside dense card grids),
headings 60–128px, hero numerals 180–300px.

### Rhythm

- Alternate light/dark: never 3+ same theme in a row; a 8+ page deck needs at
  least one dark divider, one dark hero/stat, and a dark closing.
- Alternate density: text page → big-visual page → whitespace/quote page.
- One accent, at most 3 accent touches per page.

## Workflow

1. **Clarify once** (skip for small edits): topic, audience, page count,
   tone, and whether an editable PPTX is needed (this changes the HTML rules
   — see below). One focused batch of questions, then wait.
2. **Real content only.** Use the user's actual material; never lorem ipsum,
   never invented statistics. Missing data gets an honest
   `<!-- 待用户提供 -->` placeholder, not fake numbers.
3. **Showcase first for ≥5 pages**: build the 2 structurally most different
   pages (e.g. cover + data), show them, then batch the rest with the
   approved grammar. Direction wrong = 2 pages of rework, not 13.
4. **Copy `example.html`**, retitle it, swap token values if the user has a
   brand, then replace each section's content following the layout
   enumeration. Keep masthead/kicker/footer chrome and the script intact.
5. **Self-check before delivery**: arrow through every page; counter and
   `#/N` hash stay in sync; no page overflows 1920×1080; no 3+ same theme in
   a row; body type ≥ 24px; grep for leftover `TODO`/placeholder text.

## Anti-AI-slop checklist (from the upstream skill — non-negotiable)

- ❌ Aggressive purple gradients ("tech feel" filler) — the seed's warm
  paper + single terracotta accent is the baseline.
- ❌ Emoji as icons; use inline SVG or plain unicode glyphs (`✦ ✓ → ·`).
- ❌ An icon next to every heading; data/stat decoration that says nothing.
- ❌ Hand-drawn SVG faces/scenes; honest placeholders beat bad artwork.
- ❌ Uniform `#0D1117` + neon glow "GitHub-dark" laziness.
- ✅ Real brand assets when a real product/brand is named (logo, real
  screenshots); ask the user for them rather than faking.
- ✅ One detail at 120%, the rest at 80% — taste is selective precision.

## Optional: PDF / editable PPTX export

The HTML deck is always the source of truth. If the user only needs to
present or archive, the HTML (or a browser-printed PDF) is the deliverable.

If the user explicitly needs an **editable PPTX** (colleagues will edit text
in PowerPoint), the HTML must follow these constraints **from the first
line** — retrofit costs hours:

1. Fixed page size matching PowerPoint wide (960 × 540 pt geometry).
2. All text inside `<p>`/`<h1>`–`<h6>`/`<ul>`/`<ol>` — no bare text in `<div>`,
   no `<span>` as the main text carrier, no `::before/::after` text.
3. No background/border/shadow on `<p>`/`<h*>` themselves (wrap in a div).
4. No CSS gradients, no `background-image` on divs (use `<img>`), no web
   components, no complex decorative SVG.

Tell the user honestly that this trades away visual freedom, and never
degrade the default HTML deck design just to keep PPTX possible. Conversion
itself is done with an HTML-to-PPTX tool of the user's environment (upstream
uses `html2pptx`); from this plugin, deliver the constraint-compliant HTML.
