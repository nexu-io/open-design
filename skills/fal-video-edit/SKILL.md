---
name: fal-video-edit
description: |
  Edit existing videos using AI — remix style, upscale, remove background, and add audio via fal.ai's hosted video models.
triggers:
  - "fal video edit"
  - "video upscale"
  - "video style transfer"
  - "remove video bg"
  - "video remix"
od:
  mode: video
  category: video-generation
  upstream: "https://github.com/fal-ai-community/skills"
---

# fal-video-edit

> Curated from the fal.ai community team.

## What it does

Edit existing videos using AI — remix style, upscale, remove background, and add audio via fal.ai's hosted video models.

## Source

- Upstream: https://github.com/fal-ai-community/skills
- Category: `video-generation`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/fal-ai-community/skills
```

Then ask the agent to invoke this skill by name (`fal-video-edit`) or with
one of the trigger phrases listed in this skill's frontmatter.
