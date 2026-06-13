# Layouts catalog

Every layout lives in `templates/single-page/<name>.html` as a fully
functional standalone page with realistic demo data. Open any file directly
in Chrome to see it working.

To compose a new deck: open the file, copy the `<section class="slide">…</section>`
block (or multiple blocks) into your deck HTML, and replace the demo data.
Shared CSS (base, theme, animations) is already wired by `deck.html`.

## Openers & transitions

| file | purpose |
|---|---|
| `cover.html` | Deck cover. Kicker + huge title + lede + pill row. |
| `toc.html` | Table of contents. 2×3 grid of numbered cards. |
| `section-divider.html` | Big numbered section break (02 · Theme). |

## Text-centric

| file | purpose |
|---|---|
| `bullets.html` | Classic bullet list with card-wrapped items. |
| `two-column.html` | Concept + example side by side. |
| `three-column.html` | Three equal pillars with icons. |
| `big-quote.html` | Full-bleed pull quote in editorial-serif style. |

## Numbers & data

| file | purpose |
|---|---|
| `stat-highlight.html` | One giant number + subtitle (uses `.counter` animation). |
| `kpi-grid.html` | 4 KPIs in a row with up/down deltas. |
| `table.html` | Data table with hover rows, right-aligned numerics. |
| `chart-bar.html` | Chart.js bar chart, theme-aware colors. |
| `chart-line.html` | Chart.js dual-line chart with filled area. |
| `chart-pie.html` | Chart.js doughnut + takeaways card. |
| `chart-radar.html` | Chart.js radar comparing 2 products on 6 axes. |

## Code & terminal

| file | purpose |
|---|---|
| `code.html` | Syntax-highlighted code via highlight.js (JS example). |
| `diff.html` | Hand-rolled +/- diff view. |
| `terminal.html` | Terminal window mock with traffic-light header. |

## Diagrams & flows

| file | purpose |
|---|---|
| `flow-diagram.html` | 5-node pipeline with arrows and one highlighted node. |
| `arch-diagram.html` | 3-tier architecture grid. |
| `process-steps.html` | 4 numbered steps in cards. |
| `mindmap.html` | Radial mindmap with SVG path-draw animation. |

## Plans & comparisons

| file | purpose |
|---|---|
| `timeline.html` | 5-point horizontal timeline with dots. |
| `roadmap.html` | 4-column NOW / NEXT / LATER / VISION. |
| `gantt.html` | 12-week gantt chart with 5 parallel tracks. |
| `comparison.html` | Before vs After two-panel card. |
| `pros-cons.html` | Pros and cons two-card layout. |
| `todo-checklist.html` | Checklist with checked/unchecked states. |

## Visuals

| file | purpose |
|---|---|
| `image-hero.html` | Full-bleed hero with Ken Burns gradient background. |
| `image-grid.html` | 7-cell bento grid with gradient placeholders. |

## Closers

| file | purpose |
|---|---|
| `cta.html` | Call-to-action with big gradient headline + buttons. |
| `thanks.html` | Final "Thanks" page with confetti burst. |

## Picking a layout

- **Opener**: `cover.html`, often followed by `toc.html`.
- **Section break**: `section-divider.html` before every major section.
- **Core content**: `bullets.html`, `two-column.html`, `three-column.html`.
- **Show numbers**: `stat-highlight.html` (single) or `kpi-grid.html` (4-up).
- **Show plot**: `chart-bar.html` / `chart-line.html` / `chart-pie.html` / `chart-radar.html`.
- **Show a diff or change**: `comparison.html`, `diff.html`, `pros-cons.html`.
- **Show a plan**: `timeline.html`, `roadmap.html`, `gantt.html`, `process-steps.html`.
- **Show architecture**: `arch-diagram.html`, `flow-diagram.html`, `mindmap.html`.
- **Code / demo**: `code.html`, `terminal.html`.
- **Closer**: `cta.html` → `thanks.html`.

## Naming / structure conventions

- Each slide is `<section class="slide" data-title="...">`.
- Header pills: `<p class="kicker">…</p>`, eyebrow: `<p class="eyebrow">…</p>`.
- Titles: `<h1 class="h1">…</h1>` / `<h2 class="h2">…</h2>`.
- Lede: `<p class="lede">…</p>`.
- Cards: `<div class="card">…</div>` (variants: `card-soft`, `card-outline`, `card-accent`).
- Grids: `.grid.g2`, `.grid.g3`, `.grid.g4`.
- Notes: `<div class="notes">…</div>` per slide.
