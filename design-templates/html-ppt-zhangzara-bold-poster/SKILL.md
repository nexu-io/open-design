---
name: html-ppt-zhangzara-bold-poster
en_name: "Write a Series A Growth Story like a Tier-1 VC Partner"
zh_name: "像一线 VC 合伙人一样写 A 轮增长叙事"
description: |
  Open Design's Series A growth story: the traction curve, the expansion motion, and why it's venture-scale. Built as a decision-grade fundraising pitch deck for Series A partners.
en_description: |
  Open Design's Series A growth story: the traction curve, the expansion motion, and why it's venture-scale. Built as a decision-grade fundraising pitch deck for Series A partners.
zh_description: |
  像一线 VC 合伙人一样写 A 轮增长叙事——一份可商业交付的融资路演 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "fundraising-pitch"
  - "series-a-pitch-deck"
  - "finance"
  - "pitch-deck"
  - "fundraising"
  - "investor-deck"
  - "decision-deck"
  - "commercial-slide-agent"
  - "html-ppt-zhangzara-bold-poster"
triggers:
  - "series-a-pitch-deck"
  - "fundraising-pitch"
  - "Write a Series A Growth Story like a Tier-1 VC Partner"
  - "像一线 VC 合伙人一样写 A 轮增长叙事"
  - "pitch-deck"
  - "fundraising"
  - "investor-deck"
  - "html deck"
  - "html slides"
od:
  mode: deck
  upstream: "https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/bold-poster"
  upstream_license: MIT
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
  speaker_notes: false
  animations: false
  category: "fundraising-pitch"
  scenario: "finance"
  example_prompt: "Create \"Write a Series A Growth Story like a Tier-1 VC Partner\" as a decision-grade Fundraising pitch deck in this template's own visual system. Subject: Open Design's Series A growth story: the traction curve, the expansion motion, and why it's venture-scale. Audience: Series A partners. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: would an investor know why this is venture-scale and urgent."
---

# Bold Poster

> Editorial poster aesthetic with massive Shrikhand display and a single fire-engine red accent.

A single self-contained HTML deck — typography, palette, decorative system,
and slide vocabulary are all tuned together. Mixing layouts across templates
breaks the system; stay inside this one.

## At a glance

- **Scheme:** light
- **Formality:** medium
- **Density:** low
- **Slides in demo:** 10

## Best for

Anything that should land like a magazine cover: brand manifestos, founder vision decks, editorial / cultural pitches, creative reviews. Excellent any time you want a few words to feel like a poster — including unexpected fits like a tech keynote or a finance manifesto that wants to be quotable.

## Avoid for

Decks that need to communicate dense information per slide — the layout is built around a few large statements, not paragraphs of detail.

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
<artifact identifier="zhangzara-bold-poster" type="text/html" title="Deck Title">
<!doctype html>
<html>...</html>
</artifact>
```

## Source & license

Vendored from upstream MIT-licensed
[`zarazhangrui/beautiful-html-templates`](https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/bold-poster).

The full upstream MIT license text — including the original copyright notice — ships in this skill at
[`LICENSE`](./LICENSE) and must be redistributed alongside any copy of `example.html`,
`template.json`, or any vendored `assets/` runtime. See `template.json` for the upstream metadata snapshot.
