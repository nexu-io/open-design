# CI orchestration evolution

This document is the current authority for how this repository evolves CI
scope policy, how `.github/config/scopes.json` and
`.github/scripts/scopes.py` make workload decisions, and how those decisions
are evaluated. Workflow ownership and local editing instructions remain in
`.github/AGENTS.md`; this document describes the design contract rather than
restating workflow implementation line by line.

The document has four kinds of content:

- **Method** describes how to choose and evaluate an orchestration change.
- **Paradigm** gives reusable models for reasoning about CI responsibilities.
- **Current contract** records behavior that the implementation must preserve.
- **Reference** shows how the method and paradigms are applied today.

Methods and paradigms are intended to guide incremental convergence. They do
not require unrelated work to repay existing CI declaration debt. Current
contracts use normative language because changing them changes runtime safety.
References are replaceable examples, not precedent that every future slice
must copy. Git history, pull requests, and task records own change history; this
document records the design that is useful now.

## Iteration method

CI optimization starts from a scheduling problem, not from a desire to make the
rule table look complete. A useful iteration follows this sequence:

1. **Find a confused declaration point.** Look for one scope effect that arms
   unrelated tests, one test file that mixes independently schedulable
   responsibilities, a job that interprets paths after planning, or a workload
   whose cost and validation meaning do not align.
2. **Choose a measured vertical slice.** Prefer a boundary with stable semantic
   ownership, an independently executable test set, meaningful change
   frequency or omitted cost, limited cross-boundary fanout, and a simple
   conservative fallback. Critical-path time, runner-minutes, queue/startup
   cost, and maintenance clarity are useful but distinct benefits.
3. **Decompose only as far as execution needs.** Name the source unit and test
   set needed for this slice. Split source or tests only when the resulting set
   can be scheduled and validated independently. If the route needs a long list
   of scattered files, first ask whether the source tree is hiding the real
   responsibility boundary. Avoid per-file taxonomies and repository-wide
   cleanup campaigns.
4. **Add the narrowest useful route.** Map the source unit to a validation
   effect, the effect to one test set, and the test set to an execution
   workload. Preserve broad handling for manifests, lockfiles, mixed changes,
   and uncertain dependency edges.
5. **Challenge the omission.** Exercise representative in-bound, out-of-bound,
   mixed, unknown, renamed, and forced-full inputs through the real planner.
   Replay recent changes to estimate tonnage and compare the retained coverage
   with the cost being omitted.
6. **Promote and observe.** Activate omission only when its fallback and direct
   planner contracts are explicit. Keep the route small enough to demote or
   revise when dependency shape, test ownership, or measured value changes.

This is a recommended discovery and decomposition method. Once a route actively
omits pre-main validation, the safety requirements in the current contract are
not optional.

## Orchestration paradigms

### Source units, test sets, and workloads

The preferred directional model is:

```text
changed paths -> source units -> validation effects -> test sets -> workloads
                                                               -> convergence
```

A **source unit** is a named, composable ownership or dependency boundary. A
**validation effect** states what responsibility became relevant; it should not
merely repeat the name of a directory. A **test set** is one authoritative,
independently executable collection of checks. A **workload** supplies the
runner, environment, matrix, and command that execute that set.

These layers may remain coarse where finer scheduling has no measured value.
When a high-cost or platform-specific workload validates only part of a broad
package, an independent effect and test set are preferred over treating every
package change as platform relevant.

### Mapping shape is architecture feedback

Plan is deliberately a weak architecture constraint. It does not prescribe
source layout, reject existing mixed directories, or require unrelated changes
to repay historical debt. It does make the cost of an unclear boundary visible
when an optimization tries to name that boundary.

A stable responsibility usually produces a short composition of directory
prefixes and a few genuine entrypoints. A growing exact-file list, repeated
negative exclusions, or a hand-maintained transitive closure is a signal that
the source or test hierarchy does not express the responsibility being
scheduled. The mapping is then diagnosing architecture debt; adding more
planner precision does not resolve it.

