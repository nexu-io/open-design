---
name: html-ppt-zhangzara-mat
en_name: "Write a Margin-Recovery Final Deck like a McKinsey Engagement Manager"
zh_name: "像麦肯锡项目经理一样写利润率修复终稿"
description: |
  A margin-recovery diagnosis for a regional grocery chain — the governing thought, the driver tree, the priorities, and the roadmap. Built as a decision-grade consulting deck for client sponsor, steering committee.
en_description: |
  A margin-recovery diagnosis for a regional grocery chain — the governing thought, the driver tree, the priorities, and the roadmap. Built as a decision-grade consulting deck for client sponsor, steering committee.
zh_description: |
  像麦肯锡项目经理一样写利润率修复终稿——一份可商业交付的咨询交付 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "consulting"
  - "consulting-final-deck"
  - "strategy"
  - "consulting-deliverable"
  - "client"
  - "decision-deck"
  - "commercial-slide-agent"
  - "html-ppt-zhangzara-mat"
triggers:
  - "consulting-final-deck"
  - "consulting"
  - "Write a Margin-Recovery Final Deck like a McKinsey Engagement Manager"
  - "像麦肯锡项目经理一样写利润率修复终稿"
  - "consulting-deliverable"
  - "strategy"
  - "client"
  - "html deck"
  - "html slides"
od:
  mode: deck
  upstream: "https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/mat"
  upstream_license: MIT
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
  speaker_notes: false
  animations: false
  category: "consulting"
  scenario: "strategy"
  example_prompt: "Create \"Write a Margin-Recovery Final Deck like a McKinsey Engagement Manager\" as a decision-grade Consulting deck in this template's own visual system. Subject: A margin-recovery diagnosis for a regional grocery chain — the governing thought, the driver tree, the priorities, and the roadmap. Audience: client sponsor, steering committee. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: would a client know what to do Monday morning."
---

# Mat

> Dark sage canvas with bone paper and burnt-orange accent; mid-century modern with wood undertones.

A single self-contained HTML deck — typography, palette, decorative system,
and slide vocabulary are all tuned together. Mixing layouts across templates
breaks the system; stay inside this one.

## At a glance

- **Scheme:** mixed
- **Formality:** medium
- **Density:** medium
- **Slides in demo:** 9

## Best for

Anything that should feel mid-century, tactile, and intentional: design studio credentials, architecture / interior brands, ceramics / craft / furniture, advisory decks. Also a warm, distinctive choice for tech, research, or business decks that want a considered analog feel instead of digital-cool.

## Avoid for

Contexts that need fast tech energy or institutional restraint — the muted sage and burnt-orange palette is intentionally warm and slow.

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
<artifact identifier="zhangzara-mat" type="text/html" title="Deck Title">
<!doctype html>
<html>...</html>
</artifact>
```

## Source & license

Vendored from upstream MIT-licensed
[`zarazhangrui/beautiful-html-templates`](https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/mat).

The full upstream MIT license text — including the original copyright notice — ships in this skill at
[`LICENSE`](./LICENSE) and must be redistributed alongside any copy of `example.html`,
`template.json`, or any vendored `assets/` runtime. See `template.json` for the upstream metadata snapshot.
