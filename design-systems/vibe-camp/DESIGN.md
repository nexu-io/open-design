# Vibe Camp Design System

> Category: Themed & Unique

A normalized Open Design package derived from the Vibe Camp library in a TRAE Work built-in design-library export. It is a brand-referencing implementation guide, not an official asset package.

## Visual Direction

- Radius is one rule: `18px` (`1.125rem`) across cards, buttons, and shell surfaces. The silhouette should feel soft and chunky, not sharp.
- Spacing base is `4px` (`0.25rem`). Use it to build generous internal padding instead of ultra-dense enterprise compression.
- Fonts are fixed: `Geist` for UI, `Playfair Display` for editorial contrast, and `Roboto Mono` for numeric or code-like accents. Do not flatten everything into a single sans.
- Light surfaces stay warm with paper-like neutrals and dark text; dark mode stays brown-charcoal rather than blue-black. Avoid cold white canvases or icy dark shells.
- Navigation carries visual weight through deep neutral secondary/sidebar accents, and charts should continue to mix warm and digital notes instead of flattening into generic analytics colors.
- Shadows are intentionally quiet: the core shadow uses `2px 2px 10px 4px` with opacity `0`. Depth should come from color blocking and contrast, not visible lift.
- Voice is short and utilitarian: labels like `Overview`, `Sessions`, `Community`, `Analytics`, and `Settings` set the tone without decorative marketing language.

## Color Roles

- **Canvas:** `#e3dfd9` → `--bg`.
- **Surface:** `#f3f0eb` → `--surface`.
- **Primary text:** `#211d1a` → `--fg`.
- **Muted text:** `#5c5650` → `--muted`.
- **Accent:** `#f1481e` → `--accent`.
- **Border:** `#cbc3ba` → `--border`.
- **Danger:** `#ef4444` → `--danger`.

Use only the semantic names in `tokens.css` in generated work. Raw color literals belong only in that token block.

## Typography

- Fonts are fixed: `Geist` for UI, `Playfair Display` for editorial contrast, and `Roboto Mono` for numeric or code-like accents. Do not flatten everything into a single sans.
- Light surfaces stay warm with paper-like neutrals and dark text; dark mode stays brown-charcoal rather than blue-black. Avoid cold white canvases or icy dark shells.

## Spacing and Layout

- Radius is one rule: `18px` (`1.125rem`) across cards, buttons, and shell surfaces. The silhouette should feel soft and chunky, not sharp.
- Spacing base is `4px` (`0.25rem`). Use it to build generous internal padding instead of ultra-dense enterprise compression.

## Component Inventory

- **Button** (action): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Card** (container): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Table** (data-display): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Chart** (data-visualization): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Navigation** (navigation): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Sidebar** (navigation): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.

The DS 3.0 runtime exposes Button, Field, Surface, and Status as the shared intent-routing primitives. Reuse their returned implementation and selectors for mapped intents.

## Interaction States

- Every interactive control needs visible hover and keyboard-focus behavior.
- Disabled, selected, warning, and success states must remain distinguishable without relying on color alone.

## Motion

- Use `--motion-fast` for hover and focus feedback and `--motion-base` for state changes.
- Prefer short ease-out transitions; remove non-essential motion when reduced motion is requested.

## Accessibility

- Fonts are fixed: `Geist` for UI, `Playfair Display` for editorial contrast, and `Roboto Mono` for numeric or code-like accents. Do not flatten everything into a single sans.
- Shadows are intentionally quiet: the core shadow uses `2px 2px 10px 4px` with opacity `0`. Depth should come from color blocking and contrast, not visible lift.
- Voice is short and utilitarian: labels like `Overview`, `Sessions`, `Community`, `Analytics`, and `Settings` set the tone without decorative marketing language.

## Avoid

- Fonts are fixed: `Geist` for UI, `Playfair Display` for editorial contrast, and `Roboto Mono` for numeric or code-like accents. Do not flatten everything into a single sans.
- Light surfaces stay warm with paper-like neutrals and dark text; dark mode stays brown-charcoal rather than blue-black. Avoid cold white canvases or icy dark shells.
