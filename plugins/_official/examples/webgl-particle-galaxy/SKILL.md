---
name: webgl-particle-galaxy
description: |
  A real-time particle galaxy — tens of thousands of additive-blended GPU
  points spiraling around a bright core, their orbits solved entirely in the
  vertex shader (from gl_VertexID), so the whole cloud draws in one call.
  Rendered as a single self-contained `index.html`. Use when the brief asks
  for a "particle field", "particle galaxy", "point cloud", "instanced
  points", "starfield", "GPU particles", or a swirling generative point
  system. Open Design serves this in powered-preview mode so the GPU stack
  actually runs.
triggers:
  - "particle"
  - "particles"
  - "particle galaxy"
  - "point cloud"
  - "instanced points"
  - "starfield"
  - "gpu particles"
  - "粒子"
  - "粒子星系"
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

# Particle Galaxy Skill

Produce a single self-contained `index.html` that renders a real-time particle system full-screen, with a clean typographic overlay on top. The signature move: **compute each particle's position on the GPU** so the CPU never loops over particles.

## Why this is a powered artifact

Open Design detects `getContext('webgl2')` and renders this file in **powered preview** — a cross-origin-isolated iframe with `allow-same-origin`. The full GPU pipeline is available; you do not need to work around the opaque sandbox.

## Resource map

```
webgl-particle-galaxy/
├── SKILL.md      ← you're reading this
└── example.html  ← a working 50,000-point WebGL2 galaxy (READ FIRST)
```

## Workflow

### Step 0 — Read the reference
Read `example.html` end to end. Note the shape: **no vertex buffer** — the vertex shader reads `gl_VertexID`, hashes it into a stable per-particle seed, and derives a log-spiral orbit with an inner-fast rotation curve. Points are drawn with `gl.drawArrays(gl.POINTS, 0, N)` in one call, additive-blended (`blendFunc(ONE, ONE)` with premultiplied color) so overlapping points glow.

### Step 1 — Pick the motion
Choose a field the vertex shader can express cheaply from `gl_VertexID` + `uTime`:
- **Spiral galaxy** (default): log-spiral arms, rotation curve `speed ≈ k / (r + ε)`, thin disk.
- **Attractor / flow**: curl or a strange-attractor step baked as a closed-form function of time.
- **Explosion / reform**: interpolate between a seeded start and a target shape on a looping clock.

### Step 2 — Build `index.html`
- One file, zero external requests. Bind a VAO even with no attributes (some drivers require it).
- Point size in the vertex shader (`gl_PointSize`), clamped and DPR-aware; soft round sprites via `gl_PointCoord` + a gaussian falloff in the fragment shader.
- Additive blending on a dark clear color; premultiply the fragment color so `blendFunc(ONE, ONE)` reads as glow, not double-exposure.
- Compile shaders with error logging (`getShaderInfoLog` / `getProgramInfoLog`) so a typo fails loudly.

### Step 3 — Overlay + brand
- Map the accent colors to the active DESIGN.md when one is present; otherwise a restrained dark palette with one vivid accent (the reference uses lime `#63fe13` for the arms and a white-blue core).
- Headline ≤ 15ch plus one supporting line. Never bury the particles behind the text.

### Step 4 — Self-review (P0)
- [ ] Renders continuously at ~60fps; the FPS badge updates.
- [ ] Tens of thousands of points in a **single** draw call (no per-particle CPU loop).
- [ ] No WebGL console errors; program links cleanly.
- [ ] Resizes crisply on window resize (no stretching / blur).
- [ ] Degrades to a message (not a blank page) if `webgl2` is unavailable.
