---
name: design-md
description: |
  Create and manage DESIGN.md files. Useful for capturing design direction, tokens, and visual rules in a single source of truth.
triggers:
  - "design.md"
  - "design doc"
  - "design tokens doc"
  - "visual rules doc"
od:
  mode: design-system
  category: design-systems
  upstream: "https://github.com/google-labs-code/skills"
---

# design-md

> Curated from Google Labs (Stitch).

## What it does

Create and manage DESIGN.md files. Useful for capturing design direction, tokens, and visual rules in a single source of truth.

## Source

- Upstream: https://github.com/google-labs-code/skills
- Category: `design-systems`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/google-labs-code/skills
```

Then ask the agent to invoke this skill by name (`design-md`) or with
one of the trigger phrases listed in this skill's frontmatter.
