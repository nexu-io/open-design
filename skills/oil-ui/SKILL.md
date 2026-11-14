---
name: oil-ui
description: |
  Design, review, and refine websites, apps, dashboards, and UI components with direction-first workflows, distinct multi-direction comparison pages, and screenshot verification.
triggers:
  - "oil-ui"
  - "ui design"
  - "compare ui directions"
  - "design review"
  - "screenshot to ui"
od:
  mode: design-system
  category: design-systems
  upstream: "https://github.com/oil-oil/oil-ui"
---

# oil-ui

> Curated from @oil-oil.

## What it does

Oil UI is an open-source (MIT) interface design skill for coding agents. It turns vague terms like "clean" or "premium" into concrete typography, color, layout, and interaction decisions, recommends one direction by default or builds a side-by-side comparison page when exploring options, and verifies finished screens across desktop and mobile screenshots.

## Source

- Upstream: https://github.com/oil-oil/oil-ui
- Category: `design-systems`

## How to use

This catalogue entry advertises `oil-ui` in OpenDesign so the agent discovers it during planning. To run the full upstream workflow with its references, comparison page generator, and screenshot tools, install the upstream bundle:

```bash
npx skills add oil-oil/oil-ui
```

Or inspect the upstream repository directly:

```bash
open https://github.com/oil-oil/oil-ui
```

Then ask the agent to invoke this skill by name (`oil-ui`) or with one of the trigger phrases listed in this skill's frontmatter.
