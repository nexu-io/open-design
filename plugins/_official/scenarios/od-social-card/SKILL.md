---
name: od-social-card
description: Default social-card scenario for platform-ready X, Threads, LinkedIn, Instagram story, Rednote/Xiaohongshu, WeChat cover, quote-poster, and thumbnail visuals.
triggers:
  - social card
  - carousel
  - X card
  - LinkedIn card
  - 小红书
  - 公众号封面
  - social carousel
  - quote poster
od:
  scenario: social-card
  mode: social-card
---

# Social Card Scenario

Create export-ready social frames as a single HTML artifact. The output must
be inspectable in-browser and ready to export/capture as static images.

This scenario is grounded in the AGPL-3.0
[`op7418/guizang-social-card-skill`](https://github.com/op7418/guizang-social-card-skill)
workflow. The upstream license is preserved at
`LICENSE.guizang-social-card-skill`; keep source attribution if you copy the
seed templates or background assets into another package.

## Required Preflight

Read these files before writing the artifact:

1. `assets/template.html` — preview board showing the local visual standard.
2. `assets/template-editorial-card.html` — Editorial Magazine x E-ink seed.
3. `assets/template-swiss-card.html` — Swiss International seed.
4. `references/layouts.md` — Open Design routing summary.
5. `references/platform-specs.md` — exact platform ratios and export sizes.
6. `references/style-system.md` and `references/theme-presets.md` — visual rules.
7. `references/layout-recipes.md` and `references/components.md` — layout blocks.
8. `references/qa-checklist.md` before delivery.

Use the upstream screenshot/background assets under
`assets/screenshot-backgrounds/` when the user has not supplied images and the
brief still needs a concrete visual ground. Prefer user screenshots/photos when
they exist. Do not ship a social card that is only abstract gradients, generic
blobs, or lorem ipsum.

## Workflow

1. Classify the target platform and ratio:
   - X / Threads timeline: 16:9 or 4:5.
   - LinkedIn document carousel: 4:5.
   - Instagram story: 9:16.
   - Rednote/Xiaohongshu: 1080 x 1440.
   - WeChat cover pair: one 21:9 cover plus one 1:1 share card.
2. Choose one visual system for the whole package:
   - Editorial Magazine x E-ink for narrative, lifestyle, essays, travel,
     reading, games, film, or quiet thought pieces.
   - Swiss International for product reviews, data, tutorials, AI tools,
     launch notes, methods, and structured explainers.
3. Start from the matching seed template. Copy the whole seed into the project
   and replace only the poster area first. Add task-specific CSS only after the
   seed's classes are insufficient.
4. Plan pages before coding. One image should carry one idea; put nuance in the
   post body, not on the poster.
5. Use real evidence: supplied images, screenshots, product UI, web-sourced
   assets with provenance, generated bitmaps, or the bundled background assets.
6. Render/check in the browser. Inspect small thumbnails for legibility and
   crop safety.
7. Run `node scripts/validate-social-deck.mjs <task-dir>` when the user asks
   for an automatic check, or when you see overflow/collision risk.

## Hard Rules

- Respect platform ratio and safe area.
- One main message per frame.
- Use strong typography and clear crop-aware composition before decoration.
- Do not use visible instructions, keyboard shortcuts, or placeholder copy in
  the cards.
- For text on photos, map the subject and keep type out of the subject/face
  zone. Add localized tint only when needed for readability.
- Include export-size comments in the HTML for each frame.