An iteration encountering that signal has three honest choices:

1. Refactor the local source or test hierarchy until the responsibility has a
   stable boundary.
2. Accept a broader route and its execution cost.
3. Defer active omission while retaining full fallback.

Do not create a fourth choice by using a fragile enumeration to manufacture
`certain` confidence. This feedback remains local to the slice under active CI
optimization, so it can guide gradual improvement without turning plan into a
repository-wide architecture gate.

### One-way planning authority

The plan is the only component allowed to authorize omission. Executors consume
the plan and fail hard when an enabled workload cannot run; they do not infer
changed-path policy. Aggregation checks the results that the plan required; it
does not reconstruct scope rules. Repository guards can validate ordinary
policy and detect declaration drift, but a downstream guard cannot prove an
omission already made by the planner that scheduled it.

Unknown, unresolved, mixed, or below-threshold inputs move toward broader
coverage. They never gain trust from the absence of a matching rule. This
directionality is the central fail-closed property of active omission.

### Relevance and freshness are orthogonal

Scope answers whether a workload is relevant to the changed-file context. Hash
state answers whether that workload's declared Git inputs differ from the last
successful invocation on the branch. The execution predicate is:

```text
scope_enabled && !hash_equal
```

Neither mechanism may infer the other's semantics. Fine-grained commands inside
a workload remain a separate business-layer concern.

### Fan-out, convergence, and policy

Planning should complete before workloads fan out. Independent policy checks
should run alongside workloads when they do not authorize coverage. A single
plan-derived convergence point should decide whether every required result is
acceptable and publish success-dependent state. Telemetry follows convergence
and observes the result; it does not alter it.

This separation keeps policy failure visible without shortening the validation
coverage of a blocked change, and lets later source-to-test routes remain local
planner changes rather than workflow rewrites.

### Evidence is operational, not semantic proof

Planner replay, paired narrow/full runs, and job timing can justify an
operational omission. They cannot prove that every semantic dependency is
complete. Evidence should answer:

- How often does the candidate route apply?
- Which workload time and runner-minutes would it omit?
- What retained test sets cover the affected responsibility?
- Which inputs deliberately fall back to the full plan?
- Can the decision be observed and reversed cheaply?

## Current runtime contract

### Planner ownership and evaluation

Every changed file is evaluated by the additive rule table in
`.github/config/scopes.json`: effects union across matching rules, and
confidence is the minimum across those rules. Renames contribute both current
and previous paths so moving a file cannot discard the source path's validation
effects.

Each context has a trust threshold:

- PR and manual-hot plans trust `medium` and `certain` rules.
- Merge-queue plans trust only `certain` rules.
- Forced-full plans omit no workload based on scope confidence.

A file below the active threshold, a file matching no rule, or an unresolved or
empty queue change set selects the full radius. Invalid configuration or
arguments fail before workload dispatch.

`.github/scripts/scopes.py` is the install-independent Linux control-plane
entrypoint. Rule and matrix data lives in `.github/config/scopes.json`; the
planner never imports workspace code. `.github/scripts/runners.py` and
`.github/scripts/hash.py` share the same stdlib-only cold-start boundary. The
planner validates configuration and routing before emitting a workload
decision.

`scripts/guard.ts` is a downstream repository-policy entrypoint. It runs only
after a plan exists and therefore has no scope-classification or omission
authority.

### Policy floor and broad validation

`preflight` is enabled in every scope plan. Its current `"*"` hash declaration
makes workspace setup, `pnpm guard`, and i18n structure checks execute for every
new tracked tree, while an identical cached invocation may skip the whole job.

Broad app declaration builds, workspace typecheck, and
`run_workspace_unit_tests` may skip only for a merge-queue plan whose
certain-tier evaluation claims zero validation effects. PR, manual-hot,
forced-full, and escalated queue plans retain broad workspace validation.

### Confidence tiers

The error cost is asymmetric. A wrong `medium` rule can under-arm a PR and be
backstopped by the merge queue's stricter threshold, at the cost of a queue
bounce. A wrong `certain` rule can let an invalid change reach `main` without
automatic detection behind it.

