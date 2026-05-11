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
      max: 30
      # 6 is a board-update baseline. Memos and campaign decks usually land
      # at 3–4 (see example-holm / example-bluehouse). Long-form chapters
      # (atlas) can run 8–12. Don't pad to hit the default.
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
| `world-mint` | Lighter companion of world-dark — ESG, wellness finance, sustainability |
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

**Show this to the user and STOP.** Do NOT copy the seed or write any HTML until the user approves the rhythm. Redirecting at this stage is cheap.

### Step 3 — Copy seed, bind theme

1. Copy `assets/template.html` to project root as `index.html`.
2. Set `<body data-theme="<chosen>">`.
3. Replace `<title>`.
4. Delete the placeholder slides in the body (the seed ships with 3 demo slides). Keep the chrome (counter / progress / hint).

### Step 4 — Paste layouts, fill real copy — ONE SLIDE AT A TIME

**CRITICAL: Each turn writes exactly ONE slide. Each turn gets exactly ONE TodoWrite item.**

Wrong: creating 6 TodoWrite items at once like "Fill slide 1, Fill slide 2, ..., Fill slide 6" → agent tries to execute all → context overflow → crash.

Correct pattern:
- Turn 1: `TodoWrite: - Emit outline (JSON)` → outline only, no HTML
- Turn 2: `TodoWrite: - Fill slide 1 (Cover)` → write slide 1 → stop
- Turn 3: `TodoWrite: - Fill slide 2 (Metrics)` → write slide 2 → stop
- ... repeat for each slide

**Never create more than one TodoWrite item in a single turn.**

For each slide:
1. Copy the matching `<section>` from `references/layouts.md`
2. Replace every `[REPLACE]` with specific copy — never leave placeholders, never use lorem
3. If a slide feels empty, pick a different layout
4. Tag with `data-screen-label="01 Cover"`, `"02 Metrics"`, etc.
5. Move to the next slide

### Step 5 — Self-check

Run `references/checklist.md` silently before emit: the **P0 theme-lock gate** plus the five-dimension 1–5 critique (Philosophy / Hierarchy / Execution / Specificity / Restraint). Any dimension ≤ 3 → re-do before emit.

The P0 theme-lock grep is non-negotiable:

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

## Visual quality standards

This is a premium deck export. Every visual element must look polished and intentional:

- **Data charts** (bar, line, pie, comparison): use HTML Canvas inside the slide. Canvas renders as a sharp bitmap at 600 DPI in the PDF→PPTX pipeline. Use the theme's colors for fills, axes, and labels. Add grid lines, value labels, and smooth curves — no flat bare-bones charts.
- **Images**: prefer high-quality Unsplash photos for hero slides. Use `https://` URLs. No broken or low-resolution placeholders.
- **Typography**: large bold headlines, generous spacing, real copy only (no lorem ipsum).
- **Layout**: never leave a slide feeling empty or template-like. Use generous gaps, thoughtful alignment, and meaningful whitespace.

## Hard rules

- **One theme per deck.** `data-theme` set on `<body>` — never override per-slide.
- **Numbers are real or absent.** No invented metrics. Use `—` or a grey block as an honest placeholder.
- **Standard PPT fonts only.** All themes use the same sans-serif stack: headings in bold (PingFang SC Bold / Microsoft YaHei Bold / Segoe UI Bold / Arial Bold), body in regular (PingFang SC / Microsoft YaHei / Segoe UI / Arial). Do NOT import Google Fonts or use serif display faces — the original Replit templates used varied display faces, but for PPT export fidelity, stick to the standard presentation font stack.
- **Accent appears 1–2× per slide max.** Never a gradient-spam.
- **Never rewrite the nav script.** Five iframe bugs it solves are not obvious.
- **Keep it one HTML file.** Inline all CSS. No external fonts — the system stack in each theme is deliberate.
- **`data-screen-label` on every slide.**
- **No Replit logo / brand lockup.** These are template styles, not a Replit-brand deck.

---

## When to pick `replit-deck` vs. peer skills

