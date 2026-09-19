# Preview observability dashboard — insight definitions

Status: draft, not yet created in PostHog (the event does not ship yet, so a
dashboard built today would be empty)
Definitions: `specs/current/preview-observability-dashboard.md`
Event contract: `packages/contracts/src/runtime/preview-phase-events.ts`

This file is the executable half of the dashboard spec: one HogQL query per
panel, ready to paste into a PostHog insight. The prose spec owns *why* each
metric is defined the way it is; this file owns the SQL and must not restate
the reasoning.

## Conventions

- Event name: `client_preview_phase`. One event, discriminated by `phase`.
- Reporting channel: the consent-gated product analytics channel
  (`useAnalytics().track`), not `reportSafetyEvent`. See
  `apps/web/src/runtime/preview-phase-reporter.ts` for the reasoning. Consequence
  for every query below: the population is consenting clients only. All six
  headline metrics are ratios or percentiles, so this biases volume but not the
  values — provided consent is not correlated with preview health.
- **Funnel key**, used wherever a query needs "one attach":

  ```sql
  concat(
    properties.session_key, '|',
    properties.document_key, '|',
    toString(properties.attach_index)
  ) AS attach_key
  ```

- Every query is scoped to the shipping runtime unless stated otherwise:

  ```sql
  AND properties.runtime_protocol = 'universal'
  ```

  `legacy-url` documents cannot report a handshake, capability set, or gated
  promotion. Leaving them in deflates every denominator they appear in. Panel
  V4 tracks their share so the exclusion stays visible.
- Default window: `timestamp >= now() - INTERVAL 7 DAY`. Every headline panel
  gets a 28-day companion with the same body.

Placeholder `{{window}}` below means the panel's date filter; PostHog injects it
from the insight's own range, so leave the literal `WHERE` clauses as written
and set the range in the UI.

---

## Validity panels — dashboard row 2

Listed first on purpose, although they sit in row 2 of the dashboard layout.
Every headline number below is conditional on something, and these panels are
how a reader tells whether the headline is measuring anything at all.

### V1 Cold-paint coverage (guards metric 1)

```sql
SELECT
  toStartOfDay(timestamp) AS day,
  countIf(properties.phase = 'first_visible_paint'
          AND properties.paint_observed) AS painted,
  countIf(properties.phase = 'navigation_start') AS cold_attaches,
  painted / nullIf(cold_attaches, 0) AS coverage
FROM events
WHERE event = 'client_preview_phase'
  AND properties.open_kind = 'cold'
  AND properties.runtime_protocol = 'universal'
GROUP BY day
ORDER BY day
```

Alert on `coverage` before alerting on metric 1's p95. A drop here invalidates
the latency number for the same window: a regression that turns paints into
timeouts removes its own slowest rows and reads as an improvement.

### V2 Warm attaches that navigated (should be 0)

```sql
SELECT
  toStartOfDay(timestamp) AS day,
  countIf(properties.did_navigate) / count() AS navigated_share
FROM events
WHERE event = 'client_preview_phase'
  AND properties.phase = 'navigation_start'
  AND properties.open_kind = 'warm'
  AND properties.runtime_protocol = 'universal'
GROUP BY day
ORDER BY day
```

### V3 Paint-independence audit (permanent, expected non-zero)

```sql
SELECT
  toStartOfDay(timestamp) AS day,
  countIf(NOT properties.paint_observed_at_decision) AS promoted_without_paint,
  count() AS promoted_total
FROM events
WHERE event = 'client_preview_phase'
  AND properties.phase = 'version_promoted'
  AND properties.outcome = 'promoted'
  AND properties.runtime_protocol = 'universal'
GROUP BY day
ORDER BY day
```

`promoted_without_paint` reaching zero while `promoted_total` stays healthy
means something reintroduced a paint dependency in the promotion path. That is
the only reason `paint_observed_at_decision` exists.

### V4 Phase volume and protocol split

```sql
SELECT
  properties.phase AS phase,
  properties.runtime_protocol AS runtime_protocol,
  count() AS rows
FROM events
WHERE event = 'client_preview_phase'
GROUP BY phase, runtime_protocol
ORDER BY phase, runtime_protocol
```

