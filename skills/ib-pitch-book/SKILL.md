---
name: ib-pitch-book
description: |
  Investment-banking pitch book for strategic alternatives — trading comps,
  precedent transactions, valuation football field, DCF sensitivity,
  strategic-options matrix, process recommendation. Use for Board / sell-side
  discussion materials. Not a VC fundraising deck (see html-ppt-pitch-deck).
  Workflow adapted from Anthropic financial-services Pitch Agent (Apache-2.0).
triggers:
  - "ib pitch book"
  - "investment banking pitch"
  - "strategic alternatives"
  - "sell-side pitch"
  - "board materials"
  - "football field valuation"
  - "trading comps"
  - "precedent transactions"
  - "投行 pitch"
  - "并购材料"
  - "战略选项"
od:
  mode: deck
  scenario: finance
  featured: 15
  upstream: "https://github.com/anthropics/financial-services/tree/main/plugins/agent-plugins/pitch-agent"
  preview:
    type: html
    entry: example.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  speaker_notes: true
  example_prompt: |
    Build a 10-page strategic alternatives review pitch book for the Board of
    NorthPeak Industries (NYSE: NPK). Include trading comps, precedent
    transactions, valuation football field, DCF sensitivity, and a
    recommended process timeline.
---

# IB Pitch Book

End-to-end **investment-banking-style** pitch materials for a **strategic
alternatives** conversation (coverage & advisory). This is the workflow shape
of Anthropic's **Pitch Agent** from
[`financial-services`](https://github.com/anthropics/financial-services),
repackaged as an Open Design `deck` skill.

## When to use

| Use this skill | Use something else |
|----------------|-------------------|
| Board / MD discussion materials, M&A framing, comps & precedents | **html-ppt-pitch-deck** — VC / seed fundraising decks |
| Sell-side tone, confidentiality ribbons, financial tables | **guizang-ppt** — magazine editorial decks |
| Football field, sensitivity tables, four-path matrix | **simple-deck** — generic swipe slides without IB conventions |

## Resource map

```
ib-pitch-book/
├── SKILL.md           ← manifest + workflow (this file)
├── example.html       ← fully-rendered fictional example (NorthPeak / Hartfield)
└── references/
    ├── compliance.md  ← non-reliance / not investment advice
    ├── attribution.md ← upstream license pointer
    ├── conventions.md ← IB layout rules (masthead, tables, football field)
    └── checklist.md   ← P0/P1/P2 gate before <artifact>
```

## Workflow

### Step 0 — Pre-flight

1. Read **`references/compliance.md`** — every output must carry appropriate
   disclaimers; outputs are **discussion materials**, not advice.
2. Read **`references/conventions.md`** — masthead, confidentiality ribbon,
   tabular numerals, summary-row styling, football-field axis rules.
3. Read the active **`DESIGN.md`** — map tokens into the deck's `:root` CSS.
4. Optional: if the user has financial data MCPs (FactSet, Capital IQ, etc.),
   pull live figures; otherwise label assumptions clearly and never invent
   undisclosed market data.

### Step 1 — Structure

Default **10-slide** spine unless the brief says otherwise:

1. Cover — bank brand, project codename, confidentiality ribbon.
2. Table of contents — sections map to the valuation storyline.
3. Sector / market context — KPI strip + one chart narrative.
4. Trading comparables — peer table + median/mean rows + target highlighted.
5. Precedent transactions — deal table with disclosed multiples.
6. Valuation football field — aligned horizontal ranges + current-price tick.
7. DCF — assumptions table + WACC × terminal-growth sensitivity matrix.
8. Strategic alternatives — four-quadrant matrix; recommended path inverted.
9. Recommendation — pull-quote + phased process timeline.
10. Disclaimers & sources — methodology, engagements team, data providers.

### Step 2 — Build

1. Copy structural patterns from the shipped **`example.html`** (navigation,
   slide chrome, typography slots). Replace all fictional names, tickers, and
   numbers with the user's case — **do not** ship the NorthPeak sample data as
   if real.
2. Write one self-contained **`index.html`** in the project artifact directory
   (inline CSS unless DESIGN.md calls for external fonts — if using Google
   Fonts, keep the same `<link>` pattern as `example.html`).
3. Self-check against **`references/conventions.md`** before declaring done.

### Step 3 — Export

Follow Open Design's deck export path for the active session (HTML / PDF /
PPTX per daemon capabilities).

## Relationship to Open Design financial skills

- **`dcf-valuation`** produces a Markdown valuation memo — complementary; this
  deck embeds DCF **summary** slides, not the full memo file.
- **`finance-report`** is operating / SaaS quarterly reporting — different
  audience and layout system.

## Provenance

See **`references/attribution.md`**. Source workflow and naming derive from
Anthropic's Apache-2.0 **financial-services** repository; this skill file is an
original adaptation for Open Design.
