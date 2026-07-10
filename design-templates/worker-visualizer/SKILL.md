---
name: worker-visualizer
description: |
  A real-time data/particle/simulation visualizer whose heavy compute runs in
  a Web Worker (off the main thread), optionally sharing memory with the UI via
  SharedArrayBuffer, and renders to a canvas at 60fps. Produced as a single
  self-contained `index.html`. Use when the brief asks for a "web worker",
  "simulation", "particle system", "physics", "off-main-thread", "fractal",
  "real-time compute", or "audio/data visualizer". Open Design serves this in
  powered-preview mode so Workers and SharedArrayBuffer actually work.
triggers:
  - "web worker"
  - "worker"
  - "simulation"
  - "particle system"
  - "physics sim"
  - "fractal"
  - "off main thread"
  - "sharedarraybuffer"
  - "real-time compute"
  - "visualizer"
  - "多线程"
  - "粒子"
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
    requires: [animation-discipline, state-coverage]
---

# Worker Visualizer Skill

Produce a single self-contained `index.html` that moves heavy per-frame compute into a Web Worker and renders the result to a canvas, keeping the main thread at a smooth 60fps.

## Why this is a powered artifact

Open Design detects `new Worker(` / `SharedArrayBuffer` / `OffscreenCanvas` and renders this file in **powered preview** — a cross-origin-isolated iframe with `allow-same-origin`. That means external and blob Web Workers construct successfully, `SharedArrayBuffer` is defined (`crossOriginIsolated === true`), and `importScripts` works. In the old opaque sandbox all three failed; here they just work.

## Resource map

```
worker-visualizer/
├── SKILL.md      ← you're reading this
└── example.html  ← a working 12k-particle SharedArrayBuffer sim (READ FIRST)
```

## Workflow

### Step 0 — Read the reference
Read `example.html`. Note the split: the worker integrates positions each tick; the main thread only reads + draws. It feature-detects `crossOriginIsolated` and uses a `SharedArrayBuffer` for zero-copy when available, falling back to a transferable `postMessage` copy otherwise. Always ship that fallback so the artifact still animates if isolation is off.

### Step 1 — Choose the workload
Pick ONE compute-bound job worth offloading:
- **Particle / N-body field** (default): thousands of bodies with a cheap force law.
- **Fractal**: Mandelbrot/Julia escape-time into an `ImageData` buffer.
- **Cellular automata / reaction-diffusion**: grid updated in the worker.
- **Data/audio visualizer**: transform a stream into bars/rings each frame.

### Step 2 — Build `index.html`
- **One file, zero external requests.** Build the worker from a `Blob` + `URL.createObjectURL` (inline its source), or embed it as a `data:` URL.
- **Prefer SharedArrayBuffer** for large per-frame state: allocate on the main thread, pass the `SharedArrayBuffer` to the worker, and read the same `Float32Array`/`Uint8ClampedArray` view while drawing. Guard on `typeof SharedArrayBuffer !== 'undefined' && crossOriginIsolated`.
- **Fallback path**: if not isolated, `postMessage` a transferable `ArrayBuffer` each frame.
- Consider `OffscreenCanvas` + `canvas.transferControlToOffscreen()` to render inside the worker for the heaviest scenes.

### Step 3 — Overlay + brand
- HUD with the title and 2–3 live stat tiles (particle count, transport mode, fps). Map accent color to the active DESIGN.md when present; otherwise a dark ground with one vivid accent.

### Step 4 — Self-review (P0)
- [ ] Worker constructs with no SecurityError; sim runs.
- [ ] Main-thread render holds ~60fps under the full workload.
- [ ] `SharedArrayBuffer` path engages when `crossOriginIsolated` is true; `postMessage` fallback engages otherwise — verify BOTH branches degrade cleanly.
- [ ] No unbounded growth: velocities/positions stay stable over minutes.
- [ ] The "Transport" stat truthfully reports which path is live.
