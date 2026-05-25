# Diagnostics

`retrieveForInjection` returns a `diagnostics` array describing every non-trivial decision the engine made during retrieval. The engine never logs, throws, or persists these itself; the host is free to forward them to a logger, ignore them, or aggregate them for observability.

This document is the canonical reference for what each diagnostic event means and when it fires.

## Event shape

Every diagnostic has the same envelope:

```js
{
  type:  string,   // event type identifier (see below)
  ...:   ...,      // structured fields specific to the event
  trace: string,   // human-readable single-line summary
}
```

The `trace` is suitable for a single log line. The structured fields are suitable for metric aggregation.

## Event types

### `project_override_suppression`

A global preference was hidden by a project preference with the same `pattern`. Emitted once per suppressed global.

```js
{
  type:                 "project_override_suppression",
  suppressed_pattern:   string,
  suppressed_polarity:  "positive" | "negative",
  suppressed_strength:  number,
  override_polarity:    "positive" | "negative" | "unknown",
  override_strength:    number,
  project_id:           string,
  trace:                string,
}
```

**When it fires.** During stage 2 (project-override merge) of retrieval.

**What it means.** A project-scoped preference is in effect for this generation, shadowing the user's global preference. Reviewers should see this when investigating "why did my global preference not appear in the prompt?"

### `hard_cap_applied`

The eligible preference set exceeded `MAX_INJECTION_COUNT` and was trimmed.

```js
{
  type:           "hard_cap_applied",
  total_eligible: number,
  cap:            number,   // MAX_INJECTION_COUNT
  dropped:        number,   // total_eligible - cap
  trace:          string,
}
```

**When it fires.** During stage 6 (hard-cap enforcement). Note that the trimmed records are kept in an `overflowPrefs` pool and may be promoted back in by the polarity or category backfill stages.

**What it means.** The user has more strong, stable preferences than the injection budget allows. Some will not be in the prompt.

### `diversity_ceiling_applied`

The polarity diversity ceiling trimmed negatives because they would have exceeded `NEGATIVE_BUDGET_RATIO` of the final injection set.

```js
{
  type:                  "diversity_ceiling_applied",
  negative_count_before: number,
  negative_count_after:  number,
  max_negative_slots:    number,
  ratio:                 number,        // NEGATIVE_BUDGET_RATIO
  trimmed_patterns:      string[],
  trace:                 string,
}
```

**When it fires.** During stage 7 (polarity diversity ceiling).

**What it means.** The user has a dense negative profile; the engine trimmed weakest negatives to keep the prompt from becoming an avoidance-only directive list.

### `diversity_backfill`

After the polarity ceiling trimmed negatives, freed slots were filled by positives promoted from the hard-cap overflow.

```js
{
  type:                "diversity_backfill",
  backfilled_count:    number,
  backfilled_patterns: string[],
  trace:               string,
}
```

**When it fires.** During stage 8 (polarity backfill), only when stage 7 actually trimmed and the overflow pool contains positives.

**What it means.** Positives that did not make the hard cap have been promoted into slots freed by negative trimming. The final injection set is denser in positives than priority-only ranking would have produced.

### `category_ceiling_applied`

One or more `preference_type` categories had more entries than `MAX_PER_CATEGORY` and were trimmed.

```js
{
  type:               "category_ceiling_applied",
  categories_trimmed: [
    { category: string, before: number, after: number },
    ...
  ],
  total_trimmed:      number,
  trimmed_patterns:   string[],
  max_per_category:   number,
  trace:              string,
}
```

**When it fires.** During stage 9 (category diversity ceiling), only when 2+ distinct categories exist across the final set and the overflow pool combined.

**What it means.** A single category was about to dominate the prompt; the engine trimmed weakest entries in that category to make room for diversity.

### `category_backfill`

Slots freed by category trimming were filled from the overflow pool, preferring under-represented types.

```js
{
  type:              "category_backfill",
  backfilled_count:  number,
  backfilled_types:  string[],
  trace:             string,
}
```

**When it fires.** During stage 10 (category backfill), only when stage 9 trimmed and the overflow contains under-represented types.

**What it means.** Categories that would have been absent or under-represented have been promoted into the final set.

### `token_budget_exceeded`

A specific preference was dropped because including it would have pushed the running token estimate over `TOKEN_BUDGET`.

```js
{
  type:                       "token_budget_exceeded",
  pattern:                    string,
  estimated_tokens_at_cut:    number,
  budget:                     number,    // TOKEN_BUDGET
  trace:                      string,
}
```

**When it fires.** During stage 11 (token-budget enforcement), once per dropped preference. The loop continues after a drop, so smaller subsequent preferences can still fit.

**What it means.** The prompt block was approaching the token budget; this preference (and possibly others) did not make the cut.

## Reading diagnostics in practice

A few common patterns hosts should be ready for:

- **No diagnostics.** Retrieval ran cleanly: no overrides, no cap hit, no ceiling fired, no token cuts. This is the expected state for sparse profiles.
- **Override diagnostics only.** Project overrides shadowed globals; this is informational, not a problem.
- **Hard cap with no backfill.** The user has more strong preferences than the budget allows; nothing was rebalanced because the polarity and category constraints were already satisfied.
- **Ceiling without backfill.** Slots were freed but the overflow pool had nothing eligible to promote (rare; usually only when the overflow is empty or dominated by the same category that was just trimmed).
- **Token cuts on every retrieval.** The user's pattern strings are unusually long, or `TOKEN_BUDGET` is set too low for the typical profile size. Worth investigating.

## What is intentionally not a diagnostic

A few things the engine does *not* emit events for, by design:

- **Records filtered out by the lifecycle gate.** Sub-threshold, low-confidence, archived, or under-review records are silently excluded. Diagnostics for these would dominate the output for any moderately active user.
- **Ranking decisions.** The order of returned records is given by `_effective_priority` and is implicit in the result; emitting a diagnostic per pair would explode noise.
- **Decay events.** `runDecay` returns a `{ decayed, archived }` summary directly; it is not part of the retrieval diagnostic stream.
- **Ingestion events.** `ingestSignal` mutates state but does not emit retrieval diagnostics.

If the host needs richer observability for any of these, the right place to add it is the host wrapper, not the engine.

## Diagnostic stability guarantee

Diagnostic types and field names are part of the subsystem's public contract. Adding new types is fine; renaming fields, removing types, or changing field semantics is a breaking change. Simulations in `sims/retrievalAdvancedSim.js` assert on diagnostic content, so accidental breakage will surface there first.
