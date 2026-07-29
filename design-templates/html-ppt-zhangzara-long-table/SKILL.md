---
name: html-ppt-zhangzara-long-table
en_name: "Present a Unit-Economics Model like an FP&A Partner"
zh_name: "像 FP&A 伙伴一样讲清单位经济模型"
description: |
  Open Design's unit-economics and BYOK cost model: the assumptions, the sensitivity, and why it scales. Built as a decision-grade data & finance deck for CFO, investors.
en_description: |
  Open Design's unit-economics and BYOK cost model: the assumptions, the sensitivity, and why it scales. Built as a decision-grade data & finance deck for CFO, investors.
zh_description: |
  像 FP&A 伙伴一样讲清单位经济模型——一份可商业交付的数据财务 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "data-finance"
  - "product-analytics-deck"
  - "finance"
  - "kpi"
  - "metrics"
  - "decision-deck"
  - "commercial-slide-agent"
  - "html-ppt-zhangzara-long-table"
triggers:
  - "product-analytics-deck"
  - "data-finance"
  - "Present a Unit-Economics Model like an FP&A Partner"
  - "像 FP&A 伙伴一样讲清单位经济模型"
  - "kpi"
  - "finance"
  - "metrics"
  - "html deck"
  - "html slides"
od:
  mode: deck
  upstream: "https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/long-table"
  upstream_license: MIT
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
  speaker_notes: false
  animations: false
  category: "data-finance"
  scenario: "finance"
  example_prompt: "Create \"Present a Unit-Economics Model like an FP&A Partner\" as a decision-grade Data, KPI & finance deck in this template's own visual system. Subject: Open Design's unit-economics and BYOK cost model: the assumptions, the sensitivity, and why it scales. Audience: CFO, investors. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: does every chart have a decision above it."
---

# Long Table

> Warm cream and rust-red supper-club aesthetic with bold uppercase grotesk headlines, italic Fraunces, and pill-shaped outlined buttons.

A single self-contained HTML deck — typography, palette, decorative system,
and slide vocabulary are all tuned together. Mixing layouts across templates
breaks the system; stay inside this one.

## At a glance

- **Scheme:** light
- **Formality:** medium
- **Density:** medium
- **Slides in demo:** 8

## Best for

Anything that should feel like a warm, intimate, modern hospitality / community brand: supper clubs, dinner series, small restaurants, creative-studio events, membership pitches, lifestyle and wine brands. Equally good for any deck wanting a single warm accent colour, italic-meets-bold typography, and a social-media-aware modern-editorial voice.

## Avoid for

Decks that need corporate polish, technical density, or a cold / minimalist register — the rust-red palette and bold-italic mix are intentionally warm and people-facing.

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
<artifact identifier="zhangzara-long-table" type="text/html" title="Deck Title">
<!doctype html>
<html>...</html>
</artifact>
```

## Source & license

Vendored from upstream MIT-licensed
[`zarazhangrui/beautiful-html-templates`](https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/long-table).

The full upstream MIT license text — including the original copyright notice — ships in this skill at
[`LICENSE`](./LICENSE) and must be redistributed alongside any copy of `example.html`,
`template.json`, or any vendored `assets/` runtime. See `template.json` for the upstream metadata snapshot.
