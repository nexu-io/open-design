---
name: huashu-annual-letter
en_name: "Write an Annual Founder's Letter like a Mission-Driven CEO"
zh_name: "像使命驱动的 CEO 一样写年度公开信"
description: |
  Open Design's annual letter to its community: the year's story, what it learned, and where it's going next. Built as a decision-grade corporate strategy deck for community, contributors, investors.
en_description: |
  Open Design's annual letter to its community: the year's story, what it learned, and where it's going next. Built as a decision-grade corporate strategy deck for community, contributors, investors.
zh_description: |
  像使命驱动的 CEO 一样写年度公开信——一份可商业交付的企业战略 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "corporate-strategy"
  - "board-pre-read-deck"
  - "strategy"
  - "board"
  - "business-review"
  - "decision-deck"
  - "commercial-slide-agent"
  - "huashu-annual-letter"
triggers:
  - "board-pre-read-deck"
  - "corporate-strategy"
  - "Write an Annual Founder's Letter like a Mission-Driven CEO"
  - "像使命驱动的 CEO 一样写年度公开信"
  - "board"
  - "strategy"
  - "business-review"
  - "html deck"
  - "html slides"
od:
  mode: deck
  surface: web
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
  example_prompt_i18n:
    zh-CN: "用「年度信笺」模板把我的年度复盘写成一封 Stripe 年信风格的 HTML 幻灯片：奶白 #FBFAF8 纸面、单一 Stripe 紫 #635BFF 点睛、65ch 行宽衬线散文、内联数据卡、超大 tabular 数字锚点页，键盘 ←/→/空格翻页 + #/N hash 跳页。从 example.html 出发只换内容，不要重写设计。"
  category: "corporate-strategy"
  scenario: "strategy"
  example_prompt: "Create \"Write an Annual Founder's Letter like a Mission-Driven CEO\" as a decision-grade Corporate strategy deck in this template's own visual system. Subject: Open Design's annual letter to its community: the year's story, what it learned, and where it's going next. Audience: community, contributors, investors. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: would a board member know what to approve and why before page five."
---

# Annual Letter · 年度信笺

Produce a **single-file, letter-grade HTML deck** in the Stripe Annual Letter
genre: a published letter you read, not a template you skim. Prose flows in
serif paragraphs; numbers live in inline data cards and giant display anchors.
The visual system, canvas contract, and navigation runtime are locked by
`example.html`. **Start from `example.html`, replace content only — do not
rewrite the design or the script, and never introduce colors or fonts outside
this spec.**

