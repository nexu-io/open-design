---
name: huashu-bento-insight
en_name: "Write a Competitive Displacement Deck like a Top Sales Engineer"
zh_name: "像顶级售前一样写竞品替换方案"
description: |
  Open Design vs closed cloud design tools: a side-by-side displacement case on control, cost (BYOK), and lock-in. Built as a decision-grade B2B sales deck for evaluation committee.
en_description: |
  Open Design vs closed cloud design tools: a side-by-side displacement case on control, cost (BYOK), and lock-in. Built as a decision-grade B2B sales deck for evaluation committee.
zh_description: |
  像顶级售前一样写竞品替换方案——一份可商业交付的B2B 销售 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "b2b-sales"
  - "b2b-saas-sales-proposal"
  - "sales"
  - "renewal"
  - "customer"
  - "decision-deck"
  - "commercial-slide-agent"
  - "huashu-bento-insight"
triggers:
  - "b2b-saas-sales-proposal"
  - "b2b-sales"
  - "Write a Competitive Displacement Deck like a Top Sales Engineer"
  - "像顶级售前一样写竞品替换方案"
  - "sales"
  - "renewal"
  - "customer"
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
    zh-CN: "用「便当格洞见」模板把我的季度汇报做成 Apple Keynote 风格的 HTML 幻灯片：1920×1080 固定画布、#F5F5F7 浅灰与奶白底、不等高圆角便当卡（1px 细描边 + 微阴影）、每卡只装一个洞见（巨型等宽数字 / 线性 SVG 图标 / SVG sparkline）、超大 display 标题强字重对比。从 example.html 出发只换内容，不要重写设计。"
  category: "b2b-sales"
  scenario: "sales"
  example_prompt: "Create \"Write a Competitive Displacement Deck like a Top Sales Engineer\" as a decision-grade B2B sales deck in this template's own visual system. Subject: Open Design vs closed cloud design tools: a side-by-side displacement case on control, cost (BYOK), and lock-in. Audience: evaluation committee. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: can the champion forward this internally without rewriting it."
---

# Bento Insight Grid · 便当格洞见

Produce a **single-file, Apple-keynote-school bento deck**. You are a metrics
curator working in HTML: every card holds exactly one insight, every number is
tabular, and whitespace does the talking. The visual system, canvas contract,
and navigation runtime are locked by `example.html`. **Start from
`example.html`, replace content only — do not rewrite the design or the
script. Do not introduce any color or font outside this spec.**

