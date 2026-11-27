# Arco Design Source Evidence

## Source Scope

This package is an OpenDesign curated integration based only on public, official Arco Design sources published by ByteDance. It does not vendor `@arco-design/web-react`, Arco icons, fonts, logos, screenshots, or React components, and it does not imply endorsement or partnership.

## Pinned Upstream Sources

- npm package: [`@arco-design/web-react` 2.66.18](https://www.npmjs.com/package/@arco-design/web-react/v/2.66.18) — tarball `https://registry.npmjs.org/@arco-design/web-react/-/web-react-2.66.18.tgz`, registry shasum `93ffa3678d7dc0007deb1b7cc45100a0b8172269`.
- npm package: [`@arco-design/color` 0.4.0](https://www.npmjs.com/package/@arco-design/color/v/0.4.0) — tarball `https://registry.npmjs.org/@arco-design/color/-/color-0.4.0.tgz`.
- Design specification: [`arco-design/arco-design` `site/docs_spec/`](https://github.com/arco-design/arco-design/tree/84504beeaf68e8dd8a5fba7a74b45f4ca71c76f2/site/docs_spec) at commit `84504beeaf68e8dd8a5fba7a74b45f4ca71c76f2` (the Markdown behind <https://arco.design/docs/spec/introduce>).
- Documentation site: <https://arco.design>.
- License: [MIT](https://github.com/arco-design/arco-design/blob/84504beeaf68e8dd8a5fba7a74b45f4ca71c76f2/LICENSE), Copyright (c) 2021 Bytedance, Inc. and its affiliates.

The tarballs were downloaded with `npm pack` from the public registry into an empty directory and read as text only; no package scripts were run. Hex values come from the compiled RGB triplets in `compiled-colors.less` rather than from re-running the palette generator.

## Evidence Map

Paths below are relative to the extracted `@arco-design/web-react@2.66.18` package unless stated otherwise. `tokens.source.json` lists every upstream value with its exact file and line.

| Package guidance | Official source |
| --- | --- |
| Light and dark palettes (arcoblue, green, orange, red, gray, …) | `es/style/theme/color/compiled-colors.less` (light block lines 1–142, dark block `[arco-theme='dark']` lines 145–288) |
| Semantic mapping (primary/link → arcoblue, success → green, warning → orange, danger → red) | `es/style/theme/color/colors.less` |
| Palette seeds and generator | `@arco-design/color@0.4.0` `src/index.js`, `src/generate.js` |
| Surfaces, text, fill, border roles and their dark values | `es/style/theme/global.less` (`@color-bg-*`, `@color-text-*`, `@color-fill-*`, `@color-border-*`, `@dark-color-*`) and `es/style/theme/css-variables.less` |
| Font family, code font, body size, line height, durations, easing curves | `es/style/theme/default.less` |
| Font sizes, weights, spacing scale, radius, shadows, control sizes | `es/style/theme/global.less` |
| Heading sizes and line heights | `es/Typography/style/token.less`, `es/Typography/style/index.less` |
| Button sizes, padding, state colors, focus shadow | `es/Button/style/token.less`, `es/Button/style/index.less` |
| Input fill/focus/error model | `es/Input/style/token.less`, `es/Input/style/index.less` |
| Card border, radius, hover shadow | `es/Card/style/token.less`, `es/Card/style/index.less` |
| Table, Tag, Modal, Link, Select, Popover, Message specifics | matching `es/<Component>/style/token.less` |
| Grid breakpoints | `es/Grid/style/col.less` |
| Popup motion | `es/style/animation/zoom.less` |
| Design values (clear, consistent, rhythmic, open) | `site/docs_spec/values-of-arcodesign.en-US.md` |
| Color categories, mask color, font guidance, weights, shadow hierarchy, copywriting rules | `site/docs_spec/style-guideline.en-US.md` |
| Grid columns and gutter guidance; page layout types | `site/docs_spec/components/grid.en-US.md`, `site/docs_spec/components/layout.en-US.md` |

## Known Upstream Inconsistencies

- The style guideline describes a Nunito-based stack (`nunito_for_arco`), but `default.less` in 2.66.18 ships an Inter-first stack and keeps the Nunito line commented out. This package follows the shipped code.
- The style guideline mentions a default line height of 1.4 for text, while the shipped `@line-height-base` used by Typography paragraphs is `1.5715`. This package uses `1.5715` for body text and documents `1.4` as Arco's h5 heading line height.

## Adaptation Boundary

Direct upstream values are listed in `tokens.source.json`, cited in `tokens.css` comments, and explained in `DESIGN.md`. OpenDesign's shared token schema requires slots Arco does not publish: `--section-y-*`, `--container-*`, and `--radius-pill`. Those are OpenDesign compatibility bindings picked from Arco's spacing scale and Grid breakpoints and should not be cited as Arco specifications. `--meta` aliases `--muted` because Arco's fourth text tier is the disabled color. The reduced-motion override is an OpenDesign addition; Arco's Less source has no reduced-motion rules. The reference fixture is original OpenDesign markup that demonstrates the normalized token contract; some tints in it (disabled primary, tag backgrounds) are `color-mix()` approximations of Arco's step-1 and `light-3` colors, whose exact values are listed in `DESIGN.md`.