A phase missing from this table is not a healthy preview; it is an unwired call
site. In particular `navigation_start` at zero means nothing else can be
measured at all — every other phase fails closed without it.

---

## Headline metrics — dashboard row 1

### 1. Cold time-to-visible

```sql
SELECT
  toStartOfDay(timestamp) AS day,
  quantile(0.50)(properties.elapsed_ms) AS p50,
  quantile(0.75)(properties.elapsed_ms) AS p75,
  quantile(0.95)(properties.elapsed_ms) AS p95,
  count() AS samples
FROM events
WHERE event = 'client_preview_phase'
  AND properties.phase = 'first_visible_paint'
  AND properties.open_kind = 'cold'
  AND properties.paint_observed
  AND properties.detector != 'timeout'
  AND properties.runtime_protocol = 'universal'
GROUP BY day
ORDER BY day
```

Breakdowns: `properties.surface`, `properties.sandbox_profile`, `properties.deck`.
Publish only next to panel V1.

### 2. Warm-switch restore within 100 ms

```sql
WITH attaches AS (
  SELECT
    concat(properties.session_key, '|', properties.document_key, '|',
           toString(properties.attach_index)) AS attach_key,
    minIf(timestamp, properties.phase = 'navigation_start') AS started_at,
    maxIf(properties.elapsed_ms,
          properties.phase = 'first_visible_paint'
          AND properties.paint_observed) AS paint_ms,
    countIf(properties.phase = 'first_visible_paint'
            AND properties.paint_observed) AS painted
  FROM events
  WHERE event = 'client_preview_phase'
    AND properties.open_kind = 'warm'
    AND properties.runtime_protocol = 'universal'
  GROUP BY attach_key
  HAVING countIf(properties.phase = 'navigation_start') > 0
)
SELECT
  toStartOfDay(started_at) AS day,
  countIf(painted > 0 AND paint_ms <= 100) AS restored_fast,
  count() AS warm_attaches,
  restored_fast / nullIf(count(), 0) AS ratio
FROM attaches
GROUP BY day
ORDER BY day
```

Warm attaches that wrongly navigated stay in the denominator; they will be slow
and should drag this down while also showing in metric 3 and panel V2.

### 3. Non-content-update navigation ratio (target 0)

The sanctioned set is `PREVIEW_PHASE_SANCTIONED_NAVIGATION_TRIGGERS` in the
contract. Keep this list in sync with it; do not edit one without the other.

```sql
SELECT
  toStartOfDay(timestamp) AS day,
  countIf(
    properties.did_navigate
    AND properties.attach_trigger NOT IN (
      'initial_open', 'content_version_change', 'explicit_reload',
      'eviction_reload', 'recovery', 'scope_reminted'
    )
  ) AS unsanctioned,
  count() AS attaches,
  unsanctioned / nullIf(count(), 0) AS ratio
FROM events
WHERE event = 'client_preview_phase'
  AND properties.phase = 'navigation_start'
GROUP BY day
ORDER BY day
```

This one is deliberately **not** filtered to `universal`: a legacy document
navigating for a view change is the same defect.

### 4. New-version promotion success rate

```sql
SELECT
  toStartOfDay(timestamp) AS day,
  properties.attach_trigger AS attach_trigger,
  countIf(properties.outcome = 'promoted') AS promoted,
  count() AS decisions,
  promoted / nullIf(count(), 0) AS success_rate
FROM events
WHERE event = 'client_preview_phase'
  AND properties.phase = 'version_promoted'
  AND properties.runtime_protocol = 'universal'
GROUP BY day, attach_trigger
ORDER BY day, attach_trigger
```

Headline tile filters `attach_trigger = 'content_version_change'`;
`initial_open` is shown as its own series because a first document has no
previous version to fall back to.

### 5. Last-good retention rate

```sql
SELECT
  toStartOfDay(timestamp) AS day,
  countIf(properties.retained) AS retained,
  count() AS handoffs,
  retained / nullIf(count(), 0) AS retention_rate
FROM events
WHERE event = 'client_preview_phase'
  AND properties.phase = 'last_good_retained'
  AND properties.reason != 'no_previous_version'
  AND properties.runtime_protocol = 'universal'
GROUP BY day
ORDER BY day
```

