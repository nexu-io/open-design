---
name: webgl-raymarched-hero
description: |
  A real-time raymarched 3D hero — soft-shadowed morphing metaballs with a
  fresnel rim light, sphere-traced per pixel in a fragment shader with a slow
  camera orbit. No meshes, no textures. Rendered as a single self-contained
  `index.html`. Use when the brief asks for a "raymarch", "signed distance
  field", "SDF", "3D hero", "metaballs", "blobs", or a shader-based 3D scene.
  Open Design serves this in powered-preview mode so the GPU stack actually
  runs.
triggers:
  - "raymarch"
  - "raymarching"
  - "sdf"
  - "signed distance field"
  - "metaballs"
  - "3d hero"
  - "blobs"
  - "光线步进"
  - "有向距离场"
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

# Raymarched Hero Skill

Produce a single self-contained `index.html` that renders a real-time 3D scene **entirely in a fragment shader** via sphere tracing, full-screen, with a clean typographic overlay on top.

## Why this is a powered artifact

Open Design detects `getContext('webgl2')` and renders this file in **powered preview** — a cross-origin-isolated iframe with `allow-same-origin`. The full GPU pipeline is available; you do not need to work around the opaque sandbox.

## Resource map

```
webgl-raymarched-hero/
├── SKILL.md      ← you're reading this
└── example.html  ← a working SDF metaball raymarcher (READ FIRST)
```

## Workflow

### Step 0 — Read the reference
Read `example.html` end to end. Note the shape: one fullscreen triangle; a `map(p)` signed-distance function that smooth-unions (`smin`) several moving spheres; normals by finite differences; a `softShadow` march; and a camera built from `ro`/`ta` with a slow orbit. Shading = diffuse × soft shadow + fresnel rim + a tight specular.

### Step 1 — Choose the SDF
Keep the marcher cheap so it holds 60fps:
- **Metaballs** (default): a few spheres blended with `smin` — organic, always readable.
- **Rounded primitives**: box/torus/capsule SDFs with domain repetition for a structured hero.
- **Displaced surface**: a sphere plus a low-amplitude noise displacement for a molten look.

### Step 2 — Build `index.html`
- One file, zero external requests. Fullscreen triangle + fragment raymarch.
- Bound the march: cap iterations (~90), early-out on hit (`d < 0.001`) and on far distance; clamp DPR to ~1.5 — raymarching is per-pixel heavy.
- Light it: diffuse, a soft/penumbra shadow, a fresnel rim (`pow(1 - dot(n,-rd), 3)`), and one specular lobe. Gentle gamma at the end.
- Compile shaders with error logging so a typo fails loudly, not silently black.

### Step 3 — Overlay + brand
- Map the accent colors to the active DESIGN.md when one is present; otherwise a restrained dark palette with one vivid accent (the reference tints the surface toward lime `#63fe13` and rims it in teal).
- Headline ≤ 13ch plus one supporting line. Keep the 3D form as the hero.

### Step 4 — Self-review (P0)
- [ ] Renders continuously at ~60fps; the FPS badge updates.
- [ ] Surface has real depth cues: shadow, rim, and a moving specular.
- [ ] No banding artifacts at the silhouette; normals are stable.
- [ ] Resizes crisply on window resize (no stretching / blur).
- [ ] Degrades to a message (not a blank page) if `webgl2` is unavailable.
