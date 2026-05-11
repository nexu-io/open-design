# SVG Visualization Template Library

This directory contains the standardized SVG visualization templates used by PPT Master — charts, infographics, process diagrams, relationship diagrams, and strategic frameworks. The directory name `charts/` is kept for backward compatibility; the library scope is broader than charts.

## Source of truth

[`charts_index.json`](./charts_index.json) is the single source of truth for the library: total count, categories, per-template purpose / use cases / size hints, and quick-lookup keywords. Both human readers and AI roles should consume it directly.

To browse the library, open `charts_index.json` — its `categories` block groups every template, and `quickLookup` maps common intents (ranking, comparison, trend, composition, etc.) to recommended templates.

## Style rules

See [`CHART_STYLE_GUIDE.md`](./CHART_STYLE_GUIDE.md) for color palette, typography, and SVG authoring conventions all templates must follow.

## Usage

Before generating a chart page, open the corresponding `<key>.svg` file to read its structure and layout. Files are named after the `key` field in `charts_index.json` (e.g. `bar_chart.svg`, `bcg_matrix.svg`).
