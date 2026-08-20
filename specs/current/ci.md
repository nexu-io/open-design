# CI scope confidence methodology

This is the current authority for CI scope confidence rules in
`.github/config/scopes.json`, their planner invariants, and their evidence recipes.
Workflow topology and the capability/handoff architecture stay owned by
`.github/AGENTS.md`; do not restate them here.

This document records current state only. State active rules, boundaries,
invariants, evidence, and unresolved questions directly; do not add dated or
numbered rollout stages, before/after narratives, or a history of how the
current design was reached. Git history, pull requests, and task records own
that change history.

## The model in three paragraphs

Every changed file is classified by the additive rule table in
`.github/config/scopes.json`: effects union across matched rules, confidence is the
minimum across matched rules. Each evaluation context brings a trust threshold:
PR and manual-hot runs believe `medium`, the merge queue believes only
`certain`, manual-full runs believe nothing. Renames contribute both the
current and previous filename so moving a file cannot discard the source
path's validation effects. A file below threshold — or
matching no rule — escalates fail-closed to the full radius.

The scope policy floor never moves: `preflight` is enabled in every scope plan.
Its current `"*"` hash declaration makes workspace setup, `pnpm guard`, and
i18n structure checks execute for every new tracked tree, while an identical
cached invocation may skip the whole job. Broad
app declaration builds, workspace typecheck, and `run_workspace_unit_tests`
may skip only for a merge-queue plan whose certain-tier evaluation claims zero
validation effects. PR, manual-hot, forced-full, and escalated queue plans keep
all broad workspace validation.

`.github/scripts/scopes.py` is the install-independent, Linux workflow-control entrypoint.
Its rule and matrix data lives in `.github/config/scopes.json`; it never imports
workspace code. `.github/scripts/runners.py` and `.github/scripts/hash.py` share
the same stdlib-only cold-start boundary.
`scripts/guard.ts` is a downstream repository-policy entrypoint. It runs only
after the plan exists and therefore does not authorize scope classification or
workload omission. The planner validates its own configuration and routing
contract before emitting any workload decision; repository guards remain
useful checks, but they are not part of the planner's trust chain.

## Orthogonal hash composition

The scope planner answers whether a workload is relevant to the changed-file
context. The hash register answers whether that workload's declared Git input
combination differs from the previous invocation on the branch. CI runs a
workload only when `scope_enabled && !hash_equal`; fine-grained commands inside
the workload remain a separate business-layer concern.

Declarations live in `.github/config/hash.json`. A declaration may contain Git
paths/globs, `suite://<name>` reusable path groups, `key://<workflow>/<identity>`
dependencies, or `"*"` for the entire tracked tree. Cycles, dangling references,
unsafe paths, empty matches, schema drift, and scope/hash identity drift fail at
the Linux plan entrypoint before workload dispatch. The initial contract uses
`"*"` for every identity; narrow closures require high-confidence evidence and
may be introduced independently later.

Actions cache stores only the previous identity-to-hash map. `hash.py` reads it,
computes and compares every current identity, then atomically replaces the local
state before workloads run. The plan transfers that pending map to `validate`,
which publishes it to Actions cache only after the gate succeeds. The map carries
no job-success, retry, or reliability meaning; success controls publication, not
payload. Restore, transfer, and save failures are non-fatal and therefore start
cold; invalid configuration is fatal. Only
`if: ${{ fromJSON(needs.plan.outputs.run).<identity> }}` in `ci.yml` turns the
static comparison into a skip.

The error cost is asymmetric by tier. A wrong `medium` rule under-arms a PR
run and gets caught by the merge queue's stricter threshold — cost: one queue
bounce. A wrong `certain` rule lets an invalid change reach `main` with no
automatic detection behind it. That asymmetry is why the two tiers have
different iteration rules below.

## Medium-tier requirements

Adding or refining a `medium` rule needs: the rule-table diff, updated goldens
in `e2e/tests/scripts/scopes.test.ts`, and a tonnage estimate from the replay
recipe. The queue backstops mistakes. Do not add speculative rules for
surfaces nobody touches; candidates come from measurement, not from reading
the rule table for imperfections (measured imperfection lists and
frequency-weighted tonnage lists barely intersect).

## Certain-tier requirements

`certain` is an operational planner policy, not a proof that semantic
dependencies are complete. A downstream job, including `pnpm guard`, cannot
authorize an omission already made by the plan that scheduled it.

Requirements:

1. **A conservative rule-table boundary.** Keep promoted matches explicit and
   narrow. Unknown, mixed, empty-unresolved, invalid, or below-threshold inputs
   must select the full plan.
