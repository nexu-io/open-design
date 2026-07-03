---
name: huashu-luxe-whitespace
en_name: "Write a Luxury Market-Entry Deck like a Premium-Sector Strategy Partner"
zh_name: "像高端领域战略合伙人一样写奢侈品进入市场方案"
description: |
  A market-entry study for a luxury skincare brand entering Asia — segmentation, positioning, channel, and the phased plan. Built as a decision-grade consulting deck for client leadership.
en_description: |
  A market-entry study for a luxury skincare brand entering Asia — segmentation, positioning, channel, and the phased plan. Built as a decision-grade consulting deck for client leadership.
zh_description: |
  像高端领域战略合伙人一样写奢侈品进入市场方案——一份可商业交付的咨询交付 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "consulting"
  - "consulting-final-deck"
  - "strategy"
  - "consulting-deliverable"
  - "client"
  - "decision-deck"
  - "commercial-slide-agent"
  - "huashu-luxe-whitespace"
triggers:
  - "consulting-final-deck"
  - "consulting"
  - "Write a Luxury Market-Entry Deck like a Premium-Sector Strategy Partner"
  - "像高端领域战略合伙人一样写奢侈品进入市场方案"
  - "consulting-deliverable"
  - "strategy"
  - "client"
  - "html deck"
  - "html slides"
od:
  mode: deck
  surface: web
  preview:
    type: html
    entry: index.html
  design_system:
    requires: false
  example_prompt_i18n:
    zh-CN: "用「奢华留白」模板把我的内容做成轻奢 HTML 幻灯片：1920×1080 米白画布、70% 以上留白、Inter 200–600 超细字重层级、120px 超细数字 + 金色小数点、唯一暖金 #D4A574 用在发丝线与对比条上、渐变发丝线分隔。从 example.html 出发只换内容，不要重写设计。"
  category: "consulting"
  scenario: "strategy"
  example_prompt: "Create \"Write a Luxury Market-Entry Deck like a Premium-Sector Strategy Partner\" as a decision-grade Consulting deck in this template's own visual system. Subject: A market-entry study for a luxury skincare brand entering Asia — segmentation, positioning, channel, and the phased plan. Audience: client leadership. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: would a client know what to do Monday morning."
---

# Luxe Whitespace · 奢华留白

Produce a **single-file, quiet-luxury deck**. You are typesetting for a
maison, not a startup: every page breathes, numbers float in ultra-thin
weights, and gold appears only as a hairline or a decimal point — never as a
surface. The visual system, canvas contract, and navigation runtime are
locked by `example.html`. **Start from `example.html`, replace content only —
do not rewrite the design or the script. Do not introduce any color or font
outside this spec.**

