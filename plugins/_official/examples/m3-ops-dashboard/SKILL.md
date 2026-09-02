---
name: m3-ops-dashboard
description: Material Design 3 operations dashboard with tonal surface layering, navigation rail, filled/tonal buttons, status cards, incident timeline, and SVG resource rings on the M3 baseline purple scheme.
---

# Material 3 Ops Dashboard

A team operations dashboard built strictly on Google's Material Design 3 token system: elevation expressed through tonal surface containers (not shadows), a left navigation rail with active-pill destinations, the 12-28dp shape ladder, and the M3 baseline purple scheme generated from seed #6750A4.

## When to use

- Briefs mentioning "material design", "MD3", "material you", "admin dashboard", "ops dashboard", "monitoring console", "status page"
- Internal tools, SRE/on-call consoles, service health overviews, infrastructure panels
- Any product surface that should feel like a first-party Google app: soft tonal purples, pill shapes, quiet depth

## Style rules

- **Tokens first.** Every color comes from a `--md-sys-color-*` custom property; never hardcode a raw hex at the point of use. Baseline light scheme: primary #6750A4, primary-container #EADDFF, secondary-container #E8DEF8, tertiary-container #FFD8E4, error-container #F9DEDC, surface #FEF7FF, on-surface #1D1B20, on-surface-variant #49454F, outline-variant #CAC4D0.
- **Tonal elevation, not shadows.** Depth is a ladder of surface containers: page = `surface` (#FEF7FF), status cards = `surface-container-low` (#F7F2FA), panels = `surface-container` (#F3EDF7), hover/inner blocks = `surface-container-high` (#ECE6F0), ring tracks = `surface-container-highest` (#E6E0E9). The only shadow allowed is a faint one on filled-button hover.
- **Shape ladder.** Chips 8px (small), cards 12px (medium), panels 16px (large), FAB 16px morphing to full on hover, buttons/pills/avatar 9999px (full). Never invent radii outside the scale.
- **Color pairing.** Only intended pairs: `primary` + `on-primary`, `secondary-container` + `on-secondary-container`, `error-container` + `on-error-container`, surfaces + `on-surface` / `on-surface-variant`. The degraded-service card tints its entire card `error-container` and switches all inner text to `on-error-container`.
- **Typography.** Roboto Flex (Google Fonts) with `Roboto, 'Segoe UI', system-ui, sans-serif` fallback. Top-bar title 22px/500 (title-large), panel headers 16px/600, metrics 28px/600 with `tabular-nums`, labels 12px/500 with 0.4-0.5px letter-spacing. No weight above 700.
- **Navigation rail.** 80px wide, surface background, hairline `outline-variant` right border. Destinations = 56x32 pill (secondary-container when active) + 12px label. A 56px tonal FAB in primary-container sits at the top.
- **Buttons.** Filled = primary/on-primary, tonal = secondary-container/on-secondary-container, both 40px tall, full radius, 24px horizontal padding. Icon buttons are 40px circles that gain a surface-container-high wash on hover.
- **Status chips.** 24px tall, small (8px) radius, 11px/600 text, leading 6px dot: healthy = secondary-container, elevated = tertiary-container, failing = solid error with on-error text.
- **Data viz.** Resource rings are inline SVG circles (stroke-dasharray on a rotated circle) stroked with primary / secondary / tertiary over a surface-container-highest track; percentage centered in on-surface. Timeline dots use the same three accent roles plus error.
- **Motion.** Transitions 150-200ms with `cubic-bezier(0.2, 0, 0, 1)` (M3 standard easing), animating background, border-radius, or shadow only.

## Anti-patterns

- Drop shadows as the primary depth cue, or box-shadows on resting cards
- Raw hex colors inline where a `--md-sys-color-*` token exists
- Pairing colors across roles (e.g. on-primary text over a surface container)
- Sharp corners, or radii outside the 8/12/16/28/full ladder
- Gradients, glassmorphism, dark-neon styling; MD3 light is matte and tonal
- Using `outline` for decorative dividers (that is `outline-variant`'s job)

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

Original page authored for OpenDesign following https://github.com/hamen/material-3-skill (MIT); Material Design 3 is an open specification by Google
