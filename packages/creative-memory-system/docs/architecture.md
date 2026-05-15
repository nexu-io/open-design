# Architecture

This document explains *what the Creative Memory System is* and *why it is shaped this way*. For the step-by-step retrieval flow, see [`retrieval-pipeline.md`](retrieval-pipeline.md). For the diagnostic events, see [`diagnostics.md`](diagnostics.md).

## Purpose

The subsystem captures a user's stylistic preferences from generation events and folds them back into the next prompt as a small, bounded `[MEMORY CONTEXT]` block. The point is not personalization in the recommender sense; it is *short-term creative continuity* — so the next generation does not undo what the user just signaled they liked.

It is a memory layer, not a model. It does not generate, score, or rank artifacts. It only decides which previously expressed preferences belong in the prompt right now.

## Local-first philosophy

Everything is JSON on disk. There is no server, no database, no embedding index, no daemon. A single file per user (`<storage_root>/<userId>/preferences.json`) holds the entire state. The default `<storage_root>` is the module's own directory; overriding it requires only setting the `MEMORY_STORAGE_ROOT` environment variable.

This shape was chosen so that:

- the data is **inspectable by humans** without tooling;
- the subsystem is **portable** across environments without infrastructure;
- the user's preferences are **theirs**, on their machine, deletable in one filesystem operation;
- the integration cost is **zero infrastructure** — the host process just calls functions.

## Deterministic retrieval

`retrieveForInjection` is a pure function of stored state and the request context. Given the same JSON file and the same `(userId, context)`, it returns the same result every time. There is no probabilistic ranking, no learned model, no hidden state outside the file.

This matters because:

- **debugging is feasible.** Reviewers can read the JSON, run retrieval mentally, and spot anomalies.
- **diffing is feasible.** Two generations that differ in injection set must differ in stored state — the cause is always reachable.
- **simulation is meaningful.** A test that passes today will pass tomorrow on the same inputs; flakes signal real bugs.

Determinism is preserved through eleven retrieval stages by sorting on stable composite keys (effective priority, then strength, then array order) and by making every cap and ceiling a fixed integer rather than a learned threshold.

## Preference lifecycle

A preference moves through a small, named state machine:

```
                        ┌─────────────────────┐
                        │  signal arrives     │
                        └──────────┬──────────┘
                                   │
                                   ▼
                          ┌────────────────┐
   create new ◀───── no match ──── │ findExistingPref │ ──── match ─────▶ accumulate signal
   (low conf.)                     └────────────────┘
                                                                         │
                                                                         ▼
                                                              ┌─────────────────────┐
                                                              │ confidence ladder   │
                                                              │  low → medium → high│
                                                              └──────────┬──────────┘
                                                                         │
                                                                         ▼
                                                              ┌─────────────────────┐
                                                              │ stable (injectable  │
                                                              │ at ≥ medium conf.)  │
                                                              └──────────┬──────────┘
                                                                         │
                                       ┌─────────────────────────────────┴─────────────────────────────────┐
                                       │                                                                   │
                                       ▼                                                                   ▼
                            ┌────────────────────┐                                              ┌────────────────────┐
                            │ contradictory      │                                              │ untouched 90+ days │
                            │ signals arrive     │                                              │ (decay)            │
                            └────────┬───────────┘                                              └─────────┬──────────┘
                                     │                                                                    │
                                     ▼                                                                    ▼
                            ┌────────────────────┐                                              ┌────────────────────┐
                            │ reversal logic     │                                              │ strength × 0.70    │
                            │ (noise → reduce →  │                                              │ confidence drops   │
                            │  under_review +    │                                              └─────────┬──────────┘
                            │  shadow record)    │                                                        │
                            └────────┬───────────┘                                                        ▼
                                     │                                                          ┌────────────────────┐
                                     ▼                                                          │ untouched 180+ days│
                            ┌────────────────────┐                                              │ → archived         │
                            │ shadow promoted →  │                                              └────────────────────┘
                            │ original archived  │
                            └────────────────────┘
```

Concretely:

| Field | Meaning |
|---|---|
| `signal_strength` | `[0, 1]`, accumulates with each matching signal, decays with neglect |
| `confidence` | derived from strength: `<0.35` low, `0.35–0.65` medium, `>0.65` high |
| `polarity_status` | `stable` (injectable), `under_review` (in reversal), `archived` (terminal) |
| `polarity` | `positive` (prefer) or `negative` (avoid) |
| `shadow_of` | non-null if this is a shadow record paired with another preference |

