# TikTok Design System

> Category: Media & Consumer

A normalized Open Design package derived from the TikTok library in a TRAE Work built-in design-library export. It is a brand-referencing implementation guide, not an official asset package.

## Visual Direction

- **Override:** only switch to web discovery or editorial scenes when the user explicitly asks for a non-mobile platform.
- Mobile feed UI floats over video with a single bottom readability gradient; no top-bar blur.
- Editorial uses a 12-col grid, compressed display type, and at most one serif-italic emphasis word.
- Spacing 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64; radius 2 / 6 / 8 / 12 + pill only when needed.
- Motion vocabulary: marquee, heart pulse, disc spin, tab underline, chip swap; animate opacity/transform only, ≤3 visible animations per screen.
- Voice: real handles, captions, hashtags, counts, audio strings — never lorem ipsum or generic placeholder copy.

## Color Roles

- **Canvas:** `#0B0B10` → `--bg`.
- **Surface:** `#161823` → `--surface`.
- **Primary text:** `#F5F5F7` → `--fg`.
- **Muted text:** `#AEB2C0` → `--muted`.
- **Accent:** `#FE2C55` → `--accent`.
- **Border:** `#3A3D52` → `--border`.
- **Danger:** `#E5484D` → `--danger`.

Use only the semantic names in `tokens.css` in generated work. Raw color literals belong only in that token block.

## Typography

- Editorial uses a 12-col grid, compressed display type, and at most one serif-italic emphasis word.

## Spacing and Layout

- Editorial uses a 12-col grid, compressed display type, and at most one serif-italic emphasis word.
- Spacing 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64; radius 2 / 6 / 8 / 12 + pill only when needed.

## Component Inventory

- **Bottom Info** (component): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Bottom Nav** (component): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Editorial Cover** (component): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Right Rail** (component): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Top Tab** (component): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Video Card** (component): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.

The DS 3.0 runtime exposes Button, Field, Surface, and Status as the shared intent-routing primitives. Reuse their returned implementation and selectors for mapped intents.

## Interaction States

- Every interactive control needs visible hover and keyboard-focus behavior.
- Disabled, selected, warning, and success states must remain distinguishable without relying on color alone.

## Motion

- Motion vocabulary: marquee, heart pulse, disc spin, tab underline, chip swap; animate opacity/transform only, ≤3 visible animations per screen.

## Accessibility

- Maintain readable contrast for text and controls.
- Preserve semantic HTML, labels, focus order, and keyboard access.
- Interactive targets should be at least 44 × 44 CSS pixels where touch is expected.

## Avoid

- Voice: real handles, captions, hashtags, counts, audio strings — never lorem ipsum or generic placeholder copy.
