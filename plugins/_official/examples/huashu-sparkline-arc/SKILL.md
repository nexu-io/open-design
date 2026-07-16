---
name: huashu-sparkline-arc
en_name: "Write a Revenue-Driver Story like a Board-Level Finance Partner"
zh_name: "像董事会级财务伙伴一样写收入驱动分析"
description: |
  Open Design's revenue-driver narrative: what actually moves ARR, the leverage points, and the forecast. Built as a decision-grade data & finance deck for board, finance leadership.
en_description: |
  Open Design's revenue-driver narrative: what actually moves ARR, the leverage points, and the forecast. Built as a decision-grade data & finance deck for board, finance leadership.
zh_description: |
  像董事会级财务伙伴一样写收入驱动分析——一份可商业交付的数据财务 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "data-finance"
  - "product-analytics-deck"
  - "finance"
  - "kpi"
  - "metrics"
  - "decision-deck"
  - "commercial-slide-agent"
  - "huashu-sparkline-arc"
triggers:
  - "product-analytics-deck"
  - "data-finance"
  - "Write a Revenue-Driver Story like a Board-Level Finance Partner"
  - "像董事会级财务伙伴一样写收入驱动分析"
  - "kpi"
  - "finance"
  - "metrics"
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
    zh-CN: "用「叙事波形」模板把我的变革故事做成 Duarte 式 HTML 幻灯片：1920×1080 固定画布、每页一条横贯全屏的 SVG 贝塞尔波形线、品牌橙 #FF6B2C 只标转折点、灰化对照波形、stroke-dashoffset 逐段 reveal、Inter + Geist Mono 双字体。从 example.html 出发只换内容，不要重写设计。"
  category: "data-finance"
  scenario: "finance"
  example_prompt: "Create \"Write a Revenue-Driver Story like a Board-Level Finance Partner\" as a decision-grade Data, KPI & finance deck in this template's own visual system. Subject: Open Design's revenue-driver narrative: what actually moves ARR, the leverage points, and the forecast. Audience: board, finance leadership. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: does every chart have a decision above it."
---

# Narrative Sparkline · 叙事波形

Produce a **single-file, Duarte-style narrative deck**. You are a story
cartographer working in HTML: every page is built on one oscillating waveform
that travels between "what is" and "what could be", and orange appears only
where the story turns. The visual system, canvas contract, and navigation
runtime are locked by `example.html`. **Start from `example.html`, replace
content only — do not rewrite the design or the script. Do not introduce any
color or font outside this spec.**