A preference must be `polarity_status === "stable"` AND `confidence` ∈ `{medium, high}` AND `signal_strength >= INJECTION_THRESHOLD` to be eligible for injection. This gate is what keeps half-formed signals out of prompts.

## Reversal handling

The most subtle behavior in the subsystem is what happens when a user contradicts themselves. The naive approaches (last-write-wins, instant flip) both produce flicker. The subsystem instead uses a graduated reversal ladder:

| Reversal signals | Effect |
|---|---|
| 1 | **Noise guard.** No change to strength, status, or confidence. One contradictory click is not enough. |
| 2 | Strength × 0.80. Status remains `stable`. |
| 3 | Strength × 0.60. Confidence drops one rung. |
| 4+ | Strength reduced by `weight × multiplier`, confidence forced to `low`, status flips to `under_review`. A **shadow record** of opposite polarity is created. |

A shadow accumulates its own signals. If it reaches medium confidence, it promotes (clears `shadow_of`, becomes a stable record) and the original is archived. This gives genuine preference reversals a clean path while preventing flicker on noise.

The reversal multiplier (1.5× at signal 2, 2.0× at signal 3+) and reduction factors (0.80, 0.60) are heuristic constants chosen during simulation; their precise values are an open tuning question (see [`open-questions.md`](open-questions.md)).

## Shadow records

Shadow records are the answer to: *"What if the user genuinely changed their mind?"*

A shadow:

- is paired with an `under_review` original via `shadow_of: <originalId>`;
- has the **opposite polarity** of the original;
- accumulates signals normally;
- is **not eligible for injection** at low confidence (the lifecycle gate excludes it);
- **promotes to a full record** when it reaches medium or high confidence — at which point the original is archived and the shadow's `shadow_of` is cleared.

Shadows decouple "this preference is contested" from "this is the new preference". Without them, contested preferences would either flicker in the prompt or vanish entirely.

## Balancing philosophy

Raw retrieval — strongest preferences first, capped at N — produces three failure modes simulation surfaced:

1. **Negative dominance.** Users who reject more than they accept produce prompts that are mostly avoidance directives, which is depressing context for a generation model.
2. **Category monopolization.** A user who refines `layout` ten times and `motion` once gets a prompt full of layout, even though motion is also above threshold.
3. **Token-budget overruns.** Long pattern strings can blow the prompt budget if simply concatenated.

The retrieval pipeline addresses each:

- **Polarity diversity ceiling** caps negatives at `NEGATIVE_BUDGET_RATIO` (50%) of the final injection set, with a `MIN_NEG_FLOOR` so rejection-only users still get useful avoidance context.
- **Category diversity quota** caps any one `preference_type` at `MAX_PER_CATEGORY` patterns.
- **Token-budget enforcement** drops preferences at the cut when the running estimate would exceed `TOKEN_BUDGET`.

Each ceiling has a corresponding **backfill stage**: when slots are freed by trimming, they are refilled from the overflow set, preferring under-represented categories. This keeps the prompt full without re-introducing the imbalance the ceiling just removed.

## Observability philosophy

Every stage that drops, suppresses, caps, or backfills emits a structured diagnostic event into the `diagnostics[]` array returned alongside the retrieval result. Each event has:

- a `type` (e.g., `hard_cap_applied`, `diversity_ceiling_applied`)
- structured fields describing the decision (counts, patterns, ratios)
- a human-readable `trace` string suitable for logging

Diagnostics are **not** thrown, logged, or persisted by the engine itself; the host decides what to do with them. The contract is: the engine *describes* every non-trivial decision it made; the host *observes* however it wants.

This is the layer reviewers should look at first when retrieval behavior surprises them. See [`diagnostics.md`](diagnostics.md) for every event type.

## What this subsystem is *not*

- **Not a model.** No embeddings, no learned ranker, no neural anything.
- **Not a recommender.** It does not predict what the user will want; it only relays what the user has signaled.
- **Not async.** Every API call is synchronous JSON file I/O. The host can wrap it in whatever async strategy it wants.
- **Not multi-tenant.** Storage is per `userId`. Cross-user logic is the host's concern.
- **Not a UI.** Display, settings, and "forget this" affordances are the host's concern.
- **Not a service.** It is a library. There is no daemon, no port, no IPC.

These boundaries are the reason the subsystem can be reviewed, simulated, and integrated without dragging in additional complexity. Resist pull to violate them.
