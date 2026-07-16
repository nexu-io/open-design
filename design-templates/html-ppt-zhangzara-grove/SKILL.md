---
name: html-ppt-zhangzara-grove
en_name: "Write an Urban Green-Space Policy Brief like a City Sustainability Director"
zh_name: "像城市可持续总监一样写城市绿地政策简报"
description: |
  A municipal urban-tree-canopy policy proposal — the public need, the evidence, the options, and the funding decision. Built as a decision-grade policy briefing deck for city council, agency reviewers.
en_description: |
  A municipal urban-tree-canopy policy proposal — the public need, the evidence, the options, and the funding decision. Built as a decision-grade policy briefing deck for city council, agency reviewers.
zh_description: |
  像城市可持续总监一样写城市绿地政策简报——一份可商业交付的政策简报 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "government-policy"
  - "policy-briefing-deck"
  - "policy"
  - "regulatory"
  - "risk-review"
  - "decision-deck"
  - "commercial-slide-agent"
  - "html-ppt-zhangzara-grove"
triggers:
  - "policy-briefing-deck"
  - "government-policy"
  - "Write an Urban Green-Space Policy Brief like a City Sustainability Director"
  - "像城市可持续总监一样写城市绿地政策简报"
  - "policy"
  - "regulatory"
  - "risk-review"
  - "html deck"
  - "html slides"
od:
  mode: deck
  upstream: "https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/grove"
  upstream_license: MIT
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
  speaker_notes: false
  animations: false
  category: "government-policy"
  scenario: "policy"
  example_prompt: "Create \"Write an Urban Green-Space Policy Brief like a City Sustainability Director\" as a decision-grade Government & policy deck in this template's own visual system. Subject: A municipal urban-tree-canopy policy proposal — the public need, the evidence, the options, and the funding decision. Audience: city council, agency reviewers. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: does the deck reduce approval risk rather than create rhetorical heat."
---

# Grove

> Forest-green canvas with cream type, classical Playfair serifs, and a single rust accent.

A single self-contained HTML deck — typography, palette, decorative system,
and slide vocabulary are all tuned together. Mixing layouts across templates
breaks the system; stay inside this one.

## At a glance

- **Scheme:** mixed
- **Formality:** medium-high
- **Density:** medium
- **Slides in demo:** 12

## Best for

Anything that should feel organic, considered, and grown-up: sustainability and wellness brands, outdoor / nature products, wineries and restaurants, literary or arts decks, advisory deliverables, bilingual EN/CN reports. Also a calm, distinctive choice for tech, research, or business decks that want patience over urgency.

## Avoid for

Decks that need neon energy or rapid-fire pop — the forest-green canvas and Playfair serif commit to a slow, classical voice.

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
<artifact identifier="zhangzara-grove" type="text/html" title="Deck Title">
<!doctype html>
<html>...</html>
</artifact>
```

## Source & license

Vendored from upstream MIT-licensed
[`zarazhangrui/beautiful-html-templates`](https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/grove).

The full upstream MIT license text — including the original copyright notice — ships in this skill at
[`LICENSE`](./LICENSE) and must be redistributed alongside any copy of `example.html`,
`template.json`, or any vendored `assets/` runtime. See `template.json` for the upstream metadata snapshot.
