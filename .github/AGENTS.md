# GitHub automation guide

This directory is still only partially standardized. Several historical workflows and helper locations do not yet follow one uniform shape. Do not copy old patterns blindly. For new work, bug fixes, and cleanup, use the `ci.yml` + `comment.atom.yml` + `autofix.atom.yml` + `report.atom.yml` + `.github/scripts/handoff.py` system as the reference topology unless a maintainer explicitly chooses a different boundary.

## Required reading

Before changing GitHub automation, read the current versions of:

- `.github/workflows/ci.yml`
- `.github/workflows/comment.atom.yml`
- `.github/workflows/autofix.atom.yml`
- `.github/workflows/report.atom.yml`
- `.github/scripts/handoff.py`
- `scripts/scopes.ts`
- `e2e/tests/packaged-smoke-workflow.test.ts`
- `scripts/approve-fork-pr-workflows.ts` and `scripts/approve-fork-pr-workflows.test.ts` when touching fork PR approval behavior

If the change affects cross-workflow behavior, update the topology tests instead of relying only on workflow YAML review.

## Architecture

GitHub automation uses two layers.

Business layer:

- Business workflows decide what happened and what should be requested next.
- `ci.yml` is the main low-privilege PR, merge-queue, and manual validation gate (application merge bar only).
- `ci.yml` should run validation, decide scopes, and produce typed handoff artifacts.
- Packaging checks are standalone and outside the merge gate: `nix.yml` (flake check) and `docker-image.yml` (image validate + publish). Do not re-attach them to `Validate workspace`.
- Business workflows should not perform trusted writes to PR comments or branches when a capability workflow can do it.

Atomic capability layer:

- Capability workflows perform reusable trusted operations from well-defined inputs.
- `comment.atom.yml` consumes `handoff-comment-*` artifacts and upserts pure text PR comments.
- `autofix.atom.yml` consumes `handoff-autofix-*` artifacts and applies same-repository patches.
- `report.atom.yml` consumes `handoff-report-*` artifacts and handles advanced comments that need trusted materialization, such as dependency install, R2 access, artifact processing, or report generation before upsert.
- `.github/scripts/handoff.py` owns artifact names, directory layout, discovery, and contract validation for `comment`, `autofix`, and `report` handoffs.

Default rule: do not add a new domain-specific follow-on workflow such as `foo.comment.atom.yml`, `foo.autofix.atom.yml`, or `foo.report.atom.yml` until the flow has been tested against these existing atomic capabilities.

## Directory conventions

- `.github/workflows/` contains GitHub Actions workflow entrypoints.
- `.github/actions/` contains reusable composite actions for workflow setup steps.
- `.github/scripts/` contains workflow-owned scripts and contracts that are not general repo developer commands.
- `.github/scripts/release/` contains release workflow implementation helpers. Keep release-only helpers there and CI handoff helpers at `.github/scripts/`.
- Root `scripts/` remains for repo-level developer checks, product scripts, and guard/test logic. Do not move workflow-only handoff glue there just to make it look more general.

New workflow-owned helpers should usually live under `.github/scripts/`. Prefer TypeScript for project-owned scripts in general, but Python is acceptable for small GitHub runner glue when stdlib portability and low setup cost matter. Keep such exceptions narrow and covered by `pnpm guard` policy.

## Handoff contract

Use `.github/scripts/handoff.py` for all CI follow-on artifact names and paths. The canonical layout is:

- `handoff/comment/<id>/metadata.json` plus `body.md`
- `handoff/autofix/<id>/metadata.json` plus `patch.diff`
- `handoff/report/<id>/metadata.json`

Artifact names must come from `handoff.py artifact-name <kind> <id>`, and download patterns must come from `handoff.py artifact-pattern <kind>`.

`metadata.json` always identifies the target PR, head SHA, base SHA, CI run id, handoff kind, and handoff id. Capability-specific fields belong in that capability's metadata and must be validated by `handoff.py`.

Do not hand-roll artifact name prefixes, alternate directory layouts, or one-off metadata parsers in workflows. Extend `handoff.py` first, then use the new contract from producers and consumers.

## Capability rules

### `comment.atom.yml`

Use `comment.atom.yml` for pure text PR comments only.

- Input is an already-final `body.md`.
- The body must contain a stable marker.
- The workflow validates PR state, draft state, head SHA, and base SHA before upsert.
- It writes the GitHub API payload through `jq -n --rawfile body ...` and `gh api --input`.
- It must not install dependencies, access R2, execute report scripts, understand Nix, understand visual diffs, or checkout PR code.

### `autofix.atom.yml`

Use `autofix.atom.yml` for same-repository patch application.

