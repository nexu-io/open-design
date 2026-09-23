# GitHub automation guide

This directory is still only partially standardized. Several historical workflows and helper locations do not yet follow one uniform shape. Do not copy old patterns blindly. For new work, bug fixes, and cleanup, use the `ci.yml` + `comment.atom.yml` + `autofix.atom.yml` + `report.atom.yml` + `.github/scripts/handoff.py` system as the reference topology unless a maintainer explicitly chooses a different boundary.

## Required reading

Before changing GitHub automation, read the current versions of:

- `.github/workflows/ci.yml`
- `.github/workflows/comment.atom.yml`
- `.github/workflows/autofix.atom.yml`
- `.github/workflows/report.atom.yml`
- `.github/scripts/handoff.py`
- `.github/config/runners.json`, `.github/config/scopes.json`, and `.github/config/convergence.json`
- `.github/scripts/runners.py`, `.github/scripts/scopes.py`, and `.github/scripts/convergence.py`
- `.github/workflows/convergence.atom.yml` and `.github/scripts/lib/r2.py` when changing reusable workload results
- `specs/current/ci.md` when changing scope rules, confidence tiers, or planner invariants
- `e2e/tests/packaged-smoke-workflow.test.ts`
- `scripts/approve-fork-pr-workflows.ts` and `e2e/tests/scripts/approve-fork-pr-workflows.test.ts` when touching fork PR approval behavior

If the change affects cross-workflow behavior, update the topology tests instead of relying only on workflow YAML review.

## Architecture

GitHub automation uses two layers.

Business layer:

- Business workflows decide what happened and what should be requested next.
- `ci.yml` is the main low-privilege PR, merge-queue, and manual validation gate (application merge bar only).
- `ci.yml` should resolve runners, compose scope and convergence decisions in its Linux `plan` job, run validation, and produce typed handoff artifacts.
- Docker image checks are standalone and outside the merge gate. Do not re-attach `docker-image.yml` to `Validate workspace`.
- Business workflows should not perform trusted writes to PR comments or branches when a capability workflow can do it.

Atomic capability layer:

- Capability workflows perform reusable trusted operations from well-defined inputs.
- `comment.atom.yml` consumes `handoff-comment-*` artifacts and upserts pure text PR comments.
- `autofix.atom.yml` consumes `handoff-autofix-*` artifacts and applies same-repository patches.
- `report.atom.yml` consumes `handoff-report-*` artifacts and handles advanced comments that need trusted materialization, such as dependency install, R2 access, artifact processing, or report generation before upsert.
- `rerun.atom.yml` watches completed `ci` runs and requests one `gh run rerun --failed` when leaf jobs died to runner/spot cancel. Decision logic lives in `.github/scripts/rerun_infra_cancel.py`; it must not rerun ordinary assertion failures or stale heads.
- `convergence.atom.yml` consumes successful `handoff-convergence-*` artifacts for low-privilege CI. Authorized release jobs use `.github/actions/convergence` to invoke the same handoff/admit/publish commands with local execution evidence and products.
- `.github/scripts/handoff.py` owns artifact names, directory layout, discovery, and contract validation for `comment`, `autofix`, `report`, and `convergence` handoffs.

Default rule: do not add a new domain-specific follow-on workflow such as `foo.comment.atom.yml`, `foo.autofix.atom.yml`, or `foo.report.atom.yml` until the flow has been tested against these existing atomic capabilities.

## Directory conventions

- `.github/workflows/` contains GitHub Actions workflow entrypoints.
- `.github/actions/` contains reusable composite actions for workflow setup steps.
- `.github/scripts/` contains workflow-owned scripts and contracts that are not general repo developer commands.
- `.github/templates/` contains non-executable `.md` and `.txt` delivery templates rendered by
  `.github/scripts/template.py`. Keep shell, expressions, conditionals, and structured JSON out of
  these templates; workflow or domain scripts must calculate every explicit parameter.
- `.github/scripts/feishu.py` owns release notices, download cards, progressive cards, and fallback decisions. Its stdlib-only Python helpers under `lib/` consume workflow/publication observations; they must not import product tools, require npm installation, or authorize publication. Keep the application bot and fallback webhook credentials independent.
- `.github/scripts/release/` contains release workflow implementation helpers. Keep release-only helpers there and CI handoff helpers at `.github/scripts/`.
- Root `scripts/` remains for repo-level developer checks, product scripts, and guard/test logic. Do not move workflow-only handoff glue there just to make it look more general.

