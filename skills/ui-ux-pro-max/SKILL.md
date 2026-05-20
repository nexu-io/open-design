---
name: ui-ux-pro-max
description: |
  Catalog-only UI/UX Pro Max entry. The full upstream templates, data, and search workflow are not bundled in Open Design.
triggers:
  - "ui ux patterns"
  - "design patterns"
  - "ux heuristics"
  - "usability"
od:
  mode: design-system
  category: design-systems
  upstream: "https://github.com/nextlevelbuilder/ui-ux-pro-max-skill"
---

# ui-ux-pro-max

> Curated from @nextlevelbuilder.

## What it does

Catalog-only UI/UX Pro Max entry. The full upstream templates, data, and search workflow are not bundled in Open Design.

## Current Open Design scope

Open Design currently ships this entry as discovery metadata only. If this `SKILL.md`
is the only file under `skills/ui-ux-pro-max/`, the upstream UI/UX Pro Max
workflow is not available locally.

The full upstream workflow expects additional assets such as the searchable
`data` CSVs, the `scripts/search.py` helper, reference material, templates, and
related upstream skill instructions. Without those files, do not tell users that
the full UI/UX Pro Max pattern library or template search is active.

## Source

- Upstream: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- Category: `design-systems`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
```

Then ask the agent to invoke this skill by name (`ui-ux-pro-max`) or with
one of the trigger phrases listed in this skill's frontmatter.

If those upstream files are not installed, explain that Open Design only has the
catalog entry for this skill and ask whether to continue with Open Design's
default design-system guidance instead.