2. **Planner-owned validation.** `python3 .github/scripts/scopes.py validate`
   must reject schema drift, unknown effects, invalid regexes, match cycles,
   malformed or duplicate matrices, and invalid UI P0 shadow references before
   any workload decision is emitted.
3. **Direct planner behavior tests.** Goldens invoke `scopes.py plan` itself for
   representative in-bound, out-of-bound, mixed, and fallback inputs. Do not
   reimplement the evaluator in another language and compare two copies.
4. **Measured operational evidence.** Replay and paired-run evidence quantify
   how often a rule applies and whether the retained plan has passed in
   practice. This evidence can justify an operational decision, but it must not
   be described as a complete dependency proof.

Independent semantic-closure guards may be evaluated later. They must sit
outside the planner's scheduling authority before their evidence can strengthen
a `certain` claim.

## Certain-exempt boundary

Rule `certain-exempt-surface`: prefixes `docs/`, `apps/landing-page/`,
`.vscode/`, `.idea/`, `.github/ISSUE_TEMPLATE/` plus exacts `LICENSE`,
`.github/CODEOWNERS`. The planner owns this classification directly; no
downstream guard is treated as proof that these files are unconsumed.

Current evidence and exceptions:

- A replay of 398 first-parent merges ending at `b99a9fdc3` produces 46
  certain, zero-effect plans (11.6%).
- Root markdown such as `README.md` remains medium because bare filename
  literals are widespread as project-fixture data and are not locally
  distinguishable from repository-root reads.

## Certain packaged-leaf boundary

Rule `certain-packaged-leaf-sources` covers only:

- `apps/desktop/{src,tests}/`
- `apps/packaged/{src,tests}/`
- `tools/pack/{src,tests,resources}/`

It claims `tools_dev_tests_required`, `tools_pack_tests_required`, and
`workspace_validation_required`. A pure matching merge group therefore keeps
preflight/typecheck, workspace unit tests, desktop/packaged/tools-pack tests,
the focused packaged launcher update-loop fallback, and Windows launcher
payload tests. It skips web workspace tests, broad E2E Vitest, UI P0, critical
Playwright, and visual Playwright.

Package manifests, build configs, bins, vendor content, and files outside the
listed core remain medium. A mixed queue group containing any medium file
still escalates to the full plan. Direct `scopes.py plan` tests pin the retained
effects and escalation behavior; they do not claim to prove every consumer.

Current evidence:

- The latest 400 first-parent merges contain 19 pure packaged-leaf groups.
- All 19 have successful narrow PR validation paired with successful full
  merge-queue validation; the active narrow plan additionally runs desktop,
  packaged, and focused update-loop coverage absent from the historical plan.
- A current full merge-group run measures about 11.8 elapsed minutes and 68
  runner-minutes. A representative pure-leaf narrow PR run measures about 4.2
  elapsed minutes and 8.1 runner-minutes.
- Expected savings are about 7.5 elapsed minutes and 60 runner-minutes per
  qualifying single-PR group, before queue batching discounts.

## Certain daemon-core boundary

Rule `certain-daemon-core` covers `apps/daemon/src/` and
`apps/daemon/tests/`, excluding `apps/daemon/src/sidecar/` and the
`daemon-runtime-definition` UI P0 shadow surface. Package manifests, build
configuration, bins, the packaged sidecar compatibility bridge, and runtime
definition source/companion tests stay medium-tier.

A pure matching merge group keeps preflight and workspace typecheck, workspace
unit coverage, broad E2E Vitest, and the complete four-domain UI P0 matrix. It
skips web workspace tests, visual Playwright, Windows launcher-payload tests,
and tools-dev/tools-pack unit coverage. The retained plan therefore continues
to exercise daemon buildability, user-level API/runtime behavior, and every
merge-gated UI P0 capability without treating web-owned rendering tests or
packaging-format tests as daemon consumers.

Direct `scopes.py plan` tests pin representative daemon-core routing and
out-of-bound escalation. General cross-app and visual-harness guards remain
repository checks, but they do not authorize the planner's daemon-core
omissions.

The authoritative cross-app critique coverage walker lives in
`e2e/tests/critique-coverage.test.ts`, which remains armed by the daemon-core
plan. The latest 400 first-parent merges contain 78 pure daemon-core groups.
Fifteen recent groups have successful narrow PR validation paired with
successful full merge-group validation. A representative full queue run spends
about 20 runner-minutes in the web, visual, and Windows jobs omitted by the
planner; UI P0 remains the critical path.

## Daemon UI P0 capability shadow

