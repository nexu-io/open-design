---
name: huashu-takram-soft-tech
en_name: "Build a Buyer-Committee Leave-Behind like an Enterprise Sales Lead"
zh_name: "像企业销售负责人一样写买方委员会转发稿"
description: |
  Open Design procurement & security leave-behind: the one-pager-plus a buying committee can forward and approve internally. Built as a decision-grade B2B sales deck for buying committee, security, procurement.
en_description: |
  Open Design procurement & security leave-behind: the one-pager-plus a buying committee can forward and approve internally. Built as a decision-grade B2B sales deck for buying committee, security, procurement.
zh_description: |
  像企业销售负责人一样写买方委员会转发稿——一份可商业交付的B2B 销售 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "b2b-sales"
  - "b2b-saas-sales-proposal"
  - "sales"
  - "renewal"
  - "customer"
  - "decision-deck"
  - "commercial-slide-agent"
  - "huashu-takram-soft-tech"
triggers:
  - "b2b-saas-sales-proposal"
  - "b2b-sales"
  - "Build a Buyer-Committee Leave-Behind like an Enterprise Sales Lead"
  - "像企业销售负责人一样写买方委员会转发稿"
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
    entry: example.html
  design_system:
    requires: false
  example_prompt_i18n:
    zh-CN: "用「东方柔光科技」模板把我的内容做成柔和自然色系的 HTML 幻灯片：1920×1080 固定画布、米色和纸底 #F5F0EB、鼠尾草绿 #6B8F71 + 唯一金 #D4A574 + 暖灰系、Noto Serif SC 衬线大标题 + Inter 标签混排、圆角半透明数据卡片、SVG 雷达图三色叠加当艺术品并配 Fig. NN 图版注记。从 example.html 出发只换内容，不要重写设计。"
  category: "b2b-sales"
  scenario: "sales"
  example_prompt: "Create \"Build a Buyer-Committee Leave-Behind like an Enterprise Sales Lead\" as a decision-grade B2B sales deck in this template's own visual system. Subject: Open Design procurement & security leave-behind: the one-pager-plus a buying committee can forward and approve internally. Audience: buying committee, security, procurement. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: can the champion forward this internally without rewriting it."
---

# Takram Soft Tech · 东方柔光科技

Produce a **single-file, soft nature-toned tech deck**. You are a research
studio designer working in HTML: every chart is composed like a museum plate,
every color is borrowed from moss, paper and dusk. The visual system, canvas
contract, and navigation runtime are locked by `example.html`. **Start from
`example.html`, replace content only — do not rewrite the design or the
script. Do not introduce any color or font outside this spec.**

