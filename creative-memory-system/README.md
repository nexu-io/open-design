# Creative Memory System

Local-first, deterministic preference memory for the Open Design generation pipeline. The subsystem learns a user's stylistic preferences from generation events, stores them as inspectable JSON, and injects a bounded `[MEMORY CONTEXT]` block into prompts at generation time.

This directory is the integration-staged subsystem: the validated production-bound prototype, moved into the Open Design repo for review and integration. Logic, balancing, and simulations are unchanged from the validated baseline; only directory layout, paths, and documentation have been added.

## Goals

- **Persist stylistic intent** across sessions without a model fine-tune, server, or vector index.
- **Stay local-first**: JSON on disk, no embeddings, no cloud sync, no UI of its own.
- **Stay deterministic**: same inputs → same outputs. No probabilistic ranking, no ML.
- **Stay observable**: every retrieval emits diagnostic events explaining what was kept, dropped, capped, suppressed, or backfilled.
- **Stay bounded**: hard caps on injection count, polarity ratio, per-category share, and prompt token budget.
- **Stay integration-safe**: the external surface area is small enough that the rest of the pipeline does not need to know how the memory works.

## Philosophy

| | |
|---|---|
| Local-first | All state lives in `<storage_root>/<userId>/preferences.json`. No daemon, no service. |
| Deterministic | Retrieval is a pure function of stored state plus the request context. |
| Inspectable | Every record, every diagnostic, every weight is human-readable JSON. |
| Bounded | The prompt block is capped on count, polarity ratio, category share, and tokens. |
| Conservative | Reversal logic uses a noise guard; one contradictory signal does not flip a preference. |
| Reversal-aware | Conflicting signals create shadow records that can promote and archive the original. |
| Decay-aware | Untouched preferences fade and eventually archive on a fixed schedule. |
| Simulation-driven | Behavior is validated by 238 assertions across four simulation suites. |

## Non-goals

The subsystem deliberately does **not**:

- use embeddings, vector databases, or learned rankers;
- run an autonomous agent or scheduled job (decay is invoked by the host);
- analyze rendered artifacts, screenshots, or pixel data;
- expose its own UI, settings panel, or API surface beyond the function exports;
- sync to the cloud or share state across machines.

These are explicit non-goals; they should not be added without an architecture review.

## Current architecture

```
creative-memory-system/
├── preferenceStore.js      Core engine (CRUD, ingestion, decay, retrieval, prompt build)
├── extractionAdapter.js    Pipeline event → ingestSignal mapping (stub hookpoints)
├── package.json            Local CommonJS scope; sim run scripts
├── sims/
│   ├── testHarness.js              Lifecycle + storage validation (64 assertions)
│   ├── retrievalQualitySim.js      Ranking, flicker, threshold gating (36 assertions)
│   ├── retrievalAdvancedSim.js     Constraints, balancing, backfill (91 assertions)
│   └── retrievalLongRunSim.js      Multi-session, decay, entropy, stress (47 assertions)
└── docs/
    ├── architecture.md             Subsystem purpose and design philosophy
    ├── retrieval-pipeline.md       The 11 retrieval stages, in order
    ├── diagnostics.md              Every diagnostic event the engine can emit
    ├── validation.md               What each simulation suite proves
    └── open-questions.md           Unresolved integration questions, on purpose
```

## Retrieval pipeline summary

`retrieveForInjection(userId, context)` runs eleven stages in fixed order. The complexity is intentional and entirely internal — callers see one function in, one structured result out.

1. Load + memory-disabled gate
2. Project-override merge (project pattern shadows global)
3. Lifecycle filtering (status, confidence, threshold, type)
4. Effective-priority scoring (negatives weighted by `NEGATIVE_PRIORITY_MULTIPLIER`)
5. Ranking (descending priority)
6. Hard-cap enforcement (`MAX_INJECTION_COUNT`)
7. Polarity diversity ceiling (negatives ≤ ratio of final set; floor for rejection-only users)
8. Polarity backfill (positives from overflow fill freed negative slots)
9. Category diversity ceiling (`MAX_PER_CATEGORY` per `preference_type`)
10. Category backfill (under-represented types promoted from overflow)
11. Token-budget enforcement (`TOKEN_BUDGET`, drop-at-cut)

Each stage emits diagnostics when it fires. See [`docs/retrieval-pipeline.md`](docs/retrieval-pipeline.md) for the full ordering rationale.

## Integration surface

The subsystem's external API is intentionally minimal. Host pipeline code should only need:

