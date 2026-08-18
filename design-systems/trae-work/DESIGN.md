# TRAE Work Design System

> Category: Productivity & SaaS

A normalized Open Design package derived from the TRAE Work library in a TRAE Work built-in design-library export. It is a brand-referencing implementation guide, not an official asset package.

## Visual Direction

- Light mode only: do not add Dark-mode token blocks, theme toggles, or `prefers-color-scheme` behavior unless the project explicitly reopens Dark-mode migration.
- Token-first: every color, radius, spacing, and typography choice must resolve to the existing TraeWork tokens or component classes.
- Quiet by default: neutral surfaces, restrained borders, and typography carry the hierarchy. Use brand color only when an action or status truly needs it.
- Type-first, decoration-last: solve hierarchy with copy, layout, font size, weight, and spacing before adding icons or illustrations.
- Keep the product baseline at `body-base` (`14px / 20px`). Smaller text is reserved for existing micro or dense primitives only.
- Use one locale per screen. If the prompt does not explicitly request Chinese, default to English copy.
- Theme scope: Light mode only for this migration.
- Brand accent: `--accent`.
- Page surface: `--bg`.
- Card / panel surface: `--surface`.

## Color Roles

- **Canvas:** `#FFFFFF` → `--bg`.
- **Surface:** `#F5F5F5` → `--surface`.
- **Primary text:** `#171717` → `--fg`.
- **Muted text:** `#404040` → `--muted`.
- **Accent:** `#4B3FE3` → `--accent`.
- **Border:** `rgba(115, 115, 115, 0.12)` → `--border`.
- **Danger:** `#E8463A` → `--danger`.

Use only the semantic names in `tokens.css` in generated work. Raw color literals belong only in that token block.

## Typography

- Token-first: every color, radius, spacing, and typography choice must resolve to the existing TraeWork tokens or component classes.
- Quiet by default: neutral surfaces, restrained borders, and typography carry the hierarchy. Use brand color only when an action or status truly needs it.
- Type-first, decoration-last: solve hierarchy with copy, layout, font size, weight, and spacing before adding icons or illustrations.
- Keep the product baseline at `body-base` (`14px / 20px`). Smaller text is reserved for existing micro or dense primitives only.
- Use typography tokens as complete sets: family, size, line-height, weight, and letter-spacing should come from the same text style.
- Body copy, controls, list rows, table cells, form labels, helper text, tags, and chips default to `body-base` unless an existing component defines a denser style.
- Hero and marketing display text is typeset content, not data; do not apply mono or numeric utility styles to it.
- If a matching icon asset is missing, choose text, choose a semantically close local SVG, or remove the icon. Do not substitute an external glyph.

## Spacing and Layout

- Token-first: every color, radius, spacing, and typography choice must resolve to the existing TraeWork tokens or component classes.
- Type-first, decoration-last: solve hierarchy with copy, layout, font size, weight, and spacing before adding icons or illustrations.
- Step surface depth one level at a time. Do not place `--bg` panels inside `--surface` containers, because it visually cuts through the surface.
- Avoid nested bordered or filled containers. Do not put `.ds-card` inside `.ds-card`; use a single surface with internal dividers and spacing.
- Use typography tokens as complete sets: family, size, line-height, weight, and letter-spacing should come from the same text style.
- Every icon placeholder must reserve its final width and height before the asset loads to avoid layout shift.
- Keep motion short and functional: 120ms for hover or focus, 200ms for component state changes, and 300ms maximum for layout reveal.
- State changes must not shift layout geometry. Hover, active, selected, and disabled states should preserve component size.

## Component Inventory

- **Notifications** (feedback): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Avatar** (data-display): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Breadcrumb** (navigation): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Button** (action): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Card / List** (layout): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Dialog / Modal** (overlay): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Form** (input): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Menu** (navigation): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Pagination** (navigation): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Progress / Slider** (feedback): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Skeleton** (feedback): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Table** (data-display): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Tabs** (navigation): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Tag** (feedback): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.

The DS 3.0 runtime exposes Button, Field, Surface, and Status as the shared intent-routing primitives. Reuse their returned implementation and selectors for mapped intents.

## Interaction States

- Brand color is scarce: use it for the primary brand action, brand identity moments, and small meaningful status accents. Do not use brand color for generic hover rows, inactive borders, tab underlines, or decorative fills.
- Form focus uses contrast and neutral overlays, not brand glow or decorative rings.
- Selected rows, menu items, tabs, and pagination states use neutral overlays. Do not use brand fill for generic selection.
- Keep motion short and functional: 120ms for hover or focus, 200ms for component state changes, and 300ms maximum for layout reveal.
- State changes must not shift layout geometry. Hover, active, selected, and disabled states should preserve component size.
- Focus must remain visible. Do not remove focus rings without an equivalent.
- Interactive elements must be keyboard reachable in visual order.

## Motion

- Keep motion short and functional: 120ms for hover or focus, 200ms for component state changes, and 300ms maximum for layout reveal.
- Respect `prefers-reduced-motion` by removing nonessential transitions and translation.

## Accessibility

- Use at most one brand CTA per view. If two actions have equal weight, demote both to neutral variants.
- Form focus uses contrast and neutral overlays, not brand glow or decorative rings.
- Keep motion short and functional: 120ms for hover or focus, 200ms for component state changes, and 300ms maximum for layout reveal.
- Respect `prefers-reduced-motion` by removing nonessential transitions and translation.
- Maintain readable contrast: 4.5:1 for body text and at least 3:1 for icons and large text.
- Focus must remain visible. Do not remove focus rings without an equivalent.
- Interactive elements must be keyboard reachable in visual order.
- Icon-only buttons must provide an `aria-label`.

## Avoid

- Light mode only: do not add Dark-mode token blocks, theme toggles, or `prefers-color-scheme` behavior unless the project explicitly reopens Dark-mode migration.
- Brand color is scarce: use it for the primary brand action, brand identity moments, and small meaningful status accents. Do not use brand color for generic hover rows, inactive borders, tab underlines, or decorative fills.
- When a token already encodes alpha, do not add extra `opacity` on top of it.
- Step surface depth one level at a time. Do not place `--bg` panels inside `--surface` containers, because it visually cuts through the surface.
- Avoid nested bordered or filled containers. Do not put `.ds-card` inside `.ds-card`; use a single surface with internal dividers and spacing.
- Hero and marketing display text is typeset content, not data; do not apply mono or numeric utility styles to it.
- Preserve SVG geometry, viewBox, fill/stroke model, and visual proportions. Do not rewrite paths, normalize strokes, or hand-draw replacement glyphs.
- Do not introduce other icon sizes unless the component explicitly requires an exception and the exception is documented with the component.
