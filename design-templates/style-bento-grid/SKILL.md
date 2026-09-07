---
name: "style-bento-grid"
en_name: "Bento Grid Style"
zh_name: "Bento 网格风格"
description: "Build Apple-style bento box grid layouts with modular cards of varied sizes, soft shadows and clean hierarchy."
zh_description: "Apple 风 bento 网格布局：大小不一的模块卡片、柔和阴影、清晰层级。"
triggers:
  - "bento grid"
  - "bento layout"
  - "apple style"
  - "feature grid"
  - "modular cards"
  - "便当网格"
  - "Bento 布局"
  - "苹果风格"
  - "功能网格"
  - "模块卡片"
od:
  mode: "prototype"
  task_type: "prototype"
  surface: "web"
  platform: "desktop"
  scenario: "marketing"
  category: "style"
  preview:
    type: "html"
    entry: "example.html"
  design_system:
    requires: false
  example_prompt: "Make a product features overview page as a bento grid: Apple-style cards with mixed sizes, stats and a testimonial."
---
# Bento Box Grid Style

Modular, asymmetric card grid in the Apple keynote tradition: every message gets its own tile, tiles vary in size by importance, negative space does the organizing.

## When to use
- Product feature-overview / "everything it does" pages
- Dashboards and portfolio index pages
- Apple-style marketing sections inside a longer landing page
- SaaS capability showcases
- Any brief mentioning "bento", "feature grid", "modular tiles"

## Style rules
- Grid: `display: grid; grid-template-columns: repeat(4, 1fr); grid-auto-rows: 200px; gap: 16px`; responsive collapse 4 → 2 → 1 columns.
- Spans express hierarchy: one 2x2 hero tile, a few 2x1 / 1x2, rest 1x1. Never all-equal tiles.
- Cards: `background: #FFFFFF; border-radius: 24px` (16-24px, one value site-wide); padding 24-28px.
- Page base: neutral `#F5F5F7`; text `#1D1D1F` primary, `#6E6E73` secondary.
- ONE brand accent color (e.g. `#0071E3`) used for kickers, data marks and a single accent-filled CTA tile; optionally one dark `#1D1D1F` tile for contrast.
- Shadows: subtle only, `0 4px 6px rgba(0,0,0,0.05)`; deepen slightly on hover.
- Hover: `transform: scale(1.02)` with ~300ms spring easing (`cubic-bezier(.2,.8,.2,1)`); nothing bigger.
- Every tile is self-contained: kicker (12px uppercase accent) + short heading + one visual (stat number, sparkline SVG, mock UI, icon chips, quote). Content must fit; no scrolling inside tiles.
- Big stat numbers: 40-50px, weight 800, negative letter-spacing.

## Design tokens
`--grid-gap: 16px; --card-radius: 24px; --card-bg: #FFFFFF; --page-bg: #F5F5F7; --shadow: 0 4px 6px rgba(0,0,0,0.05); --hover-scale: 1.02`

## Anti-patterns
- Dense data tables or long-form text stuffed into tiles (bento is for glanceable messages).
- Uniform same-size cards in a plain symmetric grid; that is just a card list.
- Heavy borders, hard shadows, or more than one accent color competing across tiles.
- Real-time monitoring UIs that need scanning speed over aesthetics.
- Hover effects that reflow the grid (use scale, not size changes).

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

Adapted from https://github.com/nextlevelbuilder/ui-ux-pro-max-skill (MIT)
