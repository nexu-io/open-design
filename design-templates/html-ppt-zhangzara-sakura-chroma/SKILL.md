---
name: html-ppt-zhangzara-sakura-chroma
en_name: "Turn a Cherry-Blossom Trip into a Photo Essay like a Travel Editorial Director"
zh_name: "像旅行内容总监一样把樱花之旅做成影像散文"
description: |
  A cherry-blossom-season travel photo essay through Kyoto — the arrival, the peak bloom, and the moment that made the trip. Built as a decision-grade story deck for friends, travel readers.
en_description: |
  A cherry-blossom-season travel photo essay through Kyoto — the arrival, the peak bloom, and the moment that made the trip. Built as a decision-grade story deck for friends, travel readers.
zh_description: |
  像旅行内容总监一样把樱花之旅做成影像散文——一份可商业交付的生活故事 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "life"
  - "travel-photo-essay-deck"
  - "personal"
  - "story"
  - "photo-essay"
  - "decision-deck"
  - "commercial-slide-agent"
  - "html-ppt-zhangzara-sakura-chroma"
triggers:
  - "travel-photo-essay-deck"
  - "life"
  - "Turn a Cherry-Blossom Trip into a Photo Essay like a Travel Editorial Director"
  - "像旅行内容总监一样把樱花之旅做成影像散文"
  - "story"
  - "personal"
  - "photo-essay"
  - "html deck"
  - "html slides"
od:
  mode: deck
  upstream: "https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/sakura-chroma"
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
  example_prompt: "Create \"Turn a Cherry-Blossom Trip into a Photo Essay like a Travel Editorial Director\" as a decision-grade Life & story deck in this template's own visual system. Subject: A cherry-blossom-season travel photo essay through Kyoto — the arrival, the peak bloom, and the moment that made the trip. Audience: friends, travel readers. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: would someone retell the story after seeing it once."
---

# Sakura Chroma

> Vintage Japanese cassette-package aesthetic: cream paper, diagonal rainbow ribbons, condensed bold type, JIS-style spec checkboxes.

A single self-contained HTML deck — typography, palette, decorative system,
and slide vocabulary are all tuned together. Mixing layouts across templates
breaks the system; stay inside this one.

## At a glance

- **Scheme:** light
- **Formality:** low
- **Density:** medium
- **Slides in demo:** 8

## Best for

Anything that should feel like a vintage Japanese cassette package or a TDK / Sony / Sakura Color product catalogue: indie hardware brand decks, music-label release schedules, analog studio retrospectives, zine and magazine pitches, kawaii-tech product launches, creative-studio annual reports. Equally good for any deck wanting bold colour, condensed display type, and a tactile printed-product personality.

## Avoid for

Decks that need restrained, corporate, or quiet typography — the bold condensed lockups, ribbon stripes, and primary-colour palette are intentionally loud and product-page-y.

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
<artifact identifier="zhangzara-sakura-chroma" type="text/html" title="Deck Title">
<!doctype html>
<html>...</html>
</artifact>
```

## Source & license

Vendored from upstream MIT-licensed
[`zarazhangrui/beautiful-html-templates`](https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/sakura-chroma).

The full upstream MIT license text — including the original copyright notice — ships in this skill at
[`LICENSE`](./LICENSE) and must be redistributed alongside any copy of `example.html`,
`template.json`, or any vendored `assets/` runtime. See `template.json` for the upstream metadata snapshot.
