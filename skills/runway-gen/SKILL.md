---
name: runway-gen
description: |
  Generate videos, images, and audio via the official Runway API skills (text/image/video-to-video, Gen-4.5, Seedance, Veo). Complements the bundled runwayml design system for brand look.
triggers:
  - "runway"
  - "runway gen"
  - "runwayml video"
  - "gen4.5"
  - "rw-generate-video"
od:
  mode: video
  category: video-generation
  upstream: "https://github.com/runwayml/skills"
---

# runway-gen

> Curated from the official Runway ML skills repository.

## What it does

Generate videos, images, and audio via the official Runway API skills (text/image/video-to-video, Gen-4.5, Seedance, Veo). Complements the bundled runwayml design system for brand look.

## Current Open Design scope

Prefer the built-in Runway MCP template in Settings → Integrations (OAuth Connect) for agent tool calls. Install the full upstream skill pack with `npx skills add runwayml/skills` and set RUNWAYML_API_SECRET for CLI workflows. For brand styling inside Open Design artifacts, use the bundled `runwayml` design system.

## Source

- Upstream: https://github.com/runwayml/skills
- Category: `video-generation`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/runwayml/skills
```

Then ask the agent to invoke this skill by name (`runway-gen`) or with
one of the trigger phrases listed in this skill's frontmatter.
