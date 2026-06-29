---
name: design-system-inspired-by-framer
description: Dark-first, Framer-inspired design system — pure-black void canvas, compressed GT Walsheim display type, Inter body, and a single electric Framer Blue (#0099ff) accent. Use when building any UI, page, deck, or artifact that should feel like Framer: cinematic, precise, product-forward, one-accent restraint.
user-invocable: true
---

# Design System Inspired by Framer

## What is inside

A reusable, dark-first design-system package: 7 color-role tokens, a compressed display type
system (GT Walsheim + Inter + Azeret Mono), spacing/radius/elevation scales, component classes,
six generated artifacts, focused preview cards, and an applied UI kit. Source of truth is
`brand.json`; human rules live in `DESIGN.md` and `BRAND.md`; reusable CSS in `colors_and_type.css`.

## Source context

Re-measured from the authoritative pasted Framer DESIGN.md (treated as measured truth per the
enrichment contract). Source URL on record: `https://shopify.com/`. The binding language is
Framer's: pure-black void, one electric blue accent, product UI as hero art.

## When to use this skill

- Building a landing page, deck, dashboard, email, or prototype that should read as Framer-grade:
  dark, precise, motion-first, design-forward.
- You need a strict one-accent dark palette with disciplined typography and pill components.
- You want on-brand tokens without re-deriving good defaults.

Do **not** use it for warm/light editorial work, multi-accent playful brands, or serif-led
typography — it is intentionally a dark, geometric, one-accent system.

## How to use

1. Read `DESIGN.md` (rules) and `BRAND.md` (voice). Both bind color, type, layout, components.
2. Import `colors_and_type.css` or `system/variables.dark.css`; build on `var(--background)`,
   `var(--surface)`, `var(--foreground)`, `var(--muted)`, `var(--border)`, `var(--accent)`,
   `var(--accent-secondary)`.
3. Reference `preview/*.html` for color, type, spacing, radius, shadow, and component specimens.
4. Compose product surfaces from `ui_kits/app/` and the `system/kit*.html` showcases.
5. Pull logo/imagery from `logos/` and `imagery/`.

## Design system highlights

- **Void canvas:** pure `#000000` background — never warm or gray-tinted.
- **One accent:** Framer Blue `#0099ff` for links, focus rings, and containment borders only.
- **Compressed display:** GT Walsheim Medium (500) with extreme negative tracking (−3 to −5.5px).
- **Inverted elevation:** blue ring shadows + white 0.5px top highlights, not heavy drop shadows.
- **Pill interactions:** all buttons 40px+ radius; cards 10–15px; product screenshots as hero art.
