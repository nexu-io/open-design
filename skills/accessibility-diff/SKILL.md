---
name: accessibility-diff
description: |
  Diff one page against a baseline (uncommitted changes by default, or a branch) and report only the accessibility issues the change introduced or fixed. Use as the regression gate.
triggers:
  - "accessibility diff"
  - "a11y regression check"
  - "a11y diff"
  - "accessibility regression"
od:
  mode: design-system
  category: accessibility
  upstream: "https://github.com/AccessLint/skills/tree/main/plugins/accesslint/skills/accessibility-diff"
---

# accessibility-diff

> Curated from AccessLint.

## What it does

Diff one page against a baseline (uncommitted changes by default, or a branch) and report only the accessibility issues the change introduced or fixed. Use as the regression gate.

## Current OpenDesign scope

OpenDesign ships this entry as discovery metadata only. Running it shells out to npx @accesslint/cli against a live page over CDP (auto-launches Chrome); the CLI and browser session are user-side requirements.

## Source

- Upstream: https://github.com/AccessLint/skills/tree/main/plugins/accesslint/skills/accessibility-diff
- Category: `accessibility`

## How to use

This catalogue entry advertises the skill in OpenDesign so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/AccessLint/skills/tree/main/plugins/accesslint/skills/accessibility-diff
```

Then ask the agent to invoke this skill by name (`accessibility-diff`) or with
one of the trigger phrases listed in this skill's frontmatter.
