---
name: fal-3d
description: |
  Generate 3D models from text or images via fal.ai. Useful for game assets, AR previews, product mockups, and concept sculpting.
triggers:
  - "fal 3d"
  - "text to 3d"
  - "image to 3d"
  - "3d model gen"
  - "game asset 3d"
od:
  mode: image
  category: 3d-shaders
  upstream: "https://github.com/fal-ai-community/skills"
---

# fal-3d

> Curated from the fal.ai community team.

## What it does

Generate 3D models from text or images via fal.ai. Useful for game assets, AR previews, product mockups, and concept sculpting.

## Source

- Upstream: https://github.com/fal-ai-community/skills
- Category: `3d-shaders`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/fal-ai-community/skills
```

Then ask the agent to invoke this skill by name (`fal-3d`) or with
one of the trigger phrases listed in this skill's frontmatter.
