---
name: accessibility-inspect
description: |
  Hands-on accessibility checks for one live page that the rule engine cannot decide: keyboard and focus order, names/roles/states, reflow and zoom, reduced motion, form errors, target size. Assesses only; does not edit.
triggers:
  - "accessibility inspect"
  - "keyboard navigation check"
  - "focus order"
  - "screen reader check"
  - "target size"
od:
  mode: design-system
  category: accessibility
  upstream: "https://github.com/AccessLint/skills/tree/main/plugins/accesslint/skills/accessibility-inspect"
---

# accessibility-inspect

> Curated from AccessLint.

## What it does

Hands-on accessibility checks for one live page that the rule engine cannot decide: keyboard and focus order, names/roles/states, reflow and zoom, reduced motion, form errors, target size. Assesses only; does not edit.

## Current OpenDesign scope

OpenDesign ships this entry as discovery metadata only. The hands-on checks need a browser MCP (chrome-devtools, Playwright, or Puppeteer); without one it runs the static checks and hands off the rest.

## Source

- Upstream: https://github.com/AccessLint/skills/tree/main/plugins/accesslint/skills/accessibility-inspect
- Category: `accessibility`

## How to use

This catalogue entry advertises the skill in OpenDesign so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/AccessLint/skills/tree/main/plugins/accesslint/skills/accessibility-inspect
```

Then ask the agent to invoke this skill by name (`accessibility-inspect`) or with
one of the trigger phrases listed in this skill's frontmatter.
