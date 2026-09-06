---
name: "qiaomu-dashboard"
en_name: "E-commerce Ops Dashboard"
zh_name: "电商运营仪表盘"
description: "Dark cold-grey analytics dashboard with sidebar, KPI cards, pure-SVG charts, and a dense orders table."
zh_description: "深色冷灰分析仪表盘：侧栏、KPI 卡、纯 SVG 图表、密集订单表。"
triggers:
  - "dark dashboard"
  - "ecommerce dashboard"
  - "orders table"
  - "sales dashboard"
  - "admin dashboard"
  - "电商后台"
  - "订单看板"
  - "销售仪表盘"
  - "深色仪表盘"
  - "运营后台"
od:
  mode: "prototype"
  task_type: "prototype"
  surface: "web"
  platform: "desktop"
  scenario: "operations"
  category: "dashboard"
  preview:
    type: "html"
    entry: "example.html"
  design_system:
    requires: false
  example_prompt: "Make an operations dashboard for an e-commerce team: KPI cards, weekly sales bar chart, category donut, and a recent orders table."
---
# E-commerce Ops Dashboard

A professional dark operations dashboard: fixed 220px sidebar, topbar with search and date range, KPI stat cards with delta badges, hand-computed pure-SVG bar and donut charts, channel breakdown, and a dense recent-orders table with status pills. Cockpit density, zero decoration.

## When to use

- Analytics / operations / admin dashboards ("admin panel")
- Any data-dense internal tool where numbers are the hero
- Briefs asking for KPI overview + charts + tables in one screen

## Style rules

- Palette: cold dark greys `#0d0f12` → `#13161b` → `#1a1e25` → `#222730` for stacked elevation, hairline borders `rgba(255,255,255,.07)`. One accent (here teal `#2dd4bf`), never purple-blue. Functional colors fixed by semantics: green `#34d399` success, orange `#fb923c` warning, red `#f87171` danger, blue `#60a5fa` info.
- Text ladder: `rgba(255,255,255,.88)` / `.55` / `.28`. Serif fonts are banned in data UI; use a characterful sans (Syne) for headings + mono (JetBrains Mono) for every number.
- All numerals in mono or `font-variant-numeric: tabular-nums` so columns align.
- Charts are inline SVG with real math (bar heights computed from data), grid lines at low alpha, today's bar highlighted in accent; donut via `stroke-dasharray` segments. No chart library needed at prototype fidelity.
- KPI cards: label (11px uppercase, letter-spaced, text-3) → value (24-28px mono) → delta badge (▲/▼ + functional color at 10-12% alpha background).
- Spacing on a 4px base; group gap > in-group gap; sidebar nav items get a visible active state (accent bar + tinted background).
- Status pills: tinted background (`rgba(color,.1)`) + colored text, radius 999px, 11px.
- Hover: row highlight and card border lift `rgba(255,255,255,.12)`, transitions ≤ 200ms with `cubic-bezier(0.23, 1, 0.32, 1)`, `transform`/`opacity`/`border-color` only.
- Data must look organic: ¥1,284,392 not 1000000; 3.82% not 5%.

## Anti-patterns

- Purple gradients, glow effects, or glassmorphism in a data tool
- Serif or display-only fonts for metrics; proportional digits in tables
- Round fake numbers and identical bar heights
- Card-wrapping every single element; prefer dividers inside dense tables
- Animating chart bars on every interaction; charts animate once on load at most

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

Adapted from https://github.com/joeseesun/qiaomu-design (MIT)
