---
name: video-template-frame-creative-voltage
description: Use this plugin when the user wants a "Creative Voltage Frame" HyperFrames motion video — Electric split with hand-drawn script — offset panels slide in, display title rises with an outlined word, script strokes itself in.
license: Apache-2.0
metadata:
  author: nexu-io
  version: "0.1.0"
od:
  mode: video
  scenario: video
  surface: hyperframes
---

# Creative Voltage Frame

Electric split with hand-drawn script — offset panels slide in, display title rises with an outlined word, script strokes itself in.

## What this template is

A HyperFrames-ready HTML + CSS + GSAP motion composition, bundled under `source/`. It renders deterministically to MP4 / WEBM at 16:9, 1:1, default 15s, 60fps.

**Best for:** Energetic brand / campaign title · Creative reveal with a human, hand-drawn accent · Retro-modern hero

## Workflow

1. Read `source/index.html` to understand the named layers and the animation timeline.
2. Replace the sample copy (headlines, figures, labels) with the user's real content; keep the motion timing and visual signature intact.
3. Keep the composition self-contained under `source/`; do not introduce external network assets that would break a headless render.
4. Render to MP4 via the html-video / HyperFrames renderer.

## Attribution

Source: html-video `templates/frame-creative-voltage` (license Apache-2.0). Derived from frontend-slides (Zara Zhang, MIT) — https://github.com/zarazhangrui/frontend-slides.
