# Deliverable syntax: local acceptance and outcome metrics

This runbook validates the branch's actual daemon before a PR or remote evaluation.
A unit-test pass is not a deployment receipt. Local investigation history remains
private; this file contains the portable contract and reproduction steps.

## Confirmed behavior

### Alignment status: READY — non-blocking delivery (2026-09-08)

The current user decision supersedes the earlier syntax-blocking requirement:
syntax validation must not prevent delivery. Unrepairable output is still made
available to the user, with durable, content-free evidence of the warning.

| ID | Confirmed behavior and source | Acceptance / traceability |
| --- | --- | --- |
| N1 | User: syntax checking must not block final delivery | Host finalizer returns `warn`, not a Run failure, on repair refusal or incomplete checks; original artifact remains available |
| N2 | User: preserve evidence for unsuccessful repairs | Run/SSE and Langfuse retain the real checker status and finalization reason; `deliveredWithSyntaxWarningCount=1` only for a succeeded physical Run with complete warning evidence |
| N3 | User: continue programmatic repair | Existing safe-edit, staging, verification, commit and time budgets remain; no model repair turn |
| N4 | Existing execution failures remain failures | Agent/protocol, missing artifact, cancellation and snapshot failures are not converted to success; a syntax warning is never counted as repaired or blocked delivery |
| N5 | User-approved review follow-up: internal engine defects must remain visible without blocking delivery | The finalizer throws a dedicated internal error; only the delivery boundary recovers it, retaining `internal_error` evidence and ERROR-level observation; expected filesystem errors remain ordinary incomplete warnings |

The earlier implementation baseline `259ee527d` used the blocking policy; its
remote evaluation cannot validate N1–N4. The non-blocking increment is now based
directly on main (`d07102a3b`). PR submission does not imply merge or release.
No critical decision remains unresolved in this scope.

| ID | Contract | Acceptance |
| --- | --- | --- |
| Q1 | Preserve the historical six-error file locally; publish a privacy-safe derivative | Source hashes and six changed lines in fixture provenance |
| Q2 | Only deterministic, unambiguous syntax patches | Static quote mismatch and static HTML attribute-quote rules; dynamic expressions refuse |
| Q3 | Bounded, program-only staging | At most 8 patches, 32 edited characters, 1 second cooperative repair budget; no model turn |
| Q4 | Verify before commit | Whole-candidate checker after each patch; original unchanged on ambiguity, limit or commit conflict |
| O1 | Content-free summary on the existing physical Run terminal | No new telemetry request, source/diff upload, prompt or Repair Agent in this increment |
| O2 | Staged is not committed | Initial repairable + proven committed patch + final pass + allow + succeeded required for recovery |
| O3 | Warning delivery is not repaired or blocked delivery | Original bytes on budget/commit-conflict/incomplete warnings; true execution failures remain failures; partial summaries remain unknown |
| O4 | Versioned, allowlisted metadata | Fixed rule/reason enums and counts; missing evidence is unknown |
| O5 | Agent and Host budgets do not share candidate state | Exhausted Agent state cannot consume Host program-patch budget |
| O6 | Real local deployment witness | Build source, start isolated tools-dev daemon, invoke HTTP Run, read terminal and actual artifact |

## Architecture and impact

After a physical Agent Run exits successfully, the daemon resolves its canonical
touched HTML deliverable and settled process tree. It checks syntax, stages safe
patches in memory, fully rechecks and commits only a passing candidate through a
guarded atomic replacement. Unsupported, ambiguous or incomplete work refuses the
patch, returns `warn`, and continues delivery of the original artifact. This is
fail-closed patching, not a delivery gate. A passing staged candidate that cannot be
committed also warns; it does not prove that the delivered original parses.

The shared daemon path covers eligible UI/CLI and ordinary/OD Next Runs, not only
ODEval or production-phase Runs. No valid HTML entry skips. When touchedPaths are
provided, the canonical entry must have been touched; otherwise existing artifact
evidence determines applicability.
Inspection is limited to inline scripts and supplied related code paths; it does
not recursively fetch every script URL or validate CSS, visuals, runtime or business
behavior. Parsing success does not prove author intent.

