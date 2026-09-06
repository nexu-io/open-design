---
name: "skill-swiss-design"
en_name: "Swiss Editorial Grid"
zh_name: "瑞士编辑网格"
description: "Swiss International Style editorial layout with a rigorous 12-column grid, grotesque typography, stone palette, opacity hierarchy, and one red accent."
zh_description: "瑞士国际主义编辑排版：严格 12 栏、grotesque 字体、石色调、透明度层级、单一红色强调。"
triggers:
  - "swiss design"
  - "international style"
  - "12-column grid"
  - "grotesque type"
  - "one red accent"
  - "瑞士风格"
  - "国际主义"
  - "网格排版"
  - "瑞士网页"
  - "红色强调"
od:
  mode: "prototype"
  task_type: "prototype"
  surface: "web"
  platform: "desktop"
  scenario: "design"
  category: "style"
  preview:
    type: "html"
    entry: "example.html"
  design_system:
    requires: false
  example_prompt: "Design a Swiss-style editorial homepage for a design journal: strict grid, one red accent, grotesque type."
---
# Swiss Editorial Grid

A design system rooted in 1950s-60s Swiss International Style: grotesque type, mathematical grid, restrained color, whitespace as structure. Best rendered as an editorial or magazine-style page where the grid itself is the hero.

## When to use

- Briefs mentioning "swiss design", "international style", "grid system", "helvetica", "modernist"
- Editorial homepages, design journals, magazine indexes, studio portfolios
- Any page that should feel typographically disciplined and archival

## Style rules

- **Grid first.** 12-column CSS grid, 8px base unit, gaps of 16/32px. Content max-width 1100-1200px. Columns are visibly honored: headlines, rules, and blocks snap to grid lines.
- **Typography.** IBM Plex Sans (Google Fonts) with `'Hanken Grotesk', 'Barlow', system-ui, sans-serif` fallback. Display: clamp(3rem, 7vw, 6rem), weight 300, letter-spacing -0.02em, line-height 1.0. H2: ~2rem weight 300. Body: 1rem weight 400, line-height 1.65, max-width 60ch. Captions/labels: 0.72rem uppercase, letter-spacing 0.1em. Never bold headings; emphasis uses weight 500 max.
- **Color.** Stone neutrals only: page #fafaf9, surface #f5f5f4, ink #1c1917. Never pure black or white. Hierarchy through opacity, never a second hue: primary 100%, secondary 70%, tertiary 40%, ghost 20%.
- **One accent.** Swiss red #C8102E, used sparsely: a rule, a folio number, a hover state, a small solid block. Also allowed at /60, /20, /10 opacity. No second accent, ever.
- **Structure.** Full-width 1px hairline rules (#d6d3d1) separate sections. Section padding 64-96px vertical. Numbered items use tabular figures ("01", "02"). Rectilinear: border-radius 0 everywhere.
- **Details.** Curly quotes and the ellipsis character, tabular-nums for numbers, generous asymmetric negative space, one oversized display word allowed to dominate the masthead.
- **Hover.** Links and article cards shift text to the red accent or raise opacity; underlines are 1px offset rules, not default underline. Transitions 150-200ms, transform/opacity only.

## Anti-patterns

- Border-radius, drop shadows, gradients, or glassmorphism anywhere
- A second accent color or hue-based text hierarchy (use opacity)
- Bold display headings, centered body text, columns wider than 60ch
- Decorative imagery replacing typographic structure; the grid is the visual
- Straight quotes and "..." instead of proper typographic characters

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

Adapted from https://github.com/zeke/swiss-design-skill (MIT)
