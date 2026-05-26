---
name: figma-implement-design
description: |
  Translate Figma designs into production-ready code with 1:1 visual fidelity. Useful for handing off Figma frames straight to a frontend agent.
triggers:
  - "figma to code"
  - "implement figma"
  - "figma fidelity"
  - "1:1 figma"
od:
  mode: design-system
  category: figma
  upstream: "https://github.com/figma/skills"
---

# figma-implement-design

> Curated from Figma's MCP server guide.

## What it does

Translate Figma designs into production-ready code with 1:1 visual fidelity. Useful for handing off Figma frames straight to a frontend agent.

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

Then ask the agent to invoke this skill by name (`figma-implement-design`) or with
one of the trigger phrases listed in this skill's frontmatter.
