---
name: rw-generate-audio
description: |
  Generate audio via the official Runway API skills — sound design, voice, and soundtrack clips that pair with Runway video generations.
triggers:
  - "runway audio"
  - "rw-generate-audio"
  - "runway sound"
  - "runway soundtrack"
  - "runway voice"
od:
  mode: audio
  category: audio-music
  upstream: "https://github.com/runwayml/skills"
---

# rw-generate-audio

> Curated from the official Runway ML skills repository.

## What it does

Generate audio via the official Runway API skills — sound design, voice, and soundtrack clips that pair with Runway video generations.

## Current Open Design scope

Prefer the built-in Runway MCP template in Settings → Integrations (OAuth Connect). Install with `npx skills add runwayml/skills` when you need the CLI skill pack.

## Source

- Upstream: https://github.com/runwayml/skills
- Category: `audio-music`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/runwayml/skills
```

Then ask the agent to invoke this skill by name (`rw-generate-audio`) or with
one of the trigger phrases listed in this skill's frontmatter.
