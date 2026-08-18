# Barbie Design System

> Category: Themed & Unique

A normalized Open Design package derived from the Barbie library in a TRAE Work built-in design-library export. It is a brand-referencing implementation guide, not an official asset package.

## Visual Direction

- Brand primary is `#e91e63` in light mode and shifts brighter to `#ff007f` in dark mode; keep the palette unapologetically pink, glossy, and high-contrast.
- Base surfaces stay airy with `#ffffff` background, `#fffafc` cards, and `#fff0f6` sidebar; dark mode flips to `#1a000e` and `#2d001a` instead of neutral gray.
- Radius is a single oversized `28.8px`; this plush curve is the system signature, so controls, cards, and navigation all feel toy-like and soft.
- Spacing is built on a `4px` base token; layouts should stay dashboard-dense but never cramped, with pink breathing room rather than hard enterprise grids.
- Type stack is explicit: `Inter` for UI, `Georgia` for editorial emphasis, and `JetBrains Mono` for utility data; tracking is tightened to `-0.02em`.
- Elevation uses pink-tinted shadows, not grayscale: `0px 5.5px 12.5px` with `#ff0059` at `0.08` opacity for default lift and `0.20` at `shadow-2xl` for hero emphasis.
- Primary actions should read as bright pink fills with white text, while secondary states fall back to powder tones like `#fce4ec` and blush accents like `#ff9ec5`.
- Signature UI patterns are the active pink sidebar capsule, the crisp navigation underline, airy performance tables, and charts built from the saturated pink scale `#e91e63` → `#880e4f`.

## Color Roles

- **Canvas:** `oklch(1.0000 0 0)` → `--bg`.
- **Surface:** `oklch(0.9895 0.0059 350.7928)` → `--surface`.
- **Primary text:** `oklch(0.2028 0.0822 0.1376)` → `--fg`.
- **Muted text:** `oklch(0.5677 0.2303 359.6592)` → `--muted`.
- **Accent:** `oklch(0.6062 0.2298 9.6281)` → `--accent`.
- **Border:** `oklch(0.9405 0.0282 355.4367)` → `--border`.
- **Danger:** `oklch(0.5482 0.2250 29.2339)` → `--danger`.

Use only the semantic names in `tokens.css` in generated work. Raw color literals belong only in that token block.

## Typography

- Type stack is explicit: `Inter` for UI, `Georgia` for editorial emphasis, and `JetBrains Mono` for utility data; tracking is tightened to `-0.02em`.
- Primary actions should read as bright pink fills with white text, while secondary states fall back to powder tones like `#fce4ec` and blush accents like `#ff9ec5`.

## Spacing and Layout

- Radius is a single oversized `28.8px`; this plush curve is the system signature, so controls, cards, and navigation all feel toy-like and soft.
- Spacing is built on a `4px` base token; layouts should stay dashboard-dense but never cramped, with pink breathing room rather than hard enterprise grids.

## Component Inventory

- **Button** (actions): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Card** (containers): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Table** (data-display): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Chart** (data-visualization): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Navigation** (navigation): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Sidebar** (navigation): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.

The DS 3.0 runtime exposes Button, Field, Surface, and Status as the shared intent-routing primitives. Reuse their returned implementation and selectors for mapped intents.

## Interaction States

- Primary actions should read as bright pink fills with white text, while secondary states fall back to powder tones like `#fce4ec` and blush accents like `#ff9ec5`.
- Signature UI patterns are the active pink sidebar capsule, the crisp navigation underline, airy performance tables, and charts built from the saturated pink scale `#e91e63` → `#880e4f`.

## Motion

- Use `--motion-fast` for hover and focus feedback and `--motion-base` for state changes.
- Prefer short ease-out transitions; remove non-essential motion when reduced motion is requested.

## Accessibility

- Brand primary is `#e91e63` in light mode and shifts brighter to `#ff007f` in dark mode; keep the palette unapologetically pink, glossy, and high-contrast.

## Avoid

- Spacing is built on a `4px` base token; layouts should stay dashboard-dense but never cramped, with pink breathing room rather than hard enterprise grids.
