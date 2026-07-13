---
name: figma-code-connect-components
description: |
  Connect Figma design components to code components using Code Connect so design-system updates flow into the codebase automatically.
triggers:
  - "figma code connect"
  - "design to code"
  - "figma components"
  - "code connect"
od:
  mode: design-system
  category: figma
  upstream: "https://github.com/figma/skills"
---

# figma-code-connect-components

> Curated from Figma's MCP server guide.

## What it does

Connect Figma design components to code components using Code Connect so design-system updates flow into the codebase automatically.

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

Then ask the agent to invoke this skill by name (`figma-code-connect-components`) or with
one of the trigger phrases listed in this skill's frontmatter.
