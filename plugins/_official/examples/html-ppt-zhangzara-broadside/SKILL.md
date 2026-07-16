---
name: html-ppt-zhangzara-broadside
en_name: "Write a Product-Launch Announcement like a PR & Comms Director"
zh_name: "像公关传播总监一样写产品发布公告"
description: |
  Open Design's product-launch announcement and press narrative — the headline, the proof points, and the call to action. Built as a decision-grade marketing & GTM deck for press, community, prospects.
en_description: |
  Open Design's product-launch announcement and press narrative — the headline, the proof points, and the call to action. Built as a decision-grade marketing & GTM deck for press, community, prospects.
zh_description: |
  像公关传播总监一样写产品发布公告——一份可商业交付的市场增长 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "marketing-gtm"
  - "annual-marketing-plan"
  - "marketing"
  - "launch"
  - "campaign"
  - "pipeline"
  - "decision-deck"
  - "commercial-slide-agent"
  - "html-ppt-zhangzara-broadside"
triggers:
  - "annual-marketing-plan"
  - "marketing-gtm"
  - "Write a Product-Launch Announcement like a PR & Comms Director"
  - "像公关传播总监一样写产品发布公告"
  - "launch"
  - "campaign"
  - "pipeline"
  - "html deck"
  - "html slides"
od:
  mode: deck
  upstream: "https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/broadside"
  upstream_license: MIT
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
  speaker_notes: false
  animations: false
  category: "marketing-gtm"
  scenario: "marketing"
  example_prompt: "Create \"Write a Product-Launch Announcement like a PR & Comms Director\" as a decision-grade Marketing & GTM deck in this template's own visual system. Subject: Open Design's product-launch announcement and press narrative — the headline, the proof points, and the call to action. Audience: press, community, prospects. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: can the plan connect creative choices to measurable growth."
---

# Broadside

> Dark editorial canvas with a single fire orange accent and bilingual Latin/Chinese type stack.

A single self-contained HTML deck — typography, palette, decorative system,
and slide vocabulary are all tuned together. Mixing layouts across templates
breaks the system; stay inside this one.

## At a glance

- **Scheme:** dark
- **Formality:** medium-high
- **Density:** medium
- **Slides in demo:** 16

## Best for

Anything that should land like a broadside newspaper headline: brand manifestos, magazine and cultural pitches, design talks, bilingual EN/CN decks, founder vision statements. Also a striking pick for tech, research, or business decks that want a dramatic single-accent editorial feel.

## Avoid for

Decks that need to feel quiet, warm, or institutionally traditional — the dark canvas with fire-orange accent commits to drama.

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
<artifact identifier="zhangzara-broadside" type="text/html" title="Deck Title">
<!doctype html>
<html>...</html>
</artifact>
```

## Source & license

Vendored from upstream MIT-licensed
[`zarazhangrui/beautiful-html-templates`](https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/broadside).

The full upstream MIT license text — including the original copyright notice — ships in this skill at
[`LICENSE`](./LICENSE) and must be redistributed alongside any copy of `example.html`,
`template.json`, or any vendored `assets/` runtime. See `template.json` for the upstream metadata snapshot.