A `medium` rule refinement requires a rule-table diff, direct planner goldens,
and a tonnage estimate from the replay recipe. Candidates should come from
measured value rather than speculative attempts to make the rule table look
complete.

An active `certain` omission requires:

1. **A conservative rule-table boundary.** Promoted matches stay explicit and
   narrow. Unknown or mixed changes, empty, unresolved, or invalid change
   resolution, and below-threshold inputs select the full plan. An enumerated
   dependency closure may be promoted only when unmapped sibling changes fall
   back to broader coverage; a broad `certain` parent must not silently absorb
   future dependencies outside the enumeration.
2. **Planner-owned validation.** `scopes.py validate` rejects schema drift,
   unknown effects, invalid regexes, match cycles, malformed or duplicate
   matrices, and invalid UI P0 shadow references before dispatch.
3. **Direct planner behavior tests.** Goldens invoke `scopes.py plan` for
   representative positive, negative, mixed, and fallback inputs. They do not
   reimplement the evaluator in another language.
4. **Measured operational evidence.** Replay and paired-run evidence quantify
   applicability, retained coverage, and observed cost. It is not described as
   a complete dependency proof.

Independent semantic-closure checks may be evaluated later. They must remain
outside the planner's scheduling authority before their evidence can strengthen
a `certain` decision.

### Hash composition and publication

Hash declarations live in `.github/config/hash.json`. A declaration may contain
Git paths/globs, `suite://<name>` reusable path groups,
`key://<workflow>/<identity>` dependencies, or `"*"` for the tracked tree.
Cycles, dangling references, unsafe paths, empty matches, schema drift, and
scope/hash identity drift fail at the plan entrypoint. The current contract
uses `"*"` for every identity; narrower closures require separate evidence and
may be introduced independently.

Actions cache stores only the previous identity-to-hash map. `hash.py` computes
and compares the current map, and the plan transfers the pending map to
`validate`. Only successful convergence publishes it. The map carries no job
success, retry, or reliability meaning. Restore, transfer, and save failures
start cold without failing CI; invalid configuration remains fatal.

### Job graph and convergence

The current control flow is:

```text
runners -> plan -> workloads ---------> validate -> runtime summary
                -> merge policy ------/
```

`merge_policy` is merge-group-only and runs in parallel with workloads. It does
not cancel or suppress validation for a blocked group. `Validate workspace` is
the sole required convergence check: it consumes the plan-derived required-job
set, enforces merge policy at convergence, and is the only successful publisher
of pending hash state. Runner allocation failure and external cancellation are
operational failures rather than alternate coverage policy.

A merge-group failure at `Validate workspace` ejects the queued PR without any
trace on the PR itself: the run executes on the queue's transient ref and the
PR's own checks stay green. Two best-effort `handoff/comment` producers make the
ejection visible through `comment.atom.yml`: `merge_policy` announces a
blocking-label ejection, and `validate` announces every other failure (which
jobs failed, a log excerpt, and the PRs batched ahead in the group) after the
gate has already failed. Neither notice changes the gate result.

## Current references

These sections describe active or observed applications of the method. They are
kept here to make the paradigms concrete and may be revised or removed with the
corresponding planner behavior.

### Certain-exempt surface

Rule `certain-exempt-surface` covers prefixes `docs/`,
`apps/landing-page/`, `.vscode/`, `.idea/`, and
`.github/ISSUE_TEMPLATE/`, plus exact paths `LICENSE` and
`.github/CODEOWNERS`. The planner owns this classification directly; no
downstream guard is treated as proof that these files are unconsumed.

A replay of 398 first-parent merges ending at `b99a9fdc3` produced 46 certain,
zero-effect plans (11.6%). Root markdown such as `README.md` remains medium
because bare filename literals are widespread as fixture data and cannot be
distinguished locally from repository-root reads.

### Packaged leaf and Windows payload

