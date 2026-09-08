# Deliverable syntax: local acceptance and outcome metrics

This runbook validates the branch's actual daemon before a PR or remote evaluation.
A unit-test pass is not a deployment receipt. Local investigation history remains
private; this file contains the portable contract and reproduction steps.

## Confirmed behavior

| ID | Contract | Acceptance |
| --- | --- | --- |
| Q1 | Preserve the historical six-error file locally; publish a privacy-safe derivative | Source hashes and six changed lines in fixture provenance |
| Q2 | Only deterministic, unambiguous syntax patches | Static quote mismatch and static HTML attribute-quote rules; dynamic expressions refuse |
| Q3 | Bounded, program-only staging | At most 8 patches, 32 edited characters, 1 second cooperative repair budget; no model turn |
| Q4 | Verify before commit | Whole-candidate checker after each patch; original unchanged on ambiguity, limit or commit conflict |
| O1 | Content-free summary on the existing physical Run terminal | No new telemetry request, source/diff upload, prompt or Repair Agent in this increment |
| O2 | Staged is not committed | Initial repairable + proven committed patch + final pass + allow + succeeded required for recovery |
| O3 | Failed delivery is never repaired delivery | Budget, commit-conflict, partial-summary and incomplete negative cases |
| O4 | Versioned, allowlisted metadata | Fixed rule/reason enums and counts; missing evidence is unknown |
| O5 | Agent and Host budgets do not share candidate state | Exhausted Agent state cannot consume Host program-patch budget |
| O6 | Real local deployment witness | Build source, start isolated tools-dev daemon, invoke HTTP Run, read terminal and actual artifact |

## Architecture and impact

After a physical Agent Run exits successfully, the daemon resolves its canonical
touched HTML deliverable and settled process tree. It checks syntax, stages safe
patches in memory, fully rechecks and commits only a passing candidate through a
guarded atomic replacement. Unsupported, ambiguous or incomplete work fails closed.

The shared daemon path covers eligible UI/CLI and ordinary/OD Next Runs, not only
ODEval or production-phase Runs. No valid HTML entry skips. When touchedPaths are
provided, the canonical entry must have been touched; otherwise existing artifact
evidence determines applicability.
Inspection is limited to inline scripts and supplied related code paths; it does
not recursively fetch every script URL or validate CSS, visuals, runtime or business
behavior. Parsing success does not prove author intent.

Existing checker limits are 100 files, 2 MiB/file and 8 MiB total. This PR makes
incomplete checks block delivery: even syntactically correct but oversized HTML can
be blocked. The one-second repair budget is cooperative, not preemption of synchronous
parsing or fsync. Normal checks do not acquire the repair-only deadline.

The Host gate defaults on. `OD_DELIVERABLE_SYNTAX_FINALIZER=off` skips it, losing the
new syntax blocking guarantee. It does not restore the older Agent prompt/tool loop
removed by the parent PR change. This increment adds no Prompt/OD Next mapping change.
Acorn is a daemon-local runtime dependency; the strict checker stays authoritative.

## Local deployment acceptance

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
- Ambiguous expression: failed delivery, zero committed patches, original unchanged.

Nine expected outcomes include three intentional blocks, not nine successful deliveries.
The committed fixture is about 120 KB after removing original images/contact data.
Its six error locations are preserved. The 1.3 MB original remains local and ignored;
do not infer its timing from the smaller derivative. See fixture README/provenance.

The opt-in `--mode real` lane requires dataset path/hash/row count, pinned runner
path/version, Vela binary and test profile. It runs AMR / deepseek-v4-flash / explicit
OD Next against a few unchanged pressure cases, without creating a remote batch.
It validates integration, not deterministic repair coverage. No production-wallet
fallback is permitted. Both lanes disable telemetry/content/manifest upload and
therefore do not prove production Langfuse/R2 ingestion.

## Terminal summary and timing

`deliverableSyntaxValidation.finalization` records summaryVersion 1,
repairEngine `host-safe-fixer@2`, initialStatus, action/reason/refusal,
stagedPatchCount, committedPatchCount and committedRepairRules. Staged rules are
not committed rules. Physical terminal status completes the success criterion.
Missing or partial historical summaries cannot prove Host recovery.

| Timing | Exact scope |
| --- | --- |
| checkerDurationMs | Sum of actual checker invocations in this physical Run |
| safeFixProposalDurationMs | Proposal evaluation, including refusals |
| repairDurationMs | Accepted proposal plus commit time; overlaps proposal time, excludes parser time |
| repairWindowDurationMs | Historical failed-check start to later passing-check start; excludes last check/commit |
| repairToTerminalDurationMs | First failed-check start to physical terminal, including failures |
| repairToDeliveryDurationMs | Legacy name for the same terminal window, not proof of success |

Do not add proposal to repairDuration. Langfuse and ODEval retain the versioned
summary and reason enums without diagnostic text, paths or source. Case aggregation
must not turn a failed final Case into a recovered delivery. Legacy exhausted tool
state alone does not prove that the Host actually blocked delivery.

For comparable versions with complete eligible terminal evidence, report recovered
deliveries / initially broken deliveries as coverage, and recovered / eligible observed
deliveries as overall contribution. Separately report blocks, incomplete and unobserved
records. Rule-hit counts mean deliveries matching a rule, not independent error counts.
Report clean checker cost and successful/blocked repair-window p50/p95 separately.

Fixed regression is not evidence of online 99% coverage, p95 or causal conversion
uplift. Before/after R2 capture, live dashboards and production ingestion acceptance
are separate follow-ups; content consent, retention and storage policy do not change.
