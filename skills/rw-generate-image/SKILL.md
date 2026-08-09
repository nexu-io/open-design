---
name: rw-generate-image
description: |
  Generate still images via the official Runway API (GPT Image, Nano Banana Pro, and other Runway image models) — text-to-image and image reference workflows.
triggers:
  - "runway image"
  - "rw-generate-image"
  - "runway still"
  - "runway text to image"
  - "gpt image runway"
od:
  mode: image
  category: image-generation
  upstream: "https://github.com/runwayml/skills"
---

# rw-generate-image

> Curated from the official Runway ML skills repository.

## What it does

Generate still images via the official Runway API (GPT Image, Nano Banana Pro, and other Runway image models) — text-to-image and image reference workflows.

## Current Open Design scope

Prefer the built-in Runway MCP template in Settings → Integrations (OAuth Connect). Install with `npx skills add runwayml/skills` when you need the CLI skill pack.

## Source

- Upstream: https://github.com/runwayml/skills
- Category: `image-generation`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/runwayml/skills
```

Then ask the agent to invoke this skill by name (`rw-generate-image`) or with
one of the trigger phrases listed in this skill's frontmatter.
