---
name: subagent-driven-development
description: |
  Execute an implementation plan by dispatching independent tasks to subagents within the current session.
triggers:
  - "subagent development"
  - "delegate to subagents"
  - "parallel implementation"
  - "agent-driven build"
od:
  mode: utility
  category: development-workflow
  upstream: "https://github.com/obra/superpowers"
---

# subagent-driven-development

> Curated from @obra.

## What it does

Takes an implementation plan whose tasks are independent and dispatches each to a subagent, collecting results and synthesising them back into a coherent whole.

## Source

- Upstream: https://github.com/obra/superpowers
- Category: `development-workflow`

## How to use

Install the upstream bundle into your active agent's skills directory, then invoke by name (`subagent-driven-development`) or with one of the trigger phrases above.

```bash
open https://github.com/obra/superpowers
```