Adapted from the editorial-longform style (`references/design-styles.md`,
安静派 · 杂志编辑长文流 / Editorial Longform) of
[huashu-design](https://github.com/alchaincyf/huashu-design) by
花叔 (alchaincyf), MIT licensed. Reference lineage: Stripe Annual Letter,
Amazon six-page narrative memos, Stripe Press.

## Hard spec (locked — violating any line is a regression)

### Canvas & scaling

- One `<div id="stage">` fixed at **1920 × 1080 px**, centered with
  `position: fixed; top: 50%; left: 50%`.
- A `fit()` function scales the stage to the viewport:
  `scale = min(innerWidth / 1920, innerHeight / 1080)`, applied as
  `translate(-50%, -50%) scale(s)`, re-run on `resize`. Letterboxed, never
  cropped.
- All layout inside the stage uses **px** (never `vw`/`vh`/`%` for type) —
  the scaler owns responsiveness.

### Slides & navigation runtime (do not rewrite the script)

- Each page is one `<section class="slide">` directly inside `#stage`, with a
  `data-screen-label="01 刊头"`-style label (1-indexed).
- Exactly one slide carries `.active`. **No `.dark` pages in this theme** —
  every page sits on cream paper; rhythm comes from density, not theme flips.
- Keyboard: `←`/`↑`/`PageUp` previous · `→`/`↓`/`Space`/`PageDown` next ·
  `Home`/`End` first/last. Hash routing `#/N` (1-indexed) read on load and
  `hashchange`, written via `history.replaceState`. Click: left third back,
  rest forward. Fixed counter pill bottom-right, key-hint bottom-left.
- Zero external JS, zero build step; the file must open via `file://` inside
  a sandboxed iframe.

### Design tokens (in `:root`, keep the names — re-theme by changing values only)

```css
--paper:        #FBFAF8;                    /* cream paper, every page */
--panel:        #FFFFFF;                    /* data-card surface */
--ink:          #232036;                    /* deep ink text */
--ink-70:       rgba(35, 32, 54, 0.72);     /* prose body */
--ink-45:       rgba(35, 32, 54, 0.46);     /* captions, chrome */
--hairline:     rgba(35, 32, 54, 0.12);     /* all rules */
--accent:       #635BFF;                    /* Stripe purple — the ONLY accent */
--accent-soft:  rgba(99, 91, 255, 0.08);    /* tint panels, quote marks */
--serif:        "Newsreader", "Source Serif 4", "Noto Serif SC", Georgia, serif;
--serif-text:   "Source Serif 4", "Newsreader", "Noto Serif SC", Georgia, serif;
--sans:         "Inter", "Noto Sans SC", -apple-system, sans-serif;
```

- Fonts via Google Fonts `@import`: Newsreader (display, incl. italic),
  Source Serif 4 (prose), Noto Serif SC (CJK serif), Inter, Noto Sans SC.
- **All numerals tabular**: the shared `.num` class sets
  `font-variant-numeric: tabular-nums`; every metric, year, and display
  number uses it.
- One accent. Never a second hue, never a gradient, never a dark slide.

### Letter chrome (every page)

- **Letterhead** top strip with hairline rule: publication/company name left
  (small-caps Inter, letter-spaced, brand word in accent), issue + date right.
- **Footer** hairline rule: section name left, author/issue meta right. Page
  numbering lives **only** in the runtime counter pill — never also printed
  inside a slide.
- Headings in `var(--serif)` (Newsreader/Noto Serif SC), weight 500–600 —
  letters are set elegantly, not boldly; key words get `class="hl"` (accent),
  never the whole heading.
- **Kicker**: small-caps Inter label with a short 44×3px accent bar above
  section titles.
- Chinese copy uses 「」 quotes; 中英混排 keeps English in Newsreader italic.

### Signature devices (the genre — use them, don't substitute)

| Device | Spec |
|---|---|
| Prose measure | paragraphs `max-width: 980px` (≈65ch), serif 25–27px, `line-height: 1.9`, `text-align: justify` optional |
| Drop cap | first paragraph of the letter body: `::first-letter` serif, ~3 lines tall, accent color |
| Inline data card | `--panel` bg, 1px hairline, 2–3px accent top rule, small-caps Inter label + large tabular serif numeral + one-line caption; floated beside or gridded next to prose |
| Display-number anchor | one giant tabular numeral 180–280px in accent, alone on the page with a one-line setup above and a footnote below |
| Minimal chart | inline SVG only: single purple line/area on hairline baseline, direct labels on data points, no grid mesh, no legend, no chartjunk |
| Quote page | oversized serif quote (60–76px, weight 500) with an accent-soft giant quotation mark, attribution in small-caps Inter |
| Signed closing | farewell prose + serif-italic signature block + key-hint capsule |

### Layout enumeration (use 5–6 per deck, never one layout everywhere)

`cover` masthead page · `contents` letter outline rows · `salutation` prose
opening with drop cap · `display-number` anchor · `prose+cards` running text
with inline data cards · `chart` minimal SVG figure · `quote` full-page
citation · `metrics-panorama` data-card grid with footnote · `closing`
signature page.

### Scale & rhythm

- Body prose ≥ 24px (at 1920×1080), headings 64–132px, display numerals
  180–280px, chrome labels 14–16px.
- Alternate density: prose page → display-number page → whitespace/quote
  page. A letter is quiet; resist decorating it.
- At most 3 accent touches per page; whitespace is the composition.

## Workflow

1. **Clarify once** (skip for small edits): letter type, audience, the year's
   real numbers and 2–4 narrative chapters, tone. One batch of questions.
2. **Real content only.** Use the user's actual material and real metrics;
   never lorem ipsum, never invented statistics. Missing data gets an honest
   `<!-- 待用户提供 -->` placeholder.
3. **Showcase first for ≥5 pages**: build the 2 structurally most different
   pages (cover + prose-with-cards), confirm, then batch the rest.
4. **Copy `example.html`**, retitle, swap token values only if the user has a
   brand, then replace each section's content following the layout
   enumeration. Keep letterhead/footer chrome and the script intact.
5. **Self-check before delivery**: arrow through every page; counter and
   `#/N` stay in sync; no overflow; prose stays inside the 980px measure;
   numerals all tabular; grep for leftover placeholders.

## Anti-AI-slop checklist (non-negotiable)

- ❌ Bullet lists where prose should flow — this genre speaks in paragraphs.
- ❌ A second accent color, gradients, dark "tech" pages, neon glow.
- ❌ Emoji as icons; inline SVG or plain glyphs (`✦ ✓ → ·`) only.
- ❌ Chartjunk: grids, legends, 3D, more than one series color.
- ❌ Proportional figures in metrics — tabular numerals everywhere.
- ✅ One detail at 120% (the display number), the rest at 80%.
- ✅ Honest footnotes and sources under every metric panorama.