- Input is `patch.diff` plus metadata including `allowed_paths` and `commit_message`.
- Fork PRs must skip, not fail.
- Closed, draft, stale head, and stale base cases must skip, not fail.
- Apply patches only after validating the live PR state.
- Verify the resulting changed files exactly match `allowed_paths`.
- Prefer the configured bot app token for pushes so follow-up CI is triggered as expected.
- Do not use this workflow for arbitrary commands, generated scripts, or PR-head code execution.

### `report.atom.yml`

Use `report.atom.yml` for advanced comments, meaning comment bodies that are not pure text inputs.

Examples include reports that need:

- downloading and combining artifacts,
- installing dependencies,
- accessing R2 or other trusted secrets,
- rendering media or diffs,
- generating a rich markdown body from trusted base code.

`report.atom.yml` is a trusted writer and materializer. It may upsert comments directly because that is part of the advanced comment capability, but it must do so with the same file-backed payload hygiene as `comment.atom.yml`.

Rules:

- Treat all PR-produced artifacts as untrusted data.
- Do not checkout or execute PR-head code in `report.atom.yml`.
- Checkout trusted base/default code before running repository scripts.
- Validate PR state, draft state, head SHA, and base SHA before secret use and again before comment upsert when practical.
- Keep report type dispatch explicit. If multiple report types grow, add a clear handler boundary instead of burying branching in shell fragments.

## Fork PR approval

`fork-pr-workflow-approval.yml` and `scripts/approve-fork-pr-workflows.ts` are a separate security boundary. They may approve low-risk fork PR `pull_request` runs, but must not approve trusted `workflow_run` capability workflows.

Keep `.github/workflows/ci.yml` as the only approved workflow path unless a maintainer explicitly expands the allowlist. `comment.atom.yml`, `autofix.atom.yml`, `report.atom.yml`, release workflows, deployment workflows, and any workflow with trusted secrets or write permissions must stay outside fork auto-approval.

## Common iteration flow

1. Classify the change.
   - Validation or business decision: start in `ci.yml`.
   - Pure text PR comment: produce `handoff/comment` and let `comment.atom.yml` consume it.
   - Same-repo patch: produce `handoff/autofix` and let `autofix.atom.yml` consume it.
   - Rich/generated comment: produce `handoff/report` and let `report.atom.yml` materialize and upsert it.
   - New naming, paths, or metadata: update `.github/scripts/handoff.py`.
2. Update scope routing in `scripts/scopes.ts` when a workflow/script should trigger a validation lane.
3. Update topology coverage in `e2e/tests/packaged-smoke-workflow.test.ts` or the relevant script test.
4. Run the focused checks:
   - `python3 .github/scripts/handoff.py self-check`
   - `actionlint -color`
   - `pnpm --filter @open-design/e2e test tests/packaged-smoke-workflow.test.ts`
5. Run repo-level checks before handing off:
   - `pnpm guard`
   - `pnpm typecheck`

Use `git diff --check` before finishing workflow edits.

## FAQ

### Should I add a new `*.comment.atom.yml` workflow?

Usually no. If the body is already final markdown, produce `handoff/comment` and use `comment.atom.yml`. If the body must be generated from artifacts, secrets, or report code, produce `handoff/report` and use `report.atom.yml`.

### Why not put rich visual report generation in `comment.atom.yml`?

Because `comment.atom.yml` is the pure text comment shell. Installing dependencies, using R2 secrets, downloading screenshots, and generating diffs are advanced comment materialization, which belongs in `report.atom.yml`.

### Why can `report.atom.yml` upsert comments directly?

`report.atom.yml` is not a pure producer. It is the auditable advanced comment capability: materialize a non-pure text comment and publish it. The key boundary is that this power is explicit in one workflow with trusted inputs, stale checks, and file-backed payload hygiene.

### Why does `autofix.atom.yml` skip fork PRs?

Fork PR branches are not writable by the base repository in the same trust model, and pushing generated changes to forks would require a different permission and ownership design. Skip fork PRs and use comments or report output for contributor guidance.

### Can trusted `workflow_run` workflows checkout PR code?

No, not by default. They may download PR artifacts as data, but must not execute PR-provided code or scripts. Checkout trusted base/default code before running repository scripts.

### Why centralize handoff names in `handoff.py`?

GitHub artifact behavior is easy to drift: artifact names must be unique per upload, and consumers need stable patterns. Centralizing names, paths, and validation keeps producers and consumers aligned and makes topology tests meaningful.

### Where should tests live?

Cross-workflow topology tests belong in `e2e/tests/` when they observe repository-level behavior. Script-specific behavior can stay next to the script's existing tests. Do not add one-off `*.test.ts` files just because a workflow helper exists; prefer existing topology coverage and helper self-checks when that is enough.
