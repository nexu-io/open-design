# Retrieval pipeline

`retrieveForInjection(userId, context)` is the only function callers need. Internally it runs eleven stages in a fixed order. The order is load-bearing — re-ordering or merging stages is the most common way to silently break the subsystem's invariants. This document explains each stage and *why it has to be where it is*.

The full implementation lives in `preferenceStore.js → retrieveForInjection`.

## The eleven stages

```
load + memory-disabled gate
        │
        ▼
project-override merge ─────────────► [diagnostic: project_override_suppression]
        │
        ▼
lifecycle filter
(threshold, status, confidence, type)
        │
        ▼
effective-priority scoring
(negatives × NEGATIVE_PRIORITY_MULTIPLIER)
        │
        ▼
ranking
(descending priority)
        │
        ▼
hard-cap enforcement ────────────────► [diagnostic: hard_cap_applied]
(MAX_INJECTION_COUNT)
        │
        ▼
polarity diversity ceiling ──────────► [diagnostic: diversity_ceiling_applied]
(neg ≤ ratio × pos, with MIN_NEG_FLOOR)
        │
        ▼
polarity backfill ───────────────────► [diagnostic: diversity_backfill]
(positive overflow promoted)
        │
        ▼
category diversity ceiling ──────────► [diagnostic: category_ceiling_applied]
(at most MAX_PER_CATEGORY per type)
        │
        ▼
category backfill ───────────────────► [diagnostic: category_backfill]
(under-represented types promoted)
        │
        ▼
token-budget enforcement ────────────► [diagnostic: token_budget_exceeded]
(TOKEN_BUDGET, drop-at-cut)
        │
        ▼
final result
{ positives, negatives, projectOverrides, diagnostics }
```

---

### 1. Load + memory-disabled gate

```js
const data = loadFile(userId);
if (!data || !data.memory_enabled) return { ...empty };
```

If the user has never written, or has flipped `memory_enabled` to `false`, retrieval returns empty immediately. This is the **soft kill switch**: a host can disable memory injection for a user without touching the file structure.

### 2. Project-override merge

If `context.project_id` matches a key under `project_overrides`, project preferences shadow global preferences with the same `pattern`. Each suppressed global emits a `project_override_suppression` diagnostic with the suppressing override's polarity and strength.

**Why first.** Override resolution must happen *before* threshold filtering. Otherwise a project override that contradicts a global preference would compete with it on strength alone, and reviewers reading diagnostics would see the global "win" even though the project should have shadowed it.

### 3. Lifecycle filter

Four predicates, applied in sequence:

- `signal_strength >= INJECTION_THRESHOLD` (currently `0.40`)
- `polarity_status === "stable"` (excludes `under_review` and `archived`)
- `confidence === "medium" || "high"` (excludes `low`)
- if `context.preference_types` is provided, the record's `preference_type` must start with one of them

**Why this order.** Strength is the cheapest predicate, so it runs first. Status filtering removes records in reversal (`under_review`) and decayed records (`archived`). The confidence gate is what keeps low-strength shadows out of the prompt. Type filtering is last because it's the only optional predicate.

### 4. Effective-priority scoring

```js
p._effective_priority = p.signal_strength *
  (p.polarity === "negative" ? NEGATIVE_PRIORITY_MULTIPLIER : 1.0);
```

Negatives are multiplied by `NEGATIVE_PRIORITY_MULTIPLIER` (currently `1.2`). The reasoning: avoidance signals are typically more specific than preference signals, and the cost of generating something the user explicitly disliked is higher than the cost of failing to surface a mild preference. The multiplier biases ranking toward negatives at equal strength.

This field is internal — it is deleted before the result is returned to the caller.

### 5. Ranking

Stable sort by `_effective_priority` descending. Ties are broken by array order, which is itself stable across calls because preferences are appended (not reordered) on ingestion.

**Why before any cap.** Ranking establishes the global priority order. All downstream stages preserve relative priority within their inputs.

### 6. Hard-cap enforcement

```js
if (prefs.length > MAX_INJECTION_COUNT) { /* slice + diagnostic */ }
```

`MAX_INJECTION_COUNT` is currently `20`. Anything beyond is moved to `overflowPrefs` (kept around for backfill stages, *not* discarded yet).

