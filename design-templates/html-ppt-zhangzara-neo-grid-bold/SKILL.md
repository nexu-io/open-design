---
name: html-ppt-zhangzara-neo-grid-bold
en_name: "Build a Designer Portfolio Narrative like a Hiring Bar-Raiser"
zh_name: "像招聘 Bar Raiser 一样搭设计作品集叙事"
description: |
  A designer's portfolio narrative for a senior interview — three case studies, the craft, and the judgment behind each. Built as a decision-grade career deck for hiring panel.
en_description: |
  A designer's portfolio narrative for a senior interview — three case studies, the craft, and the judgment behind each. Built as a decision-grade career deck for hiring panel.
zh_description: |
  像招聘 Bar Raiser 一样搭设计作品集叙事——一份可商业交付的职业发展 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "career"
  - "year-end-self-review-deck"
  - "personal"
  - "portfolio"
  - "promotion"
  - "self-review"
  - "decision-deck"
  - "commercial-slide-agent"
  - "html-ppt-zhangzara-neo-grid-bold"
triggers:
  - "year-end-self-review-deck"
  - "career"
  - "Build a Designer Portfolio Narrative like a Hiring Bar-Raiser"
  - "像招聘 Bar Raiser 一样搭设计作品集叙事"
  - "portfolio"
  - "promotion"
  - "self-review"
  - "html deck"
  - "html slides"
od:
  mode: deck
  upstream: "https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/neo-grid-bold"
  upstream_license: MIT
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
  speaker_notes: false
  animations: false
  category: "career"
  scenario: "personal"
  example_prompt: "Create \"Build a Designer Portfolio Narrative like a Hiring Bar-Raiser\" as a decision-grade Career deck in this template's own visual system. Subject: A designer's portfolio narrative for a senior interview — three case studies, the craft, and the judgment behind each. Audience: hiring panel. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: does the evidence make the claim feel earned."
---

# Neo-Grid Bold

> Editorial neo-brutalism with a single neon yellow accent on off-white paper.

A single self-contained HTML deck — typography, palette, decorative system,
and slide vocabulary are all tuned together. Mixing layouts across templates
breaks the system; stay inside this one.

## At a glance

- **Scheme:** light
- **Formality:** medium
- **Density:** high
- **Slides in demo:** 12

## Best for

Anything that should feel confident and editorial-graphic: design-led pitches, brand work, founder talks, conference keynotes. Excellent for stat-heavy slides, comparisons, and process flows. Just as strong for tech, research, or finance when the speaker wants to read as design-led rather than corporate.

## Avoid for

Contexts that need to feel quiet, traditional, or warm — the neon-yellow accent and uppercase display commit to a confident editorial voice.

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
<artifact identifier="zhangzara-neo-grid-bold" type="text/html" title="Deck Title">
<!doctype html>
<html>...</html>
</artifact>
```

## Source & license

Vendored from upstream MIT-licensed
[`zarazhangrui/beautiful-html-templates`](https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/neo-grid-bold).

The full upstream MIT license text — including the original copyright notice — ships in this skill at
[`LICENSE`](./LICENSE) and must be redistributed alongside any copy of `example.html`,
`template.json`, or any vendored `assets/` runtime. See `template.json` for the upstream metadata snapshot.
