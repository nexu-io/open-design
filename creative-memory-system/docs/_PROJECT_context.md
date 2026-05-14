# Creative Memory System — Complete Project Reference

## What This Is

A **persistent creative preference memory** subsystem for Open Design. It remembers what users consistently like, what they consistently reject, how their taste evolves, what should be reinforced, and what should be avoided — across sessions and projects.

The system sits between the generation pipeline and the prompt builder. When Open Design generates an artifact for a user, it retrieves that user's accumulated taste profile and injects it as a `[MEMORY CONTEXT]` block into the generation prompt, biasing output toward learned preferences and away from known rejections.

## What This Is NOT

| Not this | Why not |
|---|---|
| AI agent system | No autonomous decision-making. Retrieval is deterministic. |
| Autonomous design generation | The system informs generation, it doesn't generate. |
| Embeddings infrastructure | No vectors. Preferences are named patterns (strings). |
| Vector memory | No similarity search. Exact pattern matching only. |
| Cloud personalization | Local-first. JSON files on disk. |
| ML ranking | Ranking is algebraic (weighted sums), not learned. |
| Screenshot analysis | No visual input. Signals come from user actions. |
| Aesthetic embeddings | No latent taste spaces. Preferences are explicit. |
| Black-box preference learning | Everything is human-readable JSON. |
| Hidden ranking system | All ranking logic is inspectable, all constants are named. |

## Core Philosophy

The subsystem focuses on:

- **Taste memory** — what patterns a user prefers/avoids
- **Iteration learning** — how preferences evolve through accept/reject/edit cycles
- **Retrieval quality** — delivering the right preferences to the prompt, in the right order, at the right density
- **Explainable personalization** — every decision traceable through diagnostics

Design constraints (non-negotiable):

- **Lightweight** — no dependencies beyond Node.js `fs`/`path`
- **Deterministic** — same input → same output, always
- **Inspectable** — open the JSON file, read the preferences
- **Local-first** — `~/memory/{userId}/preferences.json`
- **Retrieval-focused** — optimized for prompt injection quality, not storage scale
- **Integration-safe** — one function entry point (`retrieveForInjection`), all complexity encapsulated
- **Simulation-driven** — every behavior validated by deterministic test scenarios before integration

---

## Origin Story

### Session 1: Foundation (Conversation `eb898482`)

The project started with three files already authored outside this environment:
- `preferenceStore.js` — CRUD storage, signal ingestion, reversal handling, shadow records, decay, retrieval, prompt block generation
- `testHarness.js` — 18-section unit tests (64 assertions)
- `extractionAdapter.js` — event handler stubs mapping pipeline events to signals

These were copied from `~/Downloads` into a scratch workspace. The first task was building **retrieval quality instrumentation**: two simulation suites that exercise the retrieval pipeline under realistic and adversarial conditions.

**Created:**
- `retrievalQualitySim.js` — 12 core scenarios + `RetrievalMetrics` engine (36 assertions)
- `retrievalLongRunSim.js` — 10 extended scenarios: multi-session accumulation, decay-under-load, reversal during retrieval, shadow promotion, stress testing (24 assertions)

**Result:** 124/124 passing (64 + 36 + 24).

A developer review then requested three features:
1. **Token-budget ceiling** (200 est. tokens) — prompt injection bounded by token impact, not just pattern count
2. **Negative priority multiplier** (1.2×) — avoidance signals biased to survive budget cuts
3. **Conflict diagnostics** — human-readable suppression traces for project overrides

All three implemented and validated. `retrievalAdvancedSim.js` created with 11 scenarios (34 assertions).

**Result:** 158/158 passing. All files moved to `C:\Users\vedan\Desktop\Memory`.

### Session 2: Diversity Ceiling (Conversation `a99df7a9`, first half)

User request: implement **retrieval diversity balancing** — a soft polarity ceiling preventing dense negative profiles from dominating injection context.