Existing checker limits are 100 files, 2 MiB/file and 8 MiB total. Incomplete checks,
including oversized HTML, retain `incomplete` evidence and warn without blocking
delivery. The one-second repair budget is cooperative, not preemption of synchronous
parsing or fsync. Normal checks do not acquire the repair-only deadline. Agent or
protocol failures, missing required artifacts, cancellation and HTML snapshot
failures are outside this syntax-only policy and keep their existing failure paths.

The Host finalizer defaults on. `OD_DELIVERABLE_SYNTAX_FINALIZER=off` skips its checks,
safe repair and warning evidence. It does not restore the older Agent prompt/tool loop
removed by the parent PR change. This increment adds no Prompt/OD Next mapping change.
Acorn is a daemon-local runtime dependency; the strict checker stays authoritative.

## Local deployment acceptance

### Alignment: explicit synthetic telemetry canary (2026-09-09)

The user authorized executing the proposed local upload acceptance. This does
not authorize a push, release, real-model batch or upload of existing user data.

| ID | Confirmed behavior | Acceptance |
| --- | --- | --- |
| S1 | Upload is explicitly opt-in; existing replay and real lanes remain offline | Default consent stays off; upload refuses real/dataset/external-fixture inputs |
| S2 | Only three built-in synthetic outputs: clean, safely repairable, unrepairable | One repeat, isolated data and AMR home, no inherited user auth; real daemon performs finalization |
| S3 | Exercise the real exporter through the configured official test relay | Both existing consent gates explicitly on, no direct credentials or manual metrics ingestion; await durable delivery outcome |
| S4 | Distinguish synthetic records and verify actual ingestion | Unique synthetic-test environment, existing low-cardinality fixture model tag, exact Trace/Observation readback; relay acceptance alone is insufficient |

The native Langfuse environment reuses the existing telemetry environment
source. No new production privacy policy or sink-priority rule is introduced.

Explicit, fixed-synthetic upload canary (never accepts an external dataset,
fixture manifest, real mode, production profile or more than one repeat):

```bash
OPEN_DESIGN_TELEMETRY_RELAY_URL=https://telemetry-test.open-design.ai/api/langfuse \
  pnpm exec tsx scripts/syntax-acceptance.ts --mode replay --upload-telemetry --repeat 1
```

The successful Run is followed by the normal client final-message GET/PUT with
`telemetryFinalized: true`. Only the actual durable assistant message is reused;
the harness does not manufacture usage, diagnostics or outcome metrics. It then
waits for the isolated Run's durable exporter checkpoint. `failed`, `not_expected`,
zero attempts and a missing receipt do not pass. Automatic repository dotenv
loading is disabled for all tools-dev commands. Installation and legacy migration
overrides are cleared; the upload lane also isolates AMR home and clears inherited
account/direct-ingestion keys. PostHog remains disabled.

Run from `e2e/`:

```bash
pnpm exec tsx scripts/syntax-acceptance.ts --mode replay \
  --fixture-manifest ../apps/daemon/tests/artifacts/fixtures/syntax-quotes/replay.manifest.json \
  --repeat 3
```

The harness builds the current worktree and dependencies, starts tools-dev in an
isolated data root, and captures source/build identity and cleanup. The fake CLI
only supplies a fixed file; the real built daemon performs checks, patches and commit.
This is not real-model generation. Each fixture repeats three times:

- Six quote errors: six committed patches and exact reference bytes.
- Valid control: zero patches and unchanged bytes.
- Ambiguous expression: succeeded physical Run with `repairable` / `warn`, zero
  committed patches and exact original bytes still readable as the delivered artifact.

The new-policy expectation is nine succeeded Runs: three repaired deliveries,
three clean controls and three warning deliveries. This is an acceptance target,
not a result until the current source is built and replayed. Historical runs that
intentionally blocked delivery do not validate this policy. The harness rejects old
`action: fail` syntax fixture manifests so the old oracle cannot silently pass.
The committed fixture is about 120 KB after removing original images/contact data.
Its six error locations are preserved. The 1.3 MB original remains local and ignored;
do not infer its timing from the smaller derivative. See fixture README/provenance.