`no_previous_version` rows are excluded from both sides — there was nothing to
retain. They are still emitted, so panel V4 keeps showing honest volume.

### 6. Automatic recovery exhaustion rate

```sql
WITH attaches AS (
  SELECT
    concat(properties.session_key, '|', properties.document_key, '|',
           toString(properties.attach_index)) AS attach_key,
    min(timestamp) AS started_at,
    countIf(properties.outcome = 'exhausted') AS exhausted
  FROM events
  WHERE event = 'client_preview_phase'
    AND properties.phase = 'recovery_attempted'
    AND properties.runtime_protocol = 'universal'
  GROUP BY attach_key
)
SELECT
  toStartOfDay(started_at) AS day,
  countIf(exhausted > 0) AS exhausted_attaches,
  count() AS attaches_with_recovery,
  countIf(exhausted > 0) / nullIf(count(), 0) AS exhaustion_rate
FROM attaches
GROUP BY day
ORDER BY day
```

---

## Stage durations — dashboard row 3

### S1 Stage durations for cold attaches

```sql
SELECT
  toStartOfDay(timestamp) AS day,
  properties.phase AS phase,
  quantile(0.50)(properties.phase_duration_ms) AS p50,
  quantile(0.95)(properties.phase_duration_ms) AS p95
FROM events
WHERE event = 'client_preview_phase'
  AND properties.open_kind = 'cold'
  AND properties.runtime_protocol = 'universal'
  AND properties.phase IN (
    'bootstrap_handshake', 'capabilities_applied',
    'version_promoted', 'first_visible_paint'
  )
GROUP BY day, phase
ORDER BY day, phase
```

This is the panel that answers "the preview got slower — which stage?".

---

## Offenders — dashboard row 4

### O1 Unsanctioned navigation by trigger

```sql
SELECT
  properties.attach_trigger AS attach_trigger,
  count() AS navigations
FROM events
WHERE event = 'client_preview_phase'
  AND properties.phase = 'navigation_start'
  AND properties.did_navigate
  AND properties.attach_trigger NOT IN (
    'initial_open', 'content_version_change', 'explicit_reload',
    'eviction_reload', 'recovery', 'scope_reminted'
  )
GROUP BY attach_trigger
ORDER BY navigations DESC
```

`unknown` belongs in this table: an unlabelled navigation is one nobody can
defend.

### O2 Forced scope re-mint share

```sql
SELECT
  toStartOfDay(timestamp) AS day,
  countIf(properties.attach_trigger = 'scope_reminted')
    / nullIf(countIf(properties.did_navigate), 0) AS remint_share
FROM events
WHERE event = 'client_preview_phase'
  AND properties.phase = 'navigation_start'
GROUP BY day
ORDER BY day
```

Sanctioned but should be rare; its own series so a scope-renewal regression
cannot hide inside the sanctioned bucket.

### O3 Blocked promotion gate

```sql
SELECT
  properties.blocked_gate AS blocked_gate,
  properties.outcome AS outcome,
  count() AS decisions
FROM events
WHERE event = 'client_preview_phase'
  AND properties.phase = 'version_promoted'
  AND properties.outcome != 'promoted'
  AND properties.runtime_protocol = 'universal'
GROUP BY blocked_gate, outcome
ORDER BY decisions DESC
```

The enum can only contain `runtime_identity`, `capabilities`, `dom_ready`,
`presentation_state`, `none`. A paint value appearing here would mean the
contract was widened and metric 4 silently changed meaning.

### O4 Handshake outcomes

```sql
SELECT
  toStartOfDay(timestamp) AS day,
  properties.outcome AS outcome,
  count() AS handshakes
FROM events
WHERE event = 'client_preview_phase'
  AND properties.phase = 'bootstrap_handshake'
  AND properties.runtime_protocol = 'universal'
GROUP BY day, outcome
ORDER BY day, outcome
```

### O5 Recovery cause mix

```sql
SELECT
  properties.trigger AS recovery_trigger,
  properties.outcome AS outcome,
  count() AS attempts
FROM events
WHERE event = 'client_preview_phase'
  AND properties.phase = 'recovery_attempted'
  AND properties.runtime_protocol = 'universal'
GROUP BY recovery_trigger, outcome
ORDER BY attempts DESC
```

