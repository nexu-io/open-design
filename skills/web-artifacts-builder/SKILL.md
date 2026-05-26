---
name: web-artifacts-builder
description: |
  Build complex claude.ai HTML artifacts with React and Tailwind. Anthropic's reference workflow for shipping rich, embeddable artifacts.
triggers:
  - "web artifacts"
  - "tailwind artifact"
  - "react artifact"
  - "anthropic artifact"
od:
  mode: prototype
  category: web-artifacts
  upstream: "https://github.com/anthropics/skills/tree/main/web-artifacts-builder"
---

# web-artifacts-builder

> Curated from Anthropic's official skills repository.

## What it does

Build complex claude.ai HTML artifacts with React and Tailwind. Anthropic's reference workflow for shipping rich, embeddable artifacts.

## Source

- Upstream: https://github.com/anthropics/skills/tree/main/web-artifacts-builder
- Category: `web-artifacts`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/anthropics/skills/tree/main/web-artifacts-builder
```

Then ask the agent to invoke this skill by name (`web-artifacts-builder`) or with
one of the trigger phrases listed in this skill's frontmatter.
