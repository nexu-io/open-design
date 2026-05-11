---
name: slides
description: |
  Create and edit .pptx presentation decks with PptxGenJS. Useful for sales decks, kickoff briefs, and design-system showcases.
triggers:
  - "slides"
  - "pptxgenjs"
  - "sales deck"
  - "design showcase deck"
od:
  mode: deck
  category: slides
  upstream: "https://github.com/openai/skills"
---

# slides

> Curated from OpenAI's skills repository.

## What it does

Create and edit .pptx presentation decks with PptxGenJS. Useful for sales decks, kickoff briefs, and design-system showcases.

## Source

- Upstream: https://github.com/openai/skills
- Category: `slides`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/openai/skills
```

Then ask the agent to invoke this skill by name (`slides`) or with
one of the trigger phrases listed in this skill's frontmatter.
