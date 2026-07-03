---
name: claude-anthropic-design-system
description: Use this when designing, reviewing, or implementing Open Design artifacts that must follow the Claude / Anthropic visual language, including warm paper surfaces, Slate primary actions, restrained Clay accents, official-style navigation/dropdowns/buttons, route motion, sidebar systems, state colors, typography, and reusable HTML/CSS examples. Also use when maintaining this Open Design design-system package or installing it as an agent skill.
---

# Claude / Anthropic Design System

This folder is both:

- an Open Design design-system project registered as `user:anthropic`;
- a canonical source package that can be exposed to agents as a skill.

This is a non-official style system. It is not affiliated with or endorsed by Anthropic. Read `NOTICE.md` before publishing or reusing preserved assets outside local design-system work.

When this skill is installed through the local `agent-skills` registry, the registry skill should be a small stub whose `design-system/` symlink points back to this Open Design project. Do not duplicate the full package into a second canonical directory.

## Read Order

1. `SYSTEM-MANIFEST.json` - package structure, stable checks, file roles, and implementation classes.
2. `DESIGN.md` - human-readable design rules and official usage guidance.
3. `brand.json` - machine-readable tokens, palette, preview theme, rules, examples, and manifest data.
4. `colors_and_type.css` - canonical CSS tokens, font faces, smooth scrolling, selection color, and low-level component variables.
5. `examples/examples.css` - canonical component and interaction classes.
6. `style-library.json` - curated overlay/import presets; ordinary example CSS is not a preset source.
7. `examples/index.html` - unified route hub for detail fixtures, page examples, and material-direction examples.
8. `PROVENANCE.json` and `context/anthropic-official-usage-evidence.md` - source evidence when a rule needs proof.

Read only the specific `examples/details-*.html`, `examples/page-*.html`, or `system/artifacts/*.html` file needed for the current artifact. Use the materials route for deliverable formats, but keep detail fixtures higher priority for component behavior. Do not load every preview or artifact file by default.

## Priority Rules

- `DESIGN.md`, `brand.json`, `system/tokens.*.json`, and `colors_and_type.css` define the system.
- `style-library.json` is the explicit style preset library for tools/plugins; add missing reusable presets there instead of relying on CSS guessing.
- `examples/examples.css` and `examples/details-*.html` are the gold-standard implementation fixtures for controls and interactions.
- `examples/page-*.html` shows page-level composition.
- `preview/*.html` are quick review cards.
- `system/artifacts/*.html` are material-direction deliverable examples reachable through `examples/index.html#materials`; they must not override canonical rules or detail fixtures.
- `PROVENANCE.json`, `context/`, `source_examples/`, `fonts/`, `logos/`, and `imagery/` are evidence/assets, not component APIs. `logos/` has official icon/mask assets but no full wordmark; `imagery/official-svg/` has official organic SVG illustrations for editorial/reference use. Use `examples/details-official-svg-imagery.html` when deciding how to place those SVGs in real pages.
- `*.artifact.json`, `.od-skills/`, and `plugin-source/` are Open Design/source sidecars; do not copy them into new artifacts.

## Implementation Contract

