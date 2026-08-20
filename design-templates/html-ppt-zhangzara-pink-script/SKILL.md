---
name: html-ppt-zhangzara-pink-script
en_name: "Turn an Anniversary into a Photo Essay like a Wedding Storyteller"
zh_name: "像婚礼讲述者一样把纪念日做成影像散文"
description: |
  A wedding-anniversary tribute photo essay — a decade in scenes, the turning points, and the quiet meaning of staying. Built as a decision-grade story deck for couple, family, friends.
en_description: |
  A wedding-anniversary tribute photo essay — a decade in scenes, the turning points, and the quiet meaning of staying. Built as a decision-grade story deck for couple, family, friends.
zh_description: |
  像婚礼讲述者一样把纪念日做成影像散文——一份可商业交付的生活故事 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "life"
  - "travel-photo-essay-deck"
  - "personal"
  - "story"
  - "photo-essay"
  - "decision-deck"
  - "commercial-slide-agent"
  - "html-ppt-zhangzara-pink-script"
triggers:
  - "travel-photo-essay-deck"
  - "life"
  - "Turn an Anniversary into a Photo Essay like a Wedding Storyteller"
  - "像婚礼讲述者一样把纪念日做成影像散文"
  - "story"
  - "personal"
  - "photo-essay"
  - "html deck"
  - "html slides"
od:
  mode: deck
  upstream: "https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/pink-script"
  upstream_license: MIT
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
  speaker_notes: false
  animations: false
  category: "life"
  scenario: "personal"
  example_prompt: "Create \"Turn an Anniversary into a Photo Essay like a Wedding Storyteller\" as a decision-grade Life & story deck in this template's own visual system. Subject: A wedding-anniversary tribute photo essay — a decade in scenes, the turning points, and the quiet meaning of staying. Audience: couple, family, friends. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: would someone retell the story after seeing it once."
---

# Pink Script — After Hours

> Black canvas, hot pink accent, pearl-cream paper, Instrument Serif headlines: late-night editorial luxury.

A single self-contained HTML deck — typography, palette, decorative system,
and slide vocabulary are all tuned together. Mixing layouts across templates
breaks the system; stay inside this one.

## At a glance

- **Scheme:** dark
- **Formality:** medium-high
- **Density:** low
- **Slides in demo:** 9

## Best for

Anything that should feel nocturnal, intentional, and a little luxe: fashion brand decks, creator personal brands, after-hours / nightlife / spirits launches, luxury product reveals, editorial features. Also a striking unexpected pick for a tech keynote, research synthesis, or business pitch that wants to land with magnetic confidence.

## Avoid for

Daytime corporate-professional and traditional B2B contexts where the dark canvas with hot-pink accent reads as too styled or too expressive.

## Workflow

1. **Clone `example.html` AND the `assets/` folder** into the user's workspace.
   This template ships an `assets/deck-stage.js` runtime (keyboard navigation,
   stage rendering); the HTML references it as `assets/deck-stage.js`, so the
   file must sit next to the cloned HTML or that path will 404 in the generated
   artifact and navigation will silently break. Inlining the JS into a single
   `<script>` block in the HTML is an acceptable alternative when a single
   self-contained file is preferred.
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
<artifact identifier="zhangzara-pink-script" type="text/html" title="Deck Title">
<!doctype html>
<html>...</html>
</artifact>
```

## Source & license

Vendored from upstream MIT-licensed
[`zarazhangrui/beautiful-html-templates`](https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/pink-script).

The full upstream MIT license text — including the original copyright notice — ships in this skill at
[`LICENSE`](./LICENSE) and must be redistributed alongside any copy of `example.html`,
`template.json`, or any vendored `assets/` runtime. See `template.json` for the upstream metadata snapshot.