The opt-in `--mode real` lane requires dataset path/hash/row count, pinned runner
path/version, Vela binary and test profile. It runs AMR / deepseek-v4-flash / explicit
OD Next against a few unchanged pressure cases, without creating a remote batch.
It validates integration, not deterministic repair coverage. It requires a runner
that projects the complete Host terminal summary and, for warning delivery,
`deliveredWithSyntaxWarningCount=1`, `recoveredDeliveryCount=0` and
`blockedBrokenDeliveryCount=0`. Missing summaries or terminal evidence do not pass
acceptance, even if the last checker status is `pass`. This lane's projected metrics
alone do not prove original-byte preservation; fixed replay reads and compares the
actual artifact to supply that evidence. No production-wallet
fallback is permitted. Both lanes disable telemetry/content/manifest upload by
default; only the explicit fixed-synthetic canary enables Trace upload. Neither
offline replay nor the anonymous Trace canary proves R2 object materialization.

### Synthetic upload receipt: 2026-09-09

Receipt `od-syntax-acceptance-c7ZU1U` rebuilt the current local worktree and ran
three fixtures through the real daemon, terminal-message route and test relay.
All three local oracles passed, all three exporter receipts were accepted on the
first attempt, source identity stayed stable and runtime cleanup was confirmed.
The fixture process is synthetic: its token counts are test values, not model
billing or generation performance evidence.

| Fixture | Remote terminal evidence | Checker total | Discovery to terminal delivery |
| --- | --- | --- | --- |
| Clean | pass / allow; committed=0, recovered=0, warning=0 | 4.73 ms | Not applicable |
| Missing closing array delimiter | pass / allow; committed=1, recovered=1, warning=0 | 14.08 ms | 91 ms |
| Missing expression | repairable / warn / no_safe_fix; committed=0, recovered=0, warning=1 | 2.62 ms | 13 ms |

The repaired file exactly matched the frozen expected bytes; the clean and warning
files stayed byte-identical to their originals. All blocked-delivery counts were
zero. Transport waiting was 2.46–3.85 seconds, after Run delivery; it is not checker
or repair cost. These tiny synthetic timings are not a production latency promise.

Exact authenticated browser readback found all three Traces in **open-design-test**,
not the production **open-design** project. Each showed the fixture model tag,
native environment `synthetic-test-274a1e44`, the actual execution tree and the
same syntax timing/outcome fields as its local receipt.
Filtering Traces to this unique native environment returned exactly three distinct
Trace IDs, each with 16 observations; no duplicate Trace was present.
The test relay stamps
`metadata.env=test` while preserving the native synthetic environment. The existing
production-scoped read-script credential returns 404 for these test-project IDs;
that result must not be mistaken for missing ingestion. No credential was copied.

The earlier interrupted preflight `od-syntax-acceptance-udPuj0` is not an acceptance
receipt: it stopped before terminal-message telemetry finalization; its isolated
runtime was confirmed stopped. The subsequent completed receipt above is the
evidence of actual upload. Default-off, fixture/relay isolation, failed checkpoint
and durable-message contract tests passed 17/17; daemon telemetry/bridge/terminal
tests passed 237/237 and both daemon source/test typechecks passed. These test
counts are code tests, distinct from the three deployed-daemon canary executions.

No source was committed, pushed, merged or remotely deployed by that canary. Its
receipt predates PR submission. An additional default-off-lane identity-isolation assertion was
added after this receipt; it leaves the canary's effective environment unchanged.

### Main-based PR validation: 2026-09-09

Commit `5164836e47c8530254459e392051732b38a4c602`, based directly on main
`d07102a3b`, passed a fresh build and isolated deployed-daemon replay:

```bash
pnpm exec tsx e2e/scripts/syntax-acceptance.ts --mode replay --repeat 1
```

Private receipt `od-syntax-acceptance-mK8tps/report.json` records 10/10 PASS:
six verified repairs, one clean delivery and three warning deliveries. All Runs
succeeded; refused patches retained the original bytes. `sourceStable=true` and
`cleanup.stopped=true` were verified. Upload was disabled and the CLI emitted
fixed fixtures, so this is local deployment acceptance, not real-model or online
coverage evidence. Repaired-delivery windows were 21–38 ms for these tiny fixtures;
the two observed-error warning windows were 11/14 ms. The oversized incomplete
check has no first-error window, not a zero-duration repair.