Generated from the「Bento便当格模块网格 / Bento Grid」entry (neutral school,
95% fidelity) of `references/design-styles.md` in
[huashu-design](https://github.com/alchaincyf/huashu-design) by 花叔
(alchaincyf), MIT licensed. Reference lineage: Apple Keynote Bento-Grid era,
new-generation MBB Bento/Big-Type decks (2024–2026), Stripe annual-report
metric-card matrices, Pitch.com QBR templates. Distinct from the fixed 8-cell
`weekly-report` KPI scenario: this is a general bento *aesthetic* theme —
free-form unequal-height composition, weight contrast, sparklines.

## Hard spec (locked — violating any line is a regression)

### Canvas & runtime

- One `<div id="stage">` fixed at **1920 × 1080 px**, centered with
  `position: fixed; top: 50%; left: 50%`; a `fit()` function applies
  `translate(-50%, -50%) scale(min(innerWidth/1920, innerHeight/1080))` on
  load and `resize`. All inner layout in px — the scaler owns responsiveness.
- Each page is one `<section class="slide">` inside `#stage` with a
  `data-screen-label="01 封面"`-style label; exactly one slide carries
  `.active`; cream pages add `.cream`.
- Navigation (keep the script verbatim): `←`/`↑`/`PageUp` previous,
  `→`/`↓`/`Space`/`PageDown` next, `Home`/`End` first/last; `#/N` hash
  routing (1-indexed) read on load + `hashchange`, written via
  `history.replaceState`; click left third = back, rest = forward; rounded
  counter pill bottom-right, key-hint bottom-left. No external JS, no build
  step — the file must open inside a sandboxed iframe via `file://`.

### Design tokens (`:root` — keep the names, re-theme values only)

| Token | Value | Role |
|---|---|---|
| `--bg` | `#F5F5F7` | master page background (Apple light grey) |
| `--cream` | `#FBFAF7` | warm cream alternate page background |
| `--card` | `#FFFFFF` | default card surface |
| `--card-dark` | `#1D1D1F` | hero inverse card (≤ 1–2 per deck spread) |
| `--tint-blue` | `#EAF2FE` | tinted card — brand |
| `--tint-green` | `#EAF8F0` | tinted card — positive |
| `--tint-warm` | `#FDF3E7` | tinted card — highlight |
| `--ink` | `#1D1D1F` | primary text |
| `--ink-soft` | `#424245` | body copy |
| `--muted` | `#6E6E73` | secondary labels |
| `--faint` | `#AEAEB2` | tertiary captions |
| `--dark-ink` / `--dark-mut` | `#F5F5F7` / `#98989D` | text on dark card |
| `--hairline` | `#E8E8ED` | 1px card border |
| `--brand` | `#0071E3` | brand blue — primary accent |
| `--green` | `#1FA958` | positive delta accent |
| `--orange` | `#F08A24` | highlight / caution accent |
| `--shadow` | `0 2px 6px rgba(0,0,0,.04), 0 12px 32px rgba(0,0,0,.05)` | micro shadow |
| `--r-lg` / `--r-md` / `--r-sm` | `32px` / `24px` / `14px` | radius scale |
| `--sans` | `'Inter', 'Geist', -apple-system, 'PingFang SC', …` | body family |
| `--display` | `'Geist', 'Inter', …` | display headlines |
| `--mono` | `'Geist Mono', 'SF Mono', ui-monospace, …` | all KPI numerals |

- Fonts come from one Google Fonts `@import` (Inter + Geist + Geist Mono) —
  the only allowed external reference. No other CDN, no icon fonts, no
  Chart.js/mermaid; charts are pure CSS/SVG.
- Brand may be re-themed to the user's primary color, but the triad stays:
  **one brand + green (positive) + orange (caution)**. A fourth accent is the
  cardinal sin of this style. No gradients, no glassmorphism, no neon.

### Signature devices (the visual DNA — every deck must show them)

1. **Unequal-height bento grid**: CSS Grid (`repeat(6, 1fr)` columns ×
   `1.18fr 1fr`-style rows) with mixed `span` widths and one tall
   `grid-row: span 2` hero card. Never a uniform equal-cell grid — unequal
   heights *are* the style. Gap 20–24px.
2. **Card anatomy**: `--card` surface + `1px solid var(--hairline)` +
   `var(--shadow)` micro shadow + 24–32px radius. One insight per card: a
   `card-label` (14px/600 muted) on top, one protagonist below. Tinted and
   dark cards are seasoning — at most 1 dark + 2 tinted per bento page.
3. **Tabular KPI numerals**: every number in `--mono` with
   `font-variant-numeric: tabular-nums`, weight 700–800, negative tracking;
   units in a `.unit` span at ~0.42em muted. Deltas are rounded `.delta`
   pills (`↑ 42%`) in green/orange tints.
4. **Sparklines & charts**: inline `<svg preserveAspectRatio="none">`
   polyline + optional 14%-opacity area fill for sparklines; bar charts are
   flex columns of rounded `div` bars with the current period in `--brand`
   and history in `#E4E4E9`, values printed in mono above each bar.
5. **Linear icons**: inline SVG, `stroke="currentColor"`,
   `stroke-width="1.8"`, round caps, sitting in a 52px rounded tinted
   `.icon` chip. No emoji anywhere.
6. **Display weight contrast**: headlines pair weight 800–900 spans with
   300–400 `.thin`/`.lite` spans in the same line (e.g. 「稳健增长，全面提
   效。」 with the verb heavy and the qualifier light). Kickers are 14px
   mono uppercase, 3px tracking, brand-colored.

### Layout enumeration (use 5+ per deck, never one layout everywhere)

| Layout | Role |
|---|---|
| `cover` | cream page, giant 130–150px display statement + mini bento strip of 3–4 KPI cards |
| `agenda` | 4 equal cards, oversized hairline-grey mono numbers, first number brand-colored |
| `bento` | the master: 6-col × 2-row unequal grid, dark hero card with sparkline + 5 satellite cards |
| `one-insight` | cream page, one 300–380px mono numeral protagonist + label + chip row |
| `chart` | big bar-chart card (2 rows tall) + 2 side insight cards |
| `feature-bento` | 3-col grid with wide cards, linear icon chips + meta footer rows |
| `quote` | oversized quote card (brand SVG quote marks, key phrase in brand color) + 2 stat cards |
| `stats-2x2` | 2×2 grid of 80–90px numerals, one dark + one tinted card |
| `roadmap` | 3 track cards: mono Q-tag, dot-bulleted list, hairline-topped target footer |
| `closing` | cream page, giant display farewell (one brand-colored word) + summary card strip |

### Typography & scale (read from 10 meters)

- Display headlines 120–170px weight 900 on cover/closing, tracking −6 to
  −8px; page titles 62px weight 800, tracking −2px. Hero KPI 84–96px; the
  one-insight numeral 300–380px weight 800 with its `%`/unit glyph in
  `--brand`.
- Body 15–19px `--muted`/`--ink-soft`, line-height 1.6–1.7. Labels 14px/600.
  Mono meta rows 14px with 1–2px tracking.
- Chinese copy is idiomatic and uses 「」 quotes and full-width punctuation;
  zh/en mixing is welcome (mono English kickers over Chinese headlines is
  the house voice).

### Rhythm & discipline

- Default 10 pages (8–11 allowed). Page backgrounds alternate `--bg` and
  `--cream` for breathing rhythm; cards stay white/tinted/dark.
- Whitespace is a feature: card padding ≥ 36px, page padding ≈ 84–110px;
  never cram more than 7 cards on one bento page.
- One insight per card — if a card needs two numbers, it is two cards.
- Honest data only — the user's actual numbers; missing data gets an
  `<!-- 待用户提供 -->` placeholder, never invented statistics. (The seed
  deck's 「澄流 ClearFlow」data is fictional demo content and must be fully
  replaced.) Negative metrics keep the orange caution treatment — bento
  decks that hide bad news read as marketing, not review.

## Workflow

1. **Clarify once**: topic, audience, page count, and which 3–6 metrics are
   the protagonists (plus the single most important one for the one-insight
   page). This style lives on its numbers — pick them before writing pages.
2. **Copy `example.html`**, retitle, then replace each section's content
   following the layout enumeration. Keep the grid skeletons, token names,
   card anatomy, and the script intact. Re-theme by changing token values
   only — and only `--brand` plus tints, if the user's brand demands it.
3. **For ≥ 5 pages, showcase first**: build the cover + the master bento
   page, confirm the grammar, then batch the rest.
4. **Self-check before delivery**: arrow through every page; counter and
   `#/N` hash stay in sync; no overflow beyond 1920×1080; bar heights match
   their printed values proportionally; every bento page has unequal card
   heights and ≤ 1 dark card; no emoji; no fourth accent color; no leftover
   demo (「澄流」/"ClearFlow") text; grep for `TODO`.
