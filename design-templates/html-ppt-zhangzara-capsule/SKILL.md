---
name: html-ppt-zhangzara-capsule
en_name: "Write a Year-End Self-Review like a Promotion-Committee Insider"
zh_name: "像晋升委员会内部人一样写年终述职"
description: |
  A year-end self-review for a product manager — the role, the outcomes, the learning, and the ask, all evidence-backed. Built as a decision-grade career deck for manager, review committee.
en_description: |
  A year-end self-review for a product manager — the role, the outcomes, the learning, and the ask, all evidence-backed. Built as a decision-grade career deck for manager, review committee.
zh_description: |
  像晋升委员会内部人一样写年终述职——一份可商业交付的职业发展 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "career"
  - "year-end-self-review-deck"
  - "personal"
  - "portfolio"
  - "promotion"
  - "self-review"
  - "decision-deck"
  - "commercial-slide-agent"
  - "html-ppt-zhangzara-capsule"
triggers:
  - "year-end-self-review-deck"
  - "career"
  - "Write a Year-End Self-Review like a Promotion-Committee Insider"
  - "像晋升委员会内部人一样写年终述职"
  - "portfolio"
  - "promotion"
  - "self-review"
  - "html deck"
  - "html slides"
od:
  mode: deck
  upstream: "https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/capsule"
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
  example_prompt: "Create \"Write a Year-End Self-Review like a Promotion-Committee Insider\" as a decision-grade Career deck in this template's own visual system. Subject: A year-end self-review for a product manager — the role, the outcomes, the learning, and the ask, all evidence-backed. Audience: manager, review committee. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: does the evidence make the claim feel earned."
---

# Capsule

> Modular pill-shaped cards on warm bone with a full pastel-pop palette.

A single self-contained HTML deck — typography, palette, decorative system,
and slide vocabulary are all tuned together. Mixing layouts across templates
breaks the system; stay inside this one.

## At a glance

- **Scheme:** light
- **Formality:** medium-low
- **Density:** medium
- **Slides in demo:** 10

## Best for

Anything that should feel modular, modern, and a little Y2K: lifestyle brands, creator portfolios, DTC launches, beauty / wellness, agency credentials. Also fun for a playful tech demo or a research deck that wants pop-art clarity instead of gravitas.

## Avoid for

Contexts that require traditional institutional weight — the capsule shapes and pastel pops actively soften authority.

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
<artifact identifier="zhangzara-capsule" type="text/html" title="Deck Title">
<!doctype html>
<html>...</html>
</artifact>
```

## Source & license

Vendored from upstream MIT-licensed
[`zarazhangrui/beautiful-html-templates`](https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/capsule).

The full upstream MIT license text — including the original copyright notice — ships in this skill at
[`LICENSE`](./LICENSE) and must be redistributed alongside any copy of `example.html`,
`template.json`, or any vendored `assets/` runtime. See `template.json` for the upstream metadata snapshot.