**Implemented:** Algebraic ceiling formula `maxNeg = floor(R/(1-R) × totalPos)` at `R = 0.50`. Negatives cannot outnumber positives. Runs after hard-cap, before token budget. Trims weakest negatives first, backfills freed slots with positive overflow.

Added 9 advanced scenarios (ADV-12 through ADV-20) and 4 long-run scenarios (LR-11 through LR-14).

**Result:** 207/207 passing.

### Session 3: Hardening (Conversation `a99df7a9`, second half — current)

Developer review identified three refinements:

1. **`MIN_NEG_FLOOR = 2`** — the algebraic formula collapses to 0 when `totalPos = 0`. Rejection-only users (new users who only logged what they dislike) got zero injection. Floor guarantees at least 2 avoidance signals.

2. **`MAX_PER_CATEGORY = 3`** — soft per-`preference_type` quota. Prevents category stagnation (e.g., layout + typography dominating while motion signals exist but never reach the prompt). Only fires when 2+ distinct categories exist across prefs + overflow.

3. **Polarity entropy metric** — binary entropy `H = -p·log₂(p) - (1-p)·log₂(1-p)` tracking whether retrieval drifts toward avoid-dominated or prefer-saturated states over time.

During implementation, discovered the algebraic formula breaks under stage interaction: when hard-cap displaces all positives into overflow, the formula's `totalPositives` input no longer reflects actual backfillable count. **Replaced with an iterative solver** that verifies slot availability before committing.

Added 6 advanced scenarios (ADV-21 through ADV-26) and 2 long-run scenarios (LR-15, LR-16).

**Result:** 238/238 passing. Zero regressions.

---

## File Inventory

| File | Lines | Purpose |
|---|---|---|
| `preferenceStore.js` | 918 | Core engine: CRUD, signals, decay, retrieval pipeline, prompt builder |
| `testHarness.js` | 689 | Unit tests: 18 sections, 64 assertions |
| `extractionAdapter.js` | 479 | Event handler stubs: 6 pipeline event → signal mappings + 14-assertion self-test |
| `retrievalQualitySim.js` | ~620 | Core retrieval sim: 12 scenarios, 36 assertions, `RetrievalMetrics` engine |
| `retrievalAdvancedSim.js` | 1332 | Advanced sim: 26 scenarios, 91 assertions |
| `retrievalLongRunSim.js` | ~1000 | Long-run sim: 16 scenarios, 47 assertions |

**Total: 238 assertions across 4 suites + 14 adapter assertions = 252 validated behaviors.**

---

## Architecture

### Data Model

Each user gets `memory/{userId}/preferences.json`:

```json
{
  "schema_version": "1.0",
  "user_id": "usr_001",
  "memory_enabled": true,
  "global_preferences": [/* preference records */],
  "project_overrides": { "proj_id": [/* preference records */] },
  "refinement_log": [/* diff entries */],
  "last_updated": "2026-05-14T..."
}
```

A **preference record**:

```json
{
  "id": "pref_abc123",
  "preference_type": "layout_density",
  "pattern": "airy_spacing",
  "polarity": "positive",
  "signal_strength": 0.75,
  "confidence": "high",
  "sources": ["explicit_tag", "repeated_acceptance"],
  "accept_count": 5,
  "reject_count": 0,
  "explicit_tags": ["Save this direction"],
  "last_seen": "2026-05-14T...",
  "decay_at": "2026-08-12T...",
  "scope": "global",
  "reversal_signals": 0,
  "reversal_first_seen": null,
  "polarity_status": "stable",
  "shadow_of": null
}
```

### Signal Weights

| Signal Type | Weight | Description |
|---|---|---|
| `explicit_tag` | +0.30 | User applies inline tag ("Save this direction", "Too noisy") |
| `revert_after_edit` | +0.25 | User edits then reverts to original |
| `manual_refinement` | +0.20 | User edits and saves modified version |
| `repeated_acceptance` | +0.15 | User accepts generation without editing |
| `thumbs_up` | +0.10 | Thumbs up rating |
| `thumbs_down` | -0.10 | Thumbs down rating |
| `single_rejection` | -0.10 | Single rejection event |
| `abandoned_generation` | -0.02 | User views then abandons |

