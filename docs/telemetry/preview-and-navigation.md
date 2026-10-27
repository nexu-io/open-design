# Preview attempts and page navigation (OPEND-3718)

This additive implementation builds on `aa88f4387`. The baseline definitions in
[stability-metrics.md](stability-metrics.md) remain authoritative for launch,
project entry, conversations, identity and the common envelope. This change is
internal observability, with no new user-facing command or CLI capability.
Local implementation and fixture evidence are not installation QA, release,
production ingestion, seven-day observation or product acceptance.

## Preview denominator and outcomes

A **visible preview attempt** starts when a mounted frame is in a foreground
visible document, intersects the viewport, has nonzero dimensions and has no
hidden/inactive ancestor. Workspace activity, preview/source mode,
`aria-hidden`, keep-alive parking, CSS visibility and motion-activity attributes
all participate. IntersectionObserver must first confirm eligibility when
available. Initially hidden/background/parked frames emit neither an attempt nor
a white-screen result. Leaving, hiding, parking or unmounting cancels an unfinished
attempt. Returning to visibility starts a new activation with a new opaque ID;
retained frames need not reload. A source/reload/transport change closes the old
activation and starts another eligible attempt. A pending source loader is not an
attempt until a preview source exists.

`client_preview_attempt` is the denominator. `client_preview_result` has the same
`preview_attempt_id`, `started_at`, `render_mode` and nullable `artifact_kind`.
Render mode is exactly one of `srcdoc`, `url_load`, `live_artifact`. Each accepted
attempt can emit one terminal result:

| Result | Evidence / monitoring_kind |
| --- | --- |
| `success` | Frame-local visible DOM paint evidence on an animation frame; `visible_content` |
| `white_screen` | No visible paint in two foreground observations, at least 5 s + 1.5 s after the activation; `no_visible_paint_after_timeout` |
| `error` | Frame runtime/resource/element error, or a 15 s evidence deadline; `preview_error`, `srcdoc_transport_unverified` or `probe_unverified` |
| `cancelled` | Left, hidden, inactive or replaced before completion; `left_or_hidden` |

Success is a bounded DOM/layout paint heuristic, not raster/screenshot proof.
An iframe `load` event, injected head ACK or mere body presence is insufficient.
The parent checks both the sending WindowProxy and current opaque attempt ID;
foreign and previous-attempt replies cannot settle an attempt. Attempt and
terminal emission are idempotent locally. A rejected start (ineligible activation)
cannot emit an orphan result. Network transport remains best effort: there is no
persistent queue or exactly-once remote-delivery guarantee. Missing terminal
results must be reported as incomplete observations, not success or zero latency.

All new events use `buildClientTelemetryParams` and `parseClientMetricEvent` via
the existing renderer transport. `event_schema_version=4` and
`metric_schema_version=1` are retained: new v1 event families and optional fields
are additive, without rewriting historical event payloads. Missing kind,
platform/version/identity values remain null as supported by the envelope.
No path, URL, authored text, prompt, stack or PID enters the new metric schemas.

The existing `client_preview_white_screen` and `client_preview_*error` events keep
their names and meanings. Their active FileViewer path additionally rejects
hidden/inactive/zero-area frames. `monitoring_kind=no_visible_paint_after_timeout`
is distinct from `srcdoc_transport_unverified`. A transport witness is an error
in the new attempt lifecycle, not evidence for a white-screen numerator.
`client_white_screen` is the separate application-not-mounted detector, marked
`monitoring_kind=app_not_mounted`; never mix it into preview rates.

## Consent and resource budget

稳定性埋点沿用安全通道，不受匿名指标开关控制（`telemetry.metrics`）。
Navigation, preview attempts/results, preview errors, application white screens
and chat first paint all use the same safety buffer and direct-fetch transport.
Metrics opt-out does not stop probes, cancel attempts or suppress results.
Early events are buffered until safety credentials arrive, within the existing
buffer bound; absent credentials leave delivery idle. Product analytics and
content consent keep their existing gates. No extra config polling is added.

One active tracker retains an attempt, ancestor attribute observations, one
intersection observer and at most eight probe/deadline timers plus one coalesced activity timer.
Ancestor-attribute activity checks are limited to once per 100 ms. It sends at most eight
paint probes per activation (including load-triggered probes), at 0, 0.5, 1.5,
5, 6.5, 10 and 14 s, with a 15 s evidence deadline. Each frame-local probe scans
at most 2,000 candidate elements, stops after three painted candidates, and
sends only a bounded result and opaque ID. Frame-side terminal replies are also
deduplicated per attempt, including during error storms. Completion clears all timers; cleanup
removes listeners/observers. There is no continuous paint/DOM polling after the
attempt ends. Existing diagnostic bridges retain their existing independent
bounded lifecycle. Real low-end-device CPU/interaction-overhead measurement is
still QA work; the implementation bounds are not a measured CPU percentage.

Live artifacts keep their existing response bytes, CSP (`script-src 'none'`)
and sandbox (`allow-same-origin`). No metric bridge is injected and no new
preview attempt/result events are collected for that surface. Its existing
load diagnostics remain. This surface is excluded from the new preview-rate
denominator; do not weaken the security policy to improve measurement coverage.

## Rates and breakdowns

Deduplicate attempt IDs and join results to actual attempts within the same
installation/session/observation cohort. Use occurrence version/OS/artifact kind
and split every rate by render mode and monitoring kind.

