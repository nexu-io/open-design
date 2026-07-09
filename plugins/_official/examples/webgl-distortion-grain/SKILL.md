---
name: webgl-distortion-grain
description: |
  A vertical gallery (Three.js) where planes bend with scroll velocity, ripple under the cursor via simplex noise, and carry a film grain.
triggers:
  - "distortion & grain"
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

# Distortion & Grain

Produce a single self-contained `index.html` — A vertical gallery (Three.js) where planes bend with scroll velocity, ripple under the cursor via simplex noise, and carry a film grain.

## Why this is a powered artifact

Open Design detects `getContext('webgl2')` / heavy WebGL and renders this file in **powered preview** (a cross-origin-isolated iframe). The full GPU + scroll pipeline runs; no opaque-sandbox workarounds are needed.

## Resource map

```
webgl-distortion-grain/
├── SKILL.md          ← you're reading this
├── example.html      ← the complete, working artifact (READ FIRST)
└── (assets, if any)
```

## Credits / attribution

- effect: Jan Kohlbach / Codrops (MIT)
- imagery: Original (AI-generated)
- simplex noise: Ashima Arts (MIT)

Keep any bundled LICENSE and on-screen credit intact. Replace imagery only with license-clean assets (original / AI, Lummi.ai, Unsplash/Pexels — never scraped imagery).
