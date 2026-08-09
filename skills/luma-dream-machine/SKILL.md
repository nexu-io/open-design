---
name: luma-dream-machine
description: |
  Luma Dream Machine video generation and restyle — text-to-video, image-to-video, and clip modification with motion-preserving transforms.
triggers:
  - "luma"
  - "dream machine"
  - "luma video"
  - "luma dream machine"
  - "ray-2"
od:
  mode: utility
  category: video-generation
  upstream: "https://github.com/runapi-ai/luma"
---

# luma-dream-machine

> Curated from the RunAPI Luma skill (Dream Machine API).

## What it does

Luma Dream Machine video generation and restyle — text-to-video, image-to-video, and clip modification with motion-preserving transforms.

## Current Open Design scope

Prefer the built-in "Luma Dream Machine (AceDataCloud)" MCP template in Settings → Integrations (Bearer token from platform.acedata.cloud). Install with `npx skills add runapi-ai/luma -g` for the CLI skill, or use Luma docs at https://docs.lumalabs.ai.

## Source

- Upstream: https://github.com/runapi-ai/luma
- Category: `video-generation`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/runapi-ai/luma
```

Then ask the agent to invoke this skill by name (`luma-dream-machine`) or with
one of the trigger phrases listed in this skill's frontmatter.