Formula: `signal_strength += |weight| / NORMALIZER`, clamped `[0, 1]`.

### Reversal Handling

When contradictory signals arrive (positive signal on a negative preference or vice versa):

| Reversal count | Effect |
|---|---|
| 1 | Noise guard — no change |
| 2 | Strength × 0.80, confidence held |
| 3 | Strength × 0.60, confidence dropped one level |
| 4+ | Direct penalty, confidence → low, status → `under_review`, shadow record created with opposite polarity |

Shadow records are "candidate" preferences with the flipped polarity. When a shadow reaches `medium` confidence, it promotes to a full record and the original is archived.

### Decay

- **90 days** since last signal → strength × 0.70, confidence dropped
- **180 days** → archived (excluded from retrieval)

### Retrieval Pipeline (11 stages)

```
 1. Lifecycle filtering    — stable-only, confidence ≥ medium, strength ≥ 0.40
 2. Project override merge — project prefs shadow globals on same pattern
 3. Conflict diagnostics   — trace which globals were suppressed
 4. Preference type filter — optional category scoping
 5. Effective priority     — strength × polarity_multiplier (1.2× for negatives)
 6. Ranking sort           — descending by effective priority
 7. Hard-cap enforcement   — MAX_INJECTION_COUNT = 20
 8. Polarity diversity     — iterative solver, NEGATIVE_BUDGET_RATIO = 0.50, MIN_NEG_FLOOR = 2
 9. Category diversity     — MAX_PER_CATEGORY = 3 (only with 2+ distinct types)
10. Token-budget           — TOKEN_BUDGET = 200, CHARS_PER_TOKEN = 4
11. Prompt block assembly  — [MEMORY CONTEXT] with Prefer/Avoid lines
```

### Prompt Block Output

```
[MEMORY CONTEXT]
Prefer (high):    airy_spacing · warm_palette
Prefer (medium):  serif_headlines
Avoid (high):     crowded_layout
Avoid (medium):   heavy_animation
Project override: dense_grid active (proj_fintech_01)
```

### Extraction Adapter (Integration Interface)

Six event handlers mapping pipeline events to signals:

| Handler | Signal Type | Polarity |
|---|---|---|
| `onGenerationAccepted(event)` | `repeated_acceptance` | positive |
| `onArtifactEditedAndSaved(event)` | `manual_refinement` | positive |
| `onExplicitTagApplied(event)` | `explicit_tag` | from `TAG_POLARITY` map |
| `onThumbsRated(event)` | `thumbs_up`/`thumbs_down` | from rating |
| `onGenerationAbandoned(event)` | `abandoned_generation` | negative |
| `onRevertAfterEdit(event)` | `revert_after_edit` | positive |

Each handler calls `classifyArtifact(event.artifact_meta)` → gets `[{preference_type, pattern}]` → calls `store.ingestSignal()` for each.

### Constants Reference

| Constant | Value | Purpose |
|---|---|---|
| `NORMALIZER` | 2.0 | Divides raw signal weight for strength accumulation |
| `DECAY_DAYS` | 90 | Days before strength decay triggers |
| `ARCHIVE_DAYS` | 180 | Days before preference is archived |
| `INJECTION_THRESHOLD` | 0.40 | Minimum strength for retrieval eligibility |
| `TOKEN_BUDGET` | 200 | Estimated token ceiling for prompt block |
| `MAX_INJECTION_COUNT` | 20 | Hard cap on injected preferences |
| `NEGATIVE_PRIORITY_MULTIPLIER` | 1.2 | Avoidance bias in ranking |
| `NEGATIVE_BUDGET_RATIO` | 0.50 | Max fraction of negatives in injection set |
| `MIN_NEG_FLOOR` | 2 | Minimum negatives surviving polarity ceiling |
| `MAX_PER_CATEGORY` | 3 | Max patterns per preference_type (multi-category only) |
| `CHARS_PER_TOKEN` | 4 | Rough chars-per-token estimate |