- Attempt white-screen rate: attempts with terminal `white_screen` / eligible
  `client_preview_attempt` IDs. Cancellations are real attempts, not successes.
- Affected-installation rate: distinct non-null `device_id` with a joined
  white-screen result / distinct non-null `device_id` with an eligible attempt.
- Report missing-terminal coverage and null-identity coverage separately.
- Never divide historical white-screen event counts by DAU, all installations,
  all frames or all `client_white_screen` events. Missing eligible denominator
  means **not computable**. Installation identity is not a user/account.

## Page navigation and first paint

Programmatic `navigate` captures the page intent before asynchronous navigation
guards. The router's exact onCommit callback opens the readiness gate. A rendered
route observation cannot commit a page attempt. Native history starts at observed
traversal; `goBack` carries its earlier monotonic intent origin through accepted
traversal. Rejected/superseded guards, same-route no-ops, scope changes, leaving
and failures cannot declare success. Initial direct routes synthesize no intent.
Page switches do not manufacture chat-open intents.

`client_navigation_result` retains the existing `started → first_visible → ready`
model, one intent origin, and `navigation_type=page_switch`. First visible and
interactive Ready use foreground animation frames. Terminal results are
idempotent. `source_page` / `target_page` contain only static route categories,
never URLs or resource IDs. First-visible is nonterminal; only interactive Ready
belongs in successful latency distributions. Failed/cancelled attempts are
excluded; missing readiness is not a zero or a successful route commit.

| Router destination | Readiness owner |
| --- | --- |
| home, onboarding, projects, drafts, all-projects, design-systems/legacy brands | App: current-scope project-list witness, workspace/catalog/agent/config readiness and committed controls |
| settings | App gates plus credential/config hydration complete |
| tasks | TasksView: list/data loading complete, no current failure, active view |
| plugins | ExtensionsMarketplace: current identity catalog/shared-scope readiness, fresh success-only plugin cache witness for the returned catalog, active view |
| community | CommunityView: successful catalog cache witness, not an empty failure fallback |
| marketplace | MarketplaceView: catalog/marketplace completion with explicit failed-request rejection |
| integrations | MCP server-list outcome; synchronous guide/credential-config surfaces have their own gates |

The hidden Library feature is not a published destination in this release.
Members, Board and Workspace Settings are repository placeholder surfaces and
have no actionable business Ready. Detail/create/demo routes and the integrations
Skills subtab have no additional complete business-readiness contract in this
change; they can be cancelled on exit but are excluded from Ready latency. Do not
claim these unsupported surfaces as successful samples. Some inherited catalog
providers collapse failures to empty arrays (documented in the baseline); their
readiness fidelity remains a known upstream limitation, not a proven data success.

`client_chat_first_paint` now adds `timing_origin=navigation_intent` or
`surface_attach_fallback`. Fallback samples are explicitly
`measurement_trusted=false`, with `missing_open_intent` unless another existing
trust failure takes precedence. Existing hidden/font/stylesheet/bfcache trust
checks still apply. Headline firstpaint requires a navigation-intent origin AND
`measurement_trusted=true`; show degraded samples separately. Chat surface-local
paint duration does **not** equal full project intent-to-interactive duration,
which includes asynchronous project/data/message resolution before chat mounts.

## Verification and QA handoff

Focused unit/component/HTTP tests cover all four preview outcomes for srcdoc
and URL previews, visibility/activity exclusion, stale/foreign replies, probe caps,
transport uncertainty, safety delivery after opt-out, schema privacy, firstpaint fallback, router guard
commit/cancel/no-op behavior, and the unchanged live-preview CSP. Regression
tests compare updater actions/state transitions with observation disabled,
enabled and unable to write, and confirm shutdown does not wait for observation.
Root guard/typecheck and exact commands/results are retained in task logs.

QA must use the actual candidate desktop/web runtime with a
local captured ingest sink. For each of srcdoc and URL preview:
open visible content, a genuinely blank artifact and a deterministic load/runtime
failure; verify one attempt and exactly one joined terminal result. Hide the app,
change workspace, switch preview to source, park/switch retained frames and leave
before completion; verify cancellation and no hidden attempts/white-screen
results. Reactivate and verify a new ID, including repeated blank activations.
Inject wrong-frame/old-ID messages and confirm no current result changes. Revoke
metrics consent and make config unavailable: safety events should still report
with private fields stripped; product analytics must remain suppressed.

Navigate Home ↔ Settings ↔ Projects ↔ Tasks ↔ Plugins ↔ Community, including
slow requests, successful empty lists, failed requests, rejected async guards,
rapid supersession, scope changes and back/forward. Check first_visible before
Ready, monotonic full intent durations, and no success before guard commit/data
readiness. Verify live-artifact response bytes and CSP/sandbox match the existing behavior
in every packaged engine, with no new metric probe. Check firstpaint trusted/fallback breakdowns separately.

Release owner must record the actual version and ingestion validation; QA owner
must record native/platform results and overhead. Analytics owner must then
observe at least seven full days after that actual release before comparing
cohorts. The 2026-10-22 candidate schedule is not proof of release or acceptance.

## Observation-only boundary

Navigation guards, conversation mutations, catalog fallback values, automatic
update decisions and shutdown completion retain their pre-instrumentation
behavior. Observation cancellation must not cancel a business request; observer
errors must not interrupt route commits. Catalog outcomes use a best-effort
callback without converting failures into new exceptions. Update stages are
recorded at existing execution points; no telemetry promise gates shutdown.
