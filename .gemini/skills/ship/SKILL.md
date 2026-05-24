---
name: ship
description: Stage diff, generate conventional commit message, and run the ship pipeline (preflight, commit, push, PR, auto-merge queue).
---

# Ship

Use this skill when the user wants a single-command ship flow.

## Quick Triggers

- `/ship` — full pipeline
- `/ship --dry-run` — preview what would happen
- `/ship --auto-branch` — auto-create feature branch when on main
- `/ship --skip-preflight` — skip pre-commit + tests (caller already validated)

## Preconditions (must verify)

- Current branch is NOT `main` or `master` (unless using `--auto-branch`).
- Working tree is clean (no unstaged changes).
- Changes intended for commit are staged (`git diff --cached` is non-empty).

## Flow

1. Read staged diff:

```bash
git diff --cached
```

2. Generate a conventional commit message from the staged diff.

3. Run ship:

```bash
dev-infra ship -m "<type>(<scope>): <subject>" --auto-branch
```

For a preview without making changes:

```bash
dev-infra ship --dry-run -m "<type>(<scope>): <subject>"
```

## Flag Reference

| Flag | Description |
|------|-------------|
| `-m`, `--message` | Commit message |
| `-a`, `--all` | Stage all changes |
| `-n`, `--dry-run` | Preview without mutating |
| `-B`, `--base` | Base branch (default: main) |
| `--auto-branch` | Auto-create feature branch from main |
| `--skip-preflight` | Skip pre-commit + tests |
| `--immediate` | Merge now (fallback to auto if blocked) |
| `--land` | Post-merge: checkout base, pull, test, cleanup |

## Output (must report)

- PR URL (printed by `dev-infra ship`)
- Whether auto-merge is queued or merged immediately
- If anything fails, stop and paste the last error and the immediate fix.
