---
name: style-claymorphism
description: Build soft 3D clay-like interfaces with chunky borders, double shadows, pastel colors and bouncy animations.
---
# Claymorphism Style

UI that looks squeezed out of modeling clay: puffy pastel surfaces, thick soft edges, everything rounded and pressable. Friendly by construction.

## When to use
- Children's and educational apps
- Health / wellness / habit apps that want warmth
- Onboarding flows, casual games, creative tools
- Fun-focused SaaS surfaces (rewards, streaks, achievements)
- Any brief mentioning "clay", "soft 3D", "toy-like", "bubbly"

## Style rules
- Radius: 16-24px on cards (default 20-22px); pills (999px) for chips, buttons and progress bars.
- Border: thick 3-4px, in WHITE (or a lighter tint of the fill), never black.
- The clay shadow is a DOUBLE shadow, always both parts:
  `box-shadow: inset -3px -4px 10px rgba(120,80,60,0.18), inset 3px 4px 10px rgba(255,255,255,0.85), 6px 8px 16px rgba(120,90,140,0.18)`
  (dark inner on bottom-right, light inner on top-left, soft outer drop). No hard shadow lines anywhere.
- Palette: pastels only. Soft Peach `#FDBCB4`, Baby Blue `#ADD8E6`, Mint `#98FF98`, Lilac `#E6E6FA` on a warm cream base (`#FFF7EF`); text a soft dark plum (`#4A3B57`), never pure black.
- Backgrounds: pastel-to-pastel gradients or blurred pastel blobs; keep them light.
- Motion: bouncy, `cubic-bezier(0.34, 1.56, 0.64, 1)` around 200ms; hover lifts (`translateY(-4px)` + slight rotate), active press INVERTS the shadow (outer removed, inner darkened) so the element visibly squishes.
- Progress bars: inset track + clay-filled thumb, both fully rounded.
- Round typography (Baloo, Nunito, Quicksand), weights 600-800; no thin text.
- Decor: CSS-drawn mascots, emoji icons in clay tiles; respect `prefers-reduced-motion`.

## Design tokens
`--border-radius: 20px; --border-width: 4px; --shadow-inner: inset -3px -4px 10px; --shadow-outer: 6px 8px 16px; --palette: pastels; --easing: cubic-bezier(0.34,1.56,0.64,1)`

## Anti-patterns
- Formal, corporate, legal, finance or medical-critical products (reads as unserious there).
- Black borders or hard offset shadows (that is neubrutalism, not clay).
- Saturated neon or dark themes; clay needs light pastels to read as soft.
- Flat cards with only an outer drop shadow; without the inner pair it is not claymorphism.
- Thin fonts, sharp corners, or pure-black text.

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
