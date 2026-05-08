---
version: alpha
name: Mono Crimson Operations Brief
description: >
  An editorial, single-accent operations dashboard system: warm off-white canvas,
  bright white flat cards with hairline borders, charcoal horizontal bars paired
  with vivid crimson prior-year ticks, tabular-figure KPI numbers, light-grey
  filter pills, and a strict mono-crimson accent reserved for negatives,
  prior-year markers, and "lowest" callouts — built for OTD / on-time-delivery,
  supply-chain, audit, finance and operations performance briefs.
colors:
  surface: "#FFFFFF"
  surface-muted: "#F4F5F7"
  surface-subtle: "#F8F9FB"
  canvas: "#FAFAFB"
  border: "#E6E7EB"
  border-strong: "#D6D8DD"
  hairline: "#EEEFF2"
  text-primary: "#0B1220"
  text-secondary: "#4B5563"
  text-tertiary: "#6B7280"
  text-quiet: "#9CA3AF"
  text-quietest: "#B7BCC4"
  accent-crimson: "#C2272D"
  accent-crimson-strong: "#A11D22"
  accent-crimson-soft: "#FCE6E7"
  data-ink: "#0F1B2E"
  data-ink-soft: "#1E2A3D"
  data-track: "#E6E7EB"
  data-track-soft: "#EFF0F3"
  tier-low: "#F1F2F4"
  tier-mid: "#DDDFE3"
  tier-high: "#C9CBD0"
  pill-bg: "#F1F2F4"
  pill-fg: "#4B5563"
  status-up-fg: "#15803D"
  status-down-fg: "#C2272D"
typography:
  display:
    fontFamily: "'Inter', 'IBM Plex Sans', system-ui, sans-serif"
    fontSize: 17px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.005em"
  card-title:
    fontFamily: "'Inter', 'IBM Plex Sans', system-ui, sans-serif"
    fontSize: 12.5px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.04em"
    textTransform: "uppercase"
  kpi-label:
    fontFamily: "'Inter', 'IBM Plex Sans', system-ui, sans-serif"
    fontSize: 10.5px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.06em"
    textTransform: "uppercase"
  kpi-number:
    fontFamily: "'Inter', 'IBM Plex Sans', system-ui, sans-serif"
    fontSize: 34px
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.018em"
    fontFeatureSettings: "'tnum', 'lnum'"
  kpi-caption:
    fontFamily: "'Inter', 'IBM Plex Sans', system-ui, sans-serif"
    fontSize: 11.5px
    fontWeight: 500
    lineHeight: 1.4
    color: "{colors.text-tertiary}"
  body-md:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: 12.5px
    fontWeight: 400
    lineHeight: 1.45
  body-sm:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: 11.5px
    fontWeight: 400
    lineHeight: 1.45
  table-header:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: 10px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.07em"
    textTransform: "uppercase"
    color: "{colors.text-quiet}"
  pill:
    fontFamily: "'JetBrains Mono', 'IBM Plex Mono', 'SFMono-Regular', monospace"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.01em"
  numeric:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.3
    fontFeatureSettings: "'tnum', 'lnum'"
  numeric-strong:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 700
    lineHeight: 1.3
    fontFeatureSettings: "'tnum', 'lnum'"
rounded:
  none: 0px
  xs: 3px
  sm: 4px
  md: 6px
  lg: 8px
  xl: 10px
  pill: 999px
spacing:
  xxs: 2px
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  xxl: 20px
  xxxl: 24px
  section: 28px
shadow:
  none: "none"
  flat: "0 0 0 1px {colors.border}"
  card: "0 1px 0 rgba(11,18,32,.02)"
patterns:
  bar-track: "{colors.data-track}"