Adapted from the `ppt-takram` showcase of
[huashu-design](https://github.com/alchaincyf/huashu-design) by 花叔
(alchaincyf), MIT licensed. The upstream file is a single benchmark page;
this plugin extends it into a full multi-section deck while preserving its
DNA: data visualization treated as an art piece.

## Hard spec (locked — violating any line is a regression)

### Canvas & runtime

- One `<div id="stage">` fixed at **1920 × 1080 px**, centered with
  `position: fixed; top: 50%; left: 50%`; a `fit()` function applies
  `translate(-50%, -50%) scale(min(innerWidth/1920, innerHeight/1080))` on
  load and `resize`. All inner layout in px — the scaler owns responsiveness.
- Each page is one `<section class="slide">` inside `#stage` with a
  `data-screen-label="01 封面"`-style label; exactly one slide carries
  `.active`. This is an **all-light style — there are no dark pages**;
  rhythm comes from density alternation, not theme swaps.
- Navigation (keep the script verbatim): `←`/`↑`/`PageUp` previous,
  `→`/`↓`/`Space`/`PageDown` next, `Home`/`End` first/last; `#/N` hash
  routing (1-indexed) read on load + `hashchange`, written via
  `history.replaceState`; click left third = back, rest = forward; fixed
  counter pill bottom-right, key-hint bottom-left. No external JS, no build
  step — the file must open inside a sandboxed iframe via `file://`.

### Design tokens (`:root` — keep the names, re-theme values only)

| Token | Value | Role |
|---|---|---|
| `--paper` | `#F5F0EB` | warm rice-paper page background |
| `--ink` | `#2D3436` | heading ink |
| `--body` | `#3A3A3A` | body ink |
| `--green` | `#6B8F71` | sage green — the primary accent |
| `--green-2` | `#7D9B72` | lighter sage (delta pills, fills) |
| `--sage` | `#A8B5A0` | pale sage (labels, washes, flow lines) |
| `--gold` | `#D4A574` | the **only** warm accent — 2nd data series |
| `--gray-warm` | `#C8C2B8` | warm gray — 3rd data series, captions |
| `--gray-line` | `#D4CFC6` | delicate axis / rule lines |
| `--gray-dash` | `#DDD9D2` | dashed grid circles |
| `--gray-bg` | `#E8E4DC` | faint outermost rings |
| `--muted` | `#615C54` | secondary text (warm ink, WCAG AA on paper) |
| `--faint` | `#736D64` | tertiary captions (warm ink, WCAG AA) |
| `--card` | `rgba(255,255,255,0.6)` | translucent card background |
| `--card-line` | `rgba(168,181,160,0.18)` | card hairline border |
| `--serif` | `'Noto Serif SC', 'Songti SC', serif` | display headings, quotes, insight text |
| `--sans` | `'Inter', 'PingFang SC', 'Hiragino Sans GB', sans-serif` | labels, numbers, body |

Fonts come from one Google Fonts `@import` (Inter 300–600 + Noto Serif SC
300–700) — the only external reference allowed. **No purple, no blue, no
neon, no pure black, no gradients other than the two locked radial washes.**

### Signature devices (the visual DNA — every deck must show them)

1. **Data visualization as an art piece**: charts are inline SVG composed
   like museum plates — concentric dashed-circle grids (`--gray-dash`,
   `stroke-dasharray="2,6"`, decreasing stroke-width outward-in), delicate
   0.5px axis lines, tiny hollow endpoint circles, faint scale numbers, and
   a 3-series overlay: **green polygon prominent (stroke 2, dot r=6 with
   halo ring), gold secondary (stroke 1.2, dot r=3.5), warm-gray tertiary
   (stroke 1 dashed, dot r=2.5)**. Value callouts use thin annotation lines
   + 14px/600 green numerals. Every plate signs off with a right-aligned
   8–9px `Fig. NN — Title` caption in `--gray-warm`.
2. **Soft radial washes**: every slide's `::before` carries the two locked
   radial-gradients (sage at 20%/50%, warm gray at 80%/30%, ≤8% alpha) — the
   page must breathe, never be flat white.
3. **Rounded translucent cards** (`.soft-card`): 16px radius,
   `rgba(255,255,255,0.6)` fill, `--card-line` hairline border, and a 32px ×
   2px sage tick at top-left (`::before`). Value typography: 38–44px
   weight-300 numerals with a smaller green unit span; deltas in a rounded
   sage pill with a tiny SVG triangle (gold pill allowed once per page for a
   special callout).
4. **Hairline masthead** on every page: 64px strip, bottom border
   `rgba(107,143,113,0.15)`; left = green dot + 11px/500/3px-tracking
   uppercase deck name; right = 10px/400 `--faint` section label. Footer:
   11px faint credit line bottom-left, `Fig./Sec.` note bottom-right. Page
   numbering lives **only** in the runtime counter pill.
5. **Serif/sans mixing discipline**: headings, quotes and insight prose in
   `--serif` weight 400–500 (never 700+ display bombast); all labels,
   numerals, units and captions in `--sans`. English subtitles are 15–18px
   weight-300 `--muted` prose under Chinese serif titles.
6. **Badge & insight**: rounded-24px pill badge (green dot + 13px green
   label on 8% green fill) and the `.insight` card (10px uppercase sage
   label + serif 17px/1.9 finding text) for key takeaways.

### Layout enumeration (use 5+ per deck, never one layout everywhere)

| Layout | Role |
|---|---|
| `cover` | left serif display title + badge, right oversized dashed-ring SVG art |
| `contents` | serif rows + green index numbers separated by sage hairlines |
| `philosophy` | one 60–70px serif claim + 3 soft-cards |
| `big-number` | 240–280px weight-300 numeral + green unit + hairline stat row |
| `radar` (the master) | 480px left panel (kicker/serif title/badge/insight/credit) + right radar plate + 3 metric cards — preserve this two-panel grid from upstream |
| `diagram` | SVG flow/architecture plate: dashed clusters, sage dashed flow paths, gold middle node, green terminal node |
| `metrics-grid` | 2×3 soft-card grid with delta pills |
| `quote` | centered serif 52px quote, gold SVG quote marks, key phrase in green |
| `roadmap` | hairline timeline, dots graded `--gray-warm` → `--sage` → `--green-2` → `--green` (last with halo) |
| `closing` | centered serif CTA over faint concentric rings + badge |

### Typography & scale (read from 10 meters)

- Serif display: cover 90–104px, section titles 44–66px, weight 400–500,
  letter-spacing ~1px, line-height 1.35–1.65. Hero numerals 240–280px
  weight 300 with negative tracking.
- Labels: 10–13px, weight 500, `letter-spacing: 1.5–3px`, uppercase — the
  connective tissue of the style. Body/captions 13–18px weight 300,
  line-height 1.7–1.9.
- Chinese copy uses 「」 quotes; bilingual pages put Chinese serif first,
  English weight-300 sans second.

### Rhythm & discipline

- Default 10 pages (8–11 allowed). Alternate density: text page → chart
  plate → whitespace/quote page. At least one radar/diagram art plate per
  deck — it is the reason this style exists.
- Color budget: green is the protagonist; gold appears only as the 2nd data
  series, quote marks, or one special delta pill; warm gray is the 3rd
  series and all chrome. Never promote gold or gray to a heading color.
- No emoji, no icon fonts, no shadows heavier than the locked
  `drop-shadow(0 4px 20px rgba(0,0,0,0.04))`, no border heavier than 1px
  except SVG data strokes, no Chart.js/mermaid — all charts are hand-laid
  inline SVG.
- Real content only — the user's actual numbers; missing data gets an honest
  `<!-- 待用户提供 -->` placeholder, never invented statistics. (The seed
  deck's 「青屿/QINGYU」 data is fictional demo content and must be fully
  replaced.)

## Workflow

1. **Clarify once**: topic, audience, page count, and which comparison or
   dataset becomes the radar/diagram art plate — this style lives and dies
   by its chart plate; pick it before writing any page.
2. **Copy `example.html`**, retitle, then replace each section's content
   following the layout enumeration. Keep masthead/footer chrome, washes,
   token names, and the script intact. Re-theme by changing token values
   only — and only if the user's brand genuinely demands it; the
   sage/gold/warm-gray triad on rice paper is the identity.
3. **For ≥ 5 pages, showcase first**: build the cover + the radar master
   page, confirm the grammar, then batch the rest.
4. **Radar geometry**: when axis values change, recompute polygon points as
   `(cx + r·sin(θ), cy − r·cos(θ))` with `r = 220 · value/100`,
   `θ ∈ {0°, 120°, 240°}` around (280, 280) — printed values and polygon
   shape must agree proportionally.
5. **Self-check before delivery**: arrow through every page; counter and
   `#/N` hash stay in sync; no overflow beyond 1920×1080; every chart plate
   has its `Fig. NN` caption; only the three series colors appear in any
   chart; no leftover demo (「青屿」/"QINGYU") text; grep for `TODO`.
