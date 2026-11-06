---
name: video-template-frame-logo-outro
description: Use this plugin when the user wants a "Logo Outro Frame" HyperFrames motion video — Segmented logo assembly, glow bloom, and tagline reveal for video outros or brand closing frames.
license: Apache-2.0
metadata:
  author: nexu-io
  version: "0.1.0"
od:
  mode: video
  scenario: video
  surface: hyperframes
---

# Logo Outro Frame

Segmented logo assembly, glow bloom, and tagline reveal for video outros or brand closing frames.

## What this template is

A HyperFrames-ready HTML + CSS + GSAP motion composition, bundled under `source/`. It renders deterministically to MP4 / WEBM at 16:9, 9:16, 1:1, default 15s, 60fps.

**Best for:** Video closing card · Brand outro · Channel sign-off

## Workflow

1. Read `source/index.html` to understand the named layers and the animation timeline.
2. Replace the sample copy (headlines, figures, labels) with the user's real content; keep the motion timing and visual signature intact.
3. Keep the composition self-contained under `source/`; do not introduce external network assets that would break a headless render.
4. Render to MP4 via the html-video / HyperFrames renderer.

## Attribution

Source: html-video `templates/frame-logo-outro` (license Apache-2.0).
