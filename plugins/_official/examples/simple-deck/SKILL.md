---
name: simple-deck
en_name: "Write an Operating Review like a Disciplined COO"
zh_name: "像克制的 COO 一样写经营复盘"
description: |
  Open Design's operating review: growth, burn, and the concrete path to sustainability without losing the open ethos. Built as a decision-grade corporate strategy deck for leadership team.
en_description: |
  Open Design's operating review: growth, burn, and the concrete path to sustainability without losing the open ethos. Built as a decision-grade corporate strategy deck for leadership team.
zh_description: |
  像克制的 COO 一样写经营复盘——一份可商业交付的企业战略 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "corporate-strategy"
  - "board-pre-read-deck"
  - "strategy"
  - "board"
  - "business-review"
  - "decision-deck"
  - "commercial-slide-agent"
  - "simple-deck"
triggers:
  - "board-pre-read-deck"
  - "corporate-strategy"
  - "Write an Operating Review like a Disciplined COO"
  - "像克制的 COO 一样写经营复盘"
  - "board"
  - "strategy"
  - "business-review"
  - "html deck"
  - "html slides"
od:
  mode: deck
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  category: "corporate-strategy"
  scenario: "strategy"
  example_prompt: "Create \"Write an Operating Review like a Disciplined COO\" as a decision-grade Corporate strategy deck in this template's own visual system. Subject: Open Design's operating review: growth, burn, and the concrete path to sustainability without losing the open ethos. Audience: leadership team. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: would a board member know what to approve and why before page five."
---

# Simple Deck Skill

Produce a single-file horizontal-swipe HTML deck using the seed and layout library.

## Resource map

```
simple-deck/
├── SKILL.md                ← you're reading this
├── assets/
│   └── template.html       ← seed: tokens + slide primitives + proven chrome-free navigation runtime (READ FIRST)
└── references/
    ├── layouts.md          ← 8 paste-ready slide layouts + surface-hierarchy rules
    └── checklist.md        ← P0/P1/P2 self-review (surface spot-check at bottom)
```

## Workflow

### Step 0 — Pre-flight

1. **Read `assets/template.html`** end-to-end through the `<style>` block AND the `<script>` block. The script solves five iframe-specific bugs (real scroller detection, dual capture-phase listeners, auto-focus, no `scrollIntoView`, position persistence) — do not rewrite it.
2. **Read `references/layouts.md`** so you know the 8 layouts. Pay special attention to "Surface hierarchy" — it keeps background changes tied to the story.
3. **Read the active DESIGN.md** — map its tokens to the six `:root` variables in the seed.

### Step 1 — Copy the seed

Copy `assets/template.html` to the project root as `index.html`. Replace the six `:root` variables with the active design system's tokens. Replace the page `<title>`.

### Step 2 — Decide slide count + surface hierarchy BEFORE writing any slide

Default: 6 slides unless the brief says otherwise.

| Audience / format | Slides |
|---|---|
| Product overview / lightning talk (5–10 min) | 6 |
| Pitch deck (15 min) | 8–10 |
| Investor update / longer talk (20–30 min) | 12–18 |

Then choose a dominant surface and write each inverse slide's narrative role before any HTML — for example, 8 slides:

```
01  hero light center  Cover                 dominant
02  light              Problem               dominant
03  light              Why now               dominant
04  hero dark center   Solution reveal       inverse: new act
05  dark               Product workflow      inverse: same act
06  light              Evidence              dominant
07  light              Business model        dominant
08  hero dark center   Ask                    inverse: closing
```

A healthy sequence has:
- One dominant surface chosen from the active brand or direction, unless the user or active DESIGN.md explicitly requires another surface program
- Every inverse slide assigned a named narrative role
- Consecutive same-surface slides when they belong to the same act
- A single surface when the brief does not justify an inversion

Show this surface sketch to the user *before* writing slide HTML — they can redirect cheaply.

### Step 3 — Paste and fill

For each planned slide, copy the matching `<section>` from `layouts.md` into the body. Replace bracketed text with real, specific copy. **No filler / no lorem.** If a slide feels empty, the layout is wrong — pick a different one.

Tag each slide with `data-screen-label="01 Cover"`, `"02 Problem"`, etc., in the order you wrote them. (The seed's first three slides already do this — extend the pattern.)

### Step 4 — Self-check

Run through `references/checklist.md`. The "Surface hierarchy spot-check" at the end is non-negotiable:

```bash
grep 'class="slide' index.html
```

Read the resulting class list beside the slide labels. If an inverse slide has no narrative purpose, return it to the dominant surface. Never alternate light and dark merely to break a same-surface run.

### Step 5 — Write the project file

Write the completed deck HTML to `index.html`.

Then send one short ordinary assistant summary naming `index.html` and
describing the deck. Do not output the full HTML source in chat and do not emit
a source-code `<artifact>` block.

## Hard rules

- **Theme class on every slide** (`light` | `dark` | `hero light` | `hero dark`). Bare `class="slide"` = regression.
- **One dominant surface.** Every inverse surface has a named narrative role; never alternate by slide index or quota.
- **Display = serif via `var(--font-display)`.** `.h-hero` / `.h-xl` / `.h-md` already enforce.
- **One accent per slide, used at most twice.**
- **Don't rewrite the navigation runtime.** It is chrome-free and proven.
- **No `scrollIntoView()`.** Breaks iframe.
- **`data-screen-label` on every slide.**