**Why before diversity stages.** The ceilings operate on the *final injection set*; they need a bounded input. Without the hard cap, the ceiling math at scale becomes pathological.

### 7. Polarity diversity ceiling

The ceiling math:

```
keepNegs ≤ floor(R / (1-R) × finalPos)
```

with `R = NEGATIVE_BUDGET_RATIO = 0.50`. At R = 0.50 this simplifies to `negatives ≤ positives`.

The implementation iteratively solves for `keepNegs`: it tries `n = currentNegs.length` and decreases until the constraint holds, accounting for backfill from `positiveOverflow` to compute the actual `finalPos`. This is necessary because trimming negatives may free slots that get filled with positives, which then changes the ratio.

`MIN_NEG_FLOOR` (currently `2`) is the floor: rejection-only users — those with no positive signals yet — must still get *some* avoidance context. Without the floor, early users would see entirely empty memory blocks.

Trimmed negatives are the *weakest* (lowest `_effective_priority`); strongest negatives survive.

### 8. Polarity backfill

Slots freed by the polarity ceiling are filled with the strongest positives from `overflowPrefs`. The result is re-sorted by priority. A `diversity_backfill` diagnostic records the patterns promoted.

**Why explicitly separate.** Conceptually the ceiling and backfill could be one stage, but separating them means each emits its own diagnostic and reviewers can see exactly what was trimmed and what replaced it.

### 9. Category diversity ceiling

For each `preference_type` with more than `MAX_PER_CATEGORY` entries (currently `3`), trim the weakest entries within that category (lowest `_effective_priority`). Activates only when **2+ distinct categories** exist across `prefs ∪ overflowPrefs` — a single-category profile is left alone.

The "across prefs and overflow" check matters: when the hard cap displaces all minority-category records into overflow, the ceiling must still fire so backfill can rescue them. This was a real bug surfaced in advanced sim ADV-23.

### 10. Category backfill

Fill freed slots from `overflowPrefs`, **prioritizing under-represented categories** — types that are below `MAX_PER_CATEGORY` in the current set, or absent from it entirely. Re-sort by priority. Emit `category_backfill`.

### 11. Token-budget enforcement

A running estimate of `[MEMORY CONTEXT]` token cost. Each preference contributes:

```
ceil(pattern.length / CHARS_PER_TOKEN) + lineOverhead
```

with `CHARS_PER_TOKEN = 4`, `lineOverhead = 5`, and a header overhead of `20`. When adding the next preference would exceed `TOKEN_BUDGET` (currently `200`), it is dropped and `token_budget_exceeded` is emitted; the loop continues so smaller subsequent preferences can still fit.

**Why last.** Token budgeting is content-shape-dependent (long patterns cost more); applying it before balancing would mean balanced sets could be cut by raw character length and produce skewed final prompts.

---

## Output shape

```js
{
  positives:        Pref[],   // sorted by signal_strength desc
  negatives:        Pref[],   // sorted by signal_strength desc
  projectOverrides: Pref[],   // raw override records, unfiltered by ceilings
  diagnostics:      Diag[],   // every non-trivial decision the engine made
}
```

The `_effective_priority` field is stripped from records before the result is returned. `projectOverrides` is provided for the prompt builder so it can emit a "Project override active (<id>)" line; it is *not* a re-injection of the same records.

## Prompt block format

`buildPromptBlock(retrieved, projectId)` produces:

```
[MEMORY CONTEXT]
Prefer (high):    pattern1 · pattern2
Prefer (medium):  pattern3 · pattern4
Avoid (high):     pattern5
Avoid (medium):   pattern6
Project override: pattern7, pattern8 active (proj_xyz)
```

Sections are omitted when empty. The format is intentionally compact and human-readable — easier to skim in logs and easier for a model to parse than nested JSON.

## Why ordering matters

A few invariants that depend on the exact sequencing:

| Invariant | Stage that establishes it |
|---|---|
| Project overrides shadow globals before threshold filtering | 2 before 3 |
| Negatives are not over-suppressed by ceilings before they get the priority bonus | 4 before 7 |
| Hard cap bounds the input to balancing | 6 before 7 / 9 |
| Backfill draws from the same overflow pool that the cap created | 6 before 8 / 10 |
| Token budget runs against the final balanced set | 11 last |

If you find yourself wanting to merge or reorder stages, run all four sim suites first — they are calibrated against this exact sequence.
