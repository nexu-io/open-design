---
name: huashu-pentagram-grid
en_name: "Build a Positioning & Messaging System like a Brand Strategist"
zh_name: "像品牌策略师一样搭建定位与信息体系"
description: |
  Open Design's positioning & messaging system: the one-line promise, the pillars, and the proof — the source of truth for all copy. Built as a decision-grade marketing & GTM deck for brand & marketing team.
en_description: |
  Open Design's positioning & messaging system: the one-line promise, the pillars, and the proof — the source of truth for all copy. Built as a decision-grade marketing & GTM deck for brand & marketing team.
zh_description: |
  像品牌策略师一样搭建定位与信息体系——一份可商业交付的市场增长 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "marketing-gtm"
  - "annual-marketing-plan"
  - "marketing"
  - "launch"
  - "campaign"
  - "pipeline"
  - "decision-deck"
  - "commercial-slide-agent"
  - "huashu-pentagram-grid"
triggers:
  - "annual-marketing-plan"
  - "marketing-gtm"
  - "Build a Positioning & Messaging System like a Brand Strategist"
  - "像品牌策略师一样搭建定位与信息体系"
  - "launch"
  - "campaign"
  - "pipeline"
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
    zh-CN: "用「信息建筑·红」模板把我的数据故事做成瑞士网格 HTML 幻灯片：1920×1080 固定画布、上下 64px 黑色信息条、Helvetica Neue 强层级、唯一红色 #E63946、巨型 900 字重数字锚点、红/黑/灰三色对比条形图。从 example.html 出发只换内容，不要重写设计。"
  category: "marketing-gtm"
  scenario: "marketing"
  example_prompt: "Create \"Build a Positioning & Messaging System like a Brand Strategist\" as a decision-grade Marketing & GTM deck in this template's own visual system. Subject: Open Design's positioning & messaging system: the one-line promise, the pillars, and the proof — the source of truth for all copy. Audience: brand & marketing team. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: can the plan connect creative choices to measurable growth."
---

# Pentagram Info-Architecture · 信息建筑·红

Produce a **single-file, Swiss-grid data deck**. You are an information
architect working in HTML: every page is a measured grid, every number has a
coordinate, and red appears exactly where the eye must land. The visual
system, canvas contract, and navigation runtime are locked by `example.html`.
**Start from `example.html`, replace content only — do not rewrite the design
or the script. Do not introduce any color or font outside this spec.**