components:
  app-shell:
    backgroundColor: "{colors.canvas}"
    padding: 0
  page-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    border: "1px solid {colors.border}"
    padding: 18px
    shadow: "{shadow.card}"
  page-header:
    typography: "{typography.display}"
    textColor: "{colors.text-primary}"
    paddingBottom: 14px
  filter-pill:
    backgroundColor: "{colors.pill-bg}"
    textColor: "{colors.pill-fg}"
    typography: "{typography.pill}"
    rounded: "{rounded.sm}"
    padding: "3px 8px"
    border: "1px solid {colors.hairline}"
  kpi-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    border: "1px solid {colors.border}"
    padding: "14px 16px"
    shadow: "{shadow.card}"
    minHeight: "100px"
  kpi-card-label:
    typography: "{typography.kpi-label}"
    textColor: "{colors.text-secondary}"
    paddingBottom: 6px
  kpi-card-number:
    typography: "{typography.kpi-number}"
    textColor: "{colors.text-primary}"
  kpi-card-number-negative:
    typography: "{typography.kpi-number}"
    textColor: "{colors.accent-crimson}"
  kpi-card-caption:
    typography: "{typography.kpi-caption}"
    paddingTop: 6px
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    border: "1px solid {colors.border}"
    padding: "16px 18px 14px"
    shadow: "{shadow.card}"
  card-title:
    typography: "{typography.card-title}"
    textColor: "{colors.text-primary}"
    paddingBottom: 12px
  bar-row:
    height: "20px"
    paddingY: 4px
    typography: "{typography.body-sm}"
  bar-row-label:
    typography: "{typography.body-md}"
    textColor: "{colors.text-secondary}"
    width: "150px"
    align: "right"
    paddingRight: 12px
  bar-track:
    backgroundColor: "{colors.data-track}"
    rounded: "{rounded.xs}"
    height: "12px"
  bar-fill:
    backgroundColor: "{colors.data-ink}"
    rounded: "{rounded.xs}"
    height: "12px"
  bar-prior-tick:
    backgroundColor: "{colors.accent-crimson}"
    width: "2px"
    height: "16px"
    offsetY: "-2px"
  bar-row-value:
    typography: "{typography.numeric}"
    textColor: "{colors.text-quiet}"
    paddingLeft: 12px
    width: "150px"
  legend-row:
    typography: "{typography.body-sm}"
    textColor: "{colors.text-tertiary}"
    paddingTop: 12px
    borderTop: "1px solid {colors.hairline}"
    gap: 16px
  legend-swatch-bar:
    width: "18px"
    height: "10px"
    rounded: "{rounded.xs}"
  legend-swatch-tick:
    width: "2px"
    height: "12px"
    backgroundColor: "{colors.accent-crimson}"
  legend-swatch-tier:
    width: "22px"
    height: "10px"
    rounded: "{rounded.xs}"
  table-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    border: "1px solid {colors.border}"
    padding: "16px 18px 4px"
    shadow: "{shadow.card}"
  table-header-cell:
    typography: "{typography.table-header}"
    paddingY: 8px
    paddingX: 4px
  table-row:
    paddingY: 10px
    borderBottom: "1px solid {colors.hairline}"
    typography: "{typography.body-md}"
  table-rank:
    typography: "{typography.numeric}"
    textColor: "{colors.text-quiet}"
    width: "20px"
  table-name:
    typography: "{typography.body-md}"
    textColor: "{colors.text-primary}"
    fontWeight: 500
  red-mini-bar-track:
    backgroundColor: "{colors.surface-muted}"
    rounded: "{rounded.xs}"
    height: "16px"
  red-mini-bar-fill:
    backgroundColor: "{colors.accent-crimson}"
    rounded: "{rounded.xs}"
    height: "16px"
  red-mini-bar-label:
    typography: "{typography.numeric-strong}"
    textColor: "{colors.surface}"
    paddingX: 6px
    align: "right"
  hairline:
    backgroundColor: "{colors.hairline}"
    height: "1px"
---

## 1. Visual Theme & Atmosphere

**Mono Crimson Operations Brief** is an editorial, almost newspaper-feeling operations dashboard system tuned for **on-time delivery (OTD)**, supply-chain audits, finance variance reports, vendor performance, manufacturing quality briefs and any "what is our number this month" executive view.

The visual posture is **calm, factual, and slightly stern** — like a printed audit report. Surfaces are bright white with a 1px hairline; the canvas is a warm off-white. Numbers are big, charts are flat, and **a single vivid crimson is the only accent in the entire system**. Crimson is reserved for three things only: negative deltas, prior-year markers on bars, and the "lowest performers" mini-bars in the red-list. Everything else lives in a five-step charcoal-to-light-grey ramp.

