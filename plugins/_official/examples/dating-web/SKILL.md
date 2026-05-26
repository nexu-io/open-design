---
name: dating-web
description: |
  A consumer-feeling dating / matchmaking dashboard — left rail navigation,
  ticker bar of community signals, headline KPIs, a 30-day mutual-matches
  bar chart, and a match-rate trend block. Editorial typography, restrained
  accent. Use when the brief asks for a "dating site", "matchmaking",
  "community dashboard", "social network dashboard", or any consumer
  product where the data is the story.
triggers:
  - "dating app"
  - "dating site"
  - "matchmaking"
  - "social dashboard"
  - "community dashboard"
  - "consumer dashboard"
  - "约会应用"
  - "婚恋"
od:
  mode: prototype
  platform: desktop
  scenario: personal
  featured: 5
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  example_prompt: "Design ‘mutuals’ — a dating site for X posters. Daily digest dashboard with stats, mutual-matches bar chart, and a community ticker."
---

# Dating Web Skill

Produce a single-screen consumer dashboard that feels like a Sunday-paper
dating column rendered as software. Editorial type, single restrained
accent, lots of negative space, *no* swipe deck or hookup tropes.

## Workflow

1. **Read the active DESIGN.md** (injected above). Lean into a serif display
   token for the metric numerals — these screens live or die on numerals.
2. **Pick a brand voice** — wry, observational, slightly literary. Generate
   real, specific copy. Examples: "the people who'd text back within a day",
   "manageable. two are now friends.", "your single greatest compatibility
   asset."
3. **Layout**, in order:
   - **Top ticker** — single-row horizontal strip across the top in a
     sans-serif eyebrow style: tagline left, "NEXT TIER AT 2,080 MUTUALS"
     right, both in mono caps with letter-spacing. Thin rule below.
   - **Left rail** — 220–260px sidebar. Brand wordmark in serif italic at
     top. User card (avatar / handle / ratio / tier). Three groups of nav:
     "TODAY" (specimen, inbox, queue, notifications), "YOU" (your stats,
     mutuals & communities, blocked, settings), "ARCHIVE" (past issues,
     expired matches). Active item gets accent text + accent dot.
   - **Main content**:
     - **KPI grid** — 3 columns × 3 rows (or 9 cells). Each cell: small
       caps mono label, an oversized serif numeral (use accent or muted
       green for positive, muted red for caution), one-line italic
       footnote. Plausible specifics — "1,842 ↑ 41 this wk · healthy
       growth.", "14% above median for your cohort.", "4 / exes in your
       circle · manageable. two are now friends."
     - **Bar chart panel** — "mutuals — last 30 days". Tall thin black
       bars, last two days highlighted in accent. Caption above with
       "↑ TRENDING UP · +3 CLOSE MUTUALS THIS MONTH · TWO VIA THE SAME
       OFFSITE" in mono.
     - **Trend panel** — "match rate — last 12 weeks". One line of body
       copy below ("STEADY CLIMB FROM 8% → 14%. ATTRIBUTABLE TO ONE
       COMMUNITY JOIN…"). Footer rule.
4. **Write** a single HTML document:
   - `<!doctype html>` through `</html>`, CSS inline.
   - Background creamy off-white, body serif, mono labels everywhere.
   - Use `font-feature-settings: 'tnum'` on the metric numerals.
   - SVG bar chart with ~30 bars, varied heights.
   - `data-od-id` on ticker, sidebar, kpi grid, chart, trend.
5. **Self-check**:
   - Reads as restrained, editorial, slightly funny — not horny.
   - Single accent token used in 3–4 places max (one KPI, two highlight
     bars, one nav active state).
   - No swipe deck, no hearts, no fire emoji.

## Output contract

Emit between `<artifact>` tags:

```
<artifact identifier="dating-slug" type="text/html" title="Dating Dashboard — Title">
<!doctype html>
<html>...</html>
</artifact>
```

One sentence before the artifact, nothing after.
