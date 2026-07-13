---
name: diff-review
description: Render the patch-edit run's accumulated changes as a reviewable diff, surface it through a GenUI choice surface, and persist the user's accept / reject decision into the artifact manifest.
od:
  scenario: code-migration
  mode: review
---

# Diff review

Spec §20.3 / §21.3.2: a code-migration / tune-collab handoff is
worthless without a human-reviewable diff. This atom is the
"present the patch, capture the decision" stage.

## Inputs

- The project cwd's accumulated edits since the run started (or
  since the previous diff-review iteration).
- `plan/steps.json` for context per file.

## Output

```text
project-cwd/
└── review/
    ├── diff.patch        # unified diff (git apply-shaped)
    ├── summary.md        # human-friendly per-file walkthrough
    ├── decision.json     # { decision: 'accept' | 'reject' | 'partial', accepted_files: [...], rejected_files: [...], reviewer: 'user' | 'agent' }
    └── meta.json         # { generatedAt, atomDigest, planRevision }
```

The atom raises a `choice` GenUI surface with the three top-level
decisions (`accept` / `reject` / `partial`). On `partial` the user
flips per-file decisions through follow-up surfaces.

## Convergence

The atom completes when `decision.json` has a non-empty `decision`.
Acceptance writes `handoffKind: 'patch'` (or `'deployable-app'`
when a successful build-test is on file) into the eventual
artifact manifest; rejection rolls back the patch via `git restore`
or the equivalent in the `code-import`-bound repo path.

## Anti-patterns the prompt fragment forbids

- Skipping the surface and assuming acceptance.
- Generating a `decision.json` that lacks `accepted_files` /
  `rejected_files` on `partial` decisions.
- Rolling back files outside `plan/steps.json`'s union of
  `files[]` — the patch boundary is a contract.

## Status

Reserved id, prompt-only fragment in v1.
