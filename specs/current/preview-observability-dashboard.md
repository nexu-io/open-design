# Preview observability dashboard

Status: draft definition, not yet wired
Owner surface: `packages/contracts/src/runtime/preview-phase-events.ts`,
`apps/web/src/runtime/preview-phase-telemetry.ts`
Companion plan: `specs/current/html-preview-runtime-convergence.md`

## Why this document exists

The converged preview runtime replaces several transports with one real-URL document,
one bootstrap, and negotiated capabilities. The failures it is meant to remove — white
screens, reload flashes, stale frames, unexplained recovery — were only ever visible
after a user reported them. The repository already emits about a dozen preview *failure*
events (`client_preview_white_screen`, `client_preview_resource_error`,
`client_preview_runtime_error`, `client_preview_deck_stage_unscaled`, …), but **no phase
durations at all**. We can see that a preview broke; we cannot see that it got slow, that
warm switching stopped being warm, or that promotions silently started falling back.

This document defines what the dashboard computes, in enough detail that the aggregation
is not re-invented per panel.

## The event

One wire event, `client_preview_phase`, with a `phase` discriminant over eight values:

| Phase | Meaning |
| --- | --- |
| `navigation_start` | An attach attempt opened. Fires for warm attaches too, with `did_navigate: false`. |
| `bootstrap_handshake` | The injected bootstrap answered (or failed to answer) the host probe. |
| `capabilities_applied` | The runtime acknowledged the requested capability set. |
| `first_visible_paint` | Something visibly painted. **Observation only.** |
| `version_promoted` | A staged version was promoted, abandoned, or failed. |
| `last_good_retained` | The previous version was (or was not) retained across a handoff. |
| `recovery_attempted` | One bounded recovery attempt and its outcome. |
| `cache_reclaimed` | A retained preview session left the LRU. |

Every row carries the same framing: `session_key`, `document_key`, `surface`,
`render_mode`, `sandbox_profile`, `runtime_protocol`, `open_kind`, `attach_trigger`,
`did_navigate`, `deck`, `attach_index`, `sequence`, `elapsed_ms`, `phase_duration_ms`.

Two timing semantics, both anchored per *attach*:

- `elapsed_ms` — since this attach's `navigation_start`. This is the user-visible latency.
- `phase_duration_ms` — since the previous recorded phase. This is what localizes a
  regression to handshake, capability arming, or promotion.

### Funnel key

`(session_key, document_key, attach_index)` identifies one attach. `attach_index`
increments on every re-attach of the same document, so two warm switches seconds apart do
not blend into one funnel.

Because `attach_trigger`, `did_navigate`, `open_kind`, `sandbox_profile`, and `deck` are
stamped on **every** row, all six core metrics below are single-event aggregations. None
of them requires a PostHog funnel join.

## Privacy boundary

The product promise is that PostHog collects no HTML, DOM text, screenshots, file paths,
resource URLs, or project titles from previews. Two structural rules make that a property
of the contract rather than a reviewing habit:

1. **No free-text field kind exists.** Every declared field is a boolean, a bounded
   number, a value from a closed enum, or an opaque identity key
   (`PreviewPhaseFieldKind`). Reading `PREVIEW_PHASE_COMMON_FIELDS` plus the eight
   `PREVIEW_PHASE_FIELDS` tables is the complete audit of what preview telemetry can ever
   contain.
2. **Payloads are built by allowlist, never by copy.** `buildPreviewPhaseEventPayload`
   walks the spec for the phase and pulls only declared fields, dropping unknown keys and
   values that fail their declared kind.

This is not a theoretical hazard. On the rolling-upgrade path the web client mints
`documentVersion` as `` `legacy:${name}` `` (`apps/web/src/providers/registry.ts`) — the
file path. A payload that copied identity strings verbatim would have shipped user file
paths to analytics on day one. Identity therefore reaches the wire only through
`previewPhaseIdentityKey()`, as `h_<16 hex>`.

The cost of that choice is deliberate: preview phase rows cannot be joined to
`project_id`. PostHog's own `device_id` and `$current_url` still provide the account and
page context; the six metrics below need no project join.

`apps/web/tests/runtime/preview-phase-telemetry.test.ts` enforces both rules, including
an adversarial round trip that poisons every declared field, every framing field, and a
set of undeclared ones, then asserts that no string in the resulting payload is anything
other than closed vocabulary or an identity key.

## Corrected definitions carried into these metrics

Two definition corrections post-date the original Dev Design text and govern everything
below:

