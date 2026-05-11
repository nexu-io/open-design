---
name: figma-use
description: |
  Run Figma Plugin API scripts for canvas writes, inspections, variables, and design-system work. Prerequisite for every other Figma skill in this catalogue.
triggers:
  - "figma use"
  - "figma plugin api"
  - "figma canvas"
  - "figma scripts"
od:
  mode: design-system
  category: figma
  upstream: "https://github.com/figma/skills"
---

# figma-use

> Curated from Figma's MCP server guide.

## What it does

Run Figma Plugin API scripts for canvas writes, inspections, variables, and design-system work. Prerequisite for every other Figma skill in this catalogue.

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

Then ask the agent to invoke this skill by name (`figma-use`) or with
one of the trigger phrases listed in this skill's frontmatter.
