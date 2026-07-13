---
name: design-review
description: |
  Designer Who Codes: visual audit then fixes with atomic commits and before/after screenshots. Useful for tightening shipped UI before launch.
triggers:
  - "design review"
  - "visual audit"
  - "before after"
  - "pre launch design check"
od:
  mode: design-system
  category: creative-direction
  upstream: "https://github.com/garrytan/gstack"
---

# design-review

> Curated from Garry Tan (gstack).

## What it does

Designer Who Codes: visual audit then fixes with atomic commits and before/after screenshots. Useful for tightening shipped UI before launch.

## Source

- Upstream: https://github.com/garrytan/gstack
- Category: `creative-direction`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/garrytan/gstack
```

Then ask the agent to invoke this skill by name (`design-review`) or with
one of the trigger phrases listed in this skill's frontmatter.