1. **First visible paint is no longer a promotion gate.** The gate is exact runtime
   identity + capability acknowledgement + DOM ready + presentation-state
   acknowledgement. Paint is still *reported*, as a phase, but it must never drive
   promotion, retention, discard, or reload. The contract enforces this in two places: a
   constant `observation_only: true` travels on every `first_visible_paint` row, and
   `PREVIEW_PHASE_PROMOTION_GATES` deliberately has no paint member, so a paint gate
   cannot be named on the wire.
2. **Promotion success is therefore defined against the new gate**, not against paint.
   Metric 4 below uses `version_promoted.outcome`, whose `blocked_gate` breakdown names
   only the four real gates.

## The six core metrics

Notation is HogQL-flavoured pseudo-SQL over the `client_preview_phase` event; `p.x` means
property `x`. All panels default to a 7-day window with a 28-day trend companion.

### 1. Cold time-to-visible

**Question:** when a user opens a preview that has to be produced, how long until they
see something?

```
population: phase = 'first_visible_paint'
        AND open_kind = 'cold'
        AND paint_observed = true
        AND detector != 'timeout'
value:      elapsed_ms
aggregate:  p50, p75, p95 per day
breakdown:  surface, sandbox_profile, deck
```

**Coverage guard (mandatory companion panel).** This metric is conditioned on a paint
having been observed, so a regression that turns paints into timeouts *removes* its own
slowest rows and reads as an improvement. Always publish alongside it:

```
coverage = count(distinct funnel_key where phase='first_visible_paint' and paint_observed)
         / count(distinct funnel_key where phase='navigation_start' and open_kind='cold')
```

A drop in coverage invalidates the latency number for that window. Alert on coverage
before alerting on p95.

### 2. Warm-switch restore within 100 ms

**Question:** does switching back to an already-open preview feel instant?

```
denominator: distinct (session_key, document_key, attach_index)
             where phase = 'navigation_start' and open_kind = 'warm'
numerator:   those whose first_visible_paint row has
             paint_observed = true and elapsed_ms <= 100
ratio:       numerator / denominator
breakdown:   surface, deck
```

Warm attaches that wrongly navigated (`did_navigate = true` on a warm attach) stay in the
denominator on purpose. A regression that starts re-navigating on tab switch will be slow,
and it should show up here as a drop *and* in metric 3 as a rise — two independent
witnesses of the same defect. Add a small companion panel:
`share of warm attaches with did_navigate = true`, expected 0.

### 3. Non-content-update navigation ratio (target 0)

**Question:** are view changes, capability toggles, or tab switches still navigating the
document? Convergence invariant 3 says only a file-version change, explicit reload,
eviction, or terminal recovery may navigate.

```
denominator: phase = 'navigation_start'
numerator:   phase = 'navigation_start'
         AND did_navigate = true
         AND attach_trigger NOT IN PREVIEW_PHASE_SANCTIONED_NAVIGATION_TRIGGERS
ratio:       numerator / denominator     -- target 0
```

The sanctioned set is exported from the contract
(`PREVIEW_PHASE_SANCTIONED_NAVIGATION_TRIGGERS`) rather than written into a dashboard
query, so the definition cannot drift from the code. It is `initial_open`,
`content_version_change`, `explicit_reload`, `eviction_reload`, `recovery`,
`scope_reminted`.

Two companion panels:

- **Offender breakdown** — unsanctioned navigations by `attach_trigger`
  (`view_change`, `capability_change`, `file_tab_change`, `project_switch`,
  `host_reparent`, `unknown`). This is the panel that names the regressing feature.
  `unknown` counts as unsanctioned deliberately: an unlabelled navigation is a navigation
  nobody can defend.
- **Forced re-mint share** — `attach_trigger = 'scope_reminted'` as a share of all
  navigations. Sanctioned, but it should be rare; folding it into the sanctioned bucket
  would hide a scope-renewal regression behind a green headline.

### 4. New-version promotion success rate

**Question:** when a file changes, does the new version actually become current?

```
denominator: phase = 'version_promoted'
numerator:   phase = 'version_promoted' and outcome = 'promoted'
ratio:       numerator / denominator
breakdown:   attach_trigger, sandbox_profile
```

Headline slice is `attach_trigger = 'content_version_change'`; `initial_open` is reported
separately because a first document has no previous version to fall back to and its
failure mode is different.

**Blocked-gate breakdown (the panel that makes this actionable):**

```
filter:    phase = 'version_promoted' and outcome != 'promoted'
breakdown: blocked_gate  in {runtime_identity, capabilities, dom_ready, presentation_state}
```

**Paint independence audit.** A permanent panel, expected non-zero:

```
count(phase = 'version_promoted'
  and outcome = 'promoted'
  and paint_observed_at_decision = false)
```

If this ever reaches zero while promotions continue, something has quietly reintroduced a
paint dependency in the promotion path. That is the whole reason the field exists.

### 5. Last-good retention rate