The UI P0 capability shadow is evidence-only. The applied `ui_p0_matrix`
remains the full four-domain matrix in PR and merge-queue plans; no job reads
the shadow candidate as an execution input.

The `daemon-runtime-definition` capability matches changes confined to:

- `apps/daemon/src/runtimes/defs/`;
- `capabilities.ts`, `local-profiles.ts`, `metadata.ts`, and `registry.ts`
  directly under `apps/daemon/src/runtimes/`;
- the explicit companion-test list in
  the `daemon-runtime-definition` exact list (`.github/config/scopes.json`).

Its candidate keeps `entry-settings`, `project-workspace`, and
`project-runtime`, and omits only `workspace-restoration`. The project
workspace remains included because its P0 coverage contains the local-agent
and model selector. Any empty, unresolved, mixed, unknown, or out-of-surface
change falls back to the full four-domain matrix and records the reason in
`trace.uiP0Shadow`.

Direct `scopes.py plan` tests pin the applied full matrix, candidate group set,
representative in-bound resolution, and full fallback. The shadow must
accumulate successful paired runs before it can become an execution input.

The latest-400 first-parent replay contains three matching groups. The
candidate would avoid one UI P0 worker per matching group, currently about
8.5–9.2 runner-minutes, but the shadow produces no execution savings until its
paired evidence satisfies the promotion requirements.

## Zero-effect merge-queue policy floor

A merge-queue plan that trusts every changed file at `certain` and receives no
scope effects keeps preflight setup, `pnpm guard`, and the i18n structure check,
but skips preflight's app prebuild/typecheck steps and the workspace-unit job.
The predicate is queue-only: PR/manual-hot run broad validation even when the
medium-tier plan has no effects, and forced-full or escalated queue plans run
everything.

`pnpm guard` still runs as ordinary policy-floor work when preflight is
enabled, but its result does not authorize the zero-effect plan. The planner's
classification and fail-open behavior are the operative contract.

The 398-merge replay ending at `b99a9fdc3` contains 46 qualifying queue plans
(11.6%). A sample of 12 successful merge-group runs measures broad prebuild
and typecheck at about 1.95 runner-min and workspace unit at about 1.6
runner-min. The policy floor therefore avoids roughly 3.6 runner-min and 2.1
critical-path minutes per qualifying run (~166 runner-min across the replay
window).

## Evidence recipes

Design rule: shell only fetches file lists and extracts logs; every scope
judgment goes through `.github/scripts/scopes.py plan`. Never reimplement rule
semantics in a pipeline.

Replay recent merges through the evaluator (candidate tonnage):

```bash
git log --first-parent -400 --pretty=%H origin/main | while read -r sha; do
  git diff-tree -r --name-only --no-commit-id "$sha^" "$sha" |
    python3 .github/scripts/scopes.py plan \
      --context merge-queue --files-from - |
    node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
      console.log(d.trace.escalations.length === 0 ? "PURE" : "ESCALATED")'
done | sort | uniq -c
```

Classify one change set offline (PR-side view, prints `{ plan, trace }`):

```bash
python3 .github/scripts/scopes.py plan --context pr \
  --files apps/web/src/App.tsx docs/architecture.md
```

Pull the shadow column from a real queue run (the certain-rule evidence stream
for structural/behavioral proposals; prefer job logs — do not rely on
artifacts):

```bash
gh run view <run-id> --log | sed -n '/scope decision trace:/,/^}/p'
```

Each recipe's sanity check: the replay loop must print only `PURE`/`ESCALATED`
counts; `plan` must print JSON with a `trace.threshold` matching the context.

## Evidence tooling policy

Keep these commands as recipes. Check in a script only when a certain-rule
evaluation needs evidence beyond the CI log retention window, or repeated
manual execution has produced copy errors. Evidence must justify additional
infrastructure.

## Open questions

- A demotion policy for `certain` rules when planner evidence becomes stale.
- What independent evidence source could strengthen semantic closure without
  being scheduled by the plan it is meant to assess.
- Whether medium-tier zero-effect PR plans should use the policy floor; this
  needs its own evidence and containment review.
- Queue batching discount: the 11.6% figure assumes single-PR queue groups; a
  mixed group loses the benefit file-by-file. Check real `merge_group` traces
  once a few have accumulated.
- Adjacent medium-tier gaps (each is its own small PR): `e2e/tests/**` arms no
  e2e Vitest lane (and atom-workflow edits therefore skip the topology tests
  on PR runs — the queue is currently their only pre-main execution);
  `mocks/**` is fallback-classified into Playwright lanes instead of the
  daemon tests that consume it; the dispatch-hot branch never re-derives
  workspace validation (pinned asymmetry in the goldens).