Generated from the `Sparkline叙事波形 / Narrative Sparkline (Duarte式)` spec
(中性派, 还原91%) in `references/design-styles.md` of
[huashu-design](https://github.com/alchaincyf/huashu-design) by 花叔
(alchaincyf), MIT licensed. Lineage: Nancy Duarte《Resonate》sparkline
structure, Al Gore *An Inconvenient Truth*, Duarte Inc. data storytelling.

## Hard spec (locked — violating any line is a regression)

### Canvas & runtime

- One `<div id="stage">` fixed at **1920 × 1080 px**, centered with
  `position: fixed; top: 50%; left: 50%`; a `fit()` function applies
  `translate(-50%, -50%) scale(min(innerWidth/1920, innerHeight/1080))` on
  load and `resize`. All inner layout in px — the scaler owns responsiveness.
- Each page is one `<section class="slide">` inside `#stage` with a
  `data-screen-label="01 封面"`-style label; exactly one slide carries
  `.active`; dark pages add `.dark`.
- Navigation (keep the script verbatim): `←`/`↑`/`PageUp` previous,
  `→`/`↓`/`Space`/`PageDown` next, `Home`/`End` first/last; `#/N` hash
  routing (1-indexed) read on load + `hashchange`, written via
  `history.replaceState`; click left third = back, rest = forward; fixed
  counter pill bottom-right, key-hint bottom-left. No external JS, no build
  step — the file must open inside a sandboxed iframe via `file://`.

### Design tokens (`:root` — keep the names, re-theme values only)

| Token | Value | Role |
|---|---|---|
| `--paper` | `#FFFFFF` | light page background |
| `--night` | `#0E0E0C` | dark pages (solo-line, closing) |
| `--ink` | `#1A1814` | primary text on light |
| `--night-ink` | `#F5F3EE` | primary text on dark |
| `--accent` | `#FF6B2C` | **the brand orange — the only accent** |
| `--accent-dim` | `rgba(255,107,44,.14)` | annotation halos / soft fills |
| `--ghost` | `#C9C7C2` | greyed comparison waveform |
| `--grid` | `#ECEAE6` | hairline rules |
| `--muted` | `#9A958C` | secondary labels |
| `--muted-2` | `#5F5A52` | body copy on light |
| `--night-line` | `#26241F` | hairlines on dark pages |
| `--night-mut` | `#8A857C` | secondary text on dark |
| `--sans` | `'Inter', 'PingFang SC', …, sans-serif` | headlines + body |
| `--mono` | `'Geist Mono', 'SFMono-Regular', 'Menlo', monospace` | labels, annotations, numerals |

**Fonts**: one Google Fonts `@import` (Inter 400–900 + Geist Mono 400–600)
and nothing else. No CDN scripts, no chart libraries, no images — every chart
is a hand-written inline SVG path. A second accent color is the cardinal sin
of this style; grey is the only other voice.

### Signature devices (the visual DNA — every deck must show them)

1. **The waveform spine**: every page carries at least one full-bleed
   `.spark` SVG with a smooth cubic-bézier oscillating path. Line layer uses
   `preserveAspectRatio="none"` so the path stretches; annotation dots/text
   live in a **second, non-stretched SVG layer** with the same viewBox so
   circles stay round and type stays true. Line weights: `.arc` 5px orange
   hero line, `.arc-thin` 3.5px, `.ghost-line` 3px grey, `.ghost-dash`
   `stroke-dasharray: 2 10` grey baseline/industry reference.
2. **Orange turning-point annotations**: `.pt` group = soft halo circle
   (`--accent-dim`), solid orange dot (r≈6–7), optional 2px orange ring for
   THE inflection point, plus Geist Mono uppercase `.lab` (12px, 2px
   tracking) and `.val` (20px, 600) value text. Grey `.pt-ghost` dots mark
   pain points on comparison lines. Orange marks **turning points only** —
   if every dot is orange, nothing turns.
3. **Progressive reveal**: paths carry `pathLength="1"` + class `draw`
   (`stroke-dasharray: 1; stroke-dashoffset: 1`); `.slide.active .draw`
   animates `stroke-dashoffset` to 0 (`spark-draw`, ~1.8s, ease-out-ish
   cubic-bezier). Segment stagger via `d1/d2/d3`, dot fade-ins via `p1…p5`
   (animation-delay ladder). Because `.active` toggles display, the reveal
   replays every time a slide is entered — keep it that way.
4. **Mono hairline chrome**: 56px `.chrome-top` / `.chrome-bottom` strips on
   every page — Geist Mono 11px uppercase, 2px tracking, `--grid` hairline
   border (`--night-line` on dark), org name left with an orange `/`
   separator, orange uppercase tag right, orange `P.NN` page marker bottom
   right. No solid bars, no logos — type and one hairline only.
5. **Greyed contrast**: every claim gets a comparison — dashed industry
   baseline, the old process line above the new one, or a flat ghost line
   under the rising arc. The grey line is the "what is"; the orange line is
   the "what could be".
6. **Mono numerals**: giant numbers (`.giant`, 160–220px Geist Mono 600,
   negative tracking, `font-variant-numeric: tabular-nums`) with one orange
   glyph (%, ×, unit); stat strips (`.stat-strip`) with a `--grid` top
   hairline, 44px mono numbers and 11px uppercase captions.

### Layout enumeration (use 6+ per deck, never one layout everywhere)

| Layout | Role |
|---|---|
| `cover` | giant statement headline (orange full stop) + waveform below with what-is / turn / new-bliss dots |
| `contents` | chapters hung directly on the waveform as numbered annotation points |
| `what-is` | left action-title column + low, flat grey waveform with dashed industry ghost + stat strip |
| `turning-point` | giant mono numeral + V-shaped inflection waveform, THE ringed orange dot, dated annotation |
| `before-after` | stacked contrast: grey jagged line top half, orange rising line bottom half, hairline divider |
| `solo-line` | dark page, one orange line crossing the void, one annotation, one big number |
| `evidence` | rising waveform with 4 labelled value dots + summary strip of mini inline-SVG sparklines |
| `roadmap` | three waveform segments revealed in sequence (`d1/d2/d3`) + three phase columns below |
| `quote` | orange SVG quote marks + 56px/800 quote with orange key phrase + ghost waveline footer |
| `closing` | dark page, 6px orange curve climbing out of the top-right edge + giant CTA |

### Typography & narrative discipline

- Headlines: Inter 800–900, 54–108px, tracking −1.5 to −4px; the closing
  glyph (。 or .) of a hero headline is orange — never the whole headline.
- Body: 19px / 1.8 `--muted-2`, emphasized spans `--ink` 700, max-width
  ~620px. Labels/annotations/numerals: always Geist Mono, uppercase, 2–4px
  tracking. Chinese copy uses 「」 quotes and full-width punctuation.
- Default 10 pages (8–11 allowed). White pages dominate; **at most 2–3 dark
  pages** (solo-line + closing). Orange budget: turning points, annotation
  dots, chrome tags and single glyphs — roughly ≤ 5 orange touches per page.
- The deck must read as a Duarte sparkline: establish "what is" low, mark
  one explicit dated turning point, oscillate through evidence, end with the
  line climbing out of frame ("new bliss"). One story, one line.
- No emoji, no gradients, no shadows, no images, no chart libraries. Real
  content only — the user's actual numbers and dates; missing data gets an
  honest `<!-- 待用户提供 -->` placeholder, never invented statistics. (The
  seed deck's 「澈流 / CHELIU」 data is fictional demo content and must be
  fully replaced.)

## Workflow

1. **Clarify once**: topic, audience, page count — and the story spine:
   what is the "what is", what is THE dated turning point, which 3–4 numbers
   prove the climb. This style dies without a real inflection moment.
2. **Copy `example.html`**, retitle, then replace each section's content
   following the layout enumeration. Keep chrome strips, spark/reveal CSS,
   token names, and the script intact. Reshape the bézier paths to match the
   user's actual data direction (down-then-up, stepped, etc.) but keep the
   two-layer SVG pattern and `pathLength="1"` reveal mechanics.
3. **For ≥ 5 pages, showcase first**: build the cover + the turning-point
   page, confirm the grammar, then batch the rest.
4. **Self-check before delivery**: arrow through every page; counter and
   `#/N` hash stay in sync; reveal animation replays on each entry; no
   overflow beyond 1920×1080; annotation dots sit visually on their lines at
   16:9; orange appears only at turning points; every page has the chrome
   strips and at least one waveform; no leftover demo (「澈流」/"CHELIU")
   text; grep for `TODO`.
