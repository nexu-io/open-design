---
name: session-complete
description: Complete session with handoff, downstream sync, and cleanup. Use when wrapping up work and exiting cleanly.
---

# Session Complete

Use this skill when the user wants to wrap up a work session with full cleanup and state synchronization.

## Quick Triggers

- `/session-complete` — full cleanup flow
- `/session-complete "summary text"` — with custom handoff summary
- `/done` — shorthand alias

## What This Does

1. **Create handoff** — Document current state
2. **Sync downstream** — Push updates to dependent repos
3. **Housekeep** — Run safe housekeeping (optimize, prune, tidy)
4. **Cleanup branches** — Prune stale/merged branches
5. **Verify state** — Confirm everything is clean

## Flow

```bash
# 1. Create handoff (with optional summary)
# Save current session state to project handoffs directory

# 2. Sync to downstream repos
scripts/antig-sync --update

# 3. Housekeep (safe profile — optimize, prune, tidy)
dev-infra housekeep --profile=pipeline

# 4. Cleanup stale branches (merged or gone from remote)
git fetch --prune
git branch -vv | grep ': gone]' | awk '{print $1}' | xargs -r git branch -d 2>/dev/null || true

# 5. Report final state
git status --short --branch
```

## Output

Report:
- Handoff file path
- Downstream repos updated
- Branches cleaned
- Final git status
- Any warnings (uncommitted changes, unpushed commits, etc.)

## When NOT to Use

- Mid-work checkpoints (use a quick handoff instead)
- Active development (this is for exiting cleanly)
- Uncommitted work you want to keep staging
