# Android Material 3 Design System

This community plugin packages a reusable Material 3 baseline for Android applications and responsive web interfaces. It includes canonical design rules, light/dark semantic CSS tokens, focused review cards, and a runnable adaptive inbox UI kit.

## Product Overview

Material 3 is a product design platform for applications that need consistent color, typography, shape, layout, component, and motion behavior. This package supports Android app design and responsive web prototyping. It provides semantic theme roles, a 15-role type scale, state and elevation guidance, and adaptive navigation patterns for compact, medium, and expanded windows. The UI kit demonstrates those rules in a task-oriented list-detail application rather than a decorative marketing page.

The package is a baseline system, not a Google product template. A consuming product must supply its own information architecture, content, source color, brand assets, and implementation constraints.

## Source Context

The original Open Design export snapshots are preserved under `references/`:

- `references/source-1-README.md` records the generated package proposal.
- `references/source-2-SKILL.md` records the original agent-facing guidance.
- `references/source-3-README.md` records the proposed inbox UI kit behavior.
- `references/source-4-source-context.md` records that intake had no linked repository, local code, Figma file, font, logo, or uploaded asset.
- `references/provenance.json` identifies the originating Open Design candidate and run.

Those files are historical evidence, not the current install manifest. `README.md`, `SKILL.md`, and the actual file tree are authoritative for what ships now. See `PROVENANCE.md` for official source links and evidence limits.

## Package Contents

- `SKILL.md` — portable agent entry with required YAML frontmatter and reuse workflow.
- `DESIGN.md` — canonical design rules and implementation boundaries.
- `colors_and_type.css` — light/dark color roles plus type, spacing, shape, elevation, state, and motion tokens.
- `PROVENANCE.md` — source list, attribution, and evidence boundary.
- `preview/` — seven focused HTML review cards plus shared preview CSS.
- `ui_kits/app/` — runnable responsive inbox entry, local styles, and modular React components.
- `references/` — preserved source-context snapshots from the originating export.

No product repository or original binary/source assets were supplied. In particular, intake captured no `assets/logo.svg`, `build/icon.png`, `fonts/Roboto.woff2`, or `source_examples/Component.tsx` evidence. Accordingly, there are no `assets/`, `build/`, `fonts/`, or `source_examples/` directories. Their absence is intentional and prevents generated placeholders from being misrepresented as preserved source evidence.

## Preview Manifest

| Preview path | Review focus |
| --- | --- |
| `preview/colors-primary.html` | Primary, secondary, tertiary, and error role pairing. |
| `preview/colors-theme-light.html` | Light surface hierarchy and container emphasis. |
| `preview/colors-theme-dark.html` | Dark role mapping and tonal elevation. |
| `preview/typography-specimens.html` | Material type roles, readable hierarchy, and fallback behavior. |
| `preview/spacing-tokens.html` | 4px spacing grid, touch targets, shape tiers, and elevation. |
| `preview/components-buttons.html` | Button families, selection, focus, and disabled states. |
| `preview/components-navigation-adaptive.html` | Compact bar, medium rail, and expanded list-detail structure. |

`preview/preview.css` is the shared review shell and is not counted as a card.

## Reuse Workflow

1. Inspect `PROVENANCE.md`, then read `DESIGN.md` as the rules source of truth.
2. Load `colors_and_type.css` and compose only with semantic tokens.
3. Open the preview cards related to the surface being built and review role pairing, hierarchy, states, and responsive behavior.
4. Open `ui_kits/app/index.html` to inspect the applied interface. Copy or adapt the modular components rather than recreating a generic static mock.
5. Replace the inbox example's content and information architecture with real product requirements while retaining accessible state behavior.
6. Verify light/dark themes, keyboard focus, 48px targets, form errors, reduced motion, and compact/medium/expanded layouts.

## Theme Integration

```html
<link rel="stylesheet" href="colors_and_type.css">
<main data-theme="light">...</main>
```

Set `data-theme="dark"` on the application root for the dark baseline. Native Android implementations should map the same semantic intent through `MaterialTheme` rather than importing this web CSS.

## Validation

The package is ready when the plugin schema validation, design-system package audit, repository guard, and focused browser review all pass. Every path listed in this README must remain synchronized with the file tree.
