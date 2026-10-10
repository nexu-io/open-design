---
name: android-material-3-design-system-msp7eswv
description: Use this skill to create Android or responsive web interfaces with Material 3 semantic color roles, typography, shapes, adaptive layouts, component states, and motion guidance.
user-invocable: true
---

# Android Material 3 Design System

## What is inside

- `README.md` explains the package, source boundary, preview manifest, and reuse workflow.
- `DESIGN.md` is the canonical rule set for color, type, spacing, shape, layout, components, motion, voice, and anti-patterns.
- `colors_and_type.css` provides reusable light and dark semantic tokens.
- `preview/` contains focused, browser-reviewable color, typography, spacing, component, and adaptive-layout cards.
- `ui_kits/app/` contains a runnable responsive inbox example with modular React components.
- `PROVENANCE.md` and `references/` record the source basis and the original Open Design export snapshots.

No source repository, product assets, build icons, font files, or source components were supplied during intake. Therefore this package intentionally has no `assets/`, `build/`, `fonts/`, or `source_examples/` directories. Do not invent preserved evidence to fill those paths.

## Source context

The package is based on the Material 3 guidance identified by the preserved export snapshots in `references/`. Read `PROVENANCE.md` before treating any value as product-specific evidence. The included palette is the Material 3 baseline fallback, not a claim about a particular application's brand.

Material documentation-site chrome, Google product branding, and website assets are not part of this package. For a real product, obtain its source color, type, assets, and interaction requirements before adapting these rules.

## When to use this skill

Use this skill for Material 3 prototypes, interfaces, artifacts, and production design work, including:

- Jetpack Compose Material 3 applications and feature surfaces.
- Responsive web prototypes that map Material semantic roles without pretending to be native controls.
- Compact, medium, and expanded navigation or list-detail layouts.
- Forms, dialogs, buttons, cards, lists, snackbars, and progress states.
- Light/dark themes, accessible state layers, keyboard focus, and reduced motion.

Do not use this skill to copy a Google product. It supplies system grammar, not product information architecture, brand identity, or content.

## How to use

1. Read `README.md`, `DESIGN.md`, and `PROVENANCE.md` before generating an artifact.
2. Load `colors_and_type.css`; consume semantic `--md-sys-*` tokens instead of scattering literal color, type, spacing, or radius values.
3. Open the relevant `preview/*.html` cards and compare the intended role pairing, hierarchy, states, and responsive behavior.
4. Reuse the structure and interaction patterns in `ui_kits/app/`, replacing the example inbox information architecture and copy with the product's real content.
5. If product evidence supplies a source color, generate a complete light/dark scheme rather than replacing only `primary`.
6. Validate contrast, 48px touch targets, keyboard focus, error text, reduced motion, and compact/medium/expanded layouts.
7. If future evidence introduces real assets, build icons, fonts, or source components, preserve them under `assets/`, `build/`, `fonts/`, or `source_examples/` and update every package manifest section together.

## Design system highlights

- Colors use semantic role pairs: a container role and its matching `on-*` role stay together.
- Typography uses the 15-role Material baseline with Roboto-compatible fallbacks.
- Spacing follows a 4px grid; component geometry uses 4/8/12/16/24/full radius tiers.
- Layout changes with available window width: compact is single-pane, medium introduces a rail, and expanded supports simultaneous list-detail content.
- Tonal surfaces establish hierarchy before shadows.
- Interaction covers enabled, hover, focus, pressed, selected, error, and disabled states.
- Standard motion supports frequent actions; expressive motion is reserved for meaningful transitions and must honor reduced-motion preferences.

## Maintenance

Keep `README.md`, `DESIGN.md`, `colors_and_type.css`, the Preview Manifest, and `ui_kits/app/README.md` synchronized. A path mentioned as current package content must exist. Preserve files under `references/` as provenance snapshots; update the current root documents instead of rewriting historical evidence.
