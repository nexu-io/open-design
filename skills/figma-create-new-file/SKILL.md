---
name: figma-create-new-file
description: |
  Create a new blank Figma Design or FigJam file. Useful as the first step in scripted design-system or workshop workflows.
triggers:
  - "figma new file"
  - "figjam new"
  - "create figma file"
od:
  mode: design-system
  category: figma
  upstream: "https://github.com/figma/skills"
---

# figma-create-new-file

> Curated from Figma's MCP server guide.

## What it does

Create a new blank Figma Design or FigJam file. Useful as the first step in scripted design-system or workshop workflows.

## Source

- Upstream: https://github.com/figma/skills
- Category: `figma`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/figma/skills
```

Then ask the agent to invoke this skill by name (`figma-create-new-file`) or with
one of the trigger phrases listed in this skill's frontmatter.
