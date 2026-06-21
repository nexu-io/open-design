---
name: video-template-frame-data-rollup
description: Use this plugin when the user wants a "Data Rollup Frame" HyperFrames motion video — A native Remotion data frame — bars grow from zero by real data via spring physics while the figures roll 0→target in sync.
license: Apache-2.0
metadata:
  author: nexu-io
  version: "0.1.0"
od:
  mode: video
  scenario: video
  surface: hyperframes
---

# Data Rollup Frame

A native Remotion data frame — bars grow from zero by real data via spring physics while the figures roll 0→target in sync.

## What this template is

A HyperFrames-ready Remotion (React/TSX) motion composition, bundled under `source/`. It renders deterministically to MP4 / WEBM at 16:9, 9:16, 1:1, default 15s, 30fps.

**Best for:** A data frame where the numbers should animate, not sit static · Weekly metrics / growth bars driven by real values · Enhancing one data segment of an otherwise hyperframes video

## Workflow

1. Read `source/entry.ts` to understand the named layers and the animation timeline.
2. Replace the sample copy (headlines, figures, labels) with the user's real content; keep the motion timing and visual signature intact.
3. Keep the composition self-contained under `source/`; do not introduce external network assets that would break a headless render.
4. Render to MP4 via the html-video / HyperFrames renderer.

## Attribution

Source: html-video `templates/frame-data-rollup` (license Apache-2.0).