The overall feeling is "page from a printed performance brief" rather than "modern SaaS dashboard": no gradients, no glass, no shadows beyond a 1px optical hairline, no rounded blobs, no decorative iconography.

- **Visual style:** editorial · audit · operations · monochrome
- **Color stance:** mono-accent (crimson on greyscale)
- **Design intent:** Make a single number, a single ranking, and a single comparison legible at a glance, on white, in print or in a meeting room projector.

## 2. Color

The palette is a **greyscale ramp + one crimson**.

- **Canvas `#FAFAFB`** — viewport background. Never use pure white as the canvas; the warm off-white separates cards from the page.
- **Surface `#FFFFFF`** — every card, KPI tile, table, and the right-side ranking list.
- **Surface-muted `#F4F5F7`** — the empty track behind crimson mini-bars in the lowest-OTD list, and the subtle hover state on table rows.
- **Border `#E6E7EB`** — the universal 1px hairline that draws every card outline. Never use a thicker border, never use a colored border.
- **Hairline `#EEEFF2`** — internal dividers between table rows and between the legend row and the chart body.
- **Text-primary `#0B1220`** — page title, card titles, KPI numbers, table account names. Near-black, not pure black, to keep the page feeling printed.
- **Text-secondary `#4B5563`** — bar-row labels (account names on the left of bars), filter-pill text.
- **Text-tertiary `#6B7280`** — legend text, KPI captions ("August 2021 · EUR", "Current – Prior year").
- **Text-quiet `#9CA3AF`** — the percentage values to the right of bars (e.g. `83.9% (PY 73.9%)`), table rank numbers, table OTD-lines column.
- **Accent crimson `#C2272D`** — the only saturated color in the system. It appears in **exactly three** roles:
  1. Negative KPI numbers (e.g. `YOY Δ (PTS) -3.9 pts`).
  2. Vertical prior-year ticks on each horizontal bar.
  3. Mini-bars in the "Lowest OTD % accounts" list (with white tabular-figure label inside the fill).
- **Data-ink `#0F1B2E`** — the charcoal fill of every horizontal bar. Slightly cooler than pure black; reads as "ink" against white.
- **Data-track `#E6E7EB`** — the unfilled remainder of every horizontal bar, drawn as a single track that the dark fill sits on top of.

The legend at the bottom of the bar chart uses three tier swatches: `tier-low #F1F2F4` (0–60%), `tier-mid #DDDFE3` (60–80%), `tier-high #C9CBD0` (80–100%). These are quiet on purpose — they communicate "scale categories," not "data colors."

## 3. Typography

Use **Inter** (or **IBM Plex Sans** as a print-leaning alternative) as the only typeface family. The system uses three weights only: 400 (body), 500–600 (labels), and 700 (titles + KPI numbers). Filter pills may optionally use a monospace face (**JetBrains Mono / IBM Plex Mono**) to read like cell formula tokens (`Date = August 2021`, `Exchange Rate[From Currency] = "EUR"`).

- **Page title** (`On-Time Delivery Dashboard`) — 17px, weight 700, tight tracking. No subtitle, no decorative emoji.
- **Card title** (`OTD % (LINES) BY KEY ACCOUNT`, `LOWEST OTD % ACCOUNTS (≥10 LINES)`) — 12.5px, weight 700, **uppercase, +0.04em tracking**. Always uppercase. This is the editorial signature.
- **KPI label** (`OTD % (LINES)`, `YOY Δ (PTS)`) — 10.5px, weight 600, **uppercase, +0.06em tracking**, in `text-secondary`.
- **KPI number** — 34px, weight 700, line-height 1.05, slightly negative tracking, **tabular numerals enabled** (`font-feature-settings: "tnum", "lnum"`). Negative numbers are rendered in `accent-crimson`; all others in `text-primary`.
- **KPI caption** (`August 2021 · EUR`, `+5 457 vs PY (200 241)`) — 11.5px, weight 500, in `text-tertiary`. The middle dot `·` separates the period from the currency.
- **Bar-row label** (`Antarctic Corporation`, `Government Contract`, …) — 12.5px, weight 400, in `text-secondary`, right-aligned to the bar.
- **Bar-row value** (`83.9% (PY 73.9%)`) — 12px tabular, in `text-quiet`. Always `XX.X% (PY YY.Y%)` exactly — never reorder.
- **Table header** (`#`, `ACCOUNT NAME`, `OTD %`, `OTD (LINES)`) — 10px, weight 600, **uppercase, +0.07em tracking**, in `text-quiet`.
- **Filter pill** (`Date = August 2021`) — 11px monospace, weight 500, in `pill-fg`, on `pill-bg`. Always written as `Key = Value` with surrounding spaces; string values are quoted (`"EUR"`).

