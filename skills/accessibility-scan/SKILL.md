---
name: accessibility-scan
description: |
  Run the accessibility rule engine against one live page and locate every mechanically detectable WCAG 2.2 violation, each grounded to a DOM selector and source file:line. Locates only; does not edit. Use for page-level checks and verifying a UI change.
triggers:
  - "accessibility scan"
  - "is this page accessible"
  - "check a11y"
  - "wcag scan"
  - "contrast issues"
od:
  mode: design-system
  category: accessibility
  upstream: "https://github.com/AccessLint/skills/tree/main/plugins/accesslint/skills/accessibility-scan"
---

# accessibility-scan

> Curated from AccessLint.

## What it does

Run the accessibility rule engine against one live page and locate every mechanically detectable WCAG 2.2 violation, each grounded to a DOM selector and source file:line. Locates only; does not edit. Use for page-level checks and verifying a UI change.

## Current OpenDesign scope

OpenDesign ships this entry as discovery metadata only. Running it shells out to npx @accesslint/cli against a live page over CDP (auto-launches Chrome); the CLI and browser session are user-side requirements — disclose them before running in sandboxed environments.

## Source

- Upstream: https://github.com/AccessLint/skills/tree/main/plugins/accesslint/skills/accessibility-scan
- Category: `accessibility`

## How to use

This catalogue entry advertises the skill in OpenDesign so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/AccessLint/skills/tree/main/plugins/accesslint/skills/accessibility-scan
```

Then ask the agent to invoke this skill by name (`accessibility-scan`) or with
one of the trigger phrases listed in this skill's frontmatter.