### O6 Attempts needed to recover

```sql
SELECT
  properties.attempt AS attempt,
  count() AS recoveries
FROM events
WHERE event = 'client_preview_phase'
  AND properties.phase = 'recovery_attempted'
  AND properties.outcome = 'recovered'
  AND properties.runtime_protocol = 'universal'
GROUP BY attempt
ORDER BY attempt
```

If the distribution piles up on the last permitted attempt, the retry bound is
set too tight — raise `recoveryAttemptBudget` before concluding that recovery
does not work.

### O7 Recovery incidence

```sql
WITH attaches AS (
  SELECT
    concat(properties.session_key, '|', properties.document_key, '|',
           toString(properties.attach_index)) AS attach_key,
    min(timestamp) AS started_at,
    countIf(properties.phase = 'recovery_attempted') AS recoveries
  FROM events
  WHERE event = 'client_preview_phase'
    AND properties.runtime_protocol = 'universal'
  GROUP BY attach_key
)
SELECT
  toStartOfDay(started_at) AS day,
  countIf(recoveries > 0) / nullIf(count(), 0) AS incidence
FROM attaches
GROUP BY day
ORDER BY day
```

Rising incidence with a flat exhaustion rate means recovery is working harder
but still working. Rising exhaustion means it stopped working.

---

## Retention and cache — dashboard row 5

### C1 Retention window

```sql
SELECT
  toStartOfDay(timestamp) AS day,
  quantile(0.50)(properties.retained_ms) AS p50,
  quantile(0.95)(properties.retained_ms) AS p95
FROM events
WHERE event = 'client_preview_phase'
  AND properties.phase = 'last_good_retained'
  AND properties.retained
  AND properties.runtime_protocol = 'universal'
GROUP BY day
ORDER BY day
```

### C2 Exposure honesty

```sql
SELECT
  toStartOfDay(timestamp) AS day,
  countIf(properties.previous_version_exposed)
    / nullIf(countIf(properties.retained), 0) AS exposed_share
FROM events
WHERE event = 'client_preview_phase'
  AND properties.phase = 'last_good_retained'
  AND properties.runtime_protocol = 'universal'
GROUP BY day
ORDER BY day
```

Retaining a previous version in memory is not the same as showing it; the
second is the one the user feels.

### C3 Reclaim reason mix

```sql
SELECT
  properties.reason AS reason,
  count() AS reclaims
FROM events
WHERE event = 'client_preview_phase'
  AND properties.phase = 'cache_reclaimed'
GROUP BY reason
ORDER BY reclaims DESC
```

### C4 Reuse before reclaim (LRU budget tuning)

```sql
SELECT
  properties.reuse_count AS reuse_count,
  count() AS reclaims
FROM events
WHERE event = 'client_preview_phase'
  AND properties.phase = 'cache_reclaimed'
  AND properties.reason = 'lru_budget'
GROUP BY reuse_count
ORDER BY reuse_count
```

High `lru_budget` reclaim volume piled on `reuse_count = 0` means the pool is
too small and is destroying warm switches — which surfaces as a mystery
regression in metric 2 unless this panel is read alongside it.

### C5 Pool occupancy

```sql
SELECT
  toStartOfDay(timestamp) AS day,
  quantile(0.50)(properties.retained_session_count) AS p50_retained,
  max(properties.retained_session_count) AS max_retained
FROM events
WHERE event = 'client_preview_phase'
  AND properties.phase = 'cache_reclaimed'
GROUP BY day
ORDER BY day
```

---

## Global filters to configure on the dashboard

`properties.surface`, `properties.sandbox_profile`, `properties.deck`,
`properties.runtime_protocol`, and app version. Do not add a project or file
filter: identity reaches the wire only as an opaque key
(`previewPhaseIdentityKey`), by design.

## Before creating any of this in PostHog

1. Land the FileViewer hooks. `navigation_start` and `first_visible_paint` are
   not wired yet; without the first, every query above returns nothing, because
   the timing module fails closed on a phase with no anchor.
2. Confirm panel V4 shows all eight phases with non-trivial volume.
3. Confirm panel V1 has data before publishing metric 1.