New workflow-owned helpers should usually live under `.github/scripts/`. Prefer TypeScript for project-owned scripts in general, but Python is acceptable for small GitHub runner glue when stdlib portability and low setup cost matter. Keep such exceptions narrow and covered by `pnpm guard` policy.

The planning control plane is deliberately Linux-only and stdlib-only. Runner classes,
scope rules, and workload convergence declarations live in `.github/config/`; their Python
entrypoints initialize metadata before workload runners start. A Windows job
must never invoke their planning commands. The stdlib-only `convergence.py resolve-references`
command is a cross-platform exception: it only validates received keys and assembles
runner-local URLs, without Git access, identity calculation or cache decisions.
Trusted release publication commands may also run on native runners: admission
verifies the existing source snapshot through the same Python identity function;
it does not make new scheduling or restore decisions. Product tools never calculate Plan identities.
Keep runner placement, changed-file relevance,
reusable-result convergence, and fine-grained commands inside a workload independent.

`convergence.py` computes workload identities from declared Git inputs, the
execution class, product mode, policy, and `schema.version`. Changes to hashing
or declaration interpretation require a schema version bump. The control file
set remains a trusted-writer admission boundary, not an implicit global cache
input; execution-affecting configuration must be declared by workloads. Public
result reads are credential-free. Only confirmed missing receipts select execution;
enumerated transient transport failures retry once, then fail visibly. Invalid
receipts and missing products behind a receipt must not trigger rebuilding. The convergence
handoff contains only workloads whose declared jobs and execution steps succeeded
in the producing attempt, even when an unrelated gate failed. Only trusted
`convergence.atom.yml` code or explicitly authorized release runners may publish immutable results. `lib/r2.py` knows R2
transport only and must not interpret workload policy or handoff schemas.

Workloads prepared through workflow postinstall may declare `postinstallIntent`.
The shared stdlib Python resolver projects that intent and the selected Git tree
into one canonical Plan; the Plan digest, rather than the setup action's file
identity, enters the workload identity. The Plan describes delivered workspace
state only. Job IDs, concurrency, cache hits, cache formats, compression,
storage, retries and timing are execution policy and must stay outside its
digest. `postinstall.py` and `convergence.py` must use the same resolver, and
receipts must bind the executed or restored closure to the canonical Plan.
Change the Plan schema version when serialized fields acquire new delivery
meaning that the serialized target state does not otherwise express.

Manual CI may select existing workload IDs through `workloads`; the resulting
check is explicitly selected validation, never a complete merge gate. Workload
declarations stay in `convergence.json`, scheduling stays in `ci.yml`, and the
validation job collects per-workload success without softening its gate. The
trusted writer independently checks the attempt's job/step evidence and source
tree and recalculates identities. Do not create stage-named
workflow/config files for validation. The callable path in
`convergence.atom.yml` publishes selected CI results only for a manual run on
the repository default branch. PR and merge-queue runs retain the separate
trusted `workflow_run` admission path.

Product workloads may declare `batches` in their existing workflow configuration.
Each entry binds one workload, a business execution request, and a product name.
Python projects build/restore requests and verified artifact references; native
executors do not parse pending Plan state or construct workload identities.
Requests affect identity, while batch names and transport artifact names do not.
Cross-job projections carry product keys and SHA-256, never the configured public
origin or full URLs. Consumers resolve addresses into `GITHUB_ENV` before expensive
setup; keep existing secret configuration unchanged. Cold consumers require the
publisher's complete references, while hot consumers use the frozen Plan; missing
publication output must not fall back to an incomplete cold Plan.
One platform may retain multiple independently successful products in one artifact.
The collector and trusted writer both check each workload's build and retention
steps and its declared artifact subdirectory; only those selected products enter
the immutable cache. Do not equate batch success with every member's success or
introduce a composite action per cache identity. Source producers prepare
dependencies through `setup-workspace`; package-manager stores and other
machine-level downloads remain Actions-cache concerns. A native consumer must not
repeat that workspace preparation merely to obtain source-derived packaging code.
Model the platform/architecture executor as its own Plan product, restore it before
business products, and invoke its declared pack/release entries against the
checked-out source tree. The executor contains the exact Node tools, Electron
runtime, platform binaries and built tool closure required by that host; it contains
no signing material and no version-bound product state. A failed or invalid
executor restore fails visibly and never falls back to an undeclared build.
Platform migrations may land independently, but a migrated consumer must remove
its default `cache-tools` workspace setup. Full diagnostic smoke modes may still
prepare their separate test harness explicitly.

