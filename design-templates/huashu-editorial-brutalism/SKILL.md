---
name: "huashu-editorial-brutalism"
en_name: "Editorial Brutalism"
zh_name: "编辑野兽派页面"
description: "Editorial-brutalism web page style: giant grotesk headlines compressing dense small text, 1px rule-line grids, hyperlink blue, and one signal accent, in the spirit of 2010s Businessweek."
zh_description: "编辑野兽派网页：巨型 grotesk 标题压缩密集小字、1px 规线网格、超链接蓝、一个信号色，2010 年代 Businessweek 风。"
triggers:
  - "editorial brutalism"
  - "businessweek style"
  - "newsletter front page"
  - "magazine web"
  - "bold editorial"
  - "编辑野兽派"
  - "杂志风网页"
  - "newsletter 首页"
  - "商业周刊风格"
od:
  mode: "prototype"
  task_type: "prototype"
  surface: "web"
  platform: "desktop"
  scenario: "marketing"
  category: "editorial-page"
  preview:
    type: "html"
    entry: "example.html"
  design_system:
    requires: false
  example_prompt: "Design the issue front page for an AI-industry weekly newsletter in a bold Businessweek-style editorial layout."
---
# Editorial Brutalism

A newsroom-grade page style: oversized uppercase grotesk headlines (90-120px) pressed
against dense 13-14px body text, modular grids cut by 1px black rule lines, deliberate
information density instead of whitespace. Feels like a printed business weekly
translated 1:1 to the browser.

## When to use

- Media, newsletter, or publication landing pages and issue fronts
- AI/tech product announcements that want authority instead of gloss
- Research-report or trend-briefing cover pages
- Opinionated long-form or manifesto-style marketing pages
- Data-heavy "state of X" microsites

## Style rules

- Palette: pure black `#000` on pure white `#FFF`. Links are classic hyperlink blue
  `#0000EE`, underlined. One signal accent only; orange-red `#FF433D` (alerts, quotes,
  kickers) plus terminal green `#00A33E` reserved strictly for positive data deltas.
- Type: Helvetica-lineage grotesk (Inter with Helvetica/Arial fallback), weight 900 for
  display. Headlines uppercase, `letter-spacing: -0.04em`, `line-height: 0.9-1.05`.
  Extreme size contrast: display ≥6x body size. Numbers and tickers in a monospace
  (JetBrains Mono) with `font-variant-numeric: tabular-nums`.
- Layout: CSS Grid modules separated by `1px solid #000` borders (rule lines), a 2px
  border for masthead and footer. Asymmetric splits (roughly 7:3 lead, 3-up story row,
  4-up stat band). Zero border-radius, zero box-shadow.
- Density: fill the page; ticker bar, numbered sidebar items, stat band with deltas,
  bylines in small caps. Whitespace is earned by rules, not by padding.
- Interaction: link hover inverts to solid blue with white text; nav items invert to
  black. No transitions longer than needed; snap, don't fade.
- Voice: headlines state conclusions ("Compute is the new crude"), never label sections
  generically.

## Anti-patterns

- Rounded corners, drop shadows, or gradients anywhere; this style is flat ink on paper.
- More than one accent color doing the same job; the signal red must stay scarce.
- Centered, airy hero sections with big padding; density is the identity.
- Decorative icons or emoji; the only ornaments allowed are rules, arrows, and dots.
- Sentence-case lowercase headlines; display type here is uppercase and tight.

## Template fidelity (hard constraint)

The bundled `example.html` in this folder is the ground truth for this
template, not loose inspiration. Before generating, read `example.html`
and reproduce its visual system:

1. Reuse its layout skeleton, section order, spacing rhythm, typography
   stack, color tokens, and signature components as-is.
2. Swap only CONTENT for the user's brief: copy, data, imagery subjects,
   brand name. Structure, hierarchy, and visual language stay.
3. Keep the same fonts (or the closest available), the same accent-color
   discipline, and the same interaction details (hover states, motion).
4. Output copy follows the language of the user's brief, but the result
   must remain recognizably this template when placed side-by-side with
   `example.html`.
5. If the brief conflicts with the template, make the smallest deviation
   that satisfies the brief. Never redesign from scratch.

Adapted from https://github.com/alchaincyf/huashu-design (MIT)
