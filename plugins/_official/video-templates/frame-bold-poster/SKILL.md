---
name: video-template-frame-bold-poster
description: Use this plugin when the user wants a "Bold Poster Frame" HyperFrames motion video — A 1970s European editorial poster in motion — a red rule draws across, a giant tilted figure drops in, a three-line headline rises line-by-line, an italic serif standfirst fades.
license: Apache-2.0
metadata:
  author: nexu-io
  version: "0.1.0"
od:
  mode: video
  scenario: video
  surface: hyperframes
---

# Bold Poster Frame

A 1970s European editorial poster in motion — a red rule draws across, a giant tilted figure drops in, a three-line headline rises line-by-line, an italic serif standfirst fades.

## What this template is

A HyperFrames-ready HTML + CSS + GSAP motion composition, bundled under `source/`. It renders deterministically to MP4 / WEBM at 16:9, 9:16, 1:1, default 15s, 60fps.

**Best for:** Brand manifesto / vision statement · Editorial or cultural pitch opener · A few words that should feel like a magazine cover

## Workflow

1. Read `source/index.html` to understand the named layers and the animation timeline.
2. Replace the sample copy (headlines, figures, labels) with the user's real content; keep the motion timing and visual signature intact.
3. Keep the composition self-contained under `source/`; do not introduce external network assets that would break a headless render.
4. Render to MP4 via the html-video / HyperFrames renderer.

## Attribution

Source: html-video `templates/frame-bold-poster` (license Apache-2.0). Derived from frontend-slides (Zara Zhang, MIT) — https://github.com/zarazhangrui/frontend-slides.