Adapted from the `ppt-pentagram` showcase of
[huashu-design](https://github.com/alchaincyf/huashu-design) by 花叔
(alchaincyf), MIT licensed. The upstream file is a single data page; this
plugin extends it into a full multi-section deck while preserving its DNA.

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
| `--night` | `#111111` | dark pages + chrome bars |
| `--ink` | `#111111` | primary text on light |
| `--night-ink` | `#FFFFFF` | primary text on dark |
| `--accent` | `#E63946` | **the only red — the only accent** |
| `--grid` | `#E8E8E8` | hairline rules / column rules |
| `--track` | `#F5F5F5` | bar-chart track |
| `--bar-base` | `#E0E0E0` | losing / baseline bar |
| `--muted` | `#999999` | secondary labels |
| `--muted-2` | `#666666` | body copy on light |
| `--faint` | `#BBBBBB` | tertiary captions |
| `--night-line` | `#333333` | hairlines on dark pages |
| `--night-mut` | `#888888` | secondary text on dark |
| `--sans` | `'Helvetica Neue', 'Helvetica', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', Arial, sans-serif` | the only family |

**Zero external dependencies**: no Google Fonts, no `@import`, no CDN. One
font stack, one accent. A second accent color is the cardinal sin of this
style.

### Signature devices (the visual DNA — every deck must show them)

1. **64px black chrome bars** top and bottom of every light page: top bar =
   uppercase 12px/700/3px-tracking label left (with a red `/` separator) +
   red uppercase label right; bottom bar = 900-weight logotype + 1px `#444`
   vertical divider + grey footnote left, red uppercase label right. Dark
   pages swap solid bars for 1px `--night-line` hairline strips with the same
   text.
2. **Grid hairlines**: absolutely-positioned 1px verticals
   (`top:64px; bottom:64px`) and horizontals (`left/right:80px`) at
   `opacity: 0.05` black (`0.08` white on dark). 80px outer margins are the
   master gutter; columns land on them.
3. **Giant numeral anchor**: one 180–260px, weight-900,
   negative-tracked (≈ −1px per 20px of size) number per hero page; its
   decimal point, slash, or unit glyph is red (`<span class="decimal">` /
   `.red`). Hero numerals on dark divider pages may be fully red.
4. **Red/dark/grey bar charts**: `.bar-row` = right-aligned 90px label +
   `--track` track + fill (`winner` red / `dark` black / `base` grey) with
   the value printed inside, right-aligned, white (grey on `base`). The
   subject of the page is **always** the red bar. Optional `.delta` red
   uppercase annotation underneath.
5. **Summary strip**: `border-top: 1px solid var(--grid)` row of
   `.summary-item`s — 32px/900 number with one red glyph + 11px uppercase
   spaced caption.
6. **Outlined red badge** (`.open-badge`): 2px red border, red uppercase
   11px text, optional inline-SVG dot glyph. Square corners — this style has
   **zero border-radius** anywhere except the runtime counter pill.

### Layout enumeration (use 5+ per deck, never one layout everywhere)

| Layout | Role |
|---|---|
| `cover` | giant statement headline (red full stop) + right-column hero numeral |
| `contents` | numbered red-kicker rows separated by `--grid` hairlines |
| `big-number` | one 260px numeral protagonist + side stat rail |
| `data-theater` | left hero column + 2–3 `.bench-col` bar-chart columns + summary strip (the upstream master) |
| `divider` | dark page, 260px red chapter number + oversized title |
| `two-column` | before/after comparison: grey bars left, red bars right |
| `timeline` | equal columns, 96px year numerals graded grey→black→red |
| `quote` | whitespace + red SVG quote marks + 54px/900 quote, key phrase red |
| `stats-grid` | 2×2 grid of 128px numerals with red glyph accents |
| `closing` | dark page, giant CTA with red punctuation + key-hint capsule |

### Typography & scale (read from 10 meters)

- Headlines 64–120px weight 900, tracking −2 to −5px. Hero numerals
  180–260px weight 900. Body 15–18px, `--muted-2`, line-height 1.7,
  emphasized spans in `--ink` 700.
- Labels: 11–13px, weight 700, `letter-spacing: 2–3px`,
  `text-transform: uppercase` — this is the connective tissue of the style.
- Chinese copy uses 「」 quotes and full-width punctuation; red is applied to
  single punctuation glyphs (。 ， /) inside headlines, never whole headings.

### Rhythm & discipline

- Default 10 pages (8–11 allowed). White pages dominate; **at most 2–3 dark
  pages** (divider + closing, optionally one dark hero) — this is a white
  style with black bookends, not a dark theme.
- Red budget: ≤ 4 red touches per page (bars count as one device). If
  everything is red, nothing is.
- No emoji, no icon fonts, no decorative illustrations, no gradients, no
  shadows, no rounded corners. Flat ink on paper. Icons, if truly needed,
  are minimal inline SVG strokes.
- Real content only — the user's actual numbers; missing data gets an honest
  `<!-- 待用户提供 -->` placeholder, never invented statistics. (The seed
  deck's "析衡" data is fictional demo content and must be fully replaced.)

## Workflow

1. **Clarify once**: topic, audience, page count, and which 2–4 numbers are
   the protagonists. This style lives and dies by its hero numerals — pick
   them before writing any page.
2. **Copy `example.html`**, retitle, then replace each section's content
   following the layout enumeration. Keep chrome bars, grid hairlines, token
   names, and the script intact. Re-theme by changing token values only —
   and only if the user's brand genuinely demands it; the red/black/white
   triad is the identity.
3. **For ≥ 5 pages, showcase first**: build the cover + one data-theater
   page, confirm the grammar, then batch the rest.
4. **Self-check before delivery**: arrow through every page; counter and
   `#/N` hash stay in sync; no overflow beyond 1920×1080; bar widths match
   their printed values proportionally; every page shows the chrome bars and
   at least one grid hairline; red count per page ≤ 4; no leftover demo
   ("析衡"/"XIHENG") text; grep for `TODO`.
