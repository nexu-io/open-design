# Golden Time Design System

> Category: Productivity & SaaS

A normalized Open Design package derived from the Golden Time library in a TRAE Work built-in design-library export. It is a brand-referencing implementation guide, not an official asset package.

## Visual Direction

- Write all visible product copy in English.
- Use only the CSS variables already defined by the library.
- Do not invent new semantic tokens, color names, spacing scales, or component families.
- Keep the tone premium, editorial, and dashboard-oriented.
- Prefer sentence case labels and concise microcopy.
- Let warm neutrals carry the interface and reserve stronger contrast for hierarchy, action, or urgency.
- Brand: Goldentime
- Theme direction: warm, editorial, premium, dashboard
- Signature type direction: Fraunces-led serif presentation with generous spacing
- Interaction character: restrained, confident, tactile, and calm

## Color Roles

- **Canvas:** `40 16% 98%` → `--bg`.
- **Surface:** `40 16% 98%` → `--surface`.
- **Primary text:** `37.5000 15.6863% 20%` → `--fg`.
- **Muted text:** `36.0000 19.8413% 49.4118%` → `--muted`.
- **Accent:** `37.5000 15.6863% 20%` → `--accent`.
- **Border:** `43.3333 23.0769% 84.7059%` → `--border`.
- **Danger:** `0 84.2000% 60.2000%` → `--danger`.

Use only the semantic names in `tokens.css` in generated work. Raw color literals belong only in that token block.

## Typography

- Signature type direction: Fraunces-led serif presentation with generous spacing
- Keep most supporting text on `--muted`.
- Role: search, filter, and text entry
- Titles should communicate the decision or takeaway, not just the chart type.
- Keep text contrast and state communication readable in both default and dark themes.
- Apply chart colors broadly outside data visualization contexts.

## Spacing and Layout

- Do not invent new semantic tokens, color names, spacing scales, or component families.
- Signature type direction: Fraunces-led serif presentation with generous spacing
- Radius: `--radius-md`
- Role: premium dashboard container
- Avoid turning cards into noisy mixed-purpose containers.
- Role: persistent workspace navigation shell
- Split layouts pairing tables with compact metrics or alerts
- Keep layout rhythm spacious and readable.

## Component Inventory

- **Button** (action): A softly rounded editorial button for primary calls to action, supporting calm secondary emphasis and deliberate destructive actions.
- **Card** (container): A premium dashboard surface for metrics, narratives, and compact workflows, using warm neutral contrast and spacious internal rhythm.
- **Input** (form): A refined text-entry field designed for filters, search, and profile settings with quiet borders and clear focus feedback.
- **Sidebar Navigation** (navigation): A persistent navigation rail that frames dashboard sections with understated hierarchy, tactile active states, and premium account context.
- **Data Table** (data-display): A warm-toned analytical table for operational dashboards, balancing legibility, sorting clarity, and restrained row emphasis.
- **Chart Panel** (data-visualization): A narrative chart container that pairs headline metrics, chart legends, and contextual notes inside a premium editorial frame.

The DS 3.0 runtime exposes Button, Field, Surface, and Status as the shared intent-routing primitives. Reuse their returned implementation and selectors for mapped intents.

## Interaction States

- Interaction character: restrained, confident, tactile, and calm
- Use `--accent` sparingly for hover, emphasis, and gentle highlights.
- Preserve clear focus visibility.
- Keep the active state unmistakable.
- Do not rely on color alone to communicate state, status, or chart differences.
- Keep text contrast and state communication readable in both default and dark themes.
- Use warm accent states to create tactility without visual noise.

## Motion

- overly promotional marketing language

## Accessibility

- Use only the CSS variables already defined by the library.
- Let warm neutrals carry the interface and reserve stronger contrast for hierarchy, action, or urgency.
- Variants: primary, secondary, ghost, destructive
- Preserve clear focus visibility.
- Ensure icon-only controls have accessible names.
- Keep text contrast and state communication readable in both default and dark themes.
- Only existing library variables are used.
- Supporting surfaces rely on neutrals and muted contrast.

## Avoid

- Do not invent new semantic tokens, color names, spacing scales, or component families.
- Avoid turning cards into noisy mixed-purpose containers.
- Do not overuse saturated backgrounds inside dense tables.
- Do not rely on color alone to communicate state, status, or chart differences.
