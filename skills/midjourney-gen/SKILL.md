---
name: midjourney-gen
description: |
  Midjourney image and video generation via third-party MCP/API proxies (imagine, blend, edit, describe). Complements Higgsfield/Runway when you specifically want Midjourney aesthetics.
triggers:
  - "midjourney"
  - "mj imagine"
  - "midjourney blend"
  - "midjourney video"
  - "midjourney describe"
od:
  mode: image
  category: image-generation
  upstream: "https://github.com/AceDataCloud/MidjourneyMCP"
---

# midjourney-gen

> Curated against the AceDataCloud Midjourney MCP surface (unofficial Midjourney proxy).

## What it does

Midjourney image and video generation via third-party MCP/API proxies (imagine, blend, edit, describe). Complements Higgsfield/Runway when you specifically want Midjourney aesthetics.

## Current Open Design scope

Prefer the built-in Midjourney (AceDataCloud) MCP template in Settings → Integrations (Bearer token from platform.acedata.cloud). Midjourney has no official public MCP.

## Source

- Upstream: https://github.com/AceDataCloud/MidjourneyMCP
- Category: `image-generation`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/AceDataCloud/MidjourneyMCP
```

Then ask the agent to invoke this skill by name (`midjourney-gen`) or with
one of the trigger phrases listed in this skill's frontmatter.
