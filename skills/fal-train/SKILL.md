---
name: fal-train
description: |
  Train custom AI models (LoRA) on fal.ai for personalized image generation tailored to a brand, character, or style.
triggers:
  - "fal train"
  - "train lora"
  - "custom model"
  - "personalized image gen"
  - "brand lora"
od:
  mode: image
  category: image-generation
  upstream: "https://github.com/fal-ai-community/skills"
---

# fal-train

> Curated from the fal.ai community team.

## What it does

Train custom AI models (LoRA) on fal.ai for personalized image generation tailored to a brand, character, or style.

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

Then ask the agent to invoke this skill by name (`fal-train`) or with
one of the trigger phrases listed in this skill's frontmatter.
