# Google Design System

> Category: Media & Consumer

A normalized Open Design package derived from the Google library in a TRAE Work built-in design-library export. It is a brand-referencing implementation guide, not an official asset package.

## Visual Direction

- Primary color is `#4285f4` in light mode, but the main accent flips to `#fc2c50` in dark mode; preserve that mode-specific energy instead of forcing one universal brand blue.
- Surface design is flat and analytical: backgrounds stay near `#ffffff`, `#f9f9fa`, and `#eff1f4` in light mode, while hierarchy comes from borders like `#ebebeb`, not soft shadows.
- Radius is a single `8px` baseline (`--radius-md: 0.5rem`); keep shapes structured and gently rounded, with no extra-soft 12–24px cards.
- Spacing runs on a tight `3.84px` micro-unit; prefer compact dashboard rhythm and avoid oversized marketing-page padding.
- Typography is `DM Sans` for interface copy and `JetBrains Mono` for data-heavy or technical details; keep the overall voice crisp, modern, and quietly functional.
- Shadow philosophy is nearly zero-elevation: shadow tokens exist, but their opacity is `0`, so depth should come from tonal contrast, borders, and panel grouping.
- Chart color is where the system becomes expressive: light mode uses `#4285f4`, `#ea4335`, `#fbbc05`, `#0043ad`, and `#34a853`; dark mode switches to brighter high-contrast data colors.
- Sidebar styling is a signature pattern, not a default shell: light mode uses a dedicated sidebar wash `#f0f6ff`, while dark mode uses `#171717` with stronger accent navigation states.
- Controls should feel compact and dashboard-first, roughly `32px` tall in practice, with emphasis carried by color and outline clarity rather than bulky sizing or raised chrome.

## Color Roles

- **Canvas:** `#ffffff` → `--bg`.
- **Surface:** `#ffffff` → `--surface`.
- **Primary text:** `#0e1115` → `--fg`.
- **Muted text:** `#7f8d9f` → `--muted`.
- **Accent:** `#4285f4` → `--accent`.
- **Border:** `#ebebeb` → `--border`.
- **Danger:** `#ef4444` → `--danger`.

Use only the semantic names in `tokens.css` in generated work. Raw color literals belong only in that token block.

## Typography

- Typography is `DM Sans` for interface copy and `JetBrains Mono` for data-heavy or technical details; keep the overall voice crisp, modern, and quietly functional.

## Spacing and Layout

- Radius is a single `8px` baseline (`--radius-md: 0.5rem`); keep shapes structured and gently rounded, with no extra-soft 12–24px cards.
- Spacing runs on a tight `3.84px` micro-unit; prefer compact dashboard rhythm and avoid oversized marketing-page padding.

## Component Inventory

- **Button** (action): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Card** (container): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Table** (data-display): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Chart** (data-visualization): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Navigation** (navigation): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Sidebar** (navigation): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.

The DS 3.0 runtime exposes Button, Field, Surface, and Status as the shared intent-routing primitives. Reuse their returned implementation and selectors for mapped intents.

## Interaction States

- Sidebar styling is a signature pattern, not a default shell: light mode uses a dedicated sidebar wash `#f0f6ff`, while dark mode uses `#171717` with stronger accent navigation states.

## Motion

- Use `--motion-fast` for hover and focus feedback and `--motion-base` for state changes.
- Prefer short ease-out transitions; remove non-essential motion when reduced motion is requested.

## Accessibility

- Shadow philosophy is nearly zero-elevation: shadow tokens exist, but their opacity is `0`, so depth should come from tonal contrast, borders, and panel grouping.
- Chart color is where the system becomes expressive: light mode uses `#4285f4`, `#ea4335`, `#fbbc05`, `#0043ad`, and `#34a853`; dark mode switches to brighter high-contrast data colors.

## Avoid

- Spacing runs on a tight `3.84px` micro-unit; prefer compact dashboard rhythm and avoid oversized marketing-page padding.