| Skill | Pick when |
|---|---|
| `simple-deck` | Plain, single-theme deck bound to the project's `DESIGN.md` tokens. When the deck should *match* the host brand, not assert its own. (`designSystemRequired: true`.) |
| `magazine-web-ppt` | Editorial "magazine × e-ink" aesthetic (WebGL fluid background, serif titles, chapter plates). When the brief asks for a keynote / launch / sharing-style deck and calls out Monocle / WIRED / Kinfolk / Domus. |
| `replit-deck` | The brief explicitly asks for Replit-Slides gallery aesthetic, or needs one of the 8 token-frozen visual identities (SaaS board, editorial memo, gallery catalog, Y2K campaign, policy report, museum chapter, consumer cards). No dependency on `DESIGN.md`. |

If the user just says "make me a deck" without further guidance, default to `simple-deck` — it respects their design system. Pick `replit-deck` only when the brief is explicit about the aesthetic or names a theme.

---

## Scope & provenance

- **Eight themes = the full replit.com/slides landing-page gallery at the time of snapshot.** Not a curated subset — every theme card currently published on replit.com/slides is represented here (helix, holm, vance, bevel, world-dark, world-mint, atlas, bluehouse). If Replit ships a ninth template, it is **not** automatically reflected in this skill.
- **Snapshot date: 2026-04-29.** All hex values were sampled from the actual replit.com/slides PNGs on that date with ImageMagick — no guessed colors, no memory substitutions. See `references/themes.md` → *Contributing a new theme* for the exact sampling procedure.
- **Maintenance: one-time snapshot, not tracked.** Replit Slides is a live product and may drift. This skill does not auto-sync. If you notice Replit has updated colors or added a theme and want it reflected here, open an issue on `nexu-io/open-design` titled `replit-deck: re-sync to replit.com/slides (YYYY-MM-DD)` and attach the updated screenshots. There is no designated owner monitoring the upstream.
- **No Replit branding.** These are gallery-style templates, not a Replit-brand deck. The checklist (P0) forbids inserting a Replit logo or wordmark.

---

## Browser / runtime support

- **Target**: modern evergreen desktop browsers (Chrome 110+ / Safari 16+ / Firefox 115+) and modern mobile Safari / Chrome.
- **Features used**: CSS scroll-snap (horizontal), `color-mix()`, CSS custom properties, `text-wrap: balance`. All ≥ 93% Baseline.
- **Not supported**: IE 11, Safari < 15, any browser without `color-mix()` (would need a fallback `--accent-soft` if you want to support older Safari; out of scope for this skill).
- **Mobile**: horizontal scroll-snap works on iOS Safari 16+ and Android Chrome. Keyboard nav is desktop-only by design.
- **Nav script behavior**: reused verbatim from `skills/simple-deck` — survives iframe embedding (the daemon preview surface), dual listener races, focus loss, and position persistence across reloads. **Do not rewrite it.**

---

## Verification

The skill auto-registers with the daemon on filesystem scan (no manual wiring). Confirmed against a running daemon on `localhost:7456` after adding this skill:

```bash
$ curl -s localhost:7456/api/skills \
    | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); \
               console.log(JSON.stringify(d.skills.find(s=>s.id==='replit-deck'), null, 2));"
{
  "id": "replit-deck",
  "name": "replit-deck",
  "description": "Single-file horizontal-swipe HTML deck in the style of Replit Slides's\nlanding-page template gallery. Eight distinct themes …",
  "triggers": [
    "replit deck",
    "replit slides",
    "replit 风格 ppt",
    "replit style deck",
    "helix deck",
    "holm memo",
    "atlas chapter",
    "bluehouse",
    "bevel campaign"
  ],
  "mode": "deck",
  "platform": null,
  "scenario": "product",
  "previewType": "html",
  "designSystemRequired": false,
  "defaultFor": [],
  "upstream": null,
  "featured": null,
  "fidelity": null,
  "speakerNotes": null,
  "animations": null,
  "examplePrompt": "Single-file horizontal-swipe HTML deck in the style of Replit Slides's landing-page template gallery.",
  "hasBody": true
}
```

All four example decks (`examples/example-{helix,holm,atlas,bluehouse}.html`) open directly in a browser. Keyboard nav (← / → / Space / Home / End) and horizontal scroll-snap work in Chrome 129 and Safari 18.
