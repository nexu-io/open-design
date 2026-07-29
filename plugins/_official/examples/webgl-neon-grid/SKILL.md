---
name: webgl-neon-grid
description: |
  A real-time synthwave scene — a perspective floor grid scrolling toward a
  banded retro sun under a neon starfield, all from one fragment shader. No
  textures. Rendered as a single self-contained `index.html`. Use when the
  brief asks for "synthwave", "outrun", "retro 80s", "neon grid", "perspective
  grid", "vaporwave", or a retro-futuristic hero. Open Design serves this in
  powered-preview mode so the GPU stack actually runs.
triggers:
  - "synthwave"
  - "outrun"
  - "retro 80s"
  - "neon grid"
  - "perspective grid"
  - "vaporwave"
  - "retrowave"
  - "赛博"
  - "蒸汽波"
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

# Neon Grid Skill

Produce a single self-contained `index.html` that renders a real-time synthwave scene full-screen — a perspective floor grid, a banded retro sun, and a starfield — with a clean typographic overlay on top.

## Why this is a powered artifact

Open Design detects `getContext('webgl2')` and renders this file in **powered preview** — a cross-origin-isolated iframe with `allow-same-origin`. The full GPU pipeline is available; you do not need to work around the opaque sandbox.

## Resource map

```
webgl-neon-grid/
├── SKILL.md      ← you're reading this
└── example.html  ← a working synthwave grid + sun shader (READ FIRST)
```

## Workflow

### Step 0 — Read the reference
Read `example.html` end to end. Note the shape: a horizon split; **above** the horizon a sky gradient, a circular sun cut by horizontal scanline bands, and hashed stars; **below** the horizon a perspective floor grid (`z = k / depth`, `x = uv.x * z`) that scrolls with time, its lines thinning and fading with distance. Everything is analytic — no raymarch needed.

### Step 1 — Choose the palette
Synthwave lives on its gradient:
- **Outrun** (default): magenta→indigo sky, orange→pink banded sun, cyan/magenta grid.
- **Vaporwave**: pastel teal + pink, softer sun, wider grid spacing.
- **Terminal**: near-monochrome green grid on black for a colder, hacker read.

### Step 2 — Build `index.html`
- One file, zero external requests. Fullscreen triangle + fragment shader.
- Project the floor with a simple perspective divide; derive grid lines from `abs(fract(gv) - 0.5)` and a distance-scaled line width so far lines don't alias.
- Fade the grid into a horizon haze and add a hot horizon band; band the sun with `sin(y * f)` cuts on its lower half.
- Compile shaders with error logging so a typo fails loudly, not silently black.

### Step 3 — Overlay + brand
- Map the accent colors to the active DESIGN.md when one is present; otherwise the outrun palette above, with the kicker in lime `#63fe13`.
- Headline ≤ 12ch plus one supporting line. Keep the horizon and sun as the hero.

### Step 4 — Self-review (P0)
- [ ] Renders continuously at ~60fps; the FPS badge updates.
- [ ] Grid reads as receding perspective and scrolls smoothly toward the horizon.
- [ ] Sun bands and horizon glow are visible; far grid lines fade without aliasing.
- [ ] Resizes crisply on window resize (no stretching / blur).
- [ ] Degrades to a message (not a blank page) if `webgl2` is unavailable.
