---
name: jp-ops-console
description: Restrained light SaaS settings console with a soft-blue accent, left sidebar navigation, three KPI cards, a labeled settings form with help and error text, and a pill-status job table on a 12-column grid.
---

# Ops Console Settings

A quiet, production-grade SaaS admin console page: sidebar navigation with grouped links, a page-level action bar, KPI summary cards, a settings form that treats help text and error text as first-class rows, and a compact job-status table. The look is deliberately calm — one blue accent, generous line-height, hairline borders, and large soft radii.

## When to use

- Briefs mentioning "settings page", "admin console", "ops console", "workflow settings", "internal tool", "back office"
- SaaS configuration surfaces: notification policies, team routing, digest schedules, job monitors
- Any app UI that should read as dependable and unflashy rather than promotional

## Style rules

- **Layout.** Two-column app grid: 260px sidebar + fluid main (`grid-template-columns: 260px minmax(0, 1fr)`). Main content on a 12-column grid with 16px gaps: KPI cards span 4, the form panel spans 7, the side table panel spans 5. Below 1080px everything collapses to span 12 and the sidebar moves on top.
- **Color.** Page #f5f7fb, cards/panels white on hairline #e4e7ec borders, sidebar #fbfcfe. Text #1f2937, secondary #667085. One accent: #315efb (primary button, brand chip on #eef4ff). Status greens #067647 on #ecfdf3, warning #b54708 on #fff7ed, error text #b42318. No gradients, no shadows.
- **Radii.** Soft and consistent: brand chip 14px, nav links / buttons / inputs 12px, cards and panels 18px, status pills 999px.
- **Typography.** Inter (Google Fonts) with `"Segoe UI", system-ui, sans-serif` fallback. Page title clamp(24-30px)/700; panel headers 18px/700; card labels 15px/600; metrics 28px/700 tabular-nums; nav group titles 12px uppercase with 0.04em tracking; body and table 14px with line-height 1.45-1.5.
- **Sidebar.** A tinted brand chip on top, then nav groups with uppercase group titles; the active link is a white card with a hairline border and weight 600 — no accent fill.
- **Forms.** Each field is a `form-row` grid: 13px/600 label, 42px-min input/select on 12px radius, then optional 12px help text in subtle gray or error text in #b42318. Long helper sentences and URLs must wrap without breaking the layout.
- **Actions.** Page-level actions live in the topbar, right-aligned: a quiet outlined "Save draft" and one filled accent "Apply changes". Buttons are 40px tall, 12px radius, 14px/600.
- **Table.** Full-width, collapsed borders, hairline row separators only, 12px/600 gray headers, monospace-feeling job names in regular text, and rounded status pills (green "Healthy", amber "Needs review").

## Anti-patterns

- Marketing energy: hero sections, gradients, oversized display type, illustration
- Multiple accent hues or colored panel backgrounds; the accent is one blue
- Drop shadows or heavy borders; separation comes from hairlines and background tints
- Dense forms without help text, or error copy in tooltips instead of visible rows
- Sharp corners or mixed radius values outside the 12/14/18/999 set
- Turning the KPI row into a dashboard; three cards of context is the ceiling

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

Adapted from https://github.com/hirokaji/jp-ui-contracts (MIT)
