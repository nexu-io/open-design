---
name: html-ppt-zhangzara-coral
en_name: "Plan a Community-Growth Campaign like a Head of Growth"
zh_name: "像增长负责人一样规划社区增长战役"
description: |
  Open Design's community-growth campaign across GitHub, Discord, and X: the loops, the content calendar, and the pipeline math. Built as a decision-grade marketing & GTM deck for growth team, community lead.
en_description: |
  Open Design's community-growth campaign across GitHub, Discord, and X: the loops, the content calendar, and the pipeline math. Built as a decision-grade marketing & GTM deck for growth team, community lead.
zh_description: |
  像增长负责人一样规划社区增长战役——一份可商业交付的市场增长 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "marketing-gtm"
  - "annual-marketing-plan"
  - "marketing"
  - "launch"
  - "campaign"
  - "pipeline"
  - "decision-deck"
  - "commercial-slide-agent"
  - "html-ppt-zhangzara-coral"
triggers:
  - "annual-marketing-plan"
  - "marketing-gtm"
  - "Plan a Community-Growth Campaign like a Head of Growth"
  - "像增长负责人一样规划社区增长战役"
  - "launch"
  - "campaign"
  - "pipeline"
  - "html deck"
  - "html slides"
od:
  mode: deck
  upstream: "https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/coral"
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
  example_prompt: "Create \"Plan a Community-Growth Campaign like a Head of Growth\" as a decision-grade Marketing & GTM deck in this template's own visual system. Subject: Open Design's community-growth campaign across GitHub, Discord, and X: the loops, the content calendar, and the pipeline math. Audience: growth team, community lead. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: can the plan connect creative choices to measurable growth."
---

# Coral

> Cream and coral on near-black, set in oversized Bebas Neue.

A single self-contained HTML deck — typography, palette, decorative system,
and slide vocabulary are all tuned together. Mixing layouts across templates
breaks the system; stay inside this one.

## At a glance

- **Scheme:** mixed
- **Formality:** medium
- **Density:** medium
- **Slides in demo:** 10

## Best for

Anything that should feel warm-graphic and editorial: fashion, beauty, fitness, F&B, lifestyle brands, agency credentials. Just as strong for a creator portfolio, a manifesto, or a tech / research deck that wants warmth and a single bold accent instead of corporate cool.

## Avoid for

Contexts that should feel quiet or institutional — the coral accent and oversized Bebas Neue commit hard to a confident magazine voice.

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
<artifact identifier="zhangzara-coral" type="text/html" title="Deck Title">
<!doctype html>
<html>...</html>
</artifact>
```

## Source & license

Vendored from upstream MIT-licensed
[`zarazhangrui/beautiful-html-templates`](https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/coral).

The full upstream MIT license text — including the original copyright notice — ships in this skill at
[`LICENSE`](./LICENSE) and must be redistributed alongside any copy of `example.html`,
`template.json`, or any vendored `assets/` runtime. See `template.json` for the upstream metadata snapshot.