The same source passed 380 daemon tests across eight focused files, 16 contract
tests and 17 harness tests (413 total), repository guard and full workspace
typecheck. Initial restricted-sandbox attempts could not create IPC/listening
sockets; the affected commands passed with the required local process permission.
The subsequent documentation-only commit does not change the validated runtime.

### Local receipts: 2026-09-08 non-blocking policy

The new harness assertions first failed against the old oracle (5 failures / 8
passes), then passed 13/13. Additional red checks rejected a bare staged `pass`
without finalization evidence and incorrect delivered bytes. These are harness
unit tests, not model or deployment acceptance. `pnpm typecheck` in `e2e/` and
`git diff --check` also passed.

Two subsequent invocations rebuilt the worktree, started the real local tools-dev
daemon and submitted HTTP Runs using fixed-output fake CLI processes:

| Replay receipt directory | Cases / result | Observed delivery outcomes |
| --- | --- | --- |
| `od-syntax-acceptance-kOL1U5` | Quote manifest, 3 repeats: 9/9 PASS | 3 repaired, 3 clean, 3 warning; all 9 physical Runs succeeded |
| `od-syntax-acceptance-sxbOnZ` | Built-in boundary fixtures, 1 repeat: 10/10 PASS | 6 repaired, 1 clean, 3 warning; all 10 physical Runs succeeded |

Each private local directory contains `report.json`, per-Run JSON, actual before /
after files and runtime/build logs. Both receipts record `sourceStable=true` and
confirmed `cleanup.stopped=true`; no background acceptance daemon remains. They
use base commit `259ee527dacccbb83d29fe0b91bcf9c6c3348a6e` plus local changes, not a
published version. The scoped diff hashes differ between receipts
(`65ce8a78235c...` / `5f6133be5d99...`), so these are not identical full-source
snapshots. The built server, finalizer, safe-fixer and quote-helper hashes match
exactly across both receipts; their complete source/build identities are retained
in the reports.

The quote fixture's six patches committed in each repeat and delivered bytes
exactly matched the reference. Every warning fixture preserved its original bytes:

- Ambiguous expression, 3 repeats: `repairable` / `warn`, zero committed patches.
- Repair limit: `repairable` / `warn` / `attempt_limit_reached`, eight staged but
  zero committed patches; no partial staged changes leaked into delivery.
- Expression hole: `repairable` / `warn` / `no_safe_fix`, zero committed patches.
- Oversized file: `incomplete` / `warn` / `check_incomplete`, zero committed
  patches; incomplete is not counted as a detected syntax error.

The three six-error repairs took 257 / 127 / 112 ms from first repairable check to
physical success. Ambiguous-expression warning delivery took 6 / 6 / 8 ms; the
repair-limit and expression-hole warning windows were 14 / 5 ms. Oversize has no
first-repairable timestamp, so that window is unavailable, not zero. These are
fixed-file local terminal windows (the quote derivative is about 120 KB), not model
generation latency, 1.3 MB original-file timing, production p95 or online repair
coverage. No real-model batch, remote deployment or telemetry ingestion test ran.

The nine saved physical Run JSON records from the quote receipt were also passed
through the current Open Design bridge, strict safe telemetry schema and flat
metadata helper, and separately through the local ODEval projector and Case
rollup. Both paths agreed on all nine records: three recovered deliveries, three
clean deliveries, three warning deliveries and zero blocked deliveries. Each
warning retained `no_safe_fix` / `unsupported_syntax_error`, with zero committed
patches and zero recovered-delivery count. This is a local serialization and
projection witness, not evidence of receipt by the online Langfuse service.

Focused checks additionally passed: daemon finalizer / HTTP / artifact regressions
67/67, telemetry regressions 311/311, contracts / normalized observations / OD Next
capability 48/48, and local ODEval projection / rollup / HTTP regressions 117/117.
The strengthened original-byte HTTP assertions passed again in a 4/4 rerun.
Daemon source/tests type checks and repository guard passed. Cross-Run regression
tests ensure a latest warning cannot inherit an earlier recovery, an earlier
warning cannot override a latest clean result, and missing latest warning evidence
stays unknown rather than becoming an observed zero.

