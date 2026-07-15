---
name: claude-anthropic-design-system
description: Use this Claude / Anthropic style design system for warm, restrained, editorial AI workbench interfaces.
user-invocable: true
---

# Claude / Anthropic 风格设计系统

## What's inside

- `DESIGN.md` defines the source-backed visual rules.
- `colors_and_type.css` provides reusable tokens.
- `BRAND.md` and `PROVENANCE.json` describe the optimized package version, preserved assets, and measured/inferred evidence boundary.
- `SYSTEM-MANIFEST.json` records stable read order, file roles, and invariants.
- `fonts/`, `logos/`, and `imagery/` contain preserved official source assets from sampled Anthropic pages.
- `preview/` contains focused review cards.
- `examples/` contains detail and page-level usage examples; `examples/examples.css` is the shared fixture component layer.
- `system/kit.html` and `ui_kits/app/index.html` show applied components.

## Source Context

The system is based on the pasted Anthropic-style DESIGN.md plus Anthropic public CSS sampling recorded in `anthropic-official-colors.md`.

Source-backed evidence:

- Ivory surface ladder: `#faf9f5`, `#f0eee6`, `#e8e6dc`
- Slate action system: `#141413`, `#3d3d3a`
- Clay accent: `#d97757`, sparse use only
- Header interaction: underline hover and caret rotation
- Focus ring: `#2c84db`
- Local official webfont files: `fonts/` contains Anthropic Sans / Serif / Mono.
- Asset manifest: `source_examples/official-source-manifest.json`.
- Inference boundary: `#6ea100` is measured in source CSS and assigned here as success semantics, but it is not claimed as an official named success token.

## When to use this skill

Use it to design prototypes, mockups, interfaces, production artifacts, dashboards, forms, decks, and product shells that need a Claude / Anthropic visual language.

## How to use

1. Read `DESIGN.md`.
2. Load `colors_and_type.css`.
3. Check `SYSTEM-MANIFEST.json` for stable package structure.
4. Check `PROVENANCE.json` when a value needs source proof.
5. Start from Ivory surfaces: page `#faf9f5`, components `#f0eee6`, hover/selected `#e8e6dc`; dropdowns inherit the owning trigger/nav background.
6. Use Slate Dark `#141413` for primary actions.
7. Use Clay `#d97757` only for sparse emphasis.
8. Verify against `preview/*.html`.
9. Use `examples/index.html` for concrete details and full-page examples.
10. Do not fork nav, dropdown, button, route-tab, sidebar, or color-library logic per page; reuse `examples/examples.css` patterns.

## Highlights

- Colors: warm paper surface ladder.
- Typography: Serif display, Sans UI, Mono code.
- Spacing: 4px / 8px baseline grid.
- Radius: 8px standard cards, 12px controls.
- Layout: reading-first, bordered, low-shadow surfaces.
- Interaction: header hover uses underline and caret rotation.
- Header hover uses underline and caret rotation.
- Dropdowns inherit the owning trigger/nav theme background, open on hover/focus, and use subtle borders/shadow.
- Claude.com details: use-cases card hover, pricing route tabs, Batch processing switch, startups language picker, and Contact sales / Read more button hierarchy are captured in examples.
- Sidebar system: light rails use warm borders and Slate active states; dark overlay sidebars use Slate dark, Ivory text, and deep Slate borders.
- Numerics: prices, counts, dates, percentages, and table metrics use the mono stack with tabular numbers.
- No Ant Design default blue/green/yellow/red defaults.

## Examples

- Detail examples: `examples/details-surface-layers.html`, `details-color-library.html`, `details-hover-motion.html`, `details-scroll-route-motion.html`, `details-buttons-links.html`, `details-claude-official-interactions.html`, `details-sidebar-system.html`, `details-forms-focus.html`, `details-status-data.html`, `details-typography-cn-en.html`.
- Page examples: `examples/page-landing.html`, `page-research.html`, `page-newsroom.html`, `page-company.html`, `page-console.html`, `page-login.html`, `page-settings-form.html`.
- Start with `examples/index.html` when you need to see the system applied before designing.

## Reuse workflow

Use this package when creating or revising an Open Design artifact:

1. Read `DESIGN.md` before authoring.
2. Import `colors_and_type.css` or copy its `:root` tokens.
3. Check `preview/colors-usage.html` for layer order. Check `preview/assets-provenance.html` for preserved fonts/icons/images.
4. Check `preview/components-buttons.html` before shipping CTA-heavy screens.
5. Check `preview/navigation-menus.html` for topbar and dropdown behavior.
6. Check `preview/claude-interactions.html` for Claude.com-specific button, switch, card, language picker, and route behavior.
7. Check the matching `examples/page-*.html` before shipping a full page.

## Implementation Details

- Smooth scrolling is part of the system: keep `html { scroll-behavior: smooth; }` and disable it in `prefers-reduced-motion`.
- Product dropdowns use `.nav-demo > .nav-item + .nav-demo-panel .mega`; production opens on hover/focus-within, while `.is-open` is only for inspection fixtures.
- Carets use the shared `.caret` SVG mask and rotate exactly `180deg`; never hand-build arrow borders.
- Route switching uses `.route-tabs`, `.route-panels`, and overlapping `.route-panel` children. Toggle only `aria-selected` and `.active`; the CSS handles opacity + translateY. Use `examples/details-scroll-route-motion.html` as the visible fixture for smooth scrolling and route transitions.
- Buttons use the shared `.btn` variants and official double-ring hover model. Do not substitute color-swap hover.
- Sidebars use `details-sidebar-system.html` as the source pattern; docs sidebars follow page scroll and do not get independent persistent scrollbars.
- Prices, dates, token counts, percentages, and table metrics use `.numeric`.
