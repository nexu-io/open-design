---
name: hallmark
description: |
  Anti-AI-slop page design: picks a macrostructure from 21 page shapes, applies a theme, runs slop-test gates plus a pre-emit self-critique. Verbs: default build, hallmark audit (ranked punch list, no edits), hallmark redesign, hallmark study (extract design DNA from a screenshot or URL). Use for non-generic landing pages and redesigns.
triggers:
  - "hallmark"
  - "hallmark audit"
  - "hallmark redesign"
  - "hallmark study"
  - "anti-ai-slop page"
od:
  mode: prototype
  category: creative-direction
  upstream: "https://github.com/nutlope/hallmark"
---

# hallmark

> Curated from @nutlope (MIT).

## What it does

Anti-AI-slop page design: picks a macrostructure from 21 page shapes, applies a theme, runs slop-test gates plus a pre-emit self-critique. Verbs: default build, hallmark audit (ranked punch list, no edits), hallmark redesign, hallmark study (extract design DNA from a screenshot or URL). Use for non-generic landing pages and redesigns.

## Current OpenDesign scope

OpenDesign ships this entry as discovery metadata only. The upstream theme catalog, reference files, and study/redesign workflows are not bundled here; install the upstream skill to run the full workflow.

## Source

- Upstream: https://github.com/nutlope/hallmark
- Category: `creative-direction`

## How to use

This catalogue entry advertises the skill in OpenDesign so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/nutlope/hallmark
```

Then ask the agent to invoke this skill by name (`hallmark`) or with
one of the trigger phrases listed in this skill's frontmatter.
