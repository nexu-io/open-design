---
name: bergside-trade-terminal
description: Dark cyber-terminal trading dashboard in the Matrix style — Space Mono everywhere, near-black blue surfaces, dense data tables, red/green price semantics, and one green interaction accent.
---

# Bergside Trade Terminal

A crypto/equities trading terminal built on the "Matrix" style from
bergside/awesome-design-skills: dark cyber-terminal visual language, mono
typography, dense data layouts, and exactly one green interaction accent.
Everything is a table or a chart; chrome stays out of the way.

## When to use

- Briefs mentioning "trading terminal", "crypto dashboard", "market data",
  "order book", "watchlist", "ticker", "exchange UI", "bloomberg-style"
- Real-time monitoring surfaces: prices, feeds, logs, telemetry
- Any dark, dense, keyboard-first financial or ops tool

## Style rules

- **Palette (Matrix tokens).** Canvas `#0b0c14`, panel `#10121d`, raised
  panel `#151827`, borders `#1e2233` / strong `#2a2f45`. Text `#dfe4f2`,
  dim `#8a91a8`, faint `#565d75`. Interaction accent: Matrix green
  `#2db58a` only -- active states, selected row inset bar, live dot, tags,
  chart line, mid-price. Price semantics: up `#16a34a`, down `#dc2626`,
  each with a 12%-opacity wash for depth bars; warning `#d97706` for
  partial fills. No other hues.
- **Typography.** Space Mono (Google Fonts) for everything, fallback
  SFMono-Regular/Menlo/Consolas/monospace. Matrix scale in px: 10-11 for
  column heads and axis labels (uppercase, 0.08-0.1em tracking), 12-13
  body/data, 14-16 instrument name, 24 for the last price. Weights 400 and
  700 only. All numerals `font-variant-numeric: tabular-nums`; negatives
  use the true minus sign.
- **Layout.** Full-viewport grid: 48px top bar, then three columns
  `292px / 1fr / 300px` split by 1px strong borders -- watchlist left,
  instrument (header, timeframe rail, SVG chart, open orders) center,
  order book plus trade tape right. Matrix spacing scale 4/8/12/16/24;
  data rows 3-7px vertical padding. Density is the aesthetic: no empty
  decorative regions.
- **Panels.** Every panel opens with a `panel-head`: 11px uppercase label
  left, green metadata tag right, hairline below. Radius 4px on small
  controls only; panels themselves are square. No drop shadows -- depth
  comes from surface steps and borders (the only glow is the 7px live dot).
- **Data furniture.** Sparklines are 56x16 inline SVG polylines stroked in
  the semantic red/green. The main chart is a hand-written SVG path with a
  2px accent stroke, 8%-opacity area fill, dashed last-price rule, and
  10px axis text. Order-book depth bars are row-level
  `linear-gradient(to left, wash N%, transparent N%)` backgrounds sized to
  the cumulative sum column.
- **States.** Row hover raises to `#151827`; the active watchlist row gets
  the accent wash plus a 1px inset accent bar; the selected timeframe
  button fills solid green with near-black text; cancel affordances sit
  faint until hovered red. Themed `::selection` (green on dark).

## Anti-patterns

- Any second interaction accent (blue links, purple charts) -- green owns it
- Proportional figures, centered numeric columns, or `-` instead of the minus sign
- Rounded cards, soft shadows, glassmorphism, or gradient decoration
- Light-mode surfaces or pure `#000` backgrounds
- Using red/green for anything other than price direction and order side
- Sparse marketing-style whitespace; this surface is deliberately dense

## Template fidelity (hard constraint)

The bundled `example.html` in this folder is the ground truth for this
template, not loose inspiration. Before generating, read `example.html`
and reproduce its visual system:

1. Reuse its layout skeleton, section order, spacing rhythm, typography
   stack, color tokens, and signature components as-is.
2. Swap only CONTENT for the user's brief: copy, data, imagery subjects,
   brand name. Structure, hierarchy, and visual language stay.
3. Keep the same fonts (or the closest available), the same accent-color
   discipline, and the same interaction details (hover states, motion).
4. Output copy follows the language of the user's brief, but the result
   must remain recognizably this template when placed side-by-side with
   `example.html`.
5. If the brief conflicts with the template, make the smallest deviation
   that satisfies the brief. Never redesign from scratch.

Original page authored for OpenDesign following the Matrix style of https://github.com/bergside/awesome-design-skills (MIT)
