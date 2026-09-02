---
name: skill-interface-design
description: Craft-first product UI for dashboards, admin panels, and SaaS apps: decided hierarchy, subtle surface layering, domain-derived palette, no generic metric-box templates.
---

# Craft-First SaaS Dashboard

Build product interfaces to the standard of Linear, Vercel, and Stripe: every decision decided, hierarchy unmistakable, a hundred small details correct at once. For dashboards, admin panels, tools, and data interfaces (not marketing pages).

## When to use

- Briefs mentioning "dashboard", "admin panel", "SaaS app", "console", "monitoring", "settings"
- Data-dense product screens where visual craft and consistency matter
- Reviewing or refining an existing product UI that feels generic

## Style rules

- **Intent before pixels.** Name the actual human, the verb they came to do, and the intended feel (warm notebook / cold terminal / dense trading floor). Then make every token agree with it; check systematically.
- **Domain-derived palette.** Walk into the product's physical world and pull 5+ colors that exist there naturally. Token names should evoke the world (`--dawn`, `--graphite`), not a template (`--gray-700`). ~60/30/10 distribution: dominant neutral surface, secondary tone, ~10% single accent. Gray builds structure; color communicates (status, action, identity) only.
- **One focal point per view.** Name it, then make it win through size, weight, contrast, or surrounding space. Demote everything else deliberately.
- **Type: weight beats size.** Ratio-stepped scale (~1.25) from a 13-14px body. One 14px size can hold three tiers via weight+opacity: value 600/primary, label 500/secondary, meta 400/muted. Metric pattern: 11px tracked uppercase muted label, 26-28px 600 tabular-nums hero value, 12px semantic delta. Negative tracking on large numerals/headings.
- **Surface elevation, whisper-quiet.** Numbered levels a few % lightness apart (dark: base then +7%, +9%, +12%). Sidebar shares the canvas background, separated by a border only. Popovers sit one level above their parent. Inputs slightly darker than surroundings (inset, "type here").
- **Borders.** Low-opacity rgba, never solid hex: dark mode rgba(255,255,255,.06-.12), a progression for standard/soft/emphasis/focus. Prefer whitespace and tonal shift over dividers. Pass the squint test: hierarchy visible, nothing jumping.
- **Infinite expression.** Never the icon-left-number-big-label-small metric box repeated four times. Vary the expression: hero number, sparkline, gauge, delta chip, progress track. Give the screen one signature element only this product would have.
- **Semantics.** Native elements first (button, a, input, table). Tabular-nums on all changing numbers. Visible :focus-visible states.

## Anti-patterns

- Cold gray template with an unmotivated blue accent, same 280px sidebar, same card grid
- Hierarchy through size alone, or five colors doing the job of one accent
- Solid #333 borders, different-colored sidebar worlds, floating pages with no navigation
- Every number in an identical stat card; every surface boxed and bordered
- Token names and copy that could belong to any product

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

Adapted from https://github.com/Dammyjay93/interface-design (MIT)
