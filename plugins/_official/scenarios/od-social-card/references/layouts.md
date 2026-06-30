# Social Card Layout Router

Use this file as the first routing layer, then load the deeper Guizang
references named below.

## Seed Choice

- Editorial Magazine x E-ink: copy `assets/template-editorial-card.html`.
- Swiss International: copy `assets/template-swiss-card.html`.

Do not write a blank HTML file when either seed fits. Replace the poster
region first; add task-specific CSS only after the seed classes are
insufficient.

## Platform Contracts

- X / Threads single card: 16:9 or 4:5. One statement, one proof artifact, one
  attribution/footer.
- X / Threads carousel: 4 cards. Hook, insight, evidence, takeaway.
- LinkedIn card: 4:5 document-style frame. Executive-readable hierarchy,
  chart/proof section, restrained CTA.
- Instagram story: 9:16. Progress segments, hero crop, short benefit, CTA.
- Rednote / Xiaohongshu: 1080 x 1440. Cover plus 4-8 content pages, one idea
  per page.
- WeChat cover pair: one 21:9 main cover and one 1:1 share card in the same
  HTML file so the crop relationship can be checked.
- YouTube thumbnail: 16:9. Big 3-5 word title, visible subject crop, simple
  callout, high contrast.
- Quote poster: 4:5 or 1:1. Serif statement, attribution, premium restraint.

Read `references/platform-specs.md` for exact dimensions and filenames.

## Recipe Routing

Use `references/layout-recipes.md` after choosing the visual system:

- Editorial M01-M16: image-led covers, article covers, ledgers, marginalia,
  quote pages, before/after, pipeline, full-photo covers.
- Swiss S01-S12: KPI tower, h-bar chart, matrix, proof card, checklist,
  product-review card, screenshot treatment.

Use `references/portrait-fill.md` for Rednote/Xiaohongshu 3:4 pages so short
copy does not leave the lower half empty.

## Image Routing

- Supplied screenshot or photo: read `references/screenshot-treatment.md` or
  `references/image-overlay.md`.
- No supplied image but a concrete background is needed: use bundled assets
  under `assets/screenshot-backgrounds/`, or fetch web-sourced images and keep
  `assets/SOURCES.md`.
- Do not default to abstract gradients, bubbles, or generic AI decoration.

## Frame Count Defaults

- Post / quote / data card: 1 frame.
- Carousel: 4 frames minimum; Rednote usually 5-9.
- WeChat cover: 2 frames, always paired.
- Multi-platform launch: 3-5 frames, adapted per crop.
