# @open-design/creative-memory-system

Local-first, deterministic preference memory for the Open Design generation pipeline. The subsystem learns a user's stylistic preferences from generation events, stores them as inspectable JSON on disk, and produces a bounded `[MEMORY CONTEXT]` block for prompt injection at generation time.

This package is the TypeScript-ported, workspace-integrated form of the validated `creative-memory-system` prototype. Logic, balancing, and behavior are unchanged from the validated baseline; the simulations have been ported to Vitest under `tests/`.

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
| Simulation-driven | Behavior is validated by 81 Vitest specs across five suites covering 238 invariants in the original sim runners. |

## Non-goals

The subsystem deliberately does **not**:

- use embeddings, vector databases, or learned rankers;
- run an autonomous agent or scheduled job (decay is invoked by the host);
- analyze rendered artifacts, screenshots, or pixel data;
- expose its own UI, settings panel, or API surface beyond the function exports;
- sync to the cloud or share state across machines.

These are explicit non-goals; they should not be added without an architecture review.

## Layout

```
packages/creative-memory-system/
├── src/
│   ├── index.ts              Barrel export — public API
│   ├── preferenceStore.ts    Core engine (CRUD, ingestion, decay, retrieval, prompt build)
│   ├── extractionAdapter.ts  Pipeline event → ingestSignal mapping (stub hookpoints)
│   └── types.ts              Public type definitions
├── tests/
│   ├── lifecycle.test.ts          Lifecycle + storage validation
│   ├── retrievalQuality.test.ts   Ranking, hysteresis, threshold gating
│   ├── retrievalAdvanced.test.ts  Constraint interaction, balancing, backfill
│   ├── retrievalLongRun.test.ts   Multi-session, decay, entropy, stress
│   └── extractionAdapter.test.ts  Adapter handler contracts
├── docs/
│   ├── architecture.md       Subsystem purpose and design philosophy
│   ├── retrieval-pipeline.md The 11 retrieval stages, in order
│   ├── diagnostics.md        Every diagnostic event the engine can emit
│   ├── validation.md         What each simulation suite proves
│   └── open-questions.md     Unresolved integration questions, on purpose
├── package.json
├── tsconfig.json
├── tsconfig.tests.json
├── vitest.config.ts
└── esbuild.config.mjs
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

The package's external API is intentionally minimal. Host pipeline code should only need:

```ts
import {
  retrieveForInjection,
  buildPromptBlock,
  ingestSignal,
  runDecay,
  // adapter handlers for typed pipeline events
  onGenerationAccepted,
  onArtifactEditedAndSaved,
  onExplicitTagApplied,
  onThumbsRated,
  onGenerationAbandoned,
  onRevertAfterEdit,
} from "@open-design/creative-memory-system";

// At generation time:
const retrieved = retrieveForInjection(userId, { project_id });
const memoryBlock = buildPromptBlock(retrieved, project_id);
// Concatenate memoryBlock into the prompt.

// On pipeline events (handlers wrap ingestSignal with the right signal type):
onGenerationAccepted(event);
onArtifactEditedAndSaved(event);
onExplicitTagApplied(event);
onThumbsRated(event);
onGenerationAbandoned(event);
onRevertAfterEdit(event);

// On session start (or as a daily job):
runDecay(userId);
```

Everything else is internal: balancing, ranking, diagnostics, shadow promotion, decay schedule, token estimation. None of it needs to leak.

## Storage

Default storage root is `<package install dir>/memory/`, overridable via the `MEMORY_STORAGE_ROOT` environment variable. The env var is read at call time (not module-load time), so hosts can override it during process startup before issuing a single call. Per user:

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

## Commands

```bash
# Tests (Vitest)
pnpm --filter @open-design/creative-memory-system test

# Type check (src + tests)
pnpm --filter @open-design/creative-memory-system typecheck

# Build dist (esbuild for runtime + tsc emit-decl-only for types)
pnpm --filter @open-design/creative-memory-system build
```

## Current validation state

- **81 / 81 Vitest specs passing** across five test files covering all 238 simulation-suite invariants from the validated prototype.
- Coverage spans: lifecycle (CRUD, ingestion accumulation, confidence ladder), reversal logic (noise guard → graduated reduction → under_review + shadow records → shadow promotion), decay (90-day strength × 0.70, 180-day archive), retrieval quality (ranking monotonicity, hysteresis stability, threshold gating, prompt pollution), constraint interaction (token budget, negative priority multiplier, project-override conflict diagnostics, polarity diversity ceiling + backfill, category diversity ceiling + backfill, MIN_NEG_FLOOR), and long-running temporal scenarios (multi-session evolution, 50-pattern stress, cross-project isolation, polarity entropy, category dominance over many sessions).
- Pressure scenarios run up to 50 distinct patterns and 30 sessions of negative accumulation.

See [`docs/validation.md`](docs/validation.md) for the suite-by-suite breakdown.

## Current maturity level

**Integration-staged.** The subsystem is heavily simulated as a standalone module, but the pipeline hookpoints inside `extractionAdapter.ts` are stubs awaiting confirmation from the generation pipeline team. The minimum viable integration is to wire one or two adapter handlers behind real pipeline events and observe diagnostics in the logs.

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