## Terminal summary and timing

Review follow-up (2026-09-09): internal finalizer defects now reject from the engine
as `DeliverableSyntaxInternalError`. Only the delivery owner handles this dedicated
error, retaining `internal_error` evidence and a sanitized local ERROR log. The
native Run trace exports an ERROR-level `deliverable-syntax-internal-error` event;
ordinary incomplete checks do not emit it. The original cause stays in memory and
is not logged or exported. Existing Agent/protocol/snapshot failures are unchanged.
Consumers must accept the additive `internal_error` finalization reason to retain
its classification; this PR does not deploy ODEval or prove online ingestion.

The illegal-decision and programming-error tests first failed against `ce880a19b`
(two incorrect warning resolutions), then passed. Updated engine, delivery, HTTP,
Langfuse, Task and contract checks passed 373 tests; full typecheck and guard passed.
The HTTP fault-injection test proves durable internal-error evidence, successful
Run completion and byte-identical original artifact readback. Fresh rebuilt-daemon
replay `od-syntax-acceptance-R85H3J` passed 10/10 with stable source and confirmed
cleanup (six repaired, one clean, three warnings; fixed CLI, no model/upload).
The preceding replay was invalidated by a concurrent test-source edit and is not
an acceptance receipt. These local witnesses are not production monitoring results.

`deliverableSyntaxValidation.finalization` records summaryVersion 1,
repairEngine `host-safe-fixer@2`, initialStatus, action/reason/refusal,
stagedPatchCount, committedPatchCount and committedRepairRules. Staged rules are
not committed rules. Physical terminal status completes the success criterion.
Missing or partial historical summaries cannot prove Host recovery.
The acceptance report separates `repairVerified` from `deliveredWithWarning`.
The latter requires a succeeded physical Run, complete Host summary, `warn`, zero
committed patches and a supported finalization reason. It may retain `repairable`,
`incomplete`, or a staged `pass` with commit failure; no status is rewritten to
claim repair. An actual failed/canceled Run cannot count as warning delivery.

| Timing | Exact scope |
| --- | --- |
| checkerDurationMs | Sum of actual checker invocations in this physical Run |
| safeFixProposalDurationMs | Proposal evaluation, including refusals |
| repairDurationMs | Accepted proposal plus commit time; overlaps proposal time, excludes parser time |
| repairWindowDurationMs | Historical failed-check start to later passing-check start; excludes last check/commit |
| repairToTerminalDurationMs | First failed-check start to physical terminal, including failures |
| repairToDeliveryDurationMs | Legacy name for the same terminal window, not proof of success |
| replay discoveryToWarningDeliveryMs | Terminal window only when the original is delivered with warning; not a successful repair window |
| replay discoveryToRepairedDeliveryMs | Terminal window only with proven committed repair and succeeded delivery |

Do not add proposal to repairDuration. Langfuse and ODEval retain the versioned
summary and reason enums without diagnostic text, paths or source. Case aggregation
must not turn a failed final Case into a recovered delivery. Legacy exhausted tool
state alone does not prove that the Host actually blocked delivery.

For comparable versions with complete eligible terminal evidence, report recovered
deliveries / initially broken deliveries as coverage, and recovered / eligible observed
deliveries as overall contribution. Separately report delivered-with-warning,
incomplete, true execution failure and unobserved records. A warning is neither a
recovered delivery nor a blocked broken delivery. Incomplete evidence is not proof
of a syntax error. Rule-hit counts mean deliveries matching a rule, not independent
error counts. Report clean checker cost, proven repaired-delivery terminal windows
and warning-delivery terminal windows separately; the warning window is not time
spent successfully repairing the artifact.

Fixed regression is not evidence of online 99% coverage, p95 or causal conversion
uplift. Before/after R2 capture, live dashboards and production ingestion acceptance
are separate follow-ups; content consent, retention and storage policy do not change.
