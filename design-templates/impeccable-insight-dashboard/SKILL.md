---
name: "impeccable-insight-dashboard"
en_name: "Product Insight Dashboard"
zh_name: "产品分析仪表盘"
description: "Light editorial product-analytics dashboard on warm paper neutrals with a serif display voice, one deep-teal accent, hairline structure, and soft offset shadows."
zh_description: "浅色编辑风产品分析仪表盘：暖纸中性色、衬线展示字、深青强调、发丝线结构、柔和偏移阴影。"
triggers:
  - "analytics dashboard"
  - "product analytics"
  - "kpi dashboard"
  - "light dashboard"
  - "weekly active users"
  - "数据分析仪表盘"
  - "产品分析"
  - "KPI 看板"
  - "浅色仪表盘"
  - "增长看板"
od:
  mode: "prototype"
  task_type: "prototype"
  surface: "web"
  platform: "desktop"
  scenario: "product"
  category: "dashboard"
  preview:
    type: "html"
    entry: "example.html"
  design_system:
    requires: false
  example_prompt: "Build a light, editorial product-analytics dashboard: KPI band, weekly-active-users trend with prior-period comparison, signups-by-channel table, and a funnel."
---
# Impeccable Insight Dashboard

A product-analytics dashboard built to the Impeccable design discipline: an
Operate surface where scanability and consistency outrank expression, brand
lives in precise details (serif display voice, themed selection, tabular
numerals), and color is spent with rarity so the one accent keeps its force.

## When to use

- Briefs mentioning "analytics dashboard", "product metrics", "KPI report",
  "insight dashboard", "executive readout", "growth dashboard"
- Weekly/monthly product or business reviews that should feel written and
  editorial rather than SaaS-generic
- Any light data surface where restraint and typographic hierarchy matter

## Style rules

- **Palette.** Warm paper canvas `#faf9f6`, white chart surface, ink `#23201a`
  and secondary `#6d675c` (tinted, never pure black or neutral gray). One
  accent only: deep teal `#1d6a5e` for the trend line, primary button, links,
  annotations, and share bars. Semantic deltas are tinted washes: up
  `#1e7a4a` on `#e8f2ec`, down `#a83c2e` on `#f7ebe8`. No second accent.
- **Typography.** Display: Fraunces (Google Fonts, fallback Iowan Old
  Style/Georgia/serif), weight ~560, letter-spacing -0.01em, for the H1, KPI
  values, and section headings. UI/body/data: Public Sans (fallback Avenir
  Next/Segoe UI/system-ui), 15px base. Labels: 0.72-0.74rem uppercase with
  0.07em tracking. All numbers set `font-variant-numeric: tabular-nums`.
- **Structure.** Max width 1280px, 40px page gutters. Masthead with baseline
  hairline, title row, then a 4-across KPI band separated by interior 1px
  hairlines (no boxed stat cards). Main grid `1fr / 336px`: chart + channel
  table left, insights rail right behind a hairline. 4px spacing base; tight
  within groups, generous (30-40px) between sections.
- **Hairlines over boxes.** Section separation uses 1px rules `#e7e2d8`
  (strong `#d8d2c5`), not nested cards. The only elevated surface is the
  chart panel: 10px radius, soft offset shadow
  `0 1px 2px rgba(46,40,29,.05), 0 10px 28px rgba(46,40,29,.05)` -- shadows
  always carry offset plus blur, never a zero-offset halo.
- **Chart.** Inline SVG, hand-written paths. Current period: 2.5px accent
  line with a 7%-opacity area wash and an endpoint dot; prior period: 2px
  dashed warm-gray line. Axis labels 11px, four gridlines, one vertical
  dashed annotation marking a product event. No chart libraries.
- **Table.** Uppercase right-aligned column heads over a strong hairline,
  numeric columns right-aligned tabular, per-row secondary line in small
  muted text, share column pairs a number with a 72px accent bar. Row hover
  is an accent wash `#f2f7f6`.
- **Details.** Themed `::selection` (accent on light), visible
  `:focus-visible` outlines in the accent, real typographic characters
  (curly quotes, en/em dashes, minus sign for negatives), icons are authored
  inline SVG in a consistent 1.5px round stroke -- never emoji or glyphs.

## Anti-patterns

- Pure black `#000`, untinted grays, or gray text on colored surfaces
- A second hue competing with the teal accent; gradient text; glassmorphism
- Boxed same-size stat cards, cards nested in cards, kicker/eyebrow labels
- Zero-offset glow shadows, colored left-borders thicker than 1px
- Proportional (non-tabular) figures anywhere data aligns in columns
- Monospace as a "technical" costume -- this surface is editorial, not a terminal

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

Original page authored for OpenDesign following the published rules of https://github.com/pbakaus/impeccable (Apache-2.0)
