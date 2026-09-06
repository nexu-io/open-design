---
name: "qiaomu-portfolio"
en_name: "Designer Portfolio"
zh_name: "设计师作品集"
description: "Warm off-black editorial portfolio for a designer, with serif display type, amber accent, and a CSS/SVG portrait."
zh_description: "暖色近黑设计师作品集：衬线展示字、琥珀强调、CSS 和 SVG 肖像。"
triggers:
  - "portfolio"
  - "personal site"
  - "designer website"
  - "selected work"
  - "case studies"
  - "作品集"
  - "个人网站"
  - "设计师主页"
  - "个人主页"
  - "案例展示"
od:
  mode: "prototype"
  task_type: "prototype"
  surface: "web"
  platform: "desktop"
  scenario: "personal"
  category: "portfolio"
  preview:
    type: "html"
    entry: "example.html"
  design_system:
    requires: false
  example_prompt: "Design a personal portfolio site for an independent product designer: editorial hero, selected work grid, about, and contact."
---
# Designer Portfolio

A personality-first personal site on a warm off-black ground: oversized serif display hero, hand-built CSS/SVG portrait illustration (no photo assets), editorial two-column project grid with mono index numbers, about section, and a large contact block. Notion-style warm surfaces with Framer-style hairline borders.

## When to use

- Personal portfolio / personal brand site for a designer, developer, writer
- Editorial one-pager where character matters more than density
- Briefs asking for "showcase my work", "about me page", "personal homepage"

## Style rules

- Palette: warm off-black `#0f0e0c`, card surfaces `#191714`, hover lift `#222019`; hairline borders `rgba(255,255,255,.07)` (visible state `.11`). Single warm accent `#d4a853` (amber, saturation < 80%) with dim fill `rgba(212,168,83,.14)`. No second accent.
- Type pairing carries the identity: serif display (DM Serif Display) for headlines, grotesque sans (Space Grotesk) for UI, mono (JetBrains Mono) for index numbers, dates, and meta labels. Chinese body text always on the system stack; express personality through Latin display type, weight, and structure, never decorative CJK webfonts and never italics.
- Radius is one value site-wide (3px); prose measure locked at 640px; whitespace is the layout tool (VARIANCE high, DENSITY low).
- Projects as an editorial grid, not equal cards: mono numbering (01/02/…), asymmetric spans or zig-zag, hover reveals (surface lift + accent underline slide), each project readable in one glance.
- Portrait and project art are drawn with CSS gradients and inline SVG so the page has zero image dependencies; give artwork layered light/shadow so it reads as crafted, not clip-art.
- Every page needs one memorable move (here: the drawn portrait inside a framed card). If you can't name the memorable thing, it isn't done.
- Contact is a functional contract: email and links must be obvious and clickable.
- Motion: `cubic-bezier(0.23, 1, 0.32, 1)`, hover shifts of 2-4px, ≤ 300ms, wrapped in `@media (hover: hover)`; respect `prefers-reduced-motion`.

## Anti-patterns

- Stock-photo avatars, external images, or emoji as the portrait
- Centered hero with a gradient headline; more than one accent color
- Equal-width three-card project rows; "SECTION 01" eyebrow labels on every block
- Generic placeholder names (John Doe): invent a specific person with specific projects
- Pure black `#000000` backgrounds or cold blue-grey surfaces in a warm scheme

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

Adapted from https://github.com/joeseesun/qiaomu-design (MIT)
