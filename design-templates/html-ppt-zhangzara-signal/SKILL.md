---
name: html-ppt-zhangzara-signal
en_name: "Write a Strategy Decision Memo like a Corp-Dev Lead"
zh_name: "像战略发展负责人一样写战略决策备忘"
description: |
  Open Design's strategy memo: should it monetize the plugin registry now or hold — options, risks, and the recommendation. Built as a decision-grade corporate strategy deck for CEO, strategy team.
en_description: |
  Open Design's strategy memo: should it monetize the plugin registry now or hold — options, risks, and the recommendation. Built as a decision-grade corporate strategy deck for CEO, strategy team.
zh_description: |
  像战略发展负责人一样写战略决策备忘——一份可商业交付的企业战略 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "corporate-strategy"
  - "board-pre-read-deck"
  - "strategy"
  - "board"
  - "business-review"
  - "decision-deck"
  - "commercial-slide-agent"
  - "html-ppt-zhangzara-signal"
triggers:
  - "board-pre-read-deck"
  - "corporate-strategy"
  - "Write a Strategy Decision Memo like a Corp-Dev Lead"
  - "像战略发展负责人一样写战略决策备忘"
  - "board"
  - "strategy"
  - "business-review"
  - "html deck"
  - "html slides"
od:
  mode: deck
  upstream: "https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/signal"
  upstream_license: MIT
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
  speaker_notes: false
  animations: false
  category: "corporate-strategy"
  scenario: "strategy"
  example_prompt: "Create \"Write a Strategy Decision Memo like a Corp-Dev Lead\" as a decision-grade Corporate strategy deck in this template's own visual system. Subject: Open Design's strategy memo: should it monetize the plugin registry now or hold — options, risks, and the recommendation. Audience: CEO, strategy team. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: would a board member know what to approve and why before page five."
---

# Signal

> Deep navy canvas with bone paper and a single muted-gold accent; institutional with quiet weight.

A single self-contained HTML deck — typography, palette, decorative system,
and slide vocabulary are all tuned together. Mixing layouts across templates
breaks the system; stay inside this one.

## At a glance

- **Scheme:** mixed
- **Formality:** high
- **Density:** high
- **Slides in demo:** 18

## Best for

Anything that should feel weighty, considered, and credibly institutional: investor decks, board presentations, consulting deliverables, legal / policy briefs, advisory pitches. Also a strong choice for tech, research, or brand work that wants to read as quietly authoritative rather than loud.

## Avoid for

Contexts that should feel hot, fast, or intentionally playful — the navy + gold restraint commits to a sober voice.

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
<artifact identifier="zhangzara-signal" type="text/html" title="Deck Title">
<!doctype html>
<html>...</html>
</artifact>
```

## Source & license

Vendored from upstream MIT-licensed
[`zarazhangrui/beautiful-html-templates`](https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/signal).

The full upstream MIT license text — including the original copyright notice — ships in this skill at
[`LICENSE`](./LICENSE) and must be redistributed alongside any copy of `example.html`,
`template.json`, or any vendored `assets/` runtime. See `template.json` for the upstream metadata snapshot.
