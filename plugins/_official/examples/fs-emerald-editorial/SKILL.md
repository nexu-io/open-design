---
name: fs-emerald-editorial
en_name: "Write a Brand-Launch Narrative like a Growth Strategy Lead"
zh_name: "像增长策略负责人一样写品牌发布叙事"
description: |
  Open Design's 'design on your desk' brand-launch narrative: the market moment, the story, and the proof that converts. Built as a decision-grade marketing & GTM deck for marketing team, press.
en_description: |
  Open Design's 'design on your desk' brand-launch narrative: the market moment, the story, and the proof that converts. Built as a decision-grade marketing & GTM deck for marketing team, press.
zh_description: |
  像增长策略负责人一样写品牌发布叙事——一份可商业交付的市场增长 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "marketing-gtm"
  - "annual-marketing-plan"
  - "marketing"
  - "launch"
  - "campaign"
  - "pipeline"
  - "decision-deck"
  - "commercial-slide-agent"
  - "fs-emerald-editorial"
triggers:
  - "annual-marketing-plan"
  - "marketing-gtm"
  - "Write a Brand-Launch Narrative like a Growth Strategy Lead"
  - "像增长策略负责人一样写品牌发布叙事"
  - "launch"
  - "campaign"
  - "pipeline"
  - "html deck"
  - "html slides"
od:
  mode: deck
  surface: web
  upstream: "https://github.com/zarazhangrui/beautiful-html-templates"
  preview:
    type: html
    entry: example.html
  example_prompt_i18n:
    zh-CN: "用祖母绿封面故事（Emerald Editorial）把我的季度回顾做成杂志封面级商务刊幻灯片：祖母绿画布、海军蓝油墨、Bodoni Moda 900 大标题、双线刊头装饰，固定 1920x1080 舞台。从 example.html 出发只替换内容，保留设计系统。"
  category: "marketing-gtm"
  scenario: "marketing"
  example_prompt: "Create \"Write a Brand-Launch Narrative like a Growth Strategy Lead\" as a decision-grade Marketing & GTM deck in this template's own visual system. Subject: Open Design's 'design on your desk' brand-launch narrative: the market moment, the story, and the proof that converts. Audience: marketing team, press. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: can the plan connect creative choices to measurable growth."
---

# Emerald Editorial（祖母绿封面故事）

