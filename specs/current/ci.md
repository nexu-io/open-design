# CI scope confidence methodology

This is the current authority for CI scope confidence rules in
`scripts/scopes.ts`, their guard requirements, and their evidence recipes.
Workflow topology and the capability/handoff architecture stay owned by
`.github/AGENTS.md`; do not restate them here.

This document records current state only. State active rules, boundaries,
invariants, evidence, and unresolved questions directly; do not add dated or
numbered rollout stages, before/after narratives, or a history of how the
current design was reached. Git history, pull requests, and task records own
that change history.

## The model in three paragraphs

Every changed file is classified by the additive rule table in
`scripts/scopes.ts`: effects union across matched rules, confidence is the
minimum across matched rules. Each evaluation context brings a trust threshold:
PR and manual-hot runs believe `medium`, the merge queue believes only
`certain`, manual-full runs believe nothing. A file below threshold — or
matching no rule — escalates fail-closed to the full radius.

The policy floor never moves: `run_preflight` is true in every plan, and its
workspace setup, `pnpm guard`, and i18n structure check always execute. Broad
app declaration builds, workspace typecheck, and `run_workspace_unit_tests`
may skip only for a merge-queue plan whose certain-tier evaluation claims zero
validation effects. PR, manual-hot, forced-full, and escalated queue plans keep
all broad workspace validation.

`scripts/scopes.ts` remains an install-independent preinstall entrypoint.
`scripts/guard.ts` is the postinstall policy-floor entrypoint and composes its
shared mechanism and scope contracts from `scripts/lib/guard/`. The
`scripts library architecture` guard keeps those layers acyclic, prevents
scope startup from reaching guard or third-party dependencies, and keeps CLI
process control out of the library closure.

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

A PR that makes a rule `certain` must be statable in three sentences: which
rule, what guard, how much tonnage. Anything that cannot fit that statement is
riding along and must be split out.

Requirements:

1. **A defensible core.** Promote the subset of the surface whose boundary
   invariant is local and checkable. Split the rule if needed. Example: the
   global `*.md` regex is permanently medium because its safety depends on
   *other* rules covering every runtime-markdown directory — a cross-rule
   invariant no local guard can keep.
2. **A guard that resolves.** The rule's `guard` field must name a live
   `scripts/guard.ts` check (`pnpm --silent guard --list-checks` is the
   registry; the rule-table invariant test enforces resolution). Guards for
   certain rules must run in the policy floor — `pnpm guard` in preflight
   qualifies — so the check that justifies skipping always itself runs.
3. **Evidence proportional to the guard's strength.** Guard invariants come in
   three strengths: *definitional* (the surface cannot enter build or runtime
   by construction — e.g. docs), *structural* (an import-graph boundary), and
   *behavioral* (a topology test). Definitional rules may rely on replay
   evidence alone. Structural and behavioral rules additionally require at
   least 10 qualifying single-PR queue groups from the latest 400 first-parent
   merges. Native `ifTrustAll` traces are preferred; paired evidence also
   qualifies when the PR ran the candidate medium plan for the same file set,
   the real queue group ran the full plan, both succeeded, and the proposed
   plan has not weakened since that pair.
4. **Goldens updated, divergence pinned.** The golden that changes is the
   proof of the behavior change; the goldens that do not change are the proof
   of its containment.
