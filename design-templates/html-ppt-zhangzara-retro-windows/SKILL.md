---
name: html-ppt-zhangzara-retro-windows
en_name: "Deliver a Security-Awareness Training like a CISO Enablement Team"
zh_name: "像 CISO 赋能团队一样做安全意识培训"
description: |
  An IT security-awareness training on spotting phishing — the tells, the drill, and what to do in the first 60 seconds. Built as a decision-grade professional training deck for all employees.
en_description: |
  An IT security-awareness training on spotting phishing — the tells, the drill, and what to do in the first 60 seconds. Built as a decision-grade professional training deck for all employees.
zh_description: |
  像 CISO 赋能团队一样做安全意识培训——一份可商业交付的培训交付 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "professional-training"
  - "employee-onboarding-deck"
  - "education"
  - "training-deck"
  - "workshop"
  - "course-module"
  - "decision-deck"
  - "commercial-slide-agent"
  - "html-ppt-zhangzara-retro-windows"
triggers:
  - "employee-onboarding-deck"
  - "professional-training"
  - "Deliver a Security-Awareness Training like a CISO Enablement Team"
  - "像 CISO 赋能团队一样做安全意识培训"
  - "training-deck"
  - "workshop"
  - "course-module"
  - "html deck"
  - "html slides"
od:
  mode: deck
  upstream: "https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/retro-windows"
  upstream_license: MIT
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
  speaker_notes: false
  animations: false
  category: "professional-training"
  scenario: "education"
  example_prompt: "Create \"Deliver a Security-Awareness Training like a CISO Enablement Team\" as a decision-grade Professional training deck in this template's own visual system. Subject: An IT security-awareness training on spotting phishing — the tells, the drill, and what to do in the first 60 seconds. Audience: all employees. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: can a learner perform the target task the next day."
---

# Retro Windows

> Windows 95 chrome: gray title bars, MS Sans Serif, pixel typography, full nostalgia.

A single self-contained HTML deck — typography, palette, decorative system,
and slide vocabulary are all tuned together. Mixing layouts across templates
breaks the system; stay inside this one.

## At a glance

- **Scheme:** light
- **Formality:** low
- **Density:** medium
- **Slides in demo:** 10

## Best for

Anything that should feel knowingly nostalgic: retro gaming, Y2K-aesthetic brands, creator portfolios with a 90s vibe, tech-history talks, deliberately tongue-in-cheek decks. A great choice anywhere a playful retro reference is the entire point.

## Avoid for

Decks that need to read as modern, elegant, or institutionally credible — the Win95 chrome will always read as a costume.

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
<artifact identifier="zhangzara-retro-windows" type="text/html" title="Deck Title">
<!doctype html>
<html>...</html>
</artifact>
```

## Source & license

Vendored from upstream MIT-licensed
[`zarazhangrui/beautiful-html-templates`](https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/retro-windows).

The full upstream MIT license text — including the original copyright notice — ships in this skill at
[`LICENSE`](./LICENSE) and must be redistributed alongside any copy of `example.html`,
`template.json`, or any vendored `assets/` runtime. See `template.json` for the upstream metadata snapshot.
