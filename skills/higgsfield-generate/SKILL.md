---
name: higgsfield-generate
description: |
  Image, video, 3D, and audio generation across 30+ Higgsfield models (Nano Banana, Soul, Veo, Kling, Seedance, Flux, GPT Image, …), plus Marketing Studio branded ads and Virality Predictor scoring.
triggers:
  - "higgsfield"
  - "higgsfield generate"
  - "soul generate"
  - "seedance"
  - "marketing studio"
  - "virality predictor"
od:
  mode: image
  category: image-generation
  upstream: "https://github.com/higgsfield-ai/skills"
---

# higgsfield-generate

> Curated from the official Higgsfield AI skills repository.

## What it does

Image, video, 3D, and audio generation across 30+ Higgsfield models (Nano Banana, Soul, Veo, Kling, Seedance, Flux, GPT Image, …), plus Marketing Studio branded ads and Virality Predictor scoring.

## Current Open Design scope

Prefer the built-in Higgsfield MCP template in Settings → Integrations (OAuth Connect) for agent tool calls. Install the full upstream skill pack with `npx skills add higgsfield-ai/skills` when you need CLI workflows.

## Source

- Upstream: https://github.com/higgsfield-ai/skills
- Category: `image-generation`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/higgsfield-ai/skills
```

Then ask the agent to invoke this skill by name (`higgsfield-generate`) or with
one of the trigger phrases listed in this skill's frontmatter.
