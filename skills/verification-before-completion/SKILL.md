---
name: verification-before-completion
description: |
  Run evidence-gathering checks before claiming any work is complete, fixed, or passing — before committing or opening a PR.
triggers:
  - "verify before done"
  - "check before committing"
  - "evidence before assertions"
  - "confirm it works"
  - "pre-commit verification"
od:
  mode: utility
  category: development-workflow
  upstream: "https://github.com/obra/superpowers"
---

# verification-before-completion

> Curated from @obra.

## What it does

Prevents false completion claims by running a structured verification checklist — build, typecheck, tests, and behaviour checks — before any work is declared done or committed.

## Source

- Upstream: https://github.com/obra/superpowers
- Category: `development-workflow`

## How to use

Install the upstream bundle into your active agent's skills directory, then invoke by name (`verification-before-completion`) or with one of the trigger phrases above.

```bash
open https://github.com/obra/superpowers
```
