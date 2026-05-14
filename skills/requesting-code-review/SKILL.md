---
name: requesting-code-review
description: |
  Self-review checklist to run before requesting a human code review or merging a feature branch.
triggers:
  - "request review"
  - "pre-review checklist"
  - "ready for review"
  - "self review"
  - "before PR review"
od:
  mode: utility
  category: development-workflow
  upstream: "https://github.com/obra/superpowers"
---

# requesting-code-review

> Curated from @obra.

## What it does

Runs a structured self-review — correctness, test coverage, boundary violations, docs — before marking work ready for human review or merging.

## Source

- Upstream: https://github.com/obra/superpowers
- Category: `development-workflow`

## How to use

Install the upstream bundle into your active agent's skills directory, then invoke by name (`requesting-code-review`) or with one of the trigger phrases above.

```bash
open https://github.com/obra/superpowers
```
