---
name: html-ppt-zhangzara-block-frame
en_name: "Rescue a Messy Deck to Board-Grade like an Executive Design Director"
zh_name: "像高管级设计总监一样把混乱 Deck 救到董事会级"
description: |
  Rescuing a messy startup deck into a board-grade system — the diagnosis, the page grammar, and the rebuilt proof pages. Built as a decision-grade design craft deck for founders, exec presenter.
en_description: |
  Rescuing a messy startup deck into a board-grade system — the diagnosis, the page grammar, and the rebuilt proof pages. Built as a decision-grade design craft deck for founders, exec presenter.
zh_description: |
  像高管级设计总监一样把混乱 Deck 救到董事会级——一份可商业交付的设计打磨 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "design-craft"
  - "board-upgrade-deck-rescue"
  - "design"
  - "brand"
  - "visual-system"
  - "decision-deck"
  - "commercial-slide-agent"
  - "html-ppt-zhangzara-block-frame"
triggers:
  - "board-upgrade-deck-rescue"
  - "design-craft"
  - "Rescue a Messy Deck to Board-Grade like an Executive Design Director"
  - "像高管级设计总监一样把混乱 Deck 救到董事会级"
  - "design"
  - "brand"
  - "visual-system"
  - "html deck"
  - "html slides"
od:
  mode: deck
  upstream: "https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/block-frame"
  upstream_license: MIT
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
  speaker_notes: false
  animations: false
  category: "design-craft"
  scenario: "design"
  example_prompt: "Create \"Rescue a Messy Deck to Board-Grade like an Executive Design Director\" as a decision-grade Design craft deck in this template's own visual system. Subject: Rescuing a messy startup deck into a board-grade system — the diagnosis, the page grammar, and the rebuilt proof pages. Audience: founders, exec presenter. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: does the deck feel authored by a senior designer rather than generated."
---

# BlockFrame

> Neobrutalist deck with pastel-neon color blocks and chunky black borders.

A single self-contained HTML deck — typography, palette, decorative system,
and slide vocabulary are all tuned together. Mixing layouts across templates
breaks the system; stay inside this one.

## At a glance

- **Scheme:** light
- **Formality:** medium-low
- **Density:** high
- **Slides in demo:** 10

## Best for

Anything that should feel pop-graphic and design-led: indie SaaS launches, agency credentials, creative reviews, brand redesigns. Also a strong unexpected pick for tech, finance, or research when the speaker wants to land as confident and contemporary rather than buttoned-up.

## Avoid for

Contexts that require quiet institutional restraint or traditional weight (regulated disclosures, formal legal briefs).

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
<artifact identifier="zhangzara-block-frame" type="text/html" title="Deck Title">
<!doctype html>
<html>...</html>
</artifact>
```

## Source & license

Vendored from upstream MIT-licensed
[`zarazhangrui/beautiful-html-templates`](https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/block-frame).

The full upstream MIT license text — including the original copyright notice — ships in this skill at
[`LICENSE`](./LICENSE) and must be redistributed alongside any copy of `example.html`,
`template.json`, or any vendored `assets/` runtime. See `template.json` for the upstream metadata snapshot.
