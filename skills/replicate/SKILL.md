---
name: replicate
description: |
  Discover, compare, and run AI models using Replicate's API. Strong fit for image, audio, and video generation pipelines that swap models frequently.
triggers:
  - "replicate"
  - "run ai model"
  - "model comparison"
  - "replicate api"
od:
  mode: image
  category: image-generation
  upstream: "https://github.com/replicate/skills"
---

# replicate

> Curated from Replicate.

## What it does

Discover, compare, and run AI models using Replicate's API. Strong fit for image, audio, and video generation pipelines that swap models frequently.

## Source

- Upstream: https://github.com/replicate/skills
- Category: `image-generation`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/replicate/skills
```

Then ask the agent to invoke this skill by name (`replicate`) or with
one of the trigger phrases listed in this skill's frontmatter.
