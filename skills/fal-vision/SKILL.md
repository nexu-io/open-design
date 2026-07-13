---
name: fal-vision
description: |
  Analyze images — segment objects, detect, run OCR, describe, and answer visual questions via fal.ai vision models.
triggers:
  - "fal vision"
  - "image analysis"
  - "object detection"
  - "ocr image"
  - "visual qa"
  - "segment"
od:
  mode: image
  category: image-generation
  upstream: "https://github.com/fal-ai-community/skills"
---

# fal-vision

> Curated from the fal.ai community team.

## What it does

Analyze images — segment objects, detect, run OCR, describe, and answer visual questions via fal.ai vision models.

## Source

- Upstream: https://github.com/fal-ai-community/skills
- Category: `image-generation`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/fal-ai-community/skills
```

Then ask the agent to invoke this skill by name (`fal-vision`) or with
one of the trigger phrases listed in this skill's frontmatter.
