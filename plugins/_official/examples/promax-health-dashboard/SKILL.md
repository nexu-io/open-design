---
name: promax-health-dashboard
description: Light clinical analytics dashboard with sidebar navigation, KPI stat cards, inline-SVG line and donut charts, a records table, and a schedule rail.
---

# Healthcare Analytics Dashboard

A calm, data-dense operations dashboard in the modern SaaS-admin idiom: white cards on a light slate canvas, a single clinical blue carrying the brand, monospace numerals for every metric, and generous 24px gutters that keep four columns of KPIs readable at a glance.

## When to use

- Briefs mentioning "dashboard", "admin panel", "analytics view", "operations overview", "metrics", "hospital / clinic software"
- Internal tools that mix KPI cards, trend charts, tables, and schedules on one screen
- Any B2B screen where scannability and status color-coding matter more than decoration

## Style rules

- **Layout.** Fixed 256px white sidebar (1px `#E2E8F0` right border) + fluid main column with 32px padding. Content rows are CSS grid: KPIs `repeat(4, 1fr)`, chart row `2fr 1fr`, bottom row `2fr 1fr`, all with 24px gaps.
- **Typography.** Fira Sans (Google Fonts, `-apple-system, sans-serif` fallback) for UI text; Fira Code for every numeric readout, record ID, and chart center label. Page title 1.5rem/700, panel titles 1.125rem/600, KPI values 1.875rem/700 mono, supporting text 0.875rem in slate.
- **Color.** Canvas `#F1F5F9`, cards `#FFFFFF` with 1px `#F1F5F9` borders, ink `#1E293B`, muted slate `#64748B`/`#94A3B8`. Primary blue `#3B82F6`, success `#10B981`, warning `#F59E0B`, danger `#EF4444`, accent orange `#F97316`, chart violet `#8B5CF6`. Every status hue also appears as a 10% tint background behind its icon or pill.
- **Radii and depth.** Cards and icon wells 12px radius, inputs/buttons 8px, status pills fully rounded (999px). Resting cards are flat (border only); hover raises a soft `0 4px 6px` shadow. Avatars are 40px circles filled with a 10-20% tint of their role color.
- **Charts.** Inline SVG only, no chart libraries. Line charts use smooth cubic paths with a 10%-opacity area fill, 5px white-stroked point dots, and hairline `rgba(0,0,0,0.05)` gridlines. Donut charts are stroked circles (`stroke-dasharray` segments, ~65% cutout) with a bold mono total in the center. Legends are centered dot + label rows at 0.8rem.
- **Components.** KPI card = tinted icon well top-left, green/red delta arrow top-right, big mono value, muted label. Table rows separated by 1px near-white rules with a faint hover wash; statuses are tinted pills. Schedule items are `#F8FAFC` blocks with a bold title left and a small tinted time chip right.
- **Motion.** 200-300ms ease transitions on hover backgrounds and shadows only; respect `prefers-reduced-motion`.

## Anti-patterns

- Dark mode, glassmorphism, gradients, or decorative imagery: this is a flat, light clinical surface
- More than one saturated hue per element; status colors never mix on a single pill or icon well
- Proportional-width digits in metrics: all numbers are monospace
- External chart libraries or CDN scripts; charts stay hand-drawn inline SVG
- Cramped gutters: never drop below 24px between cards or 24px card padding

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
