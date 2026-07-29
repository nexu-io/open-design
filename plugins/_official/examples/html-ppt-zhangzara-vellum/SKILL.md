---
name: html-ppt-zhangzara-vellum
description: |
  Vellum — Deep navy canvas with warm-yellow italic Cormorant serifs and a single dusty teal accent. A quiet, scholarly aesthetic. Anything that should feel scholarly, literary, and quietly intelligent: research synthesis, white papers, academic and policy briefs, advisory deliverables, longform editorial pieces, founder reflections.
triggers:
  - "vellum"
  - "zhangzara-vellum"
  - "scholarly"
  - "literary"
  - "considered"
  - "research findings"
  - "white paper or longform report"
  - "html deck"
  - "html slides"
  - "zhangzara"
od:
  mode: deck
  scenario: marketing
  upstream: "https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/vellum"
  upstream_license: MIT
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
  speaker_notes: false
  animations: false
---

# Vellum

> Deep navy canvas with warm-yellow italic Cormorant serifs and a single dusty teal accent. A quiet, scholarly aesthetic.

A single self-contained HTML deck — typography, palette, decorative system,
and slide vocabulary are all tuned together. Mixing layouts across templates
breaks the system; stay inside this one.

## At a glance

- **Scheme:** dark
- **Formality:** high
- **Density:** low
- **Slides in demo:** 9

## Best for

Anything that should feel scholarly, literary, and quietly intelligent: research synthesis, white papers, academic and policy briefs, advisory deliverables, longform editorial pieces, founder reflections. Equally strong for any deck — including tech, business, or creator work — that wants a calm, considered atmosphere instead of energetic visuals.

## Avoid for

Contexts that need visual heat or pop — the navy + warm-yellow italic-Cormorant aesthetic is intentionally low-tempo.

## Workflow

1. **Clone `example.html`** into the user's workspace as the working file.
2. **Replace placeholder content** with the user's real headlines, body copy,
   numbers, names, dates, and section labels. Match existing dimensions when
   swapping image placeholders.
3. **Preserve the design system.** Never substitute fonts, recolor the palette,
   restructure the layout grid, or strip decorative elements (corner brackets,
   paper grain, geometric shapes, illustrated SVGs). They are part of the
   identity.
4. **Adjust deck length by duplicating layouts.** If the user has more content
   than the demo holds, duplicate an existing slide of the most appropriate
   layout. If less, drop slides from the bottom. Update page-number labels.
5. **Designing missing layouts:** if a slide needs a layout the template
   doesn't have, design it from scratch using the same fonts, palette,
   decorative vocabulary, spacing rhythm, and component grammar — never bail
   to a different template.
6. **Keep the navigation runtime as shipped.** If the deck ships an
   `assets/deck-stage.js` or inline keyboard handler, leave it intact.

## Output contract

Emit between `<artifact>` tags:

```
<artifact identifier="zhangzara-vellum" type="text/html" title="Deck Title">
<!doctype html>
<html>...</html>
</artifact>
```

## Source & license

Vendored from upstream MIT-licensed
[`zarazhangrui/beautiful-html-templates`](https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/vellum).

The full upstream MIT license text — including the original copyright notice — ships in this skill at
[`LICENSE`](./LICENSE) and must be redistributed alongside any copy of `example.html`,
`template.json`, or any vendored `assets/` runtime. See `template.json` for the upstream metadata snapshot.