### RetrievalMetrics Engine

Located in `retrievalQualitySim.js`. Captures per-retrieval snapshots:

| Field | Description |
|---|---|
| `injection_density` | Number of patterns injected |
| `avg_strength` / `min` / `max` | Strength distribution |
| `conflict_rate` | Same pattern appearing with both polarities |
| `high_confidence_ratio` | Fraction of high-confidence injections |
| `polarity_entropy` | Binary entropy of positive/negative ratio (0→1) |
| `category_distribution` | Count per preference_type |
| `max_category_share` | Largest category's fraction of total |

Aggregation methods: `flickerScore()`, `rankingQuality()`, `polarityEntropy()` (with trend detection: `stable`/`diversifying`/`polarizing`).

### Diagnostic Types

| Diagnostic | When Emitted |
|---|---|
| `project_override_suppression` | Global preference suppressed by project override |
| `hard_cap_applied` | Total eligible exceeded MAX_INJECTION_COUNT |
| `token_budget_exceeded` | Pattern dropped due to token budget |
| `diversity_ceiling_applied` | Negatives trimmed by polarity ratio |
| `diversity_backfill` | Positives promoted from overflow after trimming |
| `category_ceiling_applied` | Category exceeded MAX_PER_CATEGORY |
| `category_backfill` | Under-represented categories promoted from overflow |

---

## Integration Surface

**For the pipeline team, the integration contract is exactly two calls:**

```javascript
// At generation time: retrieve preferences for prompt injection
const retrieved = store.retrieveForInjection(userId, {
  project_id: "proj_abc",           // optional
  preference_types: ["layout"],     // optional filter
});
const block = store.buildPromptBlock(retrieved, "proj_abc");
// → Inject `block` into generation prompt

// When user acts on a generation: fire the appropriate adapter handler
adapter.onGenerationAccepted({
  user_id, artifact_id, session_id, project_id, timestamp,
  artifact_meta: { signals: [{ preference_type, pattern }] }
});
```

Everything else — the 11-stage pipeline, diversity ceilings, decay, reversals, shadow records — is internal. The pipeline team doesn't need to understand it to integrate.

---

## Open Questions (For Pipeline Team Review)

These are the unresolved design decisions that require pipeline team input before full integration:

### OQ-1: Extraction Trigger Event Shape
The `onGenerationAccepted(event)` handler expects `event.artifact_meta.signals` to be `[{preference_type, pattern}]`. **Who populates this?** The generation pipeline needs to attach metadata about what design patterns were used in the artifact. The current `classifyArtifact()` is a passthrough stub. Options:
- Pipeline attaches metadata at generation time (preferred — cheapest)
- Post-generation classifier extracts patterns from rendered output (Phase 2)
- Manual annotation by the user (too expensive)

### OQ-2: Refinement Diff Shape
`logRefinement()` accepts `{ from: {key: val}, to: {key: val} }` but this is provisional. What does a real edit diff look like from the pipeline's perspective? Is it a CSS property diff? A layout structure diff? Component-level diff?

### OQ-3: Normalizer Value
`NORMALIZER = 2.0` was chosen so that the strongest signal (`explicit_tag` at 0.30) starts a new preference at `0.15` strength. Is this the right initial strength? Too aggressive (users see effects too fast) or too conservative (takes too many signals to matter)?

### OQ-4: Injection Format
The prompt block uses `Prefer (high): pattern1 · pattern2` format. Is this compatible with the generation model's expected prompt structure? Does the model need structured JSON instead? Does the prompt template already have a `[MEMORY CONTEXT]` slot?

### OQ-5: Reversal Multiplier Values
The reversal thresholds (1.0× / 1.5× / 2.0× at 1/2/3 reversals) were chosen for conservative noise-guarding. Are these appropriate for the expected signal frequency? If users rarely contradict themselves, the noise guard at 1 reversal may be too permissive; if they frequently change preferences, it may be too aggressive.

