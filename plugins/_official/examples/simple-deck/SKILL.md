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
│   └── template.html       ← seed: tokens + slide primitives + proven nav script (READ FIRST)
└── references/
    ├── layouts.md          ← 8 paste-ready slide layouts + theme-rhythm rules
    └── checklist.md        ← P0/P1/P2 self-review (rhythm spot-check at bottom)
```

## Workflow

### Step 0 — Pre-flight

1. **Read `assets/template.html`** end-to-end through the `<style>` block AND the `<script>` block. The script solves five iframe-specific bugs (real scroller detection, dual capture-phase listeners, auto-focus, no `scrollIntoView`, position persistence) — do not rewrite it.
2. **Read `references/layouts.md`** so you know the 8 layouts. Pay special attention to the "Theme rhythm" section — it's the rule that prevents the deck from feeling sleepy.
3. **Read the active DESIGN.md** — map its tokens to the six `:root` variables in the seed.

### Step 1 — Copy the seed

Copy `assets/template.html` to the project root as `index.html`. Replace the six `:root` variables with the active design system's tokens. Replace the page `<title>`.

### Step 2 — Decide slide count + theme rhythm BEFORE writing any slide

Default: 6 slides unless the brief says otherwise.

| Audience / format | Slides |
|---|---|
| Product overview / lightning talk (5–10 min) | 6 |
| Pitch deck (15 min) | 8–10 |
| Investor update / longer talk (20–30 min) | 12–18 |

Then write out the rhythm before any HTML — for example, 8 slides:

```
01  hero light center  Cover
02  light              Problem
03  hero dark center   Big stat
04  light              Three points
05  dark               Pipeline
06  hero light center  Quote
07  light              Before / after
08  hero dark center   Ask
```

A healthy sequence has:
- No 3+ same theme in a row
- ≥ 1 `hero dark` AND ≥ 1 `hero light` (for 8+ slides)
- Alternating breath every 3–4 slides

Show this rhythm sketch to the user *before* writing slide HTML — they can redirect cheaply.

### Step 3 — Paste and fill

For each planned slide, copy the matching `<section>` from `layouts.md` into the body. Replace bracketed text with real, specific copy. **No filler / no lorem.** If a slide feels empty, the layout is wrong — pick a different one.

Tag each slide with `data-screen-label="01 Cover"`, `"02 Problem"`, etc., in the order you wrote them. (The seed's first three slides already do this — extend the pattern.)

### Step 4 — Self-check

Run through `references/checklist.md`. The "Theme rhythm spot-check" at the end is non-negotiable:

```bash
grep 'class="slide' index.html
```

Read the resulting class list. If you see `light × 4 in a row`, swap one to `dark`. If no `hero dark` exists in an 8+ slide deck, promote one big-stat or closing slide.

### Step 5 — Write the project file

Write the completed deck HTML to `index.html`.

Then send one short ordinary assistant summary naming `index.html` and
describing the deck. Do not output the full HTML source in chat and do not emit
a source-code `<artifact>` block.

## Hard rules

- **Theme class on every slide** (`light` | `dark` | `hero light` | `hero dark`). Bare `class="slide"` = regression.
- **No 3+ same theme in a row.**
- **Display = serif via `var(--font-display)`.** `.h-hero` / `.h-xl` / `.h-md` already enforce.
- **One accent per slide, used at most twice.**
- **Don't rewrite the nav script.** It's proven.
- **No `scrollIntoView()`.** Breaks iframe.
- **`data-screen-label` on every slide.**
