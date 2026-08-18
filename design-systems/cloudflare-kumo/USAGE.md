# Cloudflare Kumo UI Usage

Agent-facing guidance for the Open Design curated integration of Cloudflare Kumo UI.

## Read Order

1. Read this file for the package contract and source boundary.
2. Read `DESIGN.md` for Kumo's visual intent, semantic roles, component patterns, and accessibility guidance.
3. Paste the complete `tokens.css` into the first artifact `<style>` block before writing component CSS.
4. Read `components.manifest.json` for the compact inventory, then inspect `components.html` when selectors or interaction states matter.
5. Use the `preview/` pages for quick color, typography, spacing, and radius checks.
6. Consult `source/evidence.md` before making an upstream-fidelity claim.

## Design Highlights

- Use semantic surface roles to move from a near-white canvas through base, recessed, and elevated layers.
- Keep product text compact: `14px` is the default content size, with sentence-case headings and restrained semibold emphasis.
- Use the blue semantic brand background for primary actions; do not replace it with Cloudflare orange.
- Prefer line rings and small shadows to decorative gradients or heavy elevation.
- Use Kumo's native `data-mode="dark"` hook; `data-theme="dark"` is included only for Open Design artifact compatibility.
- Treat the section, container, and extended heading tokens as Open Design compatibility bindings, not upstream Kumo tokens.

## Do

- Choose tokens by semantic role and keep raw colors inside the canonical token block.
- Default ordinary actions to secondary buttons and reserve the primary treatment for the main decision.
- Preserve visible labels, native semantics, keyboard behavior, focus-visible rings, and non-color status cues.
- Reuse the fixture's buttons, fields, status badge, layer card, and data layout before introducing a new pattern.
- Keep loading controls disabled and labeled, and preserve layout dimensions while content loads.
- Respect reduced-motion preferences and keep information available without animation.

## Avoid

- Avoid presenting this package as official, endorsed, or maintained by Cloudflare.
- Avoid raw Tailwind palette colors, manual `dark:` variants, uppercase headings, altered tracking, or default `700` weight.
- Avoid nested LayerCards, placeholder-only field labels, unlabeled icon buttons, or color-only status communication.
- Avoid long hover transitions; Kumo color changes are immediate and larger state motion stays brief.
- Avoid editing `components.manifest.json` by hand; it is derived from `components.html` and `tokens.css`.
