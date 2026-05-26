---
name: done
description: Alias for session-complete. Wrap up work, sync downstream, cleanup, and exit cleanly.
---

# Done

Shorthand for `/session-complete`. Use when you're done with a work session.

## Usage

```bash
/done
/done "fixed auth bugs and added tests"
```

## What It Does

1. Creates handoff documenting current state
2. Syncs changes to downstream repos
3. Cleans up stale git branches
4. Reports final status

## When to Use

- **Regular dev sessions** — Most common use case
- **Local development** — No external dependencies required
- **Quick exit** — Fast, simple cleanup

## Related

- `/session-complete` — Full version (same behavior)
