---
name: html-ppt-zhangzara-stencil-tablet
en_name: "Present a Workplace-Safety Compliance Review like a Senior Regulator"
zh_name: "像资深监管者一样做工作场所安全合规评审"
description: |
  A workplace-safety compliance review for a manufacturing regulator — findings, the evidence chain, and the corrective mandate. Built as a decision-grade policy briefing deck for regulator, plant leadership.
en_description: |
  A workplace-safety compliance review for a manufacturing regulator — findings, the evidence chain, and the corrective mandate. Built as a decision-grade policy briefing deck for regulator, plant leadership.
zh_description: |
  像资深监管者一样做工作场所安全合规评审——一份可商业交付的政策简报 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "government-policy"
  - "policy-briefing-deck"
  - "policy"
  - "regulatory"
  - "risk-review"
  - "decision-deck"
  - "commercial-slide-agent"
  - "html-ppt-zhangzara-stencil-tablet"
triggers:
  - "policy-briefing-deck"
  - "government-policy"
  - "Present a Workplace-Safety Compliance Review like a Senior Regulator"
  - "像资深监管者一样做工作场所安全合规评审"
  - "policy"
  - "regulatory"
  - "risk-review"
  - "html deck"
  - "html slides"
od:
  mode: deck
  upstream: "https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/stencil-tablet"
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
  example_prompt: "Create \"Present a Workplace-Safety Compliance Review like a Senior Regulator\" as a decision-grade Government & policy deck in this template's own visual system. Subject: A workplace-safety compliance review for a manufacturing regulator — findings, the evidence chain, and the corrective mandate. Audience: regulator, plant leadership. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: does the deck reduce approval risk rather than create rhetorical heat."
---

# Stencil & Tablet

> Bone paper with stencil-cut headlines and a six-color earth palette: archaeology meets brand.

A single self-contained HTML deck — typography, palette, decorative system,
and slide vocabulary are all tuned together. Mixing layouts across templates
breaks the system; stay inside this one.

## At a glance

- **Scheme:** light
- **Formality:** medium-high
- **Density:** medium
- **Slides in demo:** 11

## Best for

Anything that should feel archival, tactile, and weighty-graphic: museum and cultural-institution decks, art / architecture brands, longform research, heritage and craft brands, manifestos. A great choice anytime — including across tech and business — when you want the deck to feel like a field manual rather than a slide deck.

## Avoid for

Contexts that demand digital-native polish or playful pop — the stencil-cut display and earth-tone palette commit to a deliberate analog feel.

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
<artifact identifier="zhangzara-stencil-tablet" type="text/html" title="Deck Title">
<!doctype html>
<html>...</html>
</artifact>
```

## Source & license

Vendored from upstream MIT-licensed
[`zarazhangrui/beautiful-html-templates`](https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/stencil-tablet).

The full upstream MIT license text — including the original copyright notice — ships in this skill at
[`LICENSE`](./LICENSE) and must be redistributed alongside any copy of `example.html`,
`template.json`, or any vendored `assets/` runtime. See `template.json` for the upstream metadata snapshot.
