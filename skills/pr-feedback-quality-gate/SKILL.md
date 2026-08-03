---
name: pr-feedback-quality-gate
description: |
  Safely track pull request feedback, resolve review comments or merge conflicts, validate fixes, and use a read-only cross-review before committing or pushing follow-up changes. Also drafts truthful, ready-to-copy replies when the user asks how to answer new or current PR feedback without authorizing mutations.
triggers:
  - "PR feedback"
  - "review comments"
  - "merge conflicts"
  - "cross-review"
  - "Claude CLI review"
  - "monitor PR"
  - "continue PR"
  - "reply to PR feedback"
  - "answer PR feedback"
  - "kontynuuj PR"
  - "odpowiedz na uwagi do PR"
od:
  mode: utility
  example_prompt: "Continue PR #6016 — inspect current feedback, classify each item, and draft truthful copy-paste replies for anything actionable. Do not post, resolve threads, push commits, or edit the PR; only read and advise."
---

# PR Feedback Quality Gate

Use this when a PR has review feedback, merge conflicts, pending checks, or
needs a monitored follow-up after a fix, and use this when the user asks how to
answer PR feedback (continue PR, reply to reviewer, kontynuuj PR, odpowiedz na
uwagi do PR) without authorizing mutations.

## Reply-advice mode (read-only)

Reply-advice mode is the default path whenever the user asks to continue a PR,
review feedback, or draft replies, AND has not separately authorized the
mutating fix workflow below. Reply-advice NEVER edits PRs, posts comments,
resolves threads, commits, pushes, or reruns checks. It only inspects and
advises. The mutating fix workflow runs only on an explicit separate request
("apply the fix", "commit", "push", "resolve the thread"); until then, stay
read-only.

### Target resolution precedence

Resolve the target PR deterministically before any inspection:

1. Explicit URL or number supplied by the user.
2. The PR open on the current git branch (`gh pr view` from the worktree).
3. A single open PR authored by the current user in the current repository.

If two or more candidates remain, list them with PR number, title, head SHA,
author, and current review decision; then STOP. Do not pick silently. Let the
user disambiguate before any inspection.

### Feedback surfaces to inspect

Read every surface that can carry actionable feedback on the resolved PR:

- PR body, current head SHA, and mergeable state.
- Issue (timeline) comments on the PR.
- Review summaries (approve / request changes / comment) and reviewer bodies.
- Inline review threads, including resolved and outdated state per thread.
- Status checks (`gh pr checks`) and mergeability (`gh pr view --json
  mergeable,mergeStateStatus`).
- Local worktree status (`git status`, `git log`) when relevant.

A surface with no items is itself an observation ("no inline review threads
present on this PR"), not a gap to skip.

### Freshness and checkpoint semantics

Compare against a prior report or conversation checkpoint when one exists in
this session. Without a checkpoint, call the result `current feedback` — never
`new feedback`. Saying `new` without a comparison baseline is a fabrication
risk; only the delta over a recorded observation is `new`.

### Classification

Classify every relevant item on every inspected surface as exactly one of:

- **action required before replying** — a request that must be addressed
  (code change, PR body update, validation, doc edit) before any truthful
  reply can claim it is done.
- **question requiring an answer** — a reviewer question that needs a
  response, with no implicit code change required.
- **acknowledgement after a completed change** — a reviewer note reacting to
  an already-completed fix; reply optionally, briefly.
- **informational / approval / automated — no reply required** — CI runs,
  Looper approvals, status updates, automation logs. These are not human
  feedback. Do not draft a substantive reply; an optional courtesy `thanks for
  the review and approval` is the maximum allowed.
- **stale, outdated, or already resolved** — threads marked resolved/outdated
  by GitHub, or items superseded by a newer change. Acknowledge their state
  once; do not relitigate.

An item may have a single classification. If two classifications apply, the
most actionable one wins (a question that is also an approval is still a
question).

### Truthful drafting rules

For every actionable item, write a ready-to-copy reply that:

- States the smallest required action and why, before any draft reply.
- Never claims a change has been made when it has not. If the user has not
  separately run the fix, the draft must say `Once X is done, the suggested
  reply is:` and present the reply as conditional, not past tense.
- Never claims new validation has run when it has not. If the user has not run
  tests, say `after you run \`pnpm X\`` rather than `I ran \`pnpm X\``.
- Mirrors the reviewer's language register and addresses the reviewer by name
  when known.
- Is concise — one short paragraph per actionable item, not a wall of text.

### Output shape

Reply-advice output, in order:

1. PR state and freshness — number, title, head SHA, review decision,
   mergeable state, last update timestamp, and the comparison baseline (or
   `no prior checkpoint — current feedback, not new`).
2. Feedback item — author, source (issue comment / review summary / inline
   thread / check), timestamp, classification.
3. Required action and why (when classification is `action required` or
   `question`).
4. Suggested reply, or explicit `no reply needed` rationale. Conditional
   language if the underlying action has not yet been performed.
5. Checks and mergeability — label unknown causes as `unknown`; do not
   invent a blocker.
6. Remaining risk and next step — the smallest action that unblocks the PR.

## Workflow (mutating, opt-in only)

This workflow runs only on an explicit mutating request from the user. It does
not run inside reply-advice mode.

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
remaining risks, and next step. In reply-advice mode, replace `actions taken`
with `actions advised` and `commits pushed` with `no mutations performed`.
