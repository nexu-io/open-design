---
name: video-template-frame-product-promo-30s
description: Use this plugin when the user wants a "Product Promo · 30s" HyperFrames motion video — Multi-scene 30-second product promo: problem-type intro, brand reveal, benefits flowchart, product surfaces, value pillars, foundation, CTA outro. Forked from Nate Herk's hyperframes-student-kit (linear-promo-30s); brand-specific copy + assets replaced with generic placeholders.
license: MIT
metadata:
  author: Nate Herk
  version: "0.1.0"
od:
  mode: video
  scenario: video
  surface: hyperframes
---

# Product Promo · 30s

Multi-scene 30-second product promo: problem-type intro, brand reveal, benefits flowchart, product surfaces, value pillars, foundation, CTA outro. Forked from Nate Herk's hyperframes-student-kit (linear-promo-30s); brand-specific copy + assets replaced with generic placeholders.

## What this template is

A HyperFrames-ready HTML + CSS + GSAP motion composition, bundled under `source/`. It renders deterministically to MP4 / WEBM at 16:9, default 30s, 30fps.

**Best for:** 30-second product promo · B2B SaaS launch · Multi-feature reel with sound

## Workflow

1. Read `source/index.html` to understand the named layers and the animation timeline.
2. Replace the sample copy (headlines, figures, labels) with the user's real content; keep the motion timing and visual signature intact.
3. Keep the composition self-contained under `source/`; do not introduce external network assets that would break a headless render.
4. Render to MP4 via the html-video / HyperFrames renderer.

## Attribution

Source: html-video `templates/frame-product-promo-30s` (license MIT). Forked from Nate Herk — https://github.com/nateherkai/hyperframes-student-kit/tree/main/video-projects/linear-promo-30s.
