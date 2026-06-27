---
name: commercial-product-launches
description: |
  Commercial Product Launches is a case library for business-grade product
  websites and launch pages. It captures page narrative, reusable modules,
  media requirements, motion patterns, commerce paths, and responsive art
  direction as source-linked observations instead of copying brand assets.
triggers:
  - "commercial product launch"
  - "product launch page"
  - "commercial landing page"
  - "brand campaign page"
  - "商业产品发布页"
  - "产品官网"
  - "苹果官网效果"
category: commercial-product-launch
captured: "2026-06-14"
batch: "commercial-product-launches"
od:
  mode: prototype
  surface: web
  platform: responsive
  scenario: commercial-launch
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
---

# Commercial Product Launches

Use this entry as a modular case library, not as a one-page clone template.
Commercial launch pages are valuable because their quality comes from a full
production chain: narrative sequencing, media direction, motion behavior,
commerce reassurance, responsive cropping, and performance constraints.

## Resource Map

```text
commercial-product-launches/
|-- SKILL.md
|-- example.html
`-- references/
    `-- catalog.json
```

`references/catalog.json` is the source of truth. Keep the preview original and
small. Do not mirror commercial screenshots, source code, videos, product
renders, brand marks, or campaign assets unless the source license explicitly
allows that use.

## Capture Contract

For every commercial page or campaign, record:

- `brand`: name, sector, and public URL.
- `page`: title, URL, and page type.
- `why`: why this page is worth keeping as a commercial design reference.
- `chapters`: narrative sections and what each section proves.
- `modules`: reusable page modules such as hero, comparison, product grid,
  feature proof, social proof, offer strip, FAQ, or purchase support.
- `mediaAssets`: the production asset types the page depends on, such as
  product renders, macro photos, lifestyle photography, UI mockups, video
  clips, transparent product PNGs, or mobile crops.
- `motionPatterns`: scroll, reveal, transition, carousel, media, and fallback
  behavior that should be planned before implementation.
- `commercePatterns`: conversion and reassurance patterns such as buy CTAs,
  trade-in, financing, plan comparison, shipping, returns, support, or expert
  consultation.
- `responsiveNotes`: breakpoint-specific layout and art-direction notes.
- `implementation`: complexity, performance, accessibility, and evidence
  notes when known.
- `capture`: capture date, source links, attribution, reuse policy, and
  capture depth.

## Use In Future Work

When designing a premium commercial website:

1. Pick 2-3 references that match the product category and business model.
2. Start from the page narrative and module inventory before choosing style.
3. List required media assets and responsive crops before coding the layout.
4. Treat motion as a storyboard with fallback behavior, not decoration.
5. Preserve attribution links in planning docs and mark unclear assets as
   inspiration-only.
