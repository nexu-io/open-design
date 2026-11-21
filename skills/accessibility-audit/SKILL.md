---
name: accessibility-audit
description: |
  Whole-site WCAG conformance audit: defines scope, samples representative pages and flows, runs scan plus inspect per page, reports per-criterion conformance as pass, fail, or undetermined.
triggers:
  - "accessibility audit"
  - "wcag audit"
  - "wcag-em audit"
  - "site accessibility"
  - "section 508"
od:
  mode: design-system
  category: accessibility
  upstream: "https://github.com/AccessLint/skills/tree/main/plugins/accesslint/skills/accessibility-audit"
---

# accessibility-audit

> Curated from AccessLint.

## What it does

Whole-site WCAG conformance audit: defines scope, samples representative pages and flows, runs scan plus inspect per page, reports per-criterion conformance as pass, fail, or undetermined.

## Current OpenDesign scope

OpenDesign ships this entry as discovery metadata only. Running it needs npx @accesslint/cli plus Chrome over CDP, and uses the AccessLint MCP server for rule metadata when available.

## Source

- Upstream: https://github.com/AccessLint/skills/tree/main/plugins/accesslint/skills/accessibility-audit
- Category: `accessibility`

## How to use

This catalogue entry advertises the skill in OpenDesign so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/AccessLint/skills/tree/main/plugins/accesslint/skills/accessibility-audit
```

Then ask the agent to invoke this skill by name (`accessibility-audit`) or with
one of the trigger phrases listed in this skill's frontmatter.
