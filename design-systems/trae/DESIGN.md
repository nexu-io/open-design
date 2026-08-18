# TRAE Design System

> Category: Developer Tools

A normalized Open Design package derived from the TRAE library in a TRAE Work built-in design-library export. It is a brand-referencing implementation guide, not an official asset package.

## Visual Direction

- **Status palette**: primary / success / alert / warning / error each provide `default | hover | active | surface-l1..l3`.
- **Typography**: SF Pro / SF Pro Text body, JetBrains Mono for code; heading scale `3xs → 3xl`, body scale `xs → base` with `*-strong` 500-weight pairs.
- **Radii**: `2 / 4 / 6 / 8 / 10 / full`. **Spacers**: `0 / 4 / 6 / 8 / 12 / 16 / 24 / 32 / 40`.
- Typography: `--{body|heading}-{size}-{font-family|font-size|font-weight|line-height}`
- Auto-derived light theme — source tokens are dark-only (`/* @dark-only */`).
- React UI Kit interactivity — UI Kits ship as static HTML showcases, matching the source `previews/` structure.
- Add components: `expand-components`
- Refine tokens or rename groups: `refine-library`
- Generate an additional kit (e.g., mobile / marketing site): `generate-additional-kit`

## Color Roles

- **Canvas:** `#1A1B1D` → `--bg`.
- **Surface:** `#222427` → `--surface`.
- **Primary text:** `#D1D3DB` → `--fg`.
- **Muted text:** `#9599A6` → `--muted`.
- **Accent:** `#32F08C` → `--accent`.
- **Border:** `rgba(224, 226, 242, 0.1)` → `--border`.
- **Danger:** `#F65A5A` → `--danger`.

Use only the semantic names in `tokens.css` in generated work. Raw color literals belong only in that token block.

## Typography

- **Typography**: SF Pro / SF Pro Text body, JetBrains Mono for code; heading scale `3xs → 3xl`, body scale `xs → base` with `*-strong` 500-weight pairs.
- Typography: `--{body|heading}-{size}-{font-family|font-size|font-weight|line-height}`

## Spacing and Layout

- **Radii**: `2 / 4 / 6 / 8 / 10 / full`. **Spacers**: `0 / 4 / 6 / 8 / 12 / 16 / 24 / 32 / 40`.

## Component Inventory

- **Activity Rail**: Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Alert**: Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Shared Atoms**: Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Avatar**: Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Button**: Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Card**: Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Chat Composer**: Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Dialog**: Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Editor Tabs**: Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **File Tree**: Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Form Controls**: Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Kbd**: Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Menu**: Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Nav List**: Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Page Header**: Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Pagination**: Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Setting Row**: Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Stat Card**: Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Status Bar**: Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Table**: Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Table Panel**: Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Tabs**: Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Tag**: Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Workbench Titlebar**: Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.

The DS 3.0 runtime exposes Button, Field, Surface, and Status as the shared intent-routing primitives. Reuse their returned implementation and selectors for mapped intents.

## Interaction States

- **Status palette**: primary / success / alert / warning / error each provide `default | hover | active | surface-l1..l3`.

## Motion

- Use `--motion-fast` for hover and focus feedback and `--motion-base` for state changes.
- Prefer short ease-out transitions; remove non-essential motion when reduced motion is requested.

## Accessibility

- Maintain readable contrast for text and controls.
- Preserve semantic HTML, labels, focus order, and keyboard access.
- Interactive targets should be at least 44 × 44 CSS pixels where touch is expected.

## Avoid

- Do not invent a near-copy when a mapped component exists.
- Do not bypass the no-match confirmation rule.
- Do not add undeclared tokens, arbitrary color literals, or unverified component states.