5. **Exceptions bind to checkable preconditions.** Every guard allowlist entry
   is a claim, and claims split by what justifies them. A *local, definitional*
   fact ("this string is passed as data to a pure function, never opened") may
   stay prose — it can only be falsified by editing the allowlisted file
   itself, which puts the entry in front of a reviewer. A *remote, mutable*
   fact ("that lane doesn't run this file", "that workflow is outside the
   gate") must not be trusted as prose: the guard verifies the fact and drops
   the exception the moment it stops holding, so the failure mode is a loud
   guard report at the change that broke the premise — not a rationale that
   rotted silently years earlier. Worked example: the consumption guard
   tolerates `apps/daemon/tests/runtimes/trae-cli.test.ts` reading
   `docs/agent-adapters.md` only while `ci.yml`'s daemon lane still runs
   nothing but `project-watchers.test.ts` — the exception is conditional on
   that exclusive invocation check (`workflowRunsOnlyAllowedDaemonTest` in
   `scripts/check-certain-exempt-consumption.ts`); widening the lane revives
   the violation and forces reclassification.

No general demotion policy is defined. One hard rule is active: if a guard
check is deleted or renamed, the rule-table invariant test fails CI — a
certain rule can never silently outlive its guard. Rule five is the same
principle one level down: an exception can never silently outlive its premise.

## Certain-exempt boundary

Rule `certain-exempt-surface`: prefixes `docs/`, `apps/landing-page/`,
`.vscode/`, `.idea/`, `.github/ISSUE_TEMPLATE/` plus exacts `LICENSE`,
`.github/CODEOWNERS`. Guard: `certain-exempt surface consumption`
(`scripts/check-certain-exempt-consumption.ts`) — no skippable-lane source may
reference a certain-exempt path; policy-floor code (root `scripts/`) is exempt
from the scan because preflight always runs and may validate docs content
(product neutrality does).

Current evidence and exceptions:

- A replay of 398 first-parent merges ending at `b99a9fdc3` produces 46
  certain, zero-effect plans (11.6%).
- Root markdown such as `README.md` remains medium because bare filename
  literals are widespread as project-fixture data and are not locally
  distinguishable from repository-root reads.
- Allowlisted true consumer:
  `tools/release/src/release-note/prepare.ts` reads `docs/CHANGELOG`, which
  executes only in release workflows; `@open-design/tools-release` tests run
  in no `ci.yml` lane.

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

Guard: `packaged leaf boundary`
(`scripts/check-packaged-leaf-boundary.ts`). The policy-floor check scans
skippable-lane source for package imports and repository paths entering the
certain core, verifies that every core sample resolves to exactly the guarded
effects at the certain threshold, and pins the workspace-unit command block.
Allowed consumers are limited to:

- `tools/dev/`, whose tests stay armed by the certain rule;
- the focused packaged launcher update-loop test;
- scope, workflow, cross-app, fork-approval, and package-manager invocation
  fixtures that treat the paths as data;
- the packaged and tools-pack esbuild entry configs, which own their source
  entrypoints while config changes themselves remain medium-tier.

Package manifests, build configs, bins, vendor content, and files outside the
listed core remain medium. A mixed queue group containing any medium file
still escalates to the full plan.

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

Guard: `daemon core boundary` (`scripts/lib/guard/scope.ts`). The policy-floor
check verifies that:

- representative source, markdown, and test files resolve only to the certain
  daemon rule and its exact guarded effects;
- the daemon sidecar subtree, runtime-definition shadow, and daemon package
  manifest still escalate;
- the workflow continues to execute E2E Vitest and the full UI P0 matrix;
- web code cannot import another app's private implementation, and web tests
  do not read the daemon tree through filesystem APIs;
- the visual harness intercepts every daemon-owned route family; explicit
  visual fixtures win and every remaining request terminates with a
  deterministic browser-side 404.

The authoritative cross-app critique coverage walker lives in
`e2e/tests/critique-coverage.test.ts`, which remains armed by the daemon-core
plan. The latest 400 first-parent merges contain 78 pure daemon-core groups.
Fifteen recent groups have successful narrow PR validation paired with
successful full merge-group validation. A representative full queue run spends
about 20 runner-minutes in the web, visual, and Windows jobs omitted by the
guarded plan; UI P0 remains the critical path.

## Daemon UI P0 capability shadow

The UI P0 capability shadow is evidence-only. The applied `ui_p0_matrix`
remains the full four-domain matrix in PR and merge-queue plans; no job reads
the shadow candidate as an execution input.

The `daemon-runtime-definition` capability matches changes confined to:

- `apps/daemon/src/runtimes/defs/`;
- `capabilities.ts`, `local-profiles.ts`, `metadata.ts`, and `registry.ts`
  directly under `apps/daemon/src/runtimes/`;
- the explicit companion-test list in
  `DAEMON_RUNTIME_DEFINITION_EXACT` (`scripts/scopes.ts`).

Its candidate keeps `entry-settings`, `project-workspace`, and
`project-runtime`, and omits only `workspace-restoration`. The project
workspace remains included because its P0 coverage contains the local-agent
and model selector. Any empty, unresolved, mixed, unknown, or out-of-surface
change falls back to the full four-domain matrix and records the reason in
`trace.uiP0Shadow`.

Guard: `UI P0 shadow contract` (`scripts/lib/guard/scope.ts`). It pins the
applied full matrix, the candidate group set, representative in-bound
resolution, and full fallback for shared daemon, runtime-composition, web, and
unresolved inputs. The shadow must accumulate successful paired runs before it
can become an execution input under the certain-tier requirements.

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

The certain-exempt consumption guard executes in preflight, and `pnpm guard`
sees every changed path (including a misleading executable such as
`docs/example.js`). The workspace-unit job does not own landing-page
validation, and the broad workspace typecheck excludes
`@open-design/landing-page`.

The 398-merge replay ending at `b99a9fdc3` contains 46 qualifying queue plans
(11.6%). A sample of 12 successful merge-group runs measures broad prebuild
and typecheck at about 1.95 runner-min and workspace unit at about 1.6
runner-min. The policy floor therefore avoids roughly 3.6 runner-min and 2.1
critical-path minutes per qualifying run (~166 runner-min across the replay
window).

## Evidence recipes

Design rule: shell only fetches file lists and extracts logs; every scope
judgment goes through `scripts/scopes.ts plan`. Never reimplement rule
semantics in a pipeline.

Replay recent merges through the evaluator (candidate tonnage):

```bash
git log --first-parent -400 --pretty=%H origin/main | while read -r sha; do
  git diff-tree -r --name-only --no-commit-id "$sha^" "$sha" |
    node --experimental-strip-types scripts/scopes.ts plan \
      --context merge-queue --files-from - |
    node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
      console.log(d.trace.escalations.length === 0 ? "PURE" : "ESCALATED")'
done | sort | uniq -c
```

Classify one change set offline (PR-side view, prints `{ plan, trace }`):

```bash
node --experimental-strip-types scripts/scopes.ts plan --context pr \
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

- Demotion policy beyond the guard-resolution hard rule.
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
