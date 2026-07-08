---
name: webgl-liquid-metal
description: |
  A real-time liquid-metal shader — a domain-warped noise field shaded as
  molten chrome, with a sweeping specular highlight over an iridescent
  thin-film (cosine-palette) sheen. No textures. Rendered as a single
  self-contained `index.html`. Use when the brief asks for "liquid metal",
  "molten chrome", "iridescent", "holographic", "metallic", "thin-film", or a
  reflective flowing surface. Open Design serves this in powered-preview mode
  so the GPU stack actually runs.
triggers:
  - "liquid metal"
  - "molten chrome"
  - "iridescent"
  - "holographic"
  - "metallic"
  - "thin film"
  - "chrome"
  - "液态金属"
  - "镭射"
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
    sections: [color, typography]
  craft:
    requires: [animation-discipline]
---

# Liquid Metal Skill

Produce a single self-contained `index.html` that renders a real-time metallic surface full-screen — molten chrome with an iridescent sheen — with a clean typographic overlay on top.

## Why this is a powered artifact

Open Design detects `getContext('webgl2')` and renders this file in **powered preview** — a cross-origin-isolated iframe with `allow-same-origin`. The full GPU pipeline is available; you do not need to work around the opaque sandbox.

## Resource map

```
webgl-liquid-metal/
├── SKILL.md      ← you're reading this
└── example.html  ← a working domain-warped chrome shader (READ FIRST)
```

## Workflow

### Step 0 — Read the reference
Read `example.html` end to end. Note the shape: a domain-warped `fbm` **height field**; a surface normal reconstructed from that field's gradient (finite differences); metallic shading = diffuse chrome ramp + a sharp specular (`pow(dot(n,h), 80)`) + a fresnel term; and an **iridescent cosine palette** (`0.5 + 0.5*cos(2π(x + phase))`) driven by height and fresnel for the thin-film sheen.

### Step 1 — Choose the surface
- **Molten chrome** (default): domain-warped fbm height, hard specular, cool grey base.
- **Holographic foil**: crank the iridescence, widen the palette phase spread, soften the specular.
- **Oil slick**: darker base, thinner high-frequency warp, stronger fresnel bands.

### Step 2 — Build `index.html`
- One file, zero external requests. Fullscreen triangle + fragment shader.
- Reconstruct the normal from small height offsets (`e ≈ 0.0016`); a sharp specular exponent (≥ 60) is what reads as "metal".
- Keep the iridescence tasteful — tie it to fresnel/height so it appears at grazing angles, not everywhere.
- Compile shaders with error logging so a typo fails loudly, not silently black.

### Step 3 — Overlay + brand
- Map the accent colors to the active DESIGN.md when one is present; otherwise a restrained metallic palette. The reference tints the hottest specular toward lime `#63fe13` as the brand accent.
- Headline ≤ 13ch plus one supporting line. Keep the metal as the hero.

### Step 4 — Self-review (P0)
- [ ] Renders continuously at ~60fps; the FPS badge updates.
- [ ] Reads unmistakably as metal: a sharp, moving specular highlight.
- [ ] Iridescence is present but restrained (grazing angles), not a rainbow wash.
- [ ] Resizes crisply on window resize (no stretching / blur).
- [ ] Degrades to a message (not a blank page) if `webgl2` is unavailable.
