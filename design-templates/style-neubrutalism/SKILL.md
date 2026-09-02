---
name: "style-neubrutalism"
en_name: "Neubrutalism Style"
zh_name: "新野兽派风格"
description: "Build neubrutalist interfaces with hard black borders, offset shadows, flat pop colors and bold typography."
zh_description: "新野兽派界面：硬黑边框、偏移阴影、扁平流行色、粗体排版。"
triggers:
  - "neubrutalism"
  - "neo-brutalism"
  - "thick black borders"
  - "offset shadows"
  - "pop colors"
  - "新野兽派"
  - "粗黑边框"
  - "偏移阴影"
  - "扁平撞色"
  - "创意工作室官网"
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
  example_prompt: "Build a neubrutalist landing page for a creative studio: thick black borders, hard offset shadows and loud pop colors."
---
# Neubrutalism Style

Raw, loud, "ugly-cute" web design: everything outlined in black, everything casting a hard flat shadow, colors straight from the tube. Functional underneath, shouty on top.

## When to use
- Gen Z brands, startups, creative agencies
- Portfolio and studio landing pages
- Figma-style / Notion-style product interfaces
- Tech blogs and event sites that want personality
- Any brief mentioning "brutalist", "bold borders", "hard shadows"

## Style rules
- Borders: `border: 3px solid #000` on every card, button, input, image frame (2-4px range; never thinner).
- Shadows: hard offset only, `box-shadow: 5px 5px 0px #000`; NO blur radius, ever. Bigger elements may use 8px 8px.
- Palette: flat high-saturation colors on a warm paper base, e.g. Yellow `#FFEB3B`, Red `#FF5252`, Blue `#2196F3`, Teal `#4ECDC4` on `#FDF6E3`; black `#000` for all lines and text.
- No gradients, no blur, no transparency. Flat fills only.
- Corners: sharp `0px` (small radii ≤4px tolerated on stickers only); circular stickers/badges allowed.
- Typography: heavy grotesque (Archivo/Inter Black, weight 700-900), tight letter-spacing, UPPERCASE headlines; pair with a monospace (Space Mono) for tags and metadata.
- Interaction: press physics; on hover translate the element by the shadow offset (`translate(3px,3px)`) while shrinking the shadow (5px → 2px); on active collapse to 0. No easing fades.
- Composition: slight rotations (-2° to 2°) on logos, highlight blocks and stickers; marquee strips and outlined tags as texture.
- Headline highlights: words boxed in colored blocks with border + shadow, individually rotated.

## Design tokens
`--border-width: 3px; --shadow-offset: 5px; --shadow-color: #000; --font: 900 sans`

## Anti-patterns
- Soft shadows, gradients, glass effects or rounded 16px+ cards (that is a different style).
- Muted / pastel palettes; low-contrast gray text.
- Luxury, finance, healthcare or other conservative-brand briefs (too playful).
- Thin (1px) borders or borderless elements floating on white.
- Smooth 300ms opacity transitions; interactions should snap, not fade.

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
