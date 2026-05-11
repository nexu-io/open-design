---
name: pdf
description: |
  Extract text, create PDFs, and handle forms. Useful for press releases, branded one-pagers, and printable design deliverables.
triggers:
  - "pdf"
  - "create pdf"
  - "pdf form"
  - "branded pdf"
  - "one pager"
od:
  mode: prototype
  category: documents
  upstream: "https://github.com/anthropics/skills/tree/main/pdf"
---

# pdf

> Curated from Anthropic's official skills repository.

## What it does

Extract text, create PDFs, and handle forms. Useful for press releases, branded one-pagers, and printable design deliverables.

## Source

- Upstream: https://github.com/anthropics/skills/tree/main/pdf
- Category: `documents`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/anthropics/skills/tree/main/pdf
```

Then ask the agent to invoke this skill by name (`pdf`) or with
one of the trigger phrases listed in this skill's frontmatter.
