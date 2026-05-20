# Neutral Modern Usage

Auto-generated package guide for Open Design agents and reviewers.

## Read Order

1. Read this file first to understand the package contract.
2. Read `DESIGN.md` for the visual intent, constraints, and anti-patterns.
3. Paste `tokens.css` into the first artifact `<style>` block before writing component CSS.
4. Use `components.manifest.json` for the compact component inventory; open `components.html` only when exact selectors or states matter.
5. Inspect `preview/` pages when a visual sanity check is useful.

## Design Highlights

- Neutral Modern is the default product-system baseline for B2B tools, dashboards, and utility pages.
- The palette is intentionally quiet: off-white background, white surfaces, dark text, restrained cobalt accent.
- The component language is compact and work-focused: 8-12px radii, clear borders, no decorative shadows by default.
- Use the normalized OD tokens as the source of truth. This bundled package is not source-repository verbatim evidence.

## Do

- Keep layout density calm and scannable.
- Use `--accent` sparingly for primary actions, links, and one focal element.
- Reuse the component shapes from the manifest before inventing new patterns.
- Preserve the token names exactly so cross-brand switching stays reliable.

## Avoid

- Avoid decorative gradients, glass effects, neumorphism, and large ornamental surfaces.
- Avoid raw hex values outside the copied `:root` token block.
- Avoid more than three type sizes on one screen unless the artifact is a true editorial layout.
- Avoid treating this package as a marketing hero style; it is a product UI baseline.