Rule `certain-packaged-leaf-sources` covers only:

- `apps/desktop/{src,tests}/`
- `apps/packaged/{src,tests}/`
- `tools/pack/{src,tests,resources}/`

It claims `tools_dev_tests_required`, `tools_pack_tests_required`, and
`workspace_validation_required`. A pure matching merge group keeps
preflight/typecheck, workspace unit tests, desktop/packaged/tools-pack tests,
and the focused packaged launcher update-loop fallback. It skips web workspace
tests, broad E2E Vitest, UI P0, critical Playwright, and visual Playwright.

Windows launcher-payload validation is a separate test set. Rule
`certain-windows-launcher-payload` maps the Windows pack source unit to
`windows_tools_pack_payload_tests_required`, which alone arms its Windows
workload outside forced-full plans. The source unit includes the Windows
tools-pack implementation and resources, its explicit shared-module closure,
the Windows-only test file, launcher-proto and sidecar-proto sources, and the
narrow platform/release/sidecar exports consumed by that closure.

That exact shared-module closure is also a diagnostic signal: the flat
`tools/pack/src/` root does not yet expose stable core, launcher, and
platform-specific source units. The enumeration records the current dependency
shape, but it is not a durable pattern to copy or a substitute for decomposing
that source hierarchy. Until the source boundary or its conservative fallback
is strengthened, this route remains an active migration surface.

Desktop, packaged-runtime, mac-only, and unrelated tools-pack changes retain
Linux package coverage without starting a Windows runner. Package manifests,
workspace/lock configuration, build configuration, bins, vendor content,
unknown inputs, and below-threshold queue inputs retain conservative broad or
full behavior.

Current evidence:

- The latest 400 first-parent merges contain 23 pure packaged-leaf groups.
- Direct merge-queue replay retains the Windows workload for 5 groups and omits
  it for 18 desktop, packaged-runtime, mac-only, or unrelated tools-pack groups.
- Nineteen earlier pure-leaf groups have successful narrow PR validation paired
  with successful full merge-queue validation.
- Recent pure-leaf PR runs spend about 3.4–4.7 elapsed minutes in the Windows
  payload job, which can determine the validation critical path.
- A current full merge-group run measures about 11.8 elapsed minutes and 68
  runner-minutes. A representative pure-leaf narrow PR run measures about 4.2
  elapsed minutes and 8.1 runner-minutes.
- Expected savings are about 7.5 elapsed minutes and 60 runner-minutes per
  qualifying single-PR group, before queue batching discounts.

### Certain daemon core

Rule `certain-daemon-core` covers `apps/daemon/src/` and
`apps/daemon/tests/`, excluding `apps/daemon/src/sidecar/` and the
`daemon-runtime-definition` UI P0 shadow surface. Package manifests, build
configuration, bins, the packaged sidecar compatibility bridge, and runtime
definition source/companion tests stay medium-tier.

A pure matching merge group keeps preflight and workspace typecheck, workspace
unit coverage, broad E2E Vitest, and the complete UI P0 matrix. It skips web
workspace tests, visual Playwright, Windows launcher-payload tests, and
tools-dev/tools-pack unit coverage. Direct planner tests pin representative
routing and out-of-bound escalation. The retained plan continues to exercise
daemon buildability, user-level API/runtime behavior, and every merge-gated UI
P0 capability without treating web rendering or packaging-format tests as
daemon consumers.

The authoritative cross-app critique coverage walker lives in
`e2e/tests/critique-coverage.test.ts`, which remains armed by this plan. The
latest 400 first-parent merges contain 78 pure daemon-core groups. Fifteen
recent groups have successful narrow PR validation paired with successful full
merge-group validation. A representative full queue run spends about 20
runner-minutes in the web, visual, and Windows jobs omitted by the planner; UI
P0 remains the critical path.

### Daemon UI P0 capability shadow

The `daemon-runtime-definition` capability is evidence-only. The applied
`ui_p0` matrix remains all six current shards in PR and merge-queue plans:
`entry-settings`, `project-workspace`, `project-workspace-editor`,
`project-collab`, `project-runtime`, and `workspace-restoration`. No job reads
the shadow candidate as an execution input.