Tabular numerals are mandatory on every KPI number, every percentage, every count, every rank. Digits in adjacent cards must visually line up to the pixel.

## 4. Spacing & Grid

The page is built on a **6-column 12-gutter grid** inside a 20px outer canvas gutter. KPI strip occupies 4 equal columns. The body splits **5+3** columns: bar chart (left, 5/8) and lowest-accounts table (right, 3/8).

- Spacing scale: `2 / 4 / 6 / 8 / 12 / 16 / 20 / 24 / 28px`. Do not invent intermediate values.
- Card padding: 14–18px (KPI tiles 14px vertical, 16px horizontal; bar chart card 16/18px).
- Vertical gap between page header and the KPI strip: **12px**.
- Vertical gap between the KPI strip and the body row: **14px**.
- Horizontal gap between cards in any row: **12px**.
- Bar-row height: **20px** (12px bar + 4px vertical breathing on each side).
- Table-row height: **44–48px** (account name wraps to two lines).

## 5. Layout & Composition

The canonical page composition (top to bottom) is:

1. **Header row** (full width, 36px tall): page title on the far left + filter-pill cluster on the far right. No back-button, no breadcrumb, no avatar.
2. **KPI strip** (4 equal cards): label → very large number → 1-line caption. Each card is independently bordered.
3. **Body row** — two cards side-by-side:
   - **Left, 5/8 width:** "BY KEY ACCOUNT" — vertical stack of horizontal bars, ordered descending by current-period value, with prior-year ticks. A 3-swatch tier legend lives at the bottom.
   - **Right, 3/8 width:** "LOWEST OTD % ACCOUNTS (≥10 LINES)" — ranked table with red mini-bars and a tabular OTD-LINES count column.

The grid is rigid. Do **not** introduce a sidebar, a topbar, or a hero strip; this style is meant for a single full-bleed dashboard panel that can be embedded in a report page.

## 6. Components

### Page Header

A single line: 17px bold title on the left, **filter pills cluster** on the right. Pills are pill-shaped only at the corners; otherwise they are 4px-radius rectangles with `pill-bg` fill, `hairline` border, and monospace label. They communicate **filter context as expressions** (`Date = August 2021`, `Exchange Rate[From Currency] = "EUR"`). Never use them as clickable buttons in this style — they are read-only context tags.

### KPI Card (×4)

Bright white, 1px `border`, 6px radius, ~100px tall, padding 14×16. Three vertically stacked elements:

1. Tiny uppercase **label** in `text-secondary`.
2. Very large **number** in `text-primary` — or `accent-crimson` if it carries a leading minus sign / represents a negative delta.
3. One-line **caption** in `text-tertiary`. Caption may include a thin secondary number in parentheses (`+5 457 vs PY (200 241)`).

There is no icon, no overflow menu, no trend chip, no sparkline. The whole card is type-only.

### Bar Chart Card ("BY KEY ACCOUNT")

A single card with a top-aligned uppercase title and a vertical stack of bar rows. Each row has three slots:

- **Left slot (label, ~150px, right-aligned):** account name in 12.5px `text-secondary`.
- **Middle slot (track + fill, fluid):** a 12px-tall `data-track` track filling the slot, with a `data-ink` fill from 0% to the current-period percentage. **Always overlaid by a 2px-wide, 16px-tall vertical crimson tick** at the prior-year percentage position. The tick extends 2px above and 2px below the bar so it visually punctures the track.
- **Right slot (value, ~150px, left-aligned):** `XX.X% (PY YY.Y%)` in 12px tabular `text-quiet`.

