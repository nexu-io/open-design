# Arco Design Usage

Agent-facing guidance for the OpenDesign curated integration of Arco Design.

## Read Order

1. Read this file for the package contract and source boundary.
2. Read `DESIGN.md` for Arco's design values, color palettes, type scale, component states, motion, and accessibility notes.
3. Paste the complete `tokens.css` into the first artifact `<style>` block before writing component CSS.
4. Read `components.manifest.json` for the compact inventory, then inspect `components.html` when selectors or interaction states matter.
5. Use the `preview/` pages for quick color, typography, spacing, and radius checks.
6. Consult `source/evidence.md` and `source/tokens.source.json` before making an upstream-fidelity claim.

## Design Highlights

- Arcoblue `#165dff` is the single primary color; hover goes one step lighter (`#4080ff`) and pressed one step darker (`#0e42d2`).
- Neutrals are a cool ten-step gray from `#f7f8fa` to `#1d2129`; text uses gray-10, gray-8, and gray-6.
- Body text is `14px` with `1.5715` line height; headings use weight `500`, never `700`.
- Radii stay small: `2px` for controls and cards, `4px` for modals and tables, `8px` for large surfaces.
- Containers separate with 1px `#e5e6eb` borders and `#f2f3f5` fills; shadows (`0 4px 10px rgba(0, 0, 0, 0.1)`) are for popups and hover.
- Inputs are borderless filled fields that turn white with an arcoblue border on focus.
- Dark mode uses Arco's own dark palette on `#17171a` / `#232324`, selected with `arco-theme="dark"` or `data-theme="dark"`.

## Do

- Choose tokens by semantic role and keep raw colors inside the canonical token block.
- Keep one primary button per decision area; use secondary, outline, or text buttons for the rest.
- Pair every status color with a label or icon, and use tinted backgrounds behind status text.
- Keep controls at Arco's `32px` default height so buttons, inputs, and selects align.
- Use 24-hour times, thousands separators, and error messages that explain the cause.
- Respect reduced-motion preferences; routine state changes stay at `100ms` linear.

## Avoid

- Avoid presenting this package as official, endorsed, or maintained by ByteDance or the Arco team.
- Avoid large radii, heavy card shadows, gradients, or bold `700` headings.
- Avoid `--muted` (`#86909c`, 3.2:1 on white) or raw status colors for small text people must read.
- Avoid citing the section, container, or pill bindings as Arco tokens; they are OpenDesign compatibility values.
- Avoid editing `components.manifest.json` by hand; it is derived from `components.html` and `tokens.css`.
