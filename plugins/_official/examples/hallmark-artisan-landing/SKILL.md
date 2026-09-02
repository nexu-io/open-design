---
name: hallmark-artisan-landing
description: Warm-paper serif editorial page for a local artisan business — almanac masthead, two-column ruled catalogue with line-art SVG icons, italic descriptions, and double-rule section frames.
---

# Artisan Local-Business Page

A one-page catalogue for a small local business, set like a page from an old almanac: centered
serif masthead over a double rule, a two-column menu grid separated by hairlines, hand-drawn
line-art SVG silhouettes for each item, tabular prices on the right, and a centered "Visit"
plate framed in double rules. Warm paper ground with faint radial vignettes; one amber accent.

## When to use

- Briefs mentioning "bakery", "coffee roaster", "local shop", "menu page", "artisan",
  "editorial", "old-fashioned", "print-style"
- Small-business pages whose content is a short list of items with prices (menus, catalogues,
  service lists, market stalls)
- Any page that should feel hand-set, unhurried, and printed rather than marketed

## Style rules

- **Color.** Warm paper `oklch(94% 0.022 80)` with two soft radial vignettes; hover surface
  `oklch(91% 0.024 80)`. Ink `oklch(24% 0.020 50)`, soft ink `oklch(40% 0.020 55)`, rules
  `oklch(78% 0.020 70)`. Single warm-amber accent `oklch(58% 0.14 50)` used only for a strong
  word in the masthead sub-line and for roughly a third of the item icons. No other hue.
- **Typography.** Display face IM Fell English SC (fallback `"IM Fell English", "EB Garamond",
  Georgia, serif`) for the masthead, item names, prices, and colophon; body face Source Serif 4
  (fallback `"Iowan Old Style", Georgia, serif`). Masthead `clamp(2.5rem, 6vw, 4.5rem)` weight
  400, line-height 1. Sub-lines 0.875rem uppercase, letter-spacing 0.16em. Item descriptions are
  italic 0.9375rem soft ink. Prices use `font-variant-numeric: tabular-nums`.
- **Structure.** Page max-width 64rem. Masthead: short 4ch rule, brand, uppercase sub-line,
  closed by a `2px double` rule. Catalogue: 2-column grid with 1px hairlines between rows and a
  vertical hairline between columns (odd items carry `border-inline-end`). Each item is a
  `96px 1fr auto` grid: icon, name + italic description, price. Visit section framed top and
  bottom with `2px double` rules, centered. No border-radius anywhere except none.
- **Icons.** Inline SVG line drawings in a 96 viewBox: `fill: none; stroke: currentColor;
  stroke-width: 1.5;` round caps and joins. Default icons draw in soft ink; accent items switch
  the stroke to the amber accent. Keep drawings to 2-4 strokes — silhouette plus one detail.
- **Spacing.** rem scale 0.25 to 6.5 (`--space-3xs` … `--space-3xl`). Rows pad 2rem block.
  Sections separated by 4.5rem.
- **Motion.** Row hover only: background shifts to the warmer paper tone, 140ms
  `cubic-bezier(0.2, 0.8, 0.2, 1)`. Nothing else moves.
- **Voice.** Copy is concrete and unhurried: quantities, days of the week, provenance, and quiet
  imperatives ("Bring a bag"). "Sold out" is set in italic body face instead of a price.

## Anti-patterns

- Sans-serif anywhere; both faces are serifs, and the display face never bolds
- Photography, emoji, or filled/colored icons — line-art SVG silhouettes only
- Border-radius, shadows, gradients (beyond the two paper vignettes), or cards floating on the page
- Marketing language: no superlatives, no CTAs, no urgency banners, no discount badges
- A second accent color, or accenting every icon — accent stays scarce

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

Adapted from https://github.com/Nutlope/hallmark (MIT)