Rows are separated by 8px of vertical padding (no row borders). At the bottom of the card, a single **legend row** documents the visual grammar: a small charcoal bar swatch labeled "OTD % (Lines) — Aug 2021", a 2px crimson tick swatch labeled "Prior year (Aug 2020)", and three tier swatches "0-60%", "60-80%", "80-100%". The legend row is separated from the chart by a 1px `hairline`.

### Lowest-OTD Table

A single card with the same border / radius as the bar card. Title row, then a 4-column header (`#`, `ACCOUNT NAME`, `OTD %`, `OTD (LINES)`) in `table-header` style with a 1px `hairline` underline, then 8 rows. Each row:

- **Rank cell** — 1- or 2-digit number in `text-quiet`, tabular.
- **Name cell** — 12.5px `text-primary` weight 500, allowed to wrap to two lines (e.g. `The Ruby / Black Hole`).
- **OTD% cell** — a 16px-tall **crimson mini-bar** filling roughly `value / 60%` of a `surface-muted` track, with the **value (`35.9%`, `40.7%`, …) inset in white tabular bold inside the right edge of the fill**. The fill always starts from the left edge of the track.
- **OTD (LINES) cell** — small tabular count in `text-quiet`, right-aligned (`14`, `11`, `10`, …).

Rows are separated by `hairline` 1px dividers. There is no row hover state.

### Filter Pill

`pill-bg` fill, `hairline` border, 4px radius, 11px monospace text, 3×8px padding. The grammar is **always `Key = Value`** with single spaces around the `=`. String values are double-quoted. Do not use them as buttons; they signal "this view is filtered to these constraints."

## 7. Motion & Interaction

This style is intentionally **static**. It is meant to read like a printed page.

- No hover lift on cards.
- No row hover fill on tables (a barely visible `surface-muted` background is permitted, but discouraged).
- No skeleton shimmer. Use a `text-quietest` em-dash on missing values instead.
- Tooltip on bar hover (optional): a small 4px-radius white card with a 1px `border`, listing exact `Current` and `Prior year` percentages and the LINES count. Never animate its appearance with anything heavier than `opacity 120ms ease-out`.

## 8. Voice & Brand

The voice is **factual, audit-style, and quietly authoritative**. Card titles are uppercase nouns (`BY KEY ACCOUNT`, `LOWEST OTD % ACCOUNTS (≥10 LINES)`). Captions describe constraints with parenthetical precision (`(≥10 LINES)`, `(PY 73.9%)`). The dashboard speaks like an analyst, not like a marketing hero.

- Never use exclamation marks.
- Never use emoji.
- Never use first-person ("our", "your", "we").
- Currency / period in captions is separated by a middle dot (`August 2021 · EUR`).
- Negative deltas are written `-3.9 pts`, not `(3.9)` or `-3.9%` — keep "pts" / "%" units explicit.

## 9. Anti-patterns

**Don't:**

- Use any color other than the greyscale ramp + crimson. No blue, green, amber, mint, purple — even for "info", "success", "warning". Negative is the only differentiated state, and it is crimson.
- Add card shadows beyond the 1px optical hairline.
- Use rounded corners larger than 6–8px on cards. Pills cap at 4px. Avatars and big rounded blobs are foreign to this system.
- Use bold weights heavier than 700 or lighter than 400.
- Substitute proportional digits for tabular digits anywhere a number appears.
- Use crimson outside the three sanctioned roles (negative numbers, prior-year ticks, lowest-OTD mini-bars). Do not crimson-color a CTA, a heading underline, or a row hover.
- Add gradients (no, not even subtle background washes).
- Add icons to KPI cards or table cells. The system is type-only.
- Switch to dark mode. There is no dark variant.
- Use solid horizontal bars without the crimson prior-year tick — the tick is the point.
- Reorder the bar-row value string. It is **always** `XX.X% (PY YY.Y%)`.
- Use a sentence-case card title. Card titles are always uppercase tracked.
