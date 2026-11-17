---
name: webgl-depth-gallery
description: |
  A scroll-reactive 3D image gallery in Three.js: Z-stacked images crossfade over per-image mood backgrounds with velocity breath, a glowing cursor trail and an editorial CMYK/RGB/HEX/PMS color card.
triggers:
  - "depth gallery"
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

# Depth Gallery

Produce a single self-contained `index.html` — A scroll-reactive 3D image gallery in Three.js: Z-stacked images crossfade over per-image mood backgrounds with velocity breath, a glowing cursor trail and an editorial CMYK/RGB/HEX/PMS color card.

## Preview dependencies

The community preview also runs inside an opaque sandbox. Keep the embedded
`gallery-textures` JSON: its data URLs let Three.js upload the images to the GPU
without a cross-origin request. When replacing an image, update its embedded
texture from the corresponding WebP as well.

Copy `assets/three.min.js` alongside the HTML when adapting the example, or
inline that bundled script for a single-file deliverable. Do not replace it with
a CDN import: the gallery capture's content policy only permits local scripts.

## Resource map

```
webgl-depth-gallery/
├── SKILL.md          ← you're reading this
├── example.html      ← the complete, working artifact (READ FIRST)
├── assets/three.min.js ← bundled Three.js r160 (MIT)
└── flower-*.webp      ← original imagery; also embedded as texture data URLs
```

## Credits / attribution

- effect: Houmahani Kane / Codrops (MIT)
- imagery: Lummi.ai

Keep any bundled LICENSE and on-screen credit intact. Replace imagery only with license-clean assets (original / AI, Lummi.ai, Unsplash/Pexels — never scraped imagery).
