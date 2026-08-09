---
name: higgsfield-video-explainer
description: |
  Create a narrated non-photoreal explainer as matched Seed Audio + Gemini Omni blocks, then assemble the final MP4 with explainer_video.
triggers:
  - "higgsfield explainer"
  - "video explainer"
  - "narrated explainer"
  - "explainer video"
  - "seed audio explainer"
od:
  mode: utility
  category: video-generation
  upstream: "https://github.com/higgsfield-ai/skills"
---

# higgsfield-video-explainer

> Curated from the official Higgsfield AI skills repository.

## What it does

Create a narrated non-photoreal explainer as matched Seed Audio + Gemini Omni blocks, then assemble the final MP4 with explainer_video.

## Source

- Upstream: https://github.com/higgsfield-ai/skills
- Category: `video-generation`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/higgsfield-ai/skills
```

Then ask the agent to invoke this skill by name (`higgsfield-video-explainer`) or with
one of the trigger phrases listed in this skill's frontmatter.
