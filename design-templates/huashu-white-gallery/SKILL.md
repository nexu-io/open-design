---
name: "huashu-white-gallery"
en_name: "White Gallery"
zh_name: "白色画廊页"
description: "Kenya-Hara-inspired white gallery page style: near-white emptiness, hairline dividers, masonry curation grid where the works supply all the color and the UI recedes."
zh_description: "原研哉风白色画廊页：近白留白、发丝线分隔、瀑布流策展网格，作品供色、UI 退后。"
triggers:
  - "gallery page"
  - "white gallery"
  - "masonry grid"
  - "curation"
  - "museum"
  - "artwork collection"
  - "画廊页"
  - "作品集网格"
  - "瀑布流"
  - "策展"
  - "极简白"
od:
  mode: "prototype"
  task_type: "prototype"
  surface: "web"
  platform: "desktop"
  scenario: "design"
  category: "gallery"
  preview:
    type: "html"
    entry: "example.html"
  design_system:
    requires: false
  example_prompt: "Make a quiet, museum-like gallery page for a studio's poster collection where the works carry all the color."
---
# White Gallery

A curation page in the spirit of Kenya Hara's "white": the interface is near-invisible
(near-white ground, hairline separators, light type with wide tracking) so the curated
works themselves carry every drop of color. Masonry rhythm, luxurious spacing, a serif
italic reserved for titles.

## When to use

- Design/photography portfolios and studio galleries
- Curated shops, print editions, high-end product shelves
- Moodboard or collection-browsing platforms
- Museum, exhibition, or archive index pages
- Any brief mentioning "minimal gallery", "Japanese minimalism", "curated", "Aesop-like"

## Style rules

- Palette: ground `#FAFAFA`, ink `#0A0A0A`, hairline `#ECECEA`, muted meta `#8A8A86`.
  The UI itself uses zero chromatic color; all hue comes from the exhibited works.
- Type: light-weight sans (Inter 300/400) for UI at 11-13px with `letter-spacing`
  0.14-0.42em uppercase for labels/nav; a classic serif (Cormorant Garamond / Georgia)
  for the display line and work titles, italic allowed only there.
- Layout: generous max-width container; CSS `columns` masonry with ~54px gutters and
  ~76px vertical gaps. Each work = white plate with 1px hairline border + caption row
  (title left, medium right) + one muted metadata line (studio, edition, price).
- Spacing: whitespace is the main material; intro section 60-80px vertical padding,
  section breaks are single 1px hairlines, never bars or fills.
- Interaction: hover lifts the plate 4px with a very soft, large-radius shadow
  (`0 18px 40px rgba(0,0,0,.06)`), transitions ~0.35s ease. Nothing else moves.
- Works without real imagery: draw them as inline-SVG graphic compositions (flat
  geometry, restrained palettes) so the page stays self-contained and honest.

## Anti-patterns

- Colored buttons, badges, or brand accents in the chrome; the UI must stay achromatic.
- Card shadows at rest, rounded corners, or borders heavier than 1px.
- Dense grids with small gutters; if it feels efficient, it is wrong.
- Bold weights or tight tracking in UI labels; loud hover animations.
- Filling empty slots with placeholders; emptiness is part of the design.

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

Adapted from https://github.com/alchaincyf/huashu-design (MIT)