A magazine-cover business deck system rooted in fashion-magazine mastheads and 19th-century theatrical playbills: a saturated emerald field, deep navy ink, warm paper tiles, bilateral double-rule ornaments, and Bodoni Moda at weight 900. Curated from the MIT-licensed [zarazhangrui/beautiful-html-templates](https://github.com/zarazhangrui/beautiful-html-templates) `emerald-editorial` template.

**Start from `example.html` in this plugin folder. It is the locked seed: keep its `:root` tokens, all eight slide-master CSS blocks, the `<deck-stage>` element, and the entire inlined deck-stage runtime script verbatim. Replace only the text content, numbers, and labels. Do not rewrite the design, and do not introduce any color or font outside this spec.**

## Design tokens (locked — list verbatim in `:root`)

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#3CD896` | Emerald — the dominant slide canvas |
| `--bg-2` | `#2DC684` | Darker emerald, reserved tonal variant (rarely used) |
| `--bg-3` | `#25B377` | Darkest emerald, reserved |
| `--ink` | `#0F1A5C` | Navy — text, rules, borders, inverse-panel fill |
| `--ink-2` | `#1B2774` | Lighter navy, reserved |
| `--ink-3` | `#3A4593` | Lightest navy, reserved |
| `--paper` | `#F1E9D6` | Oat paper — alternate tile fill, alt chart series |
| `--rule` | `rgba(15, 26, 92, 0.22)` | Chart grid lines only (2px, on navy ground use `rgba(60,216,150,0.22)`) |
| `--rule-strong` | `rgba(15, 26, 92, 0.85)` | Near-solid rule alternative |
| `--display-font` | `'Bodoni Moda', serif` | The single display face |

Page background outside the stage is `#0a0a0a` (the runtime letterbox). **The emerald / navy / paper triad is the entire palette — never introduce a fourth color family.** Color pairings are fixed: ink-on-emerald, emerald-on-navy (the only display color flip), ink-on-paper. Delta/tag pills invert: emerald pill on a navy tile, navy pill on a paper tile.

## Typography (locked — exactly two faces)

Google Fonts: `Bodoni Moda` (700/800/900) + `Manrope` (400–800). No third typeface, ever — not Playfair, not Inter, not system fonts.

- **Bodoni Moda 900** — every primary display moment, with negative tracking (−0.01em to −0.03em) and tight leading (0.9–0.95). Scale tiers: 460px jumbo numeral (navy panels only) · 200px agenda title · 184px cover lines · 180px closing lines · 128–130px statements/section headlines · 104–120px chart/process headlines · 144px KPI figures (60px unit suffix) · 92px side-panel stats.
- **Bodoni Moda 800** — ornament words (68–84px), tile/card titles (40–64px). **Bodoni Moda 700** — small prepositions only.
- **Manrope 500** — body paragraphs, 24–28px, line-height 1.4–1.5. Never larger than 28px.
- **Manrope 700–800, ALWAYS UPPERCASE** with 0.05–0.18em letter-spacing — every masthead, footline, eyebrow, label, tag, caption, delta, credit (24–30px). Manrope in sentence case is forbidden chrome.

Bodoni never appears at body/label scale; Manrope never appears at display scale. No italics, no underline — emphasis is size, inversion, and ornament.

## Signature devices (non-optional when the element type appears)

- **Double-rule ornament** — the system's identity: a centered Bodoni 800 word bracketed on both sides by two stacked 4px ink rules (3px gap; 5px rules on the cover). The "The X *of* Y" playbill framing on cover, statement, and closing slides. Always bilateral. Variants via `:root[data-ornament="single"|"none"]` exist but the double form is the default.
- **Masthead / footline** — absolutely positioned Manrope-uppercase flex rows (two strings on opposite sides) at `top: 56px` / `bottom: 56px`, inset 80px. Mandatory on cover and closing; content slides carry a masthead with section + count strings.
- **4px solid `--ink` rules** — every section separator, agenda-row border, tile top rule, grid divider. 5px only for cover/closing ornaments; 2px only for chart grid lines. Never 1px, never dashed, never any other color.
- **Inverse tile** — solid navy with emerald text: chart cards, KPI tiles, process steps, the section-opener panel. Rotate in **paper tiles** (paper fill, ink text) to break rows: process flow alternates ink → paper → ink → paper.
- **Mark / tag / delta pills** — strict-rectangle uppercase Manrope chips (24px, 0.08–0.12em).
- **Flat printed ink only** — zero `border-radius`, zero `box-shadow`, zero gradients, zero blur, zero glow. Depth = color-block inversion + 4px rules. Nothing else.

## The eight slide masters (mixed scheme — keep this rhythm)

1. **Cover** (`.s1`) — centered emerald page: "The" (76px) → giant title line (184px) → double-rule ornament with preposition → second title line → letter-spaced credit; top row + masthead strings.
2. **Agenda** (`.s2`) — eyebrow + 200px "The Programme" title + ruled list rows (`130px | 1fr | 320px` grid: Bodoni ordinal · Bodoni name · uppercase kind/duration), 4px rules above each row and below the last.
3. **Section opener** (`.s3`) — full-bleed 50/50 split: left navy panel with a 460px Bodoni numeral and corner label pairs; right emerald column with kicker, 128px headline, 28px lede, and mark pills above a 4px top rule.
4. **Statement + three** (`.s4`) — centered 130px statement broken by an ornament row, over a 3-column grid of supporting cells (Bodoni ordinal + 44px title + 26px body) under a 4px rule.
5. **Data study** (`.s5`) — headline + sub over a `1.4fr | 1fr` body: navy chart card with a pure-CSS grouped bar chart (emerald + paper bars, height percentages, Bodoni y-axis, Manrope x-axis, 2px grid lines at 22% opacity) and legend; takeaway side panel with tag pill, 48px Bodoni takeaway, note, and two 92px stats.
6. **Process flow** (`.s6`) — headline pair over four alternating navy/paper step tiles: 80px ordinal, 40px title above a 4px `currentColor` rule, 24px body, owner/duration meta row.
7. **KPI grid** (`.s7`) — headline pair over four alternating tiles: uppercase label, 144px Bodoni figure (+60px unit), delta pill, 24px description.
8. **Closing** (`.s8`) — cover echo: kicker, 180px line + ornament + 180px line, then a ruled 3-column footer (next review / owner / distribution) and footline strings.

Longer decks repeat masters 03–07 per section; **never invent a new layout master.** Padding scale: content slides `110px 110px 70px`; cover `56px 110px`; closing `80px 110px`. Density: one display headline + 3–4 supporting elements per slide; split into more slides rather than shrinking type or cramming six small elements.

## Stage & runtime (locked — the deck-stage scaling system)

- Every slide is one `<section class="slide">` authored at exactly **1920×1080px**, a direct child of `<deck-stage width="1920" height="1080" no-rail>`.
- The inlined `deck-stage` web component (MIT, © 2026 Zara Zhang) scales the fixed canvas **uniformly** to the viewport: `factor = min(innerWidth/1920, innerHeight/1080)`, applied as a single `transform: scale()` centered with letterbox/pillarbox on the `#0a0a0a` ground, re-computed on `resize`. **Never reflow content per device; no responsive breakpoints inside slides; all measurements are fixed px at the 1920×1080 design size.**
- The runtime also provides: keyboard navigation (←/→, PgUp/PgDn, Space, Home/End, number keys, R to reset), click/tap zones, a fading slide-count overlay, `#<n>` hash deep-linking with the hash kept in sync on navigation, slides hidden via `visibility/opacity` (never unmounted), per-slide `data-screen-label`, a `slidechange` event, and `@media print` one-page-per-slide PDF export. Keep the entire script verbatim; keep `<style>deck-stage:not(:defined){visibility:hidden}</style>`.

## Output contract

- Single self-contained `.html`: all CSS and the full runtime JS inline; zero build step, zero external JS, no CDN scripts, no remote images. The Google Fonts `<link>` for Bodoni Moda + Manrope is the only allowed external reference.
- Charts are pure CSS/HTML (the `.s5` bar-chart pattern); diagrams use the tile/rule vocabulary; icons, if needed, are inline SVG in ink/emerald.
- No scrolling, no overflow, no overlapping text at 1920×1080.
- CJK: pair Bodoni Moda with `Noto Serif SC` 900 for display and Manrope with `Noto Sans SC` for chrome (append to the same Google Fonts request); relax display tracking to 0 and leading to ~1.05 for Chinese headlines; keep the palette and rules identical.

## Attribution

Design system, tokens, slide masters, and the deck-stage runtime come from the upstream MIT-licensed [zarazhangrui/beautiful-html-templates](https://github.com/zarazhangrui/beautiful-html-templates) `emerald-editorial` template (© 2026 Zara Zhang). The LICENSE file ships in this plugin folder; keep it in place when redistributing.
