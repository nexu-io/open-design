# Vodafone Usage

Design System 2.0 package guide for Open Design agents and reviewers.

## Read Order

1. Read this file first to understand the package contract.
2. Read `DESIGN.md` for visual intent, constraints, and anti-patterns.
3. Paste `tokens.css` into the first artifact `<style>` block before writing component CSS.
4. Use `components.manifest.json` for the compact component inventory; open `components.html` when exact selectors or states matter.
5. Inspect `preview/` pages when a visual sanity check is useful.

## Design Highlights

- Vodafone Red (`#e60000`) is the single dominant accent — used for CTAs, dividers, band sections, the speech-mark logo, and the rotated "IMPACT" brand-mark type on the sustainability map
- Monumental uppercase display type (up to 144px, weight 800, negative letter-spacing) paired with calm 16-18px body copy
- A universal page rhythm: dark atmospheric hero → monumental uppercase headline → full-width red band → white editorial canvas → dark charcoal institutional panel → charcoal footer
- Two-tier button system: tight 2px-radius rectangles for utility actions, fully-pill 60px buttons for primary content CTAs (both equally primary, selected by context)

## Do

- Preserve the schema token names exactly so cross-brand switching stays reliable.
- Use `--accent` for primary actions, links, focus states, and one clear focal element.
- Reuse component groups from `components.manifest.json` before inventing new controls.
- Treat `source/` files as audit evidence for the bundled fixture backfill.

## Avoid

- Avoid raw hex values outside the copied `:root` token block.
- Avoid redefining Tailwind or design-token values independently of `tokens.css`.
- Avoid claiming original upstream source evidence; this package is based on the curated bundled fixture.
- Avoid adding new component recipes that are not represented in `components.html` or `DESIGN.md`.