```js
const store = require("./creative-memory-system/preferenceStore");
const adapter = require("./creative-memory-system/extractionAdapter");

// At generation time:
const retrieved = store.retrieveForInjection(userId, { project_id });
const memoryBlock = store.buildPromptBlock(retrieved, project_id);
// Concatenate memoryBlock into the prompt.

// On pipeline events:
adapter.onGenerationAccepted(event);
adapter.onArtifactEditedAndSaved(event);
adapter.onExplicitTagApplied(event);
adapter.onThumbsRated(event);
adapter.onGenerationAbandoned(event);
adapter.onRevertAfterEdit(event);

// On session start (or daily):
store.runDecay(userId);
```

Everything else is internal: balancing, ranking, diagnostics, shadow promotion, decay schedule, token estimation. None of it needs to leak.

## Storage

Default storage root is `<creative-memory-system module dir>/memory/`, overridable via the `MEMORY_STORAGE_ROOT` environment variable. Per user:

```
<storage_root>/
└── <userId>/
    └── preferences.json
```

The file is plain JSON, schema-versioned (`schema_version: "1.0"`), and contains:

- `global_preferences[]` — preferences with no project scope
- `project_overrides{<project_id>: prefs[]}` — per-project preferences
- `refinement_log[]` — diff history (provisional shape, see open question #2)
- `memory_enabled` — soft kill switch; when `false`, ingestion no-ops and retrieval returns empty

## How to run the simulations

From the repo root:

```bash
node creative-memory-system/sims/testHarness.js
node creative-memory-system/sims/retrievalQualitySim.js
node creative-memory-system/sims/retrievalAdvancedSim.js
node creative-memory-system/sims/retrievalLongRunSim.js
```

Or, from `creative-memory-system/`:

```bash
node sims/testHarness.js          # 64 assertions
node sims/retrievalQualitySim.js  # 36 assertions
node sims/retrievalAdvancedSim.js # 91 assertions
node sims/retrievalLongRunSim.js  # 47 assertions
```

Each sim writes to its own scratch directory (`creative-memory-system/.test-*`) and removes it on success. These directories are gitignored.

The `extractionAdapter.js` self-test runs when invoked directly:

```bash
node creative-memory-system/extractionAdapter.js  # 12 assertions
```

## Current validation state

- **238 / 238 assertions passing** across the four simulation suites.
- Simulations cover lifecycle, decay, reversal, shadow promotion, ranking monotonicity, hysteresis stability, flicker detection, prompt pollution, threshold gating, project-override conflict diagnostics, hard cap, polarity ceiling + backfill, category ceiling + backfill, token budget, MIN_NEG_FLOOR, multi-session evolution, decay-under-load, cross-project isolation, polarity entropy, and category dominance.
- Pressure scenarios run up to 50 distinct patterns and 30 sessions of negative accumulation.

See [`docs/validation.md`](docs/validation.md) for the suite-by-suite breakdown.

## Current maturity level

**Integration-staged.** The subsystem is heavily simulated and pressure-tested as a standalone module, but the pipeline hookpoints inside `extractionAdapter.js` are stubs awaiting confirmation from the generation pipeline team. The minimum viable integration is to wire one or two adapter handlers behind real pipeline events and observe diagnostics in the logs.

The subsystem's design has stabilized; the open work is integration plumbing and a small set of timing/shape questions documented in [`docs/open-questions.md`](docs/open-questions.md).

## Open questions

These are deliberately unresolved at this stage and tracked in [`docs/open-questions.md`](docs/open-questions.md):

- exact pipeline event shapes (when does `generation_accepted` fire?)
- edit / save / revert lifecycle timing
- refinement diff structure
- the precise adapter attachment point inside the generation pipeline
- whether `extractionAdapter.classifyArtifact` should ever derive signals itself

Do not hardcode assumptions for these until the pipeline team confirms the contracts.

## Future risks (do not solve yet)

The current architectural risk is no longer instability — it is **stagnation through over-stabilization**. Possible long-tail concerns to monitor once integrated:

- retrieval entropy collapse
- repeated top-N dominance
- category monopolization
- excessive avoidance saturation
- stylistic exploration decay
- prompt homogenization

These are flagged so future maintainers know what to look for; they are not action items now.

## File-extension note for reviewers

The subsystem is `.js` (CommonJS) because that is the form in which it was validated. The repo is otherwise TypeScript-first. A future task may port the module to TypeScript without changing logic; until then, `creative-memory-system/package.json` declares `"type": "commonjs"` so the module ignores the root's `"type": "module"`. This decision is tracked as an explicit open question in [`docs/open-questions.md`](docs/open-questions.md).
