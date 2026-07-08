---
name: webgl-horizontal-parallax
description: |
  A horizontal-scroll WebGL gallery (Three.js): frames glide sideways with lerp smoothing and each image parallaxes its texture (UV shift) by its position in the viewport.
triggers:
  - "horizontal parallax gallery"
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

# Horizontal Parallax Gallery

Produce a single self-contained `index.html` — A horizontal-scroll WebGL gallery (Three.js): frames glide sideways with lerp smoothing and each image parallaxes its texture (UV shift) by its position in the viewport.

## Why this is a powered artifact

Open Design detects `getContext('webgl2')` / heavy WebGL and renders this file in **powered preview** (a cross-origin-isolated iframe). The full GPU + scroll pipeline runs; no opaque-sandbox workarounds are needed.

## Resource map

```
webgl-horizontal-parallax/
├── SKILL.md          ← you're reading this
├── example.html      ← the complete, working artifact (READ FIRST)
└── (assets, if any)
```

## Credits / attribution

- effect: David Faure / Codrops (MIT)
- imagery: Original (AI-generated)

Keep any bundled LICENSE and on-screen credit intact. Replace imagery only with license-clean assets (original / AI, Lummi.ai, Unsplash/Pexels — never scraped imagery).
