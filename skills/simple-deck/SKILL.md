---
name: simple-deck
description: |
  Single-file horizontal-swipe HTML deck. Built by copying the seed
  `assets/template.html` (which carries the proven 5-rule iframe nav script)
  and pasting slide layouts from `references/layouts.md`. Pitch decks,
  product overviews, study material — when you don't need the magazine
  aesthetic of `magazine-web-ppt`.
triggers:
  - "deck"
  - "slides"
  - "ppt"
  - "presentation"
  - "幻灯"
  - "ppt 模板"
od:
  mode: deck
  scenario: product
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
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

Default: 6 slides unless the brief says otherwise. Page count should follow content needs.

| Audience / format | Slides |
|---|---|
| Product overview / lightning talk (5–10 min) | 6 |
| Pitch deck (15 min) | 8–10 |
| Investor update / longer talk (20–30 min) | 10–15 |

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

**TodoWrite enforcement:** The rhythm sketch is planning only. **Each turn gets exactly ONE TodoWrite item.** Do NOT create a list like "Fill slide 1, Fill slide 2, ..., Fill slide 8" — that causes the agent to try executing all of them at once → context overflow → crash.

Correct pattern:
- Turn 1: `TodoWrite: - Emit outline (JSON)` → outline only, no HTML
- Turn 2: `TodoWrite: - Fill slide 1 (Cover)` → write slide 1 only → stop
- Turn 3: `TodoWrite: - Fill slide 2 (Problem)` → write slide 2 only → stop
- ... repeat for each slide

**Never create more than one TodoWrite item in a single turn.**

### Step 3 — Paste and fill ONE slide at a time

**CRITICAL: One slide per turn, NOT all at once.** For each slide:

1. Copy the matching `<section>` from `layouts.md` into the body
2. Replace bracketed text with real, specific copy. **No filler / no lorem.**
3. Tag with `data-screen-label="NN Title"`
4. Move to the next slide

**Never write "Write all slides" or "Fill all slide content" as one TodoWrite item.** Each slide is its own TodoWrite step. This prevents context overflow — the #1 reason multi-slide decks time out or hang.

Tag each slide with `data-screen-label="01 Cover"`, `"02 Problem"`, etc., in the order you wrote them. (The seed's first three slides already do this — extend the pattern.)

### Step 4 — Self-check

Run through `references/checklist.md`. The "Theme rhythm spot-check" at the end is non-negotiable:

```bash
grep 'class="slide' index.html
```

Read the resulting class list. If you see `light × 4 in a row`, swap one to `dark`. If no `hero dark` exists in an 8+ slide deck, promote one big-stat or closing slide.

### Step 5 — Emit the artifact

```
<artifact identifier="deck-slug" type="text/html" title="Deck Title">
<!doctype html>
<html>...</html>
</artifact>
```

One sentence before the artifact. Stop after `</artifact>`.

## Visual quality standards

This is a premium deck export. Every visual element must look polished and intentional:

- **Data charts** (bar, line, pie, comparison): use HTML Canvas inside the slide. Canvas renders as a sharp bitmap at 600 DPI in the PDF→PPTX pipeline. Use the deck's theme colors for fills, axes, and labels. Add grid lines, value labels, and smooth curves — no flat bare-bones charts.
- **Images**: prefer high-quality Unsplash photos for hero slides. Use `https://` URLs. No broken or low-resolution placeholders.
- **Typography**: large bold headlines, generous spacing, real copy only (no lorem ipsum).
- **Color**: use the accent color for highlights and callouts (max 1–2 per slide). Add subtle dividers and decorative elements for visual rhythm.
- **Layout**: never leave a slide feeling empty or template-like. Use generous gaps, thoughtful alignment, and meaningful whitespace.

## Hard rules

- **Theme class on every slide** (`light` | `dark` | `hero light` | `hero dark`). Bare `class="slide"` = regression.
- **No 3+ same theme in a row.**
- **Standard PPT fonts only** — headings use bold sans-serif (PingFang SC Bold / Microsoft YaHei Bold / Segoe UI Bold / Arial Bold); body uses regular sans-serif (PingFang SC / Microsoft YaHei / Segoe UI / Arial). Do NOT import Google Fonts or use serif display faces.
- **Display = bold sans-serif via `var(--font-display)`.** `.h-hero` / `.h-xl` / `.h-md` already enforce.
- **One accent per slide, used at most twice.**
- **Don't rewrite the nav script.** It's proven.
- **No `scrollIntoView()`.** Breaks iframe.
- **`data-screen-label` on every slide.**
