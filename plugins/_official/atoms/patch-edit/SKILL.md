---
name: patch-edit
description: Apply one rewrite-plan step at a time as small reviewable file edits, never rewriting whole files when a localised change suffices.
od:
  scenario: code-migration
  mode: edit
---

# Patch edit

Spec §20.3 / §21.3.2: code-migration / tune-collab cannot ship a
trustworthy diff when the agent rewrites whole files in one pass —
the reviewer can't audit the change. This atom enforces "one step
per turn, smallest possible localised edit".

## Inputs

- `plan/steps.json` from `rewrite-plan`.
- The current value of `iterations` (the daemon's per-stage counter).
- `code/index.json` for the file's known imports + neighbours.

## Output

The atom mutates files inside the project cwd via the `file-edit` tool.
After every iteration, it writes a per-step receipt:

```text
project-cwd/
└── plan/
    ├── steps.json (status updated: 'pending' → 'completed' | 'skipped')
    └── receipts/
        └── step-<id>.json    # { files: ['...'], diffSummary, rationale, completedAt }
```

## Convergence

The atom completes when every step in `plan/steps.json` is in a
terminal state (`completed` / `skipped`) OR `iterations >=
OD_MAX_DEVLOOP_ITERATIONS`. Use:

```jsonc
{
  "id": "patch-edit-loop",
  "atoms": ["patch-edit"],
  "repeat": true,
  "until": "plan.steps.terminal === plan.steps.total || iterations >= 8"
}
```

## Anti-patterns the prompt fragment forbids

- Rewriting an entire file when the rewrite-plan step is localised.
- Touching a file outside the step's `files[]`.
- Touching a `shell`-tier file when the step's `risk` is not
  `'high'` or the user hasn't confirmed.
- Skipping a step without a receipt + a rationale string.

## Status

Reserved id, prompt-only fragment in v1.
