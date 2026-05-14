# Validation

The subsystem is validated by four simulation suites totaling **238 assertions**, all passing on the validated baseline. Each suite has a focused remit; together they exercise the entire retrieval pipeline plus the storage, decay, and reversal lifecycle.

## Simulation philosophy

The subsystem deliberately has no integration tests against a live pipeline. The pipeline hookpoints inside `extractionAdapter.js` are stubs awaiting the pipeline team's confirmation, so end-to-end testing would mostly assert against fixtures the engine wrote itself.

Instead, the simulations validate the engine in isolation, at the boundary that the host actually depends on:

- **Inputs**: realistic sequences of `ingestSignal` calls, varying user profiles (sparse, dense, mixed-polarity, multi-category), and varying retrieval contexts (with and without project IDs, with and without type filters).
- **Outputs**: the structured `retrieveForInjection` result and the `[MEMORY CONTEXT]` block.
- **Invariants**: ordering, balance, bounds, and lifecycle correctness — properties that must hold regardless of profile shape.

The simulations are not unit tests. They build entire user profiles, advance time, run reversal sequences, and exercise pressure scenarios that take dozens of operations to reach. The boundary is "the engine behaves correctly under realistic, adversarial input sequences", not "this function returns the expected value".

## Suites

### `testHarness.js` — 64 assertions

Lifecycle, storage, and core engine validation.

| Section | Validates |
|---|---|
| 1. File initialisation | Empty store creation, idempotent file access |
| 2. CRUD basics | create / read / update / delete, id assignment, derived confidence |
| 3. Signal ingestion — accumulation | Strength increases monotonically with matching signals |
| 4. Signal ingestion — confidence ladder | Strength climbs through low → medium → high |
| 5. Negative preference (rejection memory) | Negative records created and tracked correctly |
| 6. Reversal logic — noise guard | One contradictory signal does not change anything |
| 7. Reversal logic — 2 contradictory signals | Strength drops ~20%, status remains stable |
| 8. Reversal logic — 4+ signals → under_review + shadow | The full reversal ladder fires correctly |
| 9. Decay runner | Strength × 0.70 at 90+ days, archived at 180+ days |
| 10. Retrieval & prompt block | End-to-end retrieve + buildPromptBlock |
| 11. Project overrides | Project preferences shadow globals |
| 12. Refinement log | Logged entries persist with stable shape |
| 13. Memory toggle | `memory_enabled = false` short-circuits ingestion and retrieval |
| 14. EDGE — under_review excluded from injection | Reversal mid-state is invisible to retrieval |
| 15. EDGE — shadow promotion archives original | Genuine reversal flow completes cleanly |
| 16. EDGE — decay + reversal apply independently | Two lifecycle paths do not interfere |
| 17. EDGE — strength ceiling | Strength clamps exactly at 1.0 |
| 18. EDGE — project override surfaces in prompt block | "Project override" line renders correctly |

### `retrievalQualitySim.js` — 36 assertions

Retrieval quality instrumentation: ranking, hysteresis, flicker, threshold gating, prompt pollution.

| Scenario | Validates |
|---|---|
| RQ-01 | Empty profile produces zero injection |
| RQ-02 | Sub-threshold records excluded |
| RQ-03 | Crossing the threshold enters injection set |
| RQ-04 | Top-N ranking sorts by descending strength |
| RQ-05 | Saturation: signal strength capped at 1.0 |
| RQ-06 | Hysteresis: repeated retrievals produce identical sets |
| RQ-07 | Flicker detection at threshold boundary |
| RQ-08 | Prompt pollution: under_review and archived excluded |
| RQ-09 | Project override shadows global for same pattern |
| RQ-10 | Prompt block character budget analysis |
| RQ-11 | Sparse user: clean retrieval, no conflicts |
| RQ-12 | Dense user: ranking stability under diversity |

The flicker metric (`flickerScore()`) measures pattern set differences across consecutive snapshots. Zero flicker on identical inputs is a determinism check; non-zero flicker at the threshold boundary is *expected* and exists so that the metric will detect real drift if it ever appears in production.

### `retrievalAdvancedSim.js` — 91 assertions

Constraint interaction validation: token budget, negative priority, conflict diagnostics, polarity diversity, category diversity, and combined-pressure scenarios.

| Scenario | Validates |
|---|---|
| ADV-01..03 | Token budget: single-pattern, long-pattern, header overhead |
| ADV-04..06 | Negative priority: avoidance ranks above equal-strength positive, survives budget pressure, but loses to strong positive |
| ADV-07..10 | Conflict diagnostics: project override traces, no spurious suppressions, multiple-pattern suppression, hard-cap traces |
| ADV-11 | Combined cap + budget + suppression in one retrieval |
| ADV-12..15 | Polarity diversity: dense profile capped, sparse passes through, budget interaction, multiplier interaction |
| ADV-16 | Diversity backfill restores positives from overflow |
| ADV-17..18 | MIN_NEG_FLOOR at 1, all-negative profile handled |
| ADV-19..20 | Negative token-share bounds, ratio holds over 30 sessions |
| ADV-21..22 | Rejection-only user still gets avoidance, floor correctness across profile sizes |
| ADV-23..26 | Category ceiling: multi-category trim, single-category untouched, backfill from under-represented types, combined polarity + category pressure |

