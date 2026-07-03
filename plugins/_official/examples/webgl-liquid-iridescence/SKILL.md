---
name: webgl-liquid-iridescence
description: |
  A self-contained WebGL2 hero: a living oil-on-water field brightened into iridescent caustic filaments; move the cursor to bend the flow.
triggers:
  - "liquid iridescence"
  - "webgl hero"
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

# Liquid Iridescence

Produce a single self-contained `index.html` — A self-contained WebGL2 hero: a living oil-on-water field brightened into iridescent caustic filaments; move the cursor to bend the flow.

## Why this is a powered artifact

Open Design detects `getContext('webgl2')` / heavy WebGL and renders this file in **powered preview** (a cross-origin-isolated iframe). The full GPU + scroll pipeline runs; no opaque-sandbox workarounds are needed.

## Resource map

```
webgl-liquid-iridescence/
├── SKILL.md          ← you're reading this
├── example.html      ← the complete, working artifact (READ FIRST)
└── (assets, if any)
```

## Credits / attribution

- Original, self-contained (no third-party assets).

Keep any bundled LICENSE and on-screen credit intact. Replace imagery only with license-clean assets (original / AI, Lummi.ai, Unsplash/Pexels — never scraped imagery).