- Import `colors_and_type.css` before artifact-specific CSS.
- Reuse shared classes from `examples/examples.css`; do not fork nav, dropdown, button, route, sidebar, card, switch, state, or color-library behavior per page.
- Keep the outer design-system topbar content identical across every HTML page. Put page-specific identity, current route, app toolbars, and local navigation inside the page body, sidebar, or product UI.
- Keep `brand.json.colors`, `brand.json.palette`, and `brand.json.previewTheme` populated. Empty machine color fields can make Open Design previews fall back to a default blue theme.
- Treat `manifest.json.previewEntry`, `displayEntry`, `showcaseEntry`, and `brand.json.preview.entry` as the Open Design display route. They must keep pointing at `system/artifacts/landing.html`.
- Route logic has three layers only: outer topbar links for global destinations, route tabs for in-page grouping, and cards/rows for concrete targets. Do not add duplicate CTA buttons for the same target.
- Split CTA triggers must be real links or real menu triggers; never ship an inert arrow-only button.
- Product dropdowns open on hover/focus. Normal showcase, preview, kit, and page files must not ship `.nav-demo.is-open`.
- For cookbook-style index cards, copy `.cookbook-grid .tile` and treat it like `.docs-card`: local paper-depth hover, not a separate transparent-tile invention.
- Pick hover behavior by taxonomy before styling: `.tutorial-card` is a resources/tutorials card, `.tutorial-card-group` adds grouped background-depth hover, `.cookbook-grid .tile` / `.docs-card` use local paper-depth hover, `.btn.secondary` is Get-help reverse hover, `.btn.tertiary`/`.btn.tiny` are double-ring, and `.nav-demo` is dropdown motion.
- Official SVG illustrations are content imagery, not chrome. Use `examples/details-official-svg-imagery.html` and the manifest in `source_examples/official-svg-imagery-manifest.json`; do not turn the SVG set into a logo, wordmark, button icon library, or mechanical decoration on every card.
- Dropdown menus have two variants: `.mega-card` underline hover for product menus, and `.mega.highlight-menu` / `.dropdown.is-highlight` for Solutions/tutorials-style shallow highlight dropdown menus. Highlight menus keep padding on every side, keep default item text readable, and only dim non-hovered sibling items while one item is hovered or focused.
- Carets use the shared SVG-mask `.caret` and rotate exactly `180deg`.
- Buttons use `.btn.primary`, `.btn.secondary`, `.btn.tertiary`, `.btn.tiny`, and `.btn.brand` with tier-specific official hover: secondary/Get help reverses to Slate fill, tertiary/tiny use double-ring, brand is rare Clay. Do not replace hover with arbitrary color swaps.
- Batch switches use `#2c84db` for the checked track.
- Route switching uses `.route-tabs + .route-panels > .route-panel.active` with opacity and translate motion, not display hard-cuts. The single route indicator follows hover/focus and returns to the selected tab on mouseleave/focusout; do not create separate hover pills per button.
- Developer terminal blocks use `examples/details-code-terminal.html`: `.terminal-window`, `.terminal-toolbar`, `.terminal-controls`, `.terminal-tabs`, `.terminal-workspace`, `.terminal-sidebar`, `.terminal-screen`, `.terminal-stream`, `.terminal-block`, `.terminal-row`, `.terminal-output-block`, and `.terminal-cursor` for CLI session contexts. `.terminal-controls` are red/yellow/green traffic-light window controls, not Anthropic brand semantic dots. API/SDK snippets use `.code-block`, `.code-block-header`, `.code-block-body`, `.copy-button`, `.code-line.highlighted`, and `.code-line.dimmed`. Do not collapse CLI terminals back into ordinary `pre/code` blocks, keep editor-style gutters out of terminal sessions, put copy actions in the window chrome, or turn terminal components into full-page black backgrounds.
- Docs/sidebar examples follow `examples/details-sidebar-system.html`; they should not create a persistent independent scrollbar.
- Prices, dates, token counts, percentages, and table metrics use `.numeric` with mono tabular figures.
- Product states use `.state-card.empty`, `.state-card.loading`, and `.state-card.error`; actions inside error panels still use ordinary button tiers, not error-colored buttons.
- Status badges use `.status.success/.info/.warning/.error`: soft semantic background plus semantic status text/dot and switch-like pill radius. Larger state panels keep soft low-saturation backgrounds, and their actions use ordinary button tiers.

## Open Design Dual-Use Setup

The Open Design project directory is the canonical source. To expose it to the local Obsidian `agent-skills` registry without duplicating files, run:

```bash
scripts/install-as-agent-skill.sh
```

The script creates:

```text
agent-skills/custom/claude-anthropic-design-system/
  SKILL.md
  agents/openai.yaml
  design-system -> <this Open Design project>
```

That stub is what the registry scans and installs. The symlink keeps Open Design and agent usage on the same editable source.

## Contribution / Security Boundary

Before publishing or moving this package, read `CONTRIBUTING.md` and `SECURITY.md`.
Also read `NOTICE.md` for non-affiliation, mark, asset, and measured/inferred evidence boundaries.

Do not include secrets, cookies, authorization tokens, raw local crawl caches, personal absolute paths, or private project screenshots in public package metadata. Keep source evidence reproducible through public URLs and relative project paths.
