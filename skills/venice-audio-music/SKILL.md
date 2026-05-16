---
name: venice-audio-music
description: |
  Music generation queueing, retrieval, and completion endpoints via Venice.ai. Suited for jingles, background loops, and prototype scoring.
triggers:
  - "venice music"
  - "music gen"
  - "jingle"
  - "background loop"
  - "score"
od:
  mode: audio
  category: audio-music
  upstream: "https://github.com/veniceai/skills"
---

# venice-audio-music

> Curated from the Venice.ai team.

## What it does

Music generation queueing, retrieval, and completion endpoints via Venice.ai. Suited for jingles, background loops, and prototype scoring.

## Source

- Upstream: https://github.com/veniceai/skills
- Category: `audio-music`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/veniceai/skills
```

Then ask the agent to invoke this skill by name (`venice-audio-music`) or with
one of the trigger phrases listed in this skill's frontmatter.
