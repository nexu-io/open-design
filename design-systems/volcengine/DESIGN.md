# Volcengine Design System

> Category: Backend & Data

A normalized Open Design package derived from the Volcengine library in a TRAE Work built-in design-library export. It is a brand-referencing implementation guide, not an official asset package.

## Visual Direction

- Sidenav 使用 `.sidenav` + `.menu-item` + `.menu-icon`，图标为完整多色内联 SVG
- PageHeader 使用 `.page-header-comp` + 子 class
- 无 Tailwind/Lucide/Bootstrap CDN 引用
- SVG 图标完整（含 `<defs>`、`<linearGradient>`）

## Color Roles

- **Canvas:** `#ffffff` → `--bg`.
- **Surface:** `#ffffff` → `--surface`.
- **Primary text:** `#0c0d0e` → `--fg`.
- **Muted text:** `#86909c` → `--muted`.
- **Accent:** `#1664ff` → `--accent`.
- **Border:** `#dde2e9` → `--border`.
- **Danger:** `#d7312a` → `--danger`.

Use only the semantic names in `tokens.css` in generated work. Raw color literals belong only in that token block.

## Typography

- Use `--font-display` for headings and `--font-body` for interface and reading copy.
- Use the declared type scale; do not create one-off heading sizes.

## Spacing and Layout

- Use the 4px spacing scale and the declared responsive container gutters.
- Keep major page sections distinct; use surfaces and whitespace before extra dividers.

## Component Inventory

- **Alert** (feedback): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Anchor** (navigation): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Avatar** (data-display): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Badge** (data-display): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Breadcrumb** (navigation): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Button** (action): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Cascader** (input): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Checkbox** (input): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Descriptions** (data-display): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Drawer** (overlay): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Dropdown** (action): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Form** (input): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Icon** (data-display): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Input** (input): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Message** (feedback): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Modal** (overlay): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **PageHeader** (layout): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Pagination** (navigation): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Popconfirm** (overlay): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Progress** (feedback): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **SegmentedPicker** (input): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Select** (input): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Sidenav** (navigation): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Slider** (input): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **StatusTag** (data-display): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Steps** (navigation): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Switch** (input): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Table** (data-display): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Tabs** (navigation): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **TimePicker** (input): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Tooltip** (overlay): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **TopNav** (navigation): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.

The DS 3.0 runtime exposes Button, Field, Surface, and Status as the shared intent-routing primitives. Reuse their returned implementation and selectors for mapped intents.

## Interaction States

- Every interactive control needs visible hover and keyboard-focus behavior.
- Disabled, selected, warning, and success states must remain distinguishable without relying on color alone.

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
