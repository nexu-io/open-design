---
name: webgl-experience
description: |
  A full-screen, real-time WebGL/WebGL2 experience — animated shaders, 3D
  scenes, generative visuals, particle fields — rendered live on the GPU with
  a typographic overlay. Produced as a single self-contained `index.html`.
  Use when the brief asks for a "WebGL", "shader", "3D", "generative", "GPU",
  "interactive canvas", "hero animation", or "real-time visual" experience.
  Open Design serves this in powered-preview mode so the GPU stack actually
  runs.
triggers:
  - "webgl"
  - "webgl2"
  - "shader"
  - "3d scene"
  - "generative art"
  - "gpu"
  - "raymarch"
  - "particle field"
  - "interactive canvas"
  - "着色器"
  - "webgl 效果"
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

# WebGL Experience Skill

Produce a single self-contained `index.html` that renders a real-time WebGL (or WebGL2) visual full-screen, with a clean typographic overlay on top.

## Why this is a powered artifact

Open Design detects `getContext('webgl2')` / `new Worker` / `SharedArrayBuffer` and renders this file in **powered preview** — a cross-origin-isolated iframe with `allow-same-origin`. That means real Web Workers, `SharedArrayBuffer`, WASM, and the full GPU pipeline are available. You do **not** need to work around the opaque sandbox. Prefer `webgl2` for modern features; fall back to `webgl` when the effect allows.

## Resource map

```
webgl-experience/
├── SKILL.md      ← you're reading this
└── example.html  ← a working WebGL2 aurora-field reference (READ FIRST)
```

## Workflow

### Step 0 — Read the reference
Read `example.html` end to end. Note the shape: one full-viewport `<canvas>`, a fragment-shader draw loop on a fullscreen triangle, a DPR-aware resize, and a `requestAnimationFrame` tick. The overlay (`kicker` → `h1` → `sub`) is pure HTML/CSS layered above the canvas via `z-index`.

### Step 1 — Choose the visual
Pick ONE technique that fits the brief:
- **Fragment-shader field** (default): domain-warped fbm noise, flow fields, plasma, gradients. Cheapest, always 60fps.
- **Raymarched scene**: SDF spheres/boxes with soft shadows for a 3D hero.
- **Instanced geometry**: thousands of points/quads driven by a vertex shader.
- **Post-processed image**: sample a data-URI texture and distort/dither it.

### Step 2 — Build `index.html`
- Keep it **one file, zero external requests** (inline the shader source; embed any texture as a `data:` URI). Powered mode allows CDN loads, but self-contained previews are faster and portable.
- Always: `alpha:false`, DPR clamped to 2, `viewport` on resize, and a guard that shows a graceful message if the context is null.
- Compile shaders with error logging (`getShaderInfoLog`) so a typo fails loudly, not silently black.

### Step 3 — Overlay + brand
- Map the two `:root`-level accent colors to the active DESIGN.md when one is present; otherwise use a restrained dark palette with a single vivid accent (the reference uses lime `#63fe13`).
- Headline ≤ 14ch, one supporting line. Never cover the whole canvas — the visual is the hero.

### Step 4 — Self-review (P0)
- [ ] Renders continuously at ~60fps; the FPS badge updates.
- [ ] No WebGL console errors; `getError()` clean after first frame.
- [ ] Resizes crisply on window resize (no stretching / blur).
- [ ] Readable overlay contrast over the brightest frame.
- [ ] Degrades to a message (not a blank page) if `webgl2` is unavailable.