### OQ-6: Abandon Detection
`onGenerationAbandoned` requires the pipeline to distinguish "viewed and abandoned" from "viewed and not yet decided." The adapter suggests a timeout-based approach (30s inactivity = abandon) or explicit discard action. Which does the pipeline support?

---

## What Has Been Validated (238 Assertions)

### testHarness.js (64 assertions)
- CRUD operations (create, read, update, delete)
- Signal ingestion and weighted accumulation
- Reversal progression (1→2→3→4+ signals)
- Shadow record creation and promotion
- Simultaneous decay + reversal
- Signal saturation ceiling (strength capped at 1.0)
- Project override conflicts
- Injection filtering (threshold, confidence, status gates)
- Reinjection stability after mutation
- Memory enable/disable toggle

### retrievalQualitySim.js (36 assertions)
- Empty profile → zero injection
- Sub-threshold exclusion
- Threshold crossing → injection entry
- Top-N ranking monotonicity
- Signal saturation ceiling behavior
- Hysteresis stability (10 consecutive retrievals, zero flicker)
- Boundary flicker detection
- Prompt pollution prevention (under_review/archived excluded)
- Project override shadowing
- Prompt block budget analysis
- Sparse user (1 preference, clean retrieval)
- Dense user (15+ preferences, ranking stability)

### retrievalAdvancedSim.js (91 assertions)
- Token budget trimming under pressure
- Long pattern names consume more budget
- Header overhead accounting
- Negative priority: avoidance survives over equal-strength positive
- Negative priority: under budget pressure, negatives survive, positives trimmed
- Strong positive still beats weak negative (no blind bias)
- Conflict diagnostics: suppression trace content and format
- No false suppression without project context
- Multiple patterns suppressed simultaneously
- Hard cap diagnostic trace content
- Combined cap + budget + suppression in one retrieval
- Diversity ceiling: dense negative profile capped to 50%
- Diversity ceiling: sparse mixed profile passes untouched
- Diversity + token budget interaction
- Diversity + negative multiplier interaction
- Backfill restores positives from overflow
- Single negative survives (floor protection)
- All-negative profile handled gracefully
- Prompt composition: negatives don't consume >80% of tokens
- 30-session stability: ratio bounded despite negative accumulation
- MIN_NEG_FLOOR: rejection-only user gets avoidance context
- MIN_NEG_FLOOR: floor value correctness
- Category ceiling: multi-category trimmed to max/type
- Category ceiling: single-category untouched
- Category ceiling: backfill from under-represented types
- Combined category + polarity diversity under dual pressure

### retrievalLongRunSim.js (47 assertions)
- 20-session accumulation with consistent ranking
- Decay under load (active survives, stale decays)
- Reversal during active use
- Shadow promotion to full record
- Mixed signal weight ranking
- Preference type filtering
- 50-pattern stress test (hard cap, ranking, uniqueness)
- Cross-project isolation
- Confidence gate enforcement
- Temporal evolution (strengthen then decay)
- 25-session negative accumulation stays bounded
- Cross-project diversity independence
- Diversity under decay
- 40-pattern triple constraint stress (cap + diversity + budget)
- Polarity entropy: balanced profile maintains H ≥ 0.5 over 20 sessions
- Category diversity: 5 types over 15 sessions, no type dominates

---

## Next Steps — Roadmap to Integration

### Phase 1: Draft PR (Current — Ready)

**Status:** The storage and retrieval pipeline is stable and production-ready. All behaviors are validated. The extraction adapter interface is defined.

**PR shape:**
1. Open questions table as the first section (focuses reviewer attention)
2. Integration surface documentation (one function, all complexity encapsulated)
3. Extraction adapter stubs included for pipeline team reaction
4. All 6 files included
5. No wiring to pipeline internals — this PR is the subsystem boundary

### Phase 2: Pipeline Wiring

