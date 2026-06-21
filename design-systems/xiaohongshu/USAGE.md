# Xiaohongshu Usage

Design System 2.0 package guide for Open Design agents and reviewers.

## Read Order

1. Read this file first to understand the package contract.
2. Read `DESIGN.md` for visual intent, constraints, and anti-patterns.
3. Paste `tokens.css` into the first artifact `<style>` block before writing component CSS.
4. Use `components.manifest.json` for the compact component inventory; open `components.html` when exact selectors or states matter.
5. Inspect `preview/` pages when a visual sanity check is useful.

## Design Highlights

- Singular brand red (`#FF2442` token, `#FF2E4D` at the component layer) — never two saturated colors at once
- Translucent neutrals (`rgba(48,48,52, .05/.10/.20)`) instead of discrete grey steps
- Generous rounding everywhere: cards 12–16px, buttons fully pill, sheets 16px top-only
- Near-zero shadow — flat by default

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