### `retrievalLongRunSim.js` — 47 assertions

Temporal and long-running validation: 20+ session evolution, decay-under-load, reinjection stability, entropy drift, cross-project isolation.

| Scenario | Validates |
|---|---|
| LR-01 | 20-session accumulation: ranking stays consistent |
| LR-02 | Decay under load: active preferences survive, stale decay |
| LR-03 | Reversal during active use: injection set updates correctly |
| LR-04 | Shadow promotion: reversed preference re-enters injection |
| LR-05 | Mixed signal weights: explicit_tag > manual_refinement > thumbs_up |
| LR-06 | Preference type filtering: scoped retrieval |
| LR-07 | 50 distinct patterns: ranking + budget integrity |
| LR-08 | Cross-project isolation: no leakage |
| LR-09 | Confidence gate: low confidence excluded even if strength ≥ threshold |
| LR-10 | Temporal evolution: strengthen then decay |
| LR-11 | 25-session negative accumulation stays bounded |
| LR-12 | Cross-project diversity: ceiling per retrieval context |
| LR-13 | Diversity under decay: decayed negatives free slots |
| LR-14 | 40-pattern triple constraint (cap + diversity + budget) |
| LR-15 | Polarity entropy: balanced profile maintains entropy over time |
| LR-16 | Category diversity: 5 types over 15 sessions, no dominance |

## Long-run validation strategy

`retrievalLongRunSim.js` is the only suite that simulates time. It uses the engine's existing `last_seen` and `decay_at` fields to advance the clock by mutating timestamps directly — there is no `Date.now()` mock. This works because `runDecay` reads `daysBetween(decay_at, now)` and is a pure function of the file state.

The temporal scenarios are designed to surface failure modes that only appear over many sessions:

- **Drift.** Does the injection set stay coherent as signals accumulate?
- **Stale dominance.** Does an old strong preference keep occupying a slot when the user has moved on?
- **Entropy collapse.** Does polarity entropy drop toward zero as the profile fills out?
- **Category monopolization.** Does one type take over as it accumulates more signals than others?

LR-15 in particular tracks the polarity entropy `H = -p·log2(p) - (1-p)·log2(1-p)` across sessions and asserts it stays above a floor.

## Pressure testing philosophy

Three suites include pressure scenarios:

- `retrievalQualitySim.js` RQ-12: dense user with high diversity
- `retrievalAdvancedSim.js` ADV-19, ADV-20: 30 sessions of negative accumulation
- `retrievalLongRunSim.js` LR-07, LR-14: 50-pattern stress and 40-pattern triple constraint

The goal is not to find the breaking point — the engine has hard caps that prevent unbounded growth — but to confirm that all bounds (count, polarity ratio, category share, token budget) hold simultaneously under adversarial input.

## Entropy tracking

Polarity entropy is computed in two places:

- `retrievalQualitySim.js` `MetricsCollector.capture()` records per-snapshot entropy.
- `retrievalLongRunSim.js` `captureMetrics()` records it for trend analysis across sessions.

These are observability assertions, not correctness assertions. The engine does not target a specific entropy value; it targets the *constraints* (ratio, count, budget) that bound entropy from below.

## Determinism guarantee

All suites are deterministic. Failures reproduce on rerun. Each suite uses its own `MEMORY_STORAGE_ROOT` (e.g., `.test-memory`, `.test-retrieval`) and removes the directory on success, so suites can run in any order without cross-contamination.

If a sim fails after a logic change, fix the logic — do not "stabilize" the test by relaxing the assertion. The assertions encode the engine's contracts.

## Running the suites

```bash
node creative-memory-system/sims/testHarness.js          # 64 assertions
node creative-memory-system/sims/retrievalQualitySim.js  # 36 assertions
node creative-memory-system/sims/retrievalAdvancedSim.js # 91 assertions
node creative-memory-system/sims/retrievalLongRunSim.js  # 47 assertions
```

Or, from `creative-memory-system/`, use the npm scripts in `creative-memory-system/package.json`:

```bash
npm run sim          # runs all four suites in sequence
npm run sim:harness
npm run sim:quality
npm run sim:advanced
npm run sim:longrun
```

The `extractionAdapter.js` self-test (`node creative-memory-system/extractionAdapter.js`) adds 12 more assertions covering the adapter handlers; it is excluded from the 238-assertion total because it tests the adapter contract, not the engine.