**Question:** during a version handoff, did the user keep seeing the previous good version
instead of a blank frame?

```
denominator: phase = 'last_good_retained'
             (one row per handoff where a previous version existed;
              reason = 'no_previous_version' rows are excluded from both sides)
numerator:   phase = 'last_good_retained' and retained = true
ratio:       numerator / denominator
breakdown:   reason, attach_trigger
```

Companion panels:

- **Exposure honesty** — `share of retained = true rows with previous_version_exposed = true`.
  Retaining a previous version in memory is not the same as showing it; the metric the
  user feels is the second one.
- **Retention window** — p50/p95 of `retained_ms`. A long tail here means handoffs are
  stalling, which shows as "the preview is showing me an old version".

### 6. Automatic recovery exhaustion rate

**Question:** how often does bounded recovery run out of attempts and leave the user on a
failed preview?

```
denominator: distinct (session_key, document_key, attach_index)
             with at least one phase = 'recovery_attempted'
numerator:   those with a phase = 'recovery_attempted' and outcome = 'exhausted'
ratio:       numerator / denominator
breakdown:   trigger (the recovery cause), sandbox_profile
```

Secondary framing, reported next to it because the two answer different questions:

- **Recovery incidence** — attaches with ≥1 recovery attempt / all attaches. Rising
  incidence with a flat exhaustion rate means recovery is working harder but still
  working; rising exhaustion means it stopped working.
- **Attempts to recovery** — distribution of `attempt` at `outcome = 'recovered'`. If most
  recoveries need the last permitted attempt, the bound is set too tight.
- **Recovery cause mix** — `trigger` breakdown across
  `handshake_timeout`, `navigation_failed`, `identity_mismatch`, `transport_unverified`,
  `promotion_timeout`, `subresource_stall`.

## Dashboard layout

**Row 1 — headline (six tiles).** Cold p95 time-to-visible · warm-100 ms ratio ·
unsanctioned navigation ratio · promotion success rate · last-good retention rate ·
recovery exhaustion rate. Each tile shows the 7-day value and the 28-day trend arrow.

**Row 2 — validity.** Cold-paint coverage · warm attaches with `did_navigate = true` ·
paint-independence count · phase-row volume by phase. This row exists so a reader can tell
whether row 1 is measuring anything. A green headline sitting on collapsed coverage is the
failure mode this dashboard is most likely to produce.

**Row 3 — where the time goes.** Stacked p50/p95 of `phase_duration_ms` by phase for cold
attaches: navigation → handshake → capabilities → paint. This is the panel that answers
"the preview got slower, which stage?".

**Row 4 — offenders.** Unsanctioned navigation by `attach_trigger` · blocked promotion
gate breakdown · recovery cause mix · reclaim reason mix.

**Row 5 — retention and cache.** `retained_ms` distribution · `reuse_count` distribution
at reclaim · `retained_session_count` over time · reclaim reason. Row 5 is how the LRU
budget gets tuned: high reclaim with low `reuse_count` means the budget is too small and
is destroying warm switches (metric 2), which is otherwise diagnosed as a mystery latency
regression.

**Global filters:** `surface`, `sandbox_profile`, `deck`, `runtime_protocol`, app version.
`runtime_protocol = 'legacy-url'` should be excluded from the headline row once the
rollout completes; until then it must be a visible split, because legacy documents cannot
report most phases and would otherwise silently deflate the denominators.

## Wiring prerequisites

The runnable HogQL for every panel above lives in
`specs/current/preview-observability-dashboard-queries.md`.

`bootstrap_handshake`, `capabilities_applied`, `version_promoted`,
`last_good_retained`, and `recovery_attempted` are wired in
`apps/web/src/components/PreviewSessionFrames.tsx`; `cache_reclaimed` is wired in
`apps/web/src/components/IframeKeepAlivePool.tsx`. Records go to the
consent-gated product analytics channel — see
`apps/web/src/runtime/preview-phase-reporter.ts` for why that channel and not the
safety bypass.

`navigation_start` and `first_visible_paint` are still unwired and are owned by
`FileViewer`. Until `navigation_start` lands nothing emits at all, because the
timing module fails closed on a phase with no anchor. Before any panel is built:

1. `FileViewer` must call `beginPreviewAttach` once per attach, *including warm
   attaches*, restarting the anchor rather than reusing the cold one. An attach
   that only records later phases produces nothing, which reads as missing volume
   in the validity row, not as a fast preview.
2. `FileViewer` must record `first_visible_paint`. It is the only owner that can
   observe paint, and metric 1, metric 2, and the paint-independence audit all
   depend on it.
3. Do not build the dashboard before the validity panels have data. A latency
   number without its coverage guard is worse than no number.
