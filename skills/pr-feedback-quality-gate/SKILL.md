---
name: pr-feedback-quality-gate
description: |
  Safely track pull request feedback, resolve review comments or merge conflicts, validate fixes, and use a read-only cross-review before committing or pushing follow-up changes.
triggers:
  - "PR feedback"
  - "review comments"
  - "merge conflicts"
  - "cross-review"
  - "Claude CLI review"
  - "monitor PR"
od:
  mode: utility
---

# PR Feedback Quality Gate

Use this when a PR has review feedback, merge conflicts, pending checks, or
needs a monitored follow-up after a fix.

## Workflow

1. Inspect PR state first: comments, reviews, mergeability, checks, branch, and
   local worktree status. Keep unrelated local changes out of the PR.
2. Use an isolated worktree for review fixes or conflict resolution when the
   main checkout is dirty, behind remote, or being used by another agent.
3. Make the smallest safe fix. Preserve the original bug invariant and any
   newer upstream structure introduced by `main`.
4. Run the narrow validation first, then the repository-required gates. For
   this repo, include `pnpm guard`; add package typechecks/builds/tests when
   touched files require them.
5. Before commit or push, run a read-only cross-review of the staged or proposed
   diff. Forbid file edits and git write or coordination commands.
6. Treat cross-review as evidence, not authority. Accept only findings grounded
   in the diff, repository rules, user goal, or validation results. Downgrade or
   reject style preferences, broad scope expansion, and suggestions that conflict
   with safety or ownership boundaries; record the reason briefly.
7. If accepted blockers remain, fix them, rerun validation, and repeat the
   review. Commit and push only after validation passes and there are no
   accepted blockers.

## Monitoring cadence

- Active review or failing checks: check often enough to unblock quickly.
- Clean or approved PR waiting for merge: check about every 12 hours.
- Merged PR: reduce to daily lightweight observation for CI, release, or
  regression signals, and stop making code changes unless asked.

## Report

Always report PR state, actions taken, cross-review verdict, accepted or
rejected findings, validation run, commits pushed, skipped checks with reasons,
remaining risks, and next step.
