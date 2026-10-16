---
name: accessibility-fix
description: |
  Apply mechanical accessibility fixes to a target or worklist with baseline and verify runs. Only fixes; leaves TODOs for visual or contextual judgment calls.
triggers:
  - "fix a11y issues"
  - "fix accessibility violations"
  - "accessibility fix"
  - "a11y remediation"
od:
  mode: design-system
  category: accessibility
  upstream: "https://github.com/AccessLint/skills/tree/main/plugins/accesslint/skills/accessibility-fix"
---

# accessibility-fix

> Curated from AccessLint.

## What it does

Apply mechanical accessibility fixes to a target or worklist with baseline and verify runs. Only fixes; leaves TODOs for visual or contextual judgment calls.

## Current OpenDesign scope

OpenDesign ships this entry as discovery metadata only. It needs the AccessLint MCP server for baseline and verify runs, and applies mechanical fixes only — visual or contextual judgment stays with a human.

## Source

- Upstream: https://github.com/AccessLint/skills/tree/main/plugins/accesslint/skills/accessibility-fix
- Category: `accessibility`

## How to use

This catalogue entry advertises the skill in OpenDesign so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/AccessLint/skills/tree/main/plugins/accesslint/skills/accessibility-fix
```

Then ask the agent to invoke this skill by name (`accessibility-fix`) or with
one of the trigger phrases listed in this skill's frontmatter.
