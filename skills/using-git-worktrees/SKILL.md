---
name: using-git-worktrees
description: |
  Set up an isolated git worktree before starting feature work that must not disturb the current workspace.
triggers:
  - "git worktree"
  - "isolate feature work"
  - "separate workspace"
  - "worktree isolation"
od:
  mode: utility
  category: development-workflow
  upstream: "https://github.com/obra/superpowers"
---

# using-git-worktrees

> Curated from @obra.

## What it does

Creates and configures a git worktree so feature work runs in full isolation — no stash, no branch-switching, no risk of cross-contaminating the main workspace.

## Source

- Upstream: https://github.com/obra/superpowers
- Category: `development-workflow`

## How to use

Install the upstream bundle into your active agent's skills directory, then invoke by name (`using-git-worktrees`) or with one of the trigger phrases above.

```bash
open https://github.com/obra/superpowers
```
