---
name: webgl-pixel-reveal-gallery
description: |
  A scroll-reactive masonry gallery (Three.js + GSAP) where each image develops from a pixel/grid dissolve on viewport entry, with a split-text heading and click-to-fullscreen Flip.
triggers:
  - "pixel reveal gallery"
  - "webgl gallery"
od:
  mode: prototype
  platform: web
  scenario: design
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  craft:
    requires: [animation-discipline]
---

# Pixel Reveal Gallery

Produce a single self-contained `index.html` — A scroll-reactive masonry gallery (Three.js + GSAP) where each image develops from a pixel/grid dissolve on viewport entry, with a split-text heading and click-to-fullscreen Flip.

## Why this is a powered artifact

Open Design detects `getContext('webgl2')` / heavy WebGL and renders this file in **powered preview** (a cross-origin-isolated iframe). The full GPU + scroll pipeline runs; no opaque-sandbox workarounds are needed.

## Resource map

```
webgl-pixel-reveal-gallery/
├── SKILL.md          ← you're reading this
├── example.html      ← the complete, working artifact (READ FIRST)
└── (assets, if any)
```

## Credits / attribution

- effect: J0SUKE / Codrops (MIT)
- imagery: Original (AI-generated)

Keep any bundled LICENSE and on-screen credit intact. Replace imagery only with license-clean assets (original / AI, Lummi.ai, Unsplash/Pexels — never scraped imagery).
