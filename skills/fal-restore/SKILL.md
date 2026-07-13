---
name: fal-restore
description: |
  Restore and fix image quality — deblur, denoise, fix faces, and restore old documents using fal.ai's hosted restoration models.
triggers:
  - "fal restore"
  - "restore image"
  - "deblur"
  - "denoise"
  - "fix faces"
  - "document restore"
od:
  mode: image
  category: image-generation
  upstream: "https://github.com/fal-ai-community/skills"
---

# fal-restore

> Curated from the fal.ai community team.

## What it does

Restore and fix image quality — deblur, denoise, fix faces, and restore old documents using fal.ai's hosted restoration models.

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

Then ask the agent to invoke this skill by name (`fal-restore`) or with
one of the trigger phrases listed in this skill's frontmatter.
