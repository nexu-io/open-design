# Cloudflare Kumo UI Source Evidence

## Source Scope

This package is an OpenDesign curated integration based only on public, official Cloudflare sources. It does not vendor `@cloudflare/kumo`, Cloudflare logos, fonts, screenshots, or React components, and it does not imply endorsement or partnership.

## Pinned Upstream Revision

- Repository: <https://github.com/cloudflare/kumo>
- Commit: [`0c5832575c99988917b81cd752002e10f3dc9c7a`](https://github.com/cloudflare/kumo/tree/0c5832575c99988917b81cd752002e10f3dc9c7a)
- Package: [`@cloudflare/kumo` 2.9.2](https://github.com/cloudflare/kumo/releases/tag/%40cloudflare/kumo%402.9.2)
- Documentation: <https://kumo-ui.com/>
- License: [MIT](https://github.com/cloudflare/kumo/blob/0c5832575c99988917b81cd752002e10f3dc9c7a/LICENSE), Copyright (c) 2026 Cloudflare, Inc.

## Evidence Map

| Package guidance | Official source |
| --- | --- |
| Semantic light/dark colors and `data-mode` theming | [Color documentation](https://kumo-ui.com/colors/) and [`theme-generator/config.ts`](https://github.com/cloudflare/kumo/blob/0c5832575c99988917b81cd752002e10f3dc9c7a/packages/kumo/scripts/theme-generator/config.ts) |
| Inter typography, compact content, sentence case, and restrained emphasis | [Kumo design skill](https://github.com/cloudflare/kumo/blob/0c5832575c99988917b81cd752002e10f3dc9c7a/skills/kumo-design/SKILL.md) and [Text documentation source](https://github.com/cloudflare/kumo/blob/0c5832575c99988917b81cd752002e10f3dc9c7a/packages/kumo-docs-astro/src/pages/components/text.mdx) |
| Button sizes, variants, loading, and focus behavior | [Button documentation](https://kumo-ui.com/components/button/) and [Button source](https://github.com/cloudflare/kumo/blob/0c5832575c99988917b81cd752002e10f3dc9c7a/packages/kumo/src/components/button/button.tsx) |
| Layered surfaces, rings, radii, and restrained shadows | [LayerCard source](https://github.com/cloudflare/kumo/blob/0c5832575c99988917b81cd752002e10f3dc9c7a/packages/kumo/src/components/layer-card/layer-card.tsx) |
| Labels, errors, keyboard behavior, and consumer accessibility duties | [Accessibility documentation](https://kumo-ui.com/accessibility/) and [Input source](https://github.com/cloudflare/kumo/blob/0c5832575c99988917b81cd752002e10f3dc9c7a/packages/kumo/src/components/input/input.tsx) |
| Semantic, categorical, and sequential chart palettes | [Chart color documentation](https://kumo-ui.com/charts/colors/) and [chart Color source](https://github.com/cloudflare/kumo/blob/0c5832575c99988917b81cd752002e10f3dc9c7a/packages/kumo/src/components/chart/Color.ts) |
| Dialog, loading, skeleton, and reduced-motion patterns | [Dialog source](https://github.com/cloudflare/kumo/blob/0c5832575c99988917b81cd752002e10f3dc9c7a/packages/kumo/src/components/dialog/dialog.tsx), [Loader source](https://github.com/cloudflare/kumo/blob/0c5832575c99988917b81cd752002e10f3dc9c7a/packages/kumo/src/components/loader/loader.tsx), and [`theme-kumo.css`](https://github.com/cloudflare/kumo/blob/0c5832575c99988917b81cd752002e10f3dc9c7a/packages/kumo/src/styles/theme-kumo.css) |

## Adaptation Boundary

Direct upstream semantic values are recorded in `tokens.css` comments and explained in `DESIGN.md`. OpenDesign's shared token schema requires additional layout slots that Kumo does not publish; those compatibility bindings are identified explicitly and should not be cited as Cloudflare specifications. The reference fixture is original OpenDesign markup that demonstrates the normalized token contract rather than a copy of an upstream example.