The capability matches changes confined to:

- `apps/daemon/src/runtimes/defs/`;
- `capabilities.ts`, `local-profiles.ts`, `metadata.ts`, and `registry.ts`
  directly under `apps/daemon/src/runtimes/`;
- the explicit companion-test list in `.github/config/scopes.json`.

Its four-shard candidate keeps `entry-settings`, `project-workspace`,
`project-collab`, and `project-runtime`; it would omit
`project-workspace-editor` and `workspace-restoration`. Any empty, unresolved,
mixed, unknown, or out-of-surface change records a full-fallback shadow. Direct
planner tests pin both the applied six-shard matrix and the four-shard
candidate. `project-workspace` remains because its P0 coverage contains the
local-agent and model selector.

The latest-400 replay contains three matching groups. Historical timing placed
the omitted shadow worker at about 8.5–9.2 runner-minutes per matching group,
but the shadow produces no execution savings until it independently satisfies
the active-omission requirements.

### Zero-effect merge-queue policy floor

A merge-queue plan that trusts every changed file at `certain` and receives no
scope effects keeps preflight setup, `pnpm guard`, and the i18n structure check,
but skips preflight's app prebuild/typecheck steps and the workspace-unit job.
PR/manual-hot, forced-full, and escalated queue plans retain broad validation.

`pnpm guard` runs as ordinary policy-floor work; it does not authorize the
zero-effect plan. The 398-merge replay ending at `b99a9fdc3` contains 46
qualifying plans (11.6%). A sample of 12 successful merge-group runs measures
broad prebuild/typecheck at about 1.95 runner-minutes and workspace unit at
about 1.6 runner-minutes, avoiding roughly 3.6 runner-minutes and 2.1
critical-path minutes per qualifying run, or about 166 runner-minutes across
that replay window.

## Evidence and evaluation

Shell may fetch file lists and extract logs, but every scope judgment goes
through `.github/scripts/scopes.py plan`. Do not reimplement rule semantics in
an evidence pipeline.

Replay recent merges through the evaluator:

```bash
git log --first-parent -400 --pretty=%H origin/main | while read -r sha; do
  git diff-tree -r --name-only --no-commit-id "$sha^" "$sha" |
    python3 .github/scripts/scopes.py plan \
      --context merge-queue --files-from - |
    node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
      console.log(d.trace.escalations.length === 0 ? "PURE" : "ESCALATED")'
done | sort | uniq -c
```

Classify one change set offline:

```bash
python3 .github/scripts/scopes.py plan --context pr \
  --files apps/web/src/App.tsx docs/architecture.md
```

Read the decision trace from a real queue run; prefer logs over artifacts:

```bash
gh run view <run-id> --log | sed -n '/scope decision trace:/,/^}/p'
```

The replay must emit only `PURE`/`ESCALATED` counts, and an individual `plan`
call must emit JSON whose `trace.threshold` matches the context. Keep these as
recipes. Check in evidence tooling only when the required window exceeds CI log
retention or repeated manual execution has become error-prone.

## Open questions

- How should a `certain` rule be demoted when planner evidence or its source
  closure becomes stale?
- What independent evidence source could detect source-closure drift without
  being scheduled by the plan it assesses?
- Should planner traces expose source unit, test set, and fallback reason as
  separate first-class fields?
- Should replay output directly summarize workload deltas and measured cost,
  rather than requiring per-slice shell analysis?
- Should medium-tier zero-effect PR plans use the policy floor? This needs a
  separate evidence and containment review.
- How much does real merge-queue batching discount single-PR replay savings?
- Adjacent medium-tier gaps remain separate candidate slices:
  `e2e/tests/**` does not arm E2E Vitest on PRs; `mocks/**` reaches Playwright
  through fallback rather than the daemon tests that consume it; manual-hot
  dispatch does not re-derive workspace validation.
