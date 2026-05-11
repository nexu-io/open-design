---
name: doc
description: |
  Read, create, and edit .docx documents with formatting and layout fidelity via OpenAI's document skill.
triggers:
  - "openai doc"
  - "docx fidelity"
  - "word doc edit"
  - "layout doc"
od:
  mode: prototype
  category: documents
  upstream: "https://github.com/openai/skills"
---

# doc

> Curated from OpenAI's skills repository.

## What it does

Read, create, and edit .docx documents with formatting and layout fidelity via OpenAI's document skill.

## Source

- Upstream: https://github.com/openai/skills
- Category: `documents`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/openai/skills
```

Then ask the agent to invoke this skill by name (`doc`) or with
one of the trigger phrases listed in this skill's frontmatter.
