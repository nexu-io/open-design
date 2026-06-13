---
name: ai-music-album
description: |
  Full-lifecycle AI music album production — concept, lyric drafting, track sequencing, and export. Useful for indie album experiments and brand soundtracks.
triggers:
  - "ai music"
  - "music album"
  - "lyric writing"
  - "track sequencing"
  - "album production"
od:
  mode: audio
  category: audio-music
  upstream: "https://github.com/bitwize-music-studio/claude-ai-music-skills"
---

# ai-music-album

> Curated from bitwize-music-studio.

## What it does

Full-lifecycle AI music album production — concept, lyric drafting, track sequencing, and export. Useful for indie album experiments and brand soundtracks.

## Source

- Upstream: https://github.com/bitwize-music-studio/claude-ai-music-skills
- Category: `audio-music`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/bitwize-music-studio/claude-ai-music-skills
```

Then ask the agent to invoke this skill by name (`ai-music-album`) or with
one of the trigger phrases listed in this skill's frontmatter.
