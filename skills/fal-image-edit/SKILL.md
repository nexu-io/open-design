---
name: fal-image-edit
description: |
  AI-powered image editing with style transfer, background removal, object removal, and inpainting via fal.ai hosted models.
triggers:
  - "fal image edit"
  - "inpaint"
  - "style transfer"
  - "background removal"
  - "object removal"
od:
  mode: image
  category: image-generation
  upstream: "https://github.com/fal-ai-community/skills"
---

# fal-image-edit

> Curated from the fal.ai community team.

## What it does

AI-powered image editing with style transfer, background removal, object removal, and inpainting via fal.ai hosted models.

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

Then ask the agent to invoke this skill by name (`fal-image-edit`) or with
one of the trigger phrases listed in this skill's frontmatter.