Release graphs separate delivery, source validation, and reusable-result publication.
Beta and prerelease declare their input suites and execution rows in
`.github/config/convergence/release-beta.json` and
`.github/config/convergence/release-prerelease.json`. Python projects per-workload test
matrices; runner labels for reusable test rows come from their
workload execution classes. Each row's command, preparation and parameters enter
that workload's identity. Matrix grouping does not merge workload identities;
all declared shard job names must be covered by the matching success proof.
Do not add aggregate hot-run switches or new actions just to narrow cache inputs.
Keep publication-only edits outside daemon/UI test inputs; repository topology
tests and repository-wide validation may intentionally retain broader inputs.
Native outputs are platform-named and emitted only by the owning platform job.
Unpublished beta builds may retain GitHub artifacts but have no alternate R2 upload
or receipt protocol. CDN installation validation requires published version metadata.
Keep platform workload/cache/Electron chains and independent test/cache chains
directly in the owning `release-beta.yml` or `release-prerelease.yml`, without
additional wrapper workflows. A cold
platform product must publish through the shared Python commands before its
Electron consumer runs. Hot workloads skip build/publication, not Electron,
when a platform is enabled. With `publish=false` and all platform inputs off,
beta runs Plan-selected tests without requesting a native product; existing
`publish=false` builds with enabled platforms remain unchanged. Consumers use
frozen Plan references. Each test workload publishes only
after its complete declared shard set succeeds, independently of other tests.
Distribution may publish while tests run; downloaded-artifact validation joins
the test and publication branches without making tests a CDN gate. Prerelease and
stable have no Linux input, workload, output, metadata, or smoke row; preview keeps
its optional Linux policy independently. Beta, prerelease, and stable prepare
metadata and Plan in one root job, reusing the source checkout unless
the workflow control SHA differs. Release build and single-job test results publish
in place through the thin convergence action; product directories go directly to
the same normalizer/publisher used by transported CI artifacts. Local assertions
are accepted only for an explicitly authorized release checkout and an explicit
steps success boundary, using step outcomes rather than continue-on-error conclusions.
The current run/attempt/commit/runner evidence is still checked against GitHub.
Multi-job workloads retain their all-shard join; no one shard can publish group success.
CI keeps its separate trusted writer and does not accept local release assertions.
Test cache publication does not gate beta publication. Stable consumes only explicitly
shared prerelease recipes, retains its promotion and quality gates, and always rebuilds
the stable-specific signed distribution layer. Its `publish` input defaults to false,
which runs the complete prepublish path without public side effects. Prefer shallow checkouts; when beta needs
the stable version floor, tools-release reads remote tag names explicitly instead
of assuming a shallow checkout contains every tag or downloading full history.

## Handoff contract

Use `.github/scripts/handoff.py` for all CI follow-on artifact names and paths. The canonical layout is:

- `handoff/comment/<id>/metadata.json` plus `body.md`
- `handoff/autofix/<id>/metadata.json` plus `patch.diff`
- `handoff/report/<id>/metadata.json`
- `handoff/convergence/<id>/metadata.json` plus `candidate.json`

Artifact names must come from `handoff.py artifact-name <kind> <id>`, and download patterns must come from `handoff.py artifact-pattern <kind>`.

PR-targeting handoffs identify the target PR, head SHA, base SHA, CI run id, kind, and id. Convergence handoffs instead bind repository, workflow policy, event, run attempt, source SHAs, and the candidate. Capability-specific fields must be validated by `handoff.py`.

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
2. Update scope routing in `.github/config/scopes.json`, then run `python3 .github/scripts/scopes.py validate`.
3. Declare workload input closure, execution class, product contract, and explicit reuse opt-in in `.github/config/convergence.json`; use `"*"` until a narrower set has high-confidence evidence.
4. Update topology coverage in `e2e/tests/packaged-smoke-workflow.test.ts` or the relevant script test.
5. Run the focused checks:
   - `python3 .github/scripts/handoff.py self-check`
   - `actionlint -color`
   - `pnpm --filter @open-design/e2e test tests/packaged-smoke-workflow.test.ts`
6. Run repo-level checks before handing off:
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

Cross-workflow topology tests belong in `e2e/tests/` when they observe repository-level behavior. Root `scripts/` is test-free (enforced by `pnpm guard`); script behavior-contract coverage lives in `e2e/tests/scripts/`. Do not add one-off `*.test.ts` files just because a workflow helper exists; prefer existing topology coverage and helper self-checks when that is enough.
