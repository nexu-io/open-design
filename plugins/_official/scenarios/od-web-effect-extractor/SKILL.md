---
name: od-web-effect-extractor
description: Extract visual effects, animation systems, Canvas/WebGL/Shader behavior, and interaction details from a reference website, then rebuild them as an editable Open Design web artifact.
od:
  scenario: web-effect-extraction
  mode: scenario
---

# Web Effect Extractor

Use this plugin when the user gives a website URL and asks Open Design to recreate, remix, or learn from its visual effects. It is especially useful for hero backgrounds, WebGL scenes, Canvas animations, shader effects, cursor trails, scroll-driven motion, animated typography, and interaction patterns that are hard to understand from screenshots alone.

This workflow is inspired by the MIT-licensed `web-shader-extractor` skill from `lixiaolin94/skills`, adapted for Open Design's website recreation and editable artifact workflow.

## Scope

The goal is to produce a faithful, editable Open Design artifact that preserves the reference site's visual effect and interaction logic while replacing private content, trademarks, tracking code, and nonessential app logic.

Extract only what is needed to understand and recreate the visual behavior:

- Layout structure, viewport behavior, breakpoints, and composition rhythm
- Color, typography, blend modes, gradients, texture, lighting, and post-processing
- Motion timing, easing, scroll triggers, pointer response, and idle animation loops
- Canvas, WebGL, Three.js, shader, particle, and framebuffer pipeline details
- Public static assets needed for visual parity, with provenance noted

Do not copy private product copy, hidden application state, user data, analytics, auth flows, or unrelated business logic.

## Workflow

### 1. Prepare The Capture

Start from the supplied URL and define the exact effect to recreate. If the user is vague, inspect the first viewport first and infer the likely target effect.

Before extracting runtime details, prefer a browser context that can evaluate page scripts and inspect canvas/WebGL state. If Chrome DevTools MCP is available, use it for runtime interception. If it is not available, continue with the strongest available browser automation and clearly state that shader/runtime capture may be incomplete.

Record:

- URL and capture timestamp
- Viewport sizes to test, usually desktop and mobile
- Main effect target and fallback effect targets
- Framework clues from HTML, network requests, globals, and package signatures

### 2. Runtime Inspection

Capture runtime evidence before simplifying anything.

Inspect:

- DOM tree, computed styles, fonts, CSS variables, custom properties, and animation names
- Canvas elements, WebGL contexts, renderer attributes, supported extensions, and resolution scaling
- Global framework markers such as `THREE`, `BABYLON`, `__NEXT_DATA__`, `__NUXT__`, `vite`, GSAP, Lenis, Framer Motion, or custom scene globals
- Networked JS bundles, images, videos, fonts, LUTs, textures, HDRIs, and data files

When WebGL is present and tooling allows pre-page-load injection, intercept:

- `gl.shaderSource()` for vertex and fragment source
- `gl.uniform*()` calls for names and observed values
- `gl.bindFramebuffer()` to understand multipass render order
- `gl.drawArrays()` and `gl.drawElements()` to understand draw-call order
- texture and buffer setup when it affects the final look

When 2D Canvas is present, inspect the render loop, draw primitives, image sources, compositing operations, and device-pixel-ratio handling.

### 3. Extract The Visual Model

Turn the raw capture into a compact visual model:

- Scene graph or layer stack
- Asset list with source, dimensions, and role
- Shader/material list with uniforms and dependencies
- Motion map with trigger, duration, easing, repeat behavior, and responsive differences
- Interaction map for pointer, keyboard, scroll, resize, and reduced-motion handling
- Known uncertainties, such as minified bundle branches or runtime values that could not be observed

Prefer evidence over guesses. If an effect cannot be observed directly, mark it as an inference.

### 4. Rebuild In Open Design

Create a standalone web artifact that can be inspected and edited.

Choose the simplest implementation that preserves the effect:

- Static DOM/CSS for layout-only references
- CSS animation or WAAPI for simple motion
- GSAP for sequenced or scroll-linked motion
- Canvas 2D for 2D procedural effects
- Native WebGL2 for compact full-screen shader effects
- Three.js when the reference uses 3D, cameras, materials, textures, post-processing, or GPGPU patterns

Keep the rebuild self-contained unless a dependency materially reduces complexity. If dependencies are used, load them in a transparent, reviewable way.

Important reconstruction rules:

- Preserve color management and output color space.
- Preserve the reference time base, such as seconds, elapsed milliseconds, frame count, or scroll progress.
- Preserve multipass ordering for shader effects.
- Do not tune random values to hide a root-cause mismatch; fix the model instead.
- Add `prefers-reduced-motion` fallbacks for intense effects.
- Replace copyrighted or brand-specific content unless the user explicitly owns it or asks to preserve it.

### 5. Verify Visual Parity

Open the reference and the rebuilt artifact at the same viewport sizes. Compare:

- First viewport framing
- Color, brightness, contrast, and blending
- Motion rhythm and loop continuity
- Pointer and scroll response
- Mobile behavior and performance
- Canvas/WebGL nonblank rendering

For WebGL and Canvas work, verify that the canvas is not blank and that animation advances over time. If possible, compare screenshots or pixel samples across at least two timestamps.

### 6. Deliver

Finish with:

- The rebuilt artifact path or preview URL
- A short extraction summary
- Any visual differences that remain
- Asset provenance and any replaced assets
- Notes on what the user can safely edit next

If the user asks for an extraction report, create `EXTRACTION-REPORT.md` with the source URL, capture method, visual model, implementation choices, validation notes, and remaining gaps.

## Quality Bar

- The artifact must run independently from the source website.
- The primary visual effect must be recognizable without explanation.
- The implementation must be understandable enough for a designer or engineer to edit.
- The workflow must avoid copying unrelated application code.
- The response must distinguish captured facts from inferred reconstruction choices.
