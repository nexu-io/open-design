---
name: skill-minimalist
description: Premium utilitarian minimalism: warm monochrome palette, editorial serif + clean sans typographic contrast, flat bento grids, muted pastel accents, near-zero shadows.
---

# Editorial Minimalist Product Page

Document-style interfaces in the spirit of top-tier workspace tools: ultra-flat, warm monochrome, typographically rich, aggressively uncluttered. The page should feel like a beautifully set document, not a SaaS template.

## When to use

- Briefs mentioning "minimal", "editorial", "clean", "notion-style", "quiet", "monochrome"
- Product pages for writing, research, notes, docs, or productivity tools
- Any landing that should feel premium through restraint rather than spectacle

## Style rules

- **Canvas.** Warm bone #F7F6F3 or #FBFBFA page, #FFFFFF card surfaces. Body ink is off-black #2F3437 (never #000), secondary #787774, line-height 1.6.
- **Borders.** Every card, divider, and kbd chip uses exactly `1px solid #EAEAEA` (or rgba(0,0,0,.06)). Radius 8-12px max on cards, 4-6px on buttons. No pill-shaped containers.
- **Type contrast.** Hero and pull-quotes in an editorial serif (Newsreader, Instrument Serif, Playfair Display) with tracking -0.02em to -0.04em and line-height 1.1. Body/UI in a clean geometric sans with character (avoid Inter/Roboto/Open Sans). Metadata and shortcuts in a monospace.
- **Pastel accents.** Color only as desaturated washed pastels on small elements: pale red #FDEBEC/#9F2F2D, pale blue #E1F3FE/#1F6C9F, pale green #EDF3EC/#346538, pale yellow #FBF3DB/#956400. Tags are tiny uppercase pills with 0.05em tracking.
- **Shadows.** Practically none. Hover lifts cards to at most `0 2px 8px rgba(0,0,0,.04)` over 200ms. Buttons: solid #111111 with white text, hover #333333 or scale(0.98).
- **Bento grid.** Asymmetric CSS grid feature cards, generous 24-40px internal padding, massive 96-128px vertical rhythm between sections, content constrained to ~max-w-4xl.
- **Micro-UI garnish.** `<kbd>` keys styled as physical keycaps (1px border, 4px radius, #F7F6F3 fill, mono font); faux macOS window chrome (three light-gray dots) around product mockups; FAQ as border-bottom rows with +/- toggles, no boxes.
- **Depth without noise.** Very low-opacity radial warm light spots or faint line patterns behind heroes; never flat empty voids, never visible gradients.

## Anti-patterns

- Gradients, neon, glassmorphism, or Tailwind-default shadow-md/lg/xl
- Bright saturated section backgrounds or colored heroes
- Inter/Roboto/Open Sans, generic thin-line icon sets, emojis in UI copy
- "John Doe" / "Acme Corp" / lorem ipsum; and cliché copy ("Elevate", "Seamless", "Unleash")
- Every element boxed in a card; use whitespace and single hairlines instead

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

Adapted from https://github.com/Leonxlnx/taste-skill/tree/main/skills/minimalist-skill (MIT)
