---
name: html-ppt-zhangzara-pin-and-paper
description: |
  Pin & Paper — Yellow paper with safety-pin illustrations, ink-blue handwritten Caveat, paper-grain texture. Anything that should feel hand-crafted, warm, and literary: qualitative research findings, founder reflections, longform brand stories, workshop debriefs.
triggers:
  - "pin-and-paper"
  - "zhangzara-pin-and-paper"
  - "Pin & Paper"
  - "crafted"
  - "handmade"
  - "literary"
  - "intimate"
  - "research findings with personality"
  - "qualitative report"
  - "html deck"
  - "html slides"
  - "zhangzara"
od:
  mode: deck
  scenario: marketing
  upstream: "https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/pin-and-paper"
  upstream_license: MIT
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
  speaker_notes: false
  animations: false
---

# Pin & Paper

> Yellow paper with safety-pin illustrations, ink-blue handwritten Caveat, paper-grain texture.

A single self-contained HTML deck — typography, palette, decorative system,
and slide vocabulary are all tuned together. Mixing layouts across templates
breaks the system; stay inside this one.

## At a glance

- **Scheme:** light
- **Formality:** medium
- **Density:** medium
- **Slides in demo:** 11

## Best for

Anything that should feel hand-crafted, warm, and literary: qualitative research findings, founder reflections, longform brand stories, workshop debriefs. The signature safety-pin illustrations and paper-grain texture make it especially good for any deck — including tech or business — that wants personality and warmth over polish.

## Avoid for

Decks that need to feel digital-native polished or rigorously data-driven — handwritten Caveat is intentionally informal.

## Workflow

1. **Clone `example.html` AND the `assets/` folder** into the user's workspace.
   This template ships an `assets/deck-stage.js` runtime (keyboard navigation,
   stage rendering) and an `assets/styles.css` stylesheet. The HTML references
   them as `assets/deck-stage.js` and `assets/styles.css`, so both must sit next
   to the cloned HTML or those paths will 404 in the generated artifact and
   navigation/styling will silently break. Inlining the JS/CSS into a single
   `<script>`/`<style>` block in the HTML is an acceptable alternative when a
   single self-contained file is preferred.
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
<artifact identifier="zhangzara-pin-and-paper" type="text/html" title="Deck Title">
<!doctype html>
<html>...</html>
</artifact>
```

## Source & license

Vendored from upstream MIT-licensed
[`zarazhangrui/beautiful-html-templates`](https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/pin-and-paper).

The full upstream MIT license text — including the original copyright notice — ships in this skill at
[`LICENSE`](./LICENSE) and must be redistributed alongside any copy of `example.html`,
`template.json`, or any vendored `assets/` runtime. See `template.json` for the upstream metadata snapshot.
