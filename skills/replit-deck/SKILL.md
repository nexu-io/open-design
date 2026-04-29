---
name: replit-deck
description: |
  Single-file horizontal-swipe HTML deck in the style of Replit Slides's
  landing-page template gallery. Eight distinct themes (helix, holm, vance,
  bevel, world-dark, world-mint, atlas, bluehouse) — each a complete visual
  system (palette + type + accent) captured from replit.com/slides. Pick one
  theme, do not mix. For pitch decks, board reports, brand memos, campaign
  reveals — when the user explicitly wants "Replit Slides style".
triggers:
  - "replit deck"
  - "replit slides"
  - "replit 风格 ppt"
  - "replit style deck"
  - "helix deck"
  - "holm memo"
  - "atlas chapter"
  - "bluehouse"
  - "bevel campaign"
od:
  mode: deck
  scenario: product
  preview:
    type: html
    entry: index.html
  design_system:
    requires: false
  inputs:
    - name: theme
      type: enum
      required: true
      default: helix
      values:
        - helix         # Modern minimal · light grey · ink + electric blue · SaaS metrics / board
        - holm          # Editorial serif · cream · ink + deep chestnut · legal / finance memo
        - vance         # Gallery · cream · cream serif on black bars · art catalog / showcase
        - bevel         # Y2K editorial · black · display type + product photo grid · campaign
        - world-dark    # Finance green dark · deep green · mint + neon yellow · policy report
        - world-mint    # Finance green light · mint · deep green + neon yellow · policy report
        - atlas         # Museum · black · serif + vermilion · long-form narrative / chapter deck
        - bluehouse     # Consumer card · deep navy · gradient cards + peach → coral · product showcase
    - name: slide_count
      type: integer
      default: 6
      min: 3
      max: 20
---

# Replit Deck Skill

Produce a single-file horizontal-swipe HTML deck in one of eight Replit-Slides themes. Every theme is a complete visual system — do not mix tokens across themes.

## Resource map

```
replit-deck/
├── SKILL.md                ← you're reading this
├── assets/
│   └── template.html       ← seed: 8 themes via [data-theme=*], proven iframe-nav script (READ FIRST)
├── references/
│   ├── themes.md           ← 8 themes: when-to-pick / do / don't / primary layouts
│   ├── layouts.md          ← 10 paste-ready slide layouts, cross-theme
│   ├── components.md       ← shared primitives (eyebrow, kpi-row, image-grid, meta-bar)
│   └── checklist.md        ← P0/P1/P2 self-review + theme lock-in gate
└── examples/               ← four reference decks across the most contrasting themes
    ├── example-helix.html       (SaaS board update · light minimal)
    ├── example-holm.html        (legal fintech memo · cream editorial serif)
    ├── example-atlas.html       (quarterly history chapter · black + vermilion)
    └── example-bluehouse.html   (real estate ROI · navy + gradient cards)
```

## Workflow

### Step 0 — Pre-flight (mandatory reads)

1. Read `assets/template.html` end-to-end. The `[data-theme]` blocks carry the tokens; the `<script>` at the bottom solves five iframe nav bugs — **do not rewrite it**.
2. Read `references/themes.md` → pick **one** theme that matches the user's brief. If the user already picked a theme via `od.inputs.theme`, use that.
3. Read `references/layouts.md` → you'll copy `<section>` blocks from here.
4. Read `references/checklist.md` → P0 must pass before emit.

### Step 1 — Commit to one theme

Write out loud (in the TodoWrite or plan section) which theme and why. Once picked, **every slide uses that theme's tokens only**. No swapping mid-deck. The `<body data-theme="helix">` attribute is the single source of truth.

| Theme | Pick when |
|---|---|
| `helix` | SaaS board update, product metrics, neutral modern |
| `holm` | Legal memo, investor pre-read, serious / institutional |
| `vance` | Art portfolio, design catalog, photographer / sculptor |
| `bevel` | Fashion campaign, lookbook, Y2K / editorial attitude |
| `world-dark` | Policy report, finance analysis, premium dark |
| `world-mint` | Same report, lighter sections / section dividers |
| `atlas` | Long-form narrative, chapter deck, museum / archive aesthetic |
| `bluehouse` | Consumer product, real estate, lifestyle, colorful cards |

### Step 2 — Plan slide rhythm before writing HTML

Default 6 slides. Write the rhythm BEFORE any HTML, for example (helix, 6 slides):

```
01  cover           hero + title + subtitle
02  kpi-row-6       6 metrics with ▲/▼ deltas
03  split-insight   left stat + right paragraph
04  chapter-plate   section divider
05  three-up        three parallel columns
06  closing         one bold number or CTA
```

Show this to the user. Redirecting at this stage is cheap.

### Step 3 — Copy seed, bind theme

1. Copy `assets/template.html` to project root as `index.html`.
2. Set `<body data-theme="<chosen>">`.
3. Replace `<title>`.
4. Delete the placeholder slides in the body (the seed ships with 3 demo slides). Keep the chrome (counter / progress / hint).

### Step 4 — Paste layouts, fill real copy

For each planned slide, copy the matching `<section>` from `references/layouts.md`. Replace every `[REPLACE]` with specific copy — never leave placeholders, never use lorem. If a slide feels empty, pick a different layout.

Tag each slide with `data-screen-label="01 Cover"`, `"02 Metrics"`, etc., in presentation order.

### Step 5 — Self-check

Run `references/checklist.md`. The **P0 theme-lock gate** is non-negotiable:

```bash
grep -E 'data-theme|style="--' index.html | head
```

If any `style="--accent:..."` or theme override appears on individual slides, revert. One theme per deck.

### Step 6 — Emit artifact

```
<artifact identifier="deck-<slug>" type="text/html" title="<Deck title>">
<!doctype html>
<html>...</html>
</artifact>
```

One sentence before the artifact. Stop after `</artifact>`.

## Hard rules

- **One theme per deck.** `data-theme` set on `<body>` — never override per-slide.
- **Numbers are real or absent.** No invented metrics. Use `—` or a grey block as an honest placeholder.
- **Display face follows theme.** helix/atlas/bluehouse use the sans Display; holm/vance use the serif Display; bevel uses the Y2K display. Do not swap.
- **Accent appears 1–2× per slide max.** Never a gradient-spam.
- **Never rewrite the nav script.** Five iframe bugs it solves are not obvious.
- **Keep it one HTML file.** Inline all CSS. No external fonts — the system stack in each theme is deliberate.
- **`data-screen-label` on every slide.**
- **No Replit logo / brand lockup.** These are template styles, not a Replit-brand deck.
