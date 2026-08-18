# Doubao Design System

> Category: AI & LLM

A normalized Open Design package derived from the Doubao library in a TRAE Work built-in design-library export. It is a brand-referencing implementation guide, not an official asset package.

## Visual Direction

- Library: `doubao`
- Brand: `Doubao`
- Product type: `AI dashboard`
- Kit type: `dashboard`
- Language: `en`
- Generation mode: `inferred-from-tokens`
- Skipped artifacts: `none`
- CSS variable coverage: 55 variables, no icon set bundled
- Primary action color: `--accent` = `#0065fd`
- App background: `--bg` = `#ffffff`

## Color Roles

- **Canvas:** `#ffffff` → `--bg`.
- **Surface:** `#ffffff` → `--surface`.
- **Primary text:** `#0e1115` → `--fg`.
- **Muted text:** `#7f8d9f` → `--muted`.
- **Accent:** `#0065fd` → `--accent`.
- **Border:** `#e7eaef` → `--border`.
- **Danger:** `#ef4444` → `--danger`.

Use only the semantic names in `tokens.css` in generated work. Raw color literals belong only in that token block.

## Typography

- Product type: `AI dashboard`
- Kit type: `dashboard`
- Main text: `--fg` = `#0e1115`
- Sans font: `Stack Sans Text, ui-sans-serif, sans-serif, system-ui`
- Serif font: `Source Serif 4, serif`
- Mono font: `JetBrains Mono, monospace`
- Components were inferred from the token system and product type because the source material did not include authored component specs.

## Spacing and Layout

- Shared radius: `--radius-md` = `19.2px`
- Mono font: `JetBrains Mono, monospace`

## Component Inventory

- **Button** (action): Primary and secondary call-to-action control for dashboard flows and AI task execution.
- **Search Input** (form): Compact search and filter entry for navigation rails, command bars, and content lists.
- **App Card** (content): Flexible container for model summaries, task snapshots, metrics, or saved workspace items.
- **Sidebar Navigation** (navigation): Primary application navigation for a dashboard or AI workspace shell.
- **Data Table** (data-display): Structured tabular view for tasks, sources, model runs, or evaluation results.
- **Chat Composer** (ai-interaction): Prompt entry surface for AI interactions, follow-up questions, and multimodal task composition.

The DS 3.0 runtime exposes Button, Field, Surface, and Status as the shared intent-routing primitives. Reuse their returned implementation and selectors for mapped intents.

## Interaction States

- Focus ring: `--focus-ring` = `#557fff`

## Motion

- Use `--motion-fast` for hover and focus feedback and `--motion-base` for state changes.
- Prefer short ease-out transitions; remove non-essential motion when reduced motion is requested.

## Accessibility

- CSS variable coverage: 55 variables, no icon set bundled
- Focus ring: `--focus-ring` = `#557fff`

## Avoid

- Do not invent a near-copy when a mapped component exists.
- Do not bypass the no-match confirmation rule.
- Do not add undeclared tokens, arbitrary color literals, or unverified component states.
