---
name: html-ppt-zhangzara-cobalt-grid
en_name: "Write a Renewal & Expansion Business Case like an Account Director"
zh_name: "像客户总监一样写续约与扩容论证"
description: |
  Open Design renewal + seat-expansion business case for a growing customer: realized value, usage proof, and the expansion ROI. Built as a decision-grade B2B sales deck for champion, finance approver.
en_description: |
  Open Design renewal + seat-expansion business case for a growing customer: realized value, usage proof, and the expansion ROI. Built as a decision-grade B2B sales deck for champion, finance approver.
zh_description: |
  像客户总监一样写续约与扩容论证——一份可商业交付的B2B 销售 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "b2b-sales"
  - "b2b-saas-sales-proposal"
  - "sales"
  - "renewal"
  - "customer"
  - "decision-deck"
  - "commercial-slide-agent"
  - "html-ppt-zhangzara-cobalt-grid"
triggers:
  - "b2b-saas-sales-proposal"
  - "b2b-sales"
  - "Write a Renewal & Expansion Business Case like an Account Director"
  - "像客户总监一样写续约与扩容论证"
  - "sales"
  - "renewal"
  - "customer"
  - "html deck"
  - "html slides"
od:
  mode: deck
  upstream: "https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/cobalt-grid"
  upstream_license: MIT
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
  speaker_notes: false
  animations: false
  category: "b2b-sales"
  scenario: "sales"
  example_prompt: "Create \"Write a Renewal & Expansion Business Case like an Account Director\" as a decision-grade B2B sales deck in this template's own visual system. Subject: Open Design renewal + seat-expansion business case for a growing customer: realized value, usage proof, and the expansion ROI. Audience: champion, finance approver. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: can the champion forward this internally without rewriting it."
---

# Cobalt Grid

> Electric cobalt italic serifs on a graph-paper canvas, anchored by stair-stepped pixel-glitch decorations and slim hairline rules.

A single self-contained HTML deck — typography, palette, decorative system,
and slide vocabulary are all tuned together. Mixing layouts across templates
breaks the system; stay inside this one.

## At a glance

- **Scheme:** light
- **Formality:** high
- **Density:** medium
- **Slides in demo:** 8

## Best for

Anything that should feel like a quietly serious design / research bulletin, art publication, or curated trend report. Strong for studio annuals, agency capabilities decks, design-research publications, architecture / art / academic decks, and any deck wanting one strict accent colour and a printed-ledger calmness rather than corporate polish.

## Avoid for

Decks that need warmth, multi-colour energy, or a casual / playful voice — the strict cobalt + cream + grid palette is intentionally austere.

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
<artifact identifier="zhangzara-cobalt-grid" type="text/html" title="Deck Title">
<!doctype html>
<html>...</html>
</artifact>
```

## Source & license

Vendored from upstream MIT-licensed
[`zarazhangrui/beautiful-html-templates`](https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/cobalt-grid).

The full upstream MIT license text — including the original copyright notice — ships in this skill at
[`LICENSE`](./LICENSE) and must be redistributed alongside any copy of `example.html`,
`template.json`, or any vendored `assets/` runtime. See `template.json` for the upstream metadata snapshot.