**Depends on:** Pipeline team answers to OQ-1 (event shape) and OQ-6 (abandon detection).

- Wire `onGenerationAccepted` to actual accept events in the generation UI
- Wire `onExplicitTagApplied` to inline feedback UI
- Wire `onThumbsRated` to thumbs up/down buttons
- Wire `retrieveForInjection` + `buildPromptBlock` into prompt assembly
- Schedule `runDecay` on session start or daily cron

### Phase 3: Classifier

**Depends on:** OQ-1 resolution (who extracts patterns from artifacts).

The `classifyArtifact()` function is currently a passthrough. In production, someone needs to populate `artifact_meta.signals` — the `[{preference_type, pattern}]` array that tells the memory system what design patterns exist in a given artifact.

Options by complexity:
1. **Pipeline metadata** — generation pipeline tags artifacts at creation time with the patterns it used (cheapest, most accurate)
2. **Heuristic classifier** — rule-based extraction from CSS/component structure
3. **Lightweight ML classifier** — trained on labeled artifacts (Phase 3+)

### Phase 4: Refinement Diff Integration

**Depends on:** OQ-2 resolution (diff shape).

`logRefinement()` currently accepts arbitrary diffs. Once the pipeline team defines what an edit diff looks like, the refinement log becomes useful for understanding *how* users modify generated output, not just *whether* they accept it.

### Phase 5: Observability Dashboard (Optional)

`RetrievalMetrics` already captures everything needed:
- Injection density over time
- Polarity entropy trend (are we drifting toward avoid-dominated prompts?)
- Category distribution (is one preference type dominating?)
- Flicker score (is the retrieval set unstable?)

A lightweight dashboard visualizing these metrics per-user would let the team monitor memory health in production.

---

## Constraints and Boundaries

### Hard Constraints
- **No external dependencies** — only Node.js `fs`/`path`
- **JSON storage** — human-readable files, no database
- **Deterministic** — no randomness in retrieval (ranking is algebraic)
- **No network calls** — everything local
- **No ML in the retrieval path** — ranking is weighted sums, not learned models

### Soft Constraints (Design Choices, Could Be Revisited)
- `NORMALIZER = 2.0` — controls initial strength from a single signal
- `INJECTION_THRESHOLD = 0.40` — minimum strength for retrieval eligibility
- `TOKEN_BUDGET = 200` — estimated, not measured (no actual tokenizer)
- `CHARS_PER_TOKEN = 4` — rough estimate, varies by model
- `MAX_PER_CATEGORY = 3` — could be tuned per deployment context
- `MIN_NEG_FLOOR = 2` — could be 1 or 3 depending on UX preference

### Known Limitations
- **No real tokenizer** — token budget uses `chars / 4` estimate. A production deployment should use the actual model tokenizer.
- **No persistence guarantees** — `fs.writeFileSync` is not atomic. Concurrent writes from multiple processes could corrupt JSON. Production needs either file locking or a proper store.
- **No migration path** — `schema_version: "1.0"` exists but no migration logic. Schema changes require manual handling.
- **No user-facing UI** — users can't see their preference profile or manually edit it (except by reading the JSON file).
- **No bulk operations** — decay runs per-user. At scale, need a batch job.
- **Pattern vocabulary is open** — any string can be a pattern. No controlled vocabulary means potential near-duplicates (`airy_layout` vs `airy_spacing`).

---

## Test Counts Over Time

| Milestone | testHarness | qualitySim | advancedSim | longRunSim | Total |
|---|---|---|---|---|---|
| Baseline (pre-simulator) | 64 | — | — | — | 64 |
| + Retrieval sims | 64 | 36 | — | 24 | 124 |
| + Token budget / neg priority / diagnostics | 64 | 36 | 34 | 24 | 158 |
| + Diversity ceiling | 64 | 36 | 67 | 40 | 207 |
| + MIN_NEG_FLOOR / category quota / entropy | 64 | 36 | 91 | 47 | **238** |
