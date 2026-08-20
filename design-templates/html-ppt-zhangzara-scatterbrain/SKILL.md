---
name: html-ppt-zhangzara-scatterbrain
en_name: "Pitch a Graduation Design Project like a Portfolio-Ready Design Student"
zh_name: "像作品集出众的设计学生一样讲毕业设计"
description: |
  A design-school graduation project: a civic wayfinding system for a transit hub — the brief, the process, and the outcome. Built as a decision-grade coursework defense deck for crit panel, faculty.
en_description: |
  A design-school graduation project: a civic wayfinding system for a transit hub — the brief, the process, and the outcome. Built as a decision-grade coursework defense deck for crit panel, faculty.
zh_description: |
  像作品集出众的设计学生一样讲毕业设计——一份可商业交付的课业答辩 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "student-coursework"
  - "senior-capstone-defense-deck"
  - "education"
  - "coursework"
  - "defense"
  - "academic"
  - "decision-deck"
  - "commercial-slide-agent"
  - "html-ppt-zhangzara-scatterbrain"
triggers:
  - "senior-capstone-defense-deck"
  - "student-coursework"
  - "Pitch a Graduation Design Project like a Portfolio-Ready Design Student"
  - "像作品集出众的设计学生一样讲毕业设计"
  - "coursework"
  - "defense"
  - "academic"
  - "html deck"
  - "html slides"
od:
  mode: deck
  upstream: "https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/scatterbrain"
  upstream_license: MIT
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
  speaker_notes: false
  animations: false
  category: "student-coursework"
  scenario: "education"
  example_prompt: "Create \"Pitch a Graduation Design Project like a Portfolio-Ready Design Student\" as a decision-grade Student coursework deck in this template's own visual system. Subject: A design-school graduation project: a civic wayfinding system for a transit hub — the brief, the process, and the outcome. Audience: crit panel, faculty. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: can a reviewer find the contribution, evidence, and limitation in under 90 seconds."
---

# Scatterbrain

> Post-it inspired: pastel sticky notes, Caveat handwriting, Shrikhand and Zilla Slab type stack.

A single self-contained HTML deck — typography, palette, decorative system,
and slide vocabulary are all tuned together. Mixing layouts across templates
breaks the system; stay inside this one.

## At a glance

- **Scheme:** light
- **Formality:** low
- **Density:** high
- **Slides in demo:** 10

## Best for

Anything that should feel like a designer's whiteboard: brainstorms, workshops, creative-agency credentials, design-thinking sessions, ideation pitches, art-direction reviews. Equally fun for any deck — including tech, research, or business — that wants to read as in-progress thinking rather than polished conclusions.

## Avoid for

Contexts that demand precision and institutional weight — the post-it sticky-note aesthetic intentionally reads as warm and unfinished.

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
<artifact identifier="zhangzara-scatterbrain" type="text/html" title="Deck Title">
<!doctype html>
<html>...</html>
</artifact>
```

## Source & license

Vendored from upstream MIT-licensed
[`zarazhangrui/beautiful-html-templates`](https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/scatterbrain).

The full upstream MIT license text — including the original copyright notice — ships in this skill at
[`LICENSE`](./LICENSE) and must be redistributed alongside any copy of `example.html`,
`template.json`, or any vendored `assets/` runtime. See `template.json` for the upstream metadata snapshot.
