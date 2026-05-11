---
name: figma-create-design-system-rules
description: |
  Generate project-specific design system rules for Figma-to-code workflows. Useful for capturing tokens, naming, and lint rules in one source.
triggers:
  - "figma rules"
  - "design system rules"
  - "figma to code rules"
  - "figma tokens"
od:
  mode: design-system
  category: figma
  upstream: "https://github.com/figma/skills"
---

# figma-create-design-system-rules

> Curated from Figma's MCP server guide.

## What it does

Generate project-specific design system rules for Figma-to-code workflows. Useful for capturing tokens, naming, and lint rules in one source.

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

Then ask the agent to invoke this skill by name (`figma-create-design-system-rules`) or with
one of the trigger phrases listed in this skill's frontmatter.
