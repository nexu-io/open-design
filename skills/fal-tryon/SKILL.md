---
name: fal-tryon
description: |
  Virtual try-on — see how clothes look on a person via fal.ai's hosted try-on models. Useful for ecommerce, lookbooks, and styling experiments.
triggers:
  - "virtual tryon"
  - "fal tryon"
  - "try on clothes"
  - "lookbook"
  - "ecommerce styling"
od:
  mode: image
  category: image-generation
  upstream: "https://github.com/fal-ai-community/skills"
---

# fal-tryon

> Curated from the fal.ai community team.

## What it does

Virtual try-on — see how clothes look on a person via fal.ai's hosted try-on models. Useful for ecommerce, lookbooks, and styling experiments.

## Source

- Upstream: https://github.com/fal-ai-community/skills
- Category: `image-generation`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/fal-ai-community/skills
```

Then ask the agent to invoke this skill by name (`fal-tryon`) or with
one of the trigger phrases listed in this skill's frontmatter.
