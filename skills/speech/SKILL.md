---
name: speech
description: |
  Generate spoken audio from text using OpenAI's API with built-in voices. Useful for narrated explainers, lecture audio, and quick voiceover tracks.
triggers:
  - "openai speech"
  - "tts openai"
  - "narrated audio"
  - "voice over"
od:
  mode: audio
  category: audio-music
  upstream: "https://github.com/openai/skills"
---

# speech

> Curated from OpenAI's skills repository.

## What it does

Generate spoken audio from text using OpenAI's API with built-in voices. Useful for narrated explainers, lecture audio, and quick voiceover tracks.

## Source

- Upstream: https://github.com/openai/skills
- Category: `audio-music`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/openai/skills
```

Then ask the agent to invoke this skill by name (`speech`) or with
one of the trigger phrases listed in this skill's frontmatter.
