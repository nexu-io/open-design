---
name: build-test
description: Run the project's build / typecheck / lint / test commands and emit the build.passing + tests.passing signals devloop convergence reads.
od:
  scenario: code-migration
  mode: critique
---

# Build test

Spec §20.2 / §22.4: the "subjective `critique-theater` panel" is
not enough on its own — a code-migration / tune-collab run must
prove the build still passes. This atom shells out to the
project's declared test commands and emits structured signals the
devloop's `until` evaluator reads.

## Inputs

- The active target stack (recorded in `code/index.json` +
  `plan.md`'s targetStack block).
- The user's optional override (`od plugin run --input
  testCommand='pnpm test'`).

## Default commands by framework

| framework | typecheck | test |
| --- | --- | --- |
| next | `pnpm typecheck` | `pnpm test` |
| vite | `pnpm typecheck` | `pnpm test` |
| remix | `pnpm typecheck` | `pnpm test` |
| custom | (read from `package.json.scripts`) | (read from `package.json.scripts`) |

## Output

```text
project-cwd/
└── critique/
    ├── build-test.json   # { build: 'passing' | 'failing', tests: 'passing' | 'failing' | 'skipped', durationMs, commandsRun: [...], failures: [...] }
    └── build-test.log    # raw stdout / stderr (truncated to OD_BUILD_TEST_LOG_BUDGET_BYTES, default 1 MiB)
```

The atom emits **two** signals the devloop reads:

- `build.passing: boolean` — the typecheck command exited 0.
- `tests.passing: boolean` — the test command exited 0.

Plus the legacy `critique.score` so existing pipelines that read
the score keep working: 5 when both pass, 3 when only build
passes, 1 when both fail.

## Convergence

Pipelines wire the atom into a devloop:

```jsonc
{
  "id": "verify",
  "atoms": ["patch-edit", "build-test"],
  "repeat": true,
  "until": "(build.passing && tests.passing) || iterations >= 8"
}
```

## Anti-patterns the prompt fragment forbids

- Running tests on a partially-edited working tree (the atom
  always runs after `patch-edit`, and only when `plan.steps`'s
  current step is in `completed` state).
- Suppressing test failures by changing test files; that violates
  the rewrite-plan ownership rule.
- Setting `tests: 'skipped'` without a non-empty `reason` field.

## Status

Reserved id, prompt-only fragment in v1. The shell-out wrapper +
log-truncation worker land in spec §16 Phase 7.