Adapted from the `ppt-build` showcase of
[huashu-design](https://github.com/alchaincyf/huashu-design) by 花叔
(alchaincyf), MIT licensed. The upstream file is a single benchmark page;
this plugin extends it into a full multi-section deck while preserving its
DNA: the off-white field, the thin floating metrics, the gold-vs-grey
comparison bars, and the gradient hairline separators.

## Hard spec (locked — violating any line is a regression)

### Canvas & runtime

- One `<div id="stage">` fixed at **1920 × 1080 px**, centered with
  `position: fixed; top: 50%; left: 50%`; a `fit()` function applies
  `translate(-50%, -50%) scale(min(innerWidth/1920, innerHeight/1080))` on
  load and `resize`. All inner layout in px — the scaler owns responsiveness.
- Each page is one `<section class="slide">` inside `#stage` with a
  `data-screen-label="01 封面"`-style label and the locked page frame:
  `padding: 64px 96px 48px 96px`, flex column, `.top-row` chrome at the top
  and `.bottom-section` (insight text + brand mark) pinned to the bottom via
  `margin-top: auto`. Exactly one slide carries `.active`.
- Navigation (keep the script verbatim): `←`/`↑`/`PageUp` previous,
  `→`/`↓`/`Space`/`PageDown` next, `Home`/`End` first/last; `#/N` hash
  routing (1-indexed) read on load + `hashchange`, written via
  `history.replaceState`; click left third = back, rest = forward; the
  script also builds the gold slide-dot indicator into `#dots` and syncs it
  in `go()`. Counter pill bottom-right, key-hint bottom-left. No external
  JS, no build step — the file must open inside a sandboxed iframe.

### Design tokens (`:root` — keep the names, re-theme values only)

| Token | Value | Role |
|---|---|---|
| `--bg` | `#FAFAF8` | warm off-white page — the only background |
| `--ink` | `#2A2A2A` | primary ink (soft black, never #000) |
| `--gold` | `#D4A574` | **the only accent** — hairlines, decimals, winning bars |
| `--hairline` | `#E0DCD6` | gradient hairline separators |
| `--rule` | `#EEECE8` | horizontal section rules / counter border |
| `--track` | `#EEECEA` | comparison bar track |
| `--bar` | `#D8D5D0` | baseline / losing bar |
| `--muted` | `#696963` | metric names, strong captions |
| `--soft` | `#74746E` | subtitles |
| `--faint` | `#B8B4AE` | tertiary captions, eyebrow |
| `--ghost` | `#C8C4BC` | brand text, source notes, oldest timeline year |
| `--body` | `#6E6E68` | insight body copy (WCAG AA on `--bg`) |
| `--sans` | `'Inter', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif` | the only family |

- **Font loading**: exactly one
  `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600&display=swap')`
  at the top of the stylesheet. Weights 200/300/400/500/600 only — **700+ is
  forbidden**; emphasis in this style is achieved by stepping 300 → 500, not
  by bolding.
- One accent. A second color, a dark page, a gradient surface, or a drop
  shadow on content (the stage letterbox shadow is the sole exception) is
  the cardinal sin of this style.

### Signature devices (the visual DNA — every deck must show them)

1. **Ultra-thin floating numerals**: metric values at 120px weight 200 with
   `letter-spacing: -4px`; hero numbers up to 240px weight 200
   (`letter-spacing: -10px`). The decimal point is always a gold
   `<span class="dot">.</span>` at weight 300; units are 28–56px weight 200
   gold `vertical-align: super` at `opacity: 0.8`.
2. **Gradient hairline separators**: 1px verticals built with
   `linear-gradient(to bottom, transparent, var(--hairline) 50%, transparent)`
   — between metric cards (`::after`), timeline columns, and the two-column
   divider. Never a solid full-height border.
3. **Gold-vs-grey comparison bars**: `.comp-row` = right-aligned 80px label +
   2px `--track` track + fill; the page's subject is **always** the 3px gold
   fill, competitors get the 2px grey `--bar` fill; values sit outside the
   track (gold for the subject). Wide chart rows may use the
   `linear-gradient(to right, var(--gold), rgba(212,165,116,0.35))` fade fill.
4. **Page chrome**: every page opens with `.top-row` — 10px/400/4px-tracking
   uppercase `.eyebrow` left, 10px/300 right-aligned `.source-note` — and
   closes with `.bottom-section` — 13px/300 `.insight-text` (emphasis =
   `<strong>` at 500/#666) left, `.brand-mark` (32px gold hairline + 10px
   tracked brand text) right. Title pages add `.title-area`: 40px weight-200
   headline with a weight-400 `.mid` span and a gold full stop
   (`.gold-dot`), 14px/300 subtitle, closed by a 1px `--rule` border.
5. **Gold slide-dot indicator**: 4px `--hairline` dots top-right; the active
   page becomes a 16px gold pill. Built by the script — do not hand-write
   dots into slides.
6. **Gold punctuation**: headlines end in a gold `。` or `.`; gold is never
   applied to a whole headline or paragraph. Budget: **≤ 5 gold touches per
   page** (a bar group counts as one).

### Layout enumeration (use 5+ per deck, never one layout everywhere)

| Layout | Role |
|---|---|
| `cover` | 104px thin statement headline + gold full stop + 64px gold rule + 280px ghost year numeral at 5% opacity |
| `contents` | hairline-ruled rows: 32px thin gold number + 22px/300 title + uppercase right caption |
| `big-number` | one 240px thin numeral protagonist + gold-ruled side column (label + 15px/300 body) |
| `metrics` | 2–3 `.metric-card` columns with 120px numerals + comparison groups + hairline separators (the upstream master) |
| `channels` | full-width horizontal bar rows: name + EN small caption, gradient gold winner, 32px thin values |
| `timeline` | equal hairline-separated columns, 88px year numerals graded ghost→faint→muted→ink, gold dot on the current year |
| `quote` | centered: vertical gold fade hairline + 52px/200 quote (key phrase gold) + uppercase attribution |
| `two-column` | before/after: ghost numerals left vs ink+gold numerals right, gradient hairline divider |
| `stats-grid` | 2×2 grid of 96px thin numerals, crossed gradient hairlines through the center |
| `closing` | 120px thin sign-off + gold full stop + uppercase EN echo + gold rule |

### Typography & whitespace discipline

- Scale: eyebrow/captions 10–12px tracked uppercase · body 13–16px weight
  300, line-height 1.8–2 · titles 40px weight 200 · metrics 120px ·
  heroes 240px. Tracking: +2 to +4px on small uppercase, −0.5 to −10px on
  large thin type. Chinese copy uses 「」 quotes and full-width punctuation.
- **70%+ of every page is empty.** One idea per page; at most 3 metric
  cards, 4 bar rows, 4 timeline columns, 4 stat cells, 7 contents rows.
  If content doesn't fit with this much air, add a page — never shrink the
  whitespace.
- No emoji, no icon fonts, no images, no dark pages, no borders thicker
  than 1px (bars excepted at 2–3px), no border-radius except the counter
  pill and bar tracks. Icons, if truly needed, are 1px-stroke inline SVG.
- Real content only — the user's actual numbers; missing data gets an honest
  `<!-- 待用户提供 -->` placeholder, never invented statistics. (The seed
  deck's 「素白 SOBLANC」 perfume-house data is fictional demo content and
  must be fully replaced.)

## Workflow

1. **Clarify once**: topic, audience, page count, and which 2–4 numbers
   deserve the thin-numeral treatment. This style is carried by its
   floating numerals — choose them before writing any page.
2. **Copy `example.html`**, retitle, then replace each section's content
   following the layout enumeration. Keep the page chrome, hairline
   devices, token names, and the script intact. Re-theme by changing token
   values only — and only if the user's brand genuinely demands it; the
   off-white + warm gold pairing is the identity.
3. **For ≥ 5 pages, showcase first**: build the cover + one metrics page,
   confirm the grammar, then batch the rest.
4. **Self-check before delivery**: arrow through every page; dots, counter,
   and `#/N` hash stay in sync; no overflow beyond 1920×1080; bar widths
   match their printed values proportionally; every page shows the eyebrow
   row, the bottom brand mark, and at least one hairline device; no weight
   above 600 anywhere; gold count per page ≤ 5; no leftover demo
   ("素白"/"SOBLANC") text; grep for `TODO`.
