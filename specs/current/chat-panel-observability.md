# ChatPanel observability

**Status**: modules landed, wiring pending (see [Wiring checklist](#wiring-checklist)).
**Dashboard**: [ChatPanel Runtime Health](https://us.posthog.com/project/420348/dashboard/2056756) (PostHog US Cloud, project `420348`).

The chat panel is the one surface a user keeps open for hours while it
accumulates unbounded state. Every reliability problem we have shipped
there was found by hand, after a complaint:

| Symptom | Found how | What it actually was |
|---|---|---|
| Conversation took 10.75s to open | user report | 63,472 stream events behind the messages |
| Whole-page bootstrap 15–18s on hard refresh | user report | — |
| Message list 2,799 nodes / 29 `<details>` | manual DOM inspection | eager mounting of collapsed tool blocks (→ 119 / 1 after lazy mount) |
| Renderer died: `FATAL ERROR: Reached heap limit` | crash log | unknown — no data survived the process |

None of these produced a single event. `apps/web/src/components/chat/`,
`ChatPane.tsx` and `AssistantMessage.tsx` contained **zero** `trackEvent`
or `posthog.capture` calls before this work.

---

## 1. Audit of the existing observability surface

Everything under `apps/web/src/observability/`, and whether it sees chat.

| Module | Event | Measures | Covers chat? |
|---|---|---|---|
| `long-task.ts` | `client_long_task` | Every main-thread block > 100 ms, globally | **Partly, uselessly.** Fires for chat jank but carries no conversation/run/DOM context, so it can never say *chat* is slow. |
| `boot-timing.ts` | `client_boot_timing` | navigationStart → domComplete, once per load | Page boot only. Blind to conversation open cost, which is the number users feel. |
| `white-screen.ts` | `client_white_screen` | App root never mounted after 5s | App shell only. A chat panel that mounts and then renders nothing is invisible to it. |
| `visibility.ts` | `client_visibility_change`, `client_session_summary` | Foreground/background cycle, session length | Global. Reused here as a *trust* input, not duplicated. |
| `stuck-run.ts` | `client_run_stuck`, `client_run_unstuck` | Run with no SSE progress for 5 min | **Yes** — the one existing chat-relevant signal. Wired in `providers/daemon.ts`. Complementary, not overlapping. |
| `resource-error.ts` | `client_resource_error` | Failed script/style/image loads | Global asset loading. |
| `iframe-error.ts` | `client_preview_*` | Preview-iframe runtime errors, white screens, deck staging | File viewer, not chat. |
| `install.ts` | — | Single boot-time entry point | Extended with the new interaction observer. |

**Conclusion**: the infrastructure is good and the transport is reusable.
The gap is not plumbing, it is that **nothing measures the chat panel as a
thing**. Everything above measures either the whole page or one iframe.

### Reused verbatim
- `reportSafetyEvent()` from `analytics/error-tracking.ts` — the
  consent-bypassing direct-fetch transport with early buffering.
- The `client_*` naming namespace.
- `long-task.ts`'s conclusion that rAF FPS sampling is a worse signal than
  Long Tasks *and* costs main-thread time. We derive jank from Long Tasks
  and never sample rAF.

### Transport choice, and why it is not the product-analytics path

`open-design-tracking` governs the consent-gated
`page_view`/`surface_view`/`ui_click`/`*_result` path with the
`page_name`+`area`+`element` triple. These events do **not** go there. They
are stability telemetry, in the same category as `client_long_task` and
`client_white_screen`, and product policy (documented at the top of
`analytics/error-tracking.ts`) is that stability ground truth survives a
user opting out of analytics. Chat health is measured for users who have
opted out of product analytics, because their renderer OOMs too.

They are, however, **typed** — previously this namespace shipped as
untyped `Record<string, unknown>`. See
`packages/contracts/src/analytics/client-observability.ts`.

### A finding worth acting on separately

`client_long_task` is **17,298,751 events in 7 days** — roughly 100× every
other `client_*` event combined:

```
client_long_task              17,298,751
client_resource_error            141,538
client_visibility_change         112,208
client_boot_timing                94,612
…
```

It is unsampled and unaggregated. This is the exact failure mode the chat
events are designed to avoid, and it is why `client_chat_stream_health`
aggregates long tasks into per-run windows rather than emitting per task.
Sampling `client_long_task` is out of scope here but should be its own
ticket.

---

## 2. Event catalogue

Seven events. Each answers one question; if it cannot, it is not here
(see §3 for what was cut).

### `client_chat_first_paint`
**Question**: how long until the user can read the conversation?

Measured from **open intent** (the click), not component mount — routing,
fetch and hydration all happen before the chat component exists and that
is where the seconds go. Measuring from mount would report a healthy 600ms
for an open the user experienced as 10 seconds.

| Field | Why |
|---|---|
| `open_kind` | `cold_boot` / `conversation_switch` / `project_switch` / `remount`. Multi-entry breakdown dimension. |
| `duration_ms` | The number. |
| `message_count`, `stream_event_count` | **Discriminator**: data volume. 63,472 was the pathological case. |
| `dom_node_count`, `details_count` | **Discriminator**: rendering path. 2,799 / 29 was the pathological case. |
| `virtualized`, `rendered_row_count` | **Discriminator**: did the >80-message threshold engage? |
| `measurement_trusted`, `untrusted_reason` | Can this reading be believed at all (see §5). |
| correlation block | Who / what / which build. |

**Sampling**: 100%, once per surface open. Bounded by user navigation.
Idempotent — a StrictMode double-effect cannot manufacture a second,
faster sample that drags P50 down and hides the regression.

### `client_chat_dom_growth`
**Question**: is the chat surface growing without bound as the
conversation grows?

`dom_node_count` and `details_count` are scoped to the chat log subtree
only — counting the document would fold in the file viewer and every
popover, and "chat DOM grew" would stop being a statement about chat.

**Sampling**: one sample per 60s, inside `requestIdleCallback`, **skipped
entirely while the tab is hidden** (a throttled background tab's numbers
are not representative and its beacons are pure noise). Node counting uses
live `getElementsByTagName` collections, whose `.length` is a native count
rather than an allocated NodeList.

Heap fields (`js_heap_used_mb`, `heap_pressure_pct`) are **omitted, never
zeroed**, where `performance.memory` is unavailable — it is a Chromium-only
extension, and a fake 0 from Safari/Firefox would drag every average toward
a floor that does not exist.

### `client_chat_memory_pressure`
**Question**: who is about to OOM?

Edge-triggered at 70 / 85 / 95 % of `jsHeapSizeLimit`, at most once per
band per session. Carries `breadcrumbs` and `heap_trend_mb` — see §4.

**Sampling**: ≤ 3 per session, by construction.

### `client_chat_stream_health`
**Question**: how janky is the UI while a run streams?

`blocked_ratio_pct` = the fraction of streaming wall-clock the main thread
spent unable to paint. Derived from the browser's own Long Tasks entries,
attributed only to windows in which a run was actively streaming.

**Sampling**: one event per run, or per 60s of a long run. **A window that
saw zero long tasks emits nothing** — clean runs are the common case, and a
zero-valued event per run would make this the highest-volume event in the
product while carrying no information.

### `client_chat_interaction_latency`
**Question**: how long between the user acting and the UI responding — and
is it worse while generating?

The `streaming` breakdown *is* the metric. The panel can be fine at rest
and unusable mid-run, and only the paired comparison shows it.

**Sampling**, three layers:
1. `durationThreshold: 200` filters **in the browser** — interactions
   faster than 200 ms never reach our JavaScript. Zero cost for the
   overwhelming majority, which are fine.
2. Only the **worst** interaction per 30s window is kept.
3. Hard cap of 20 reports per session.

Scoped to the chat panel only; an event named `client_chat_*` that also
counted file-viewer clicks would make the metric a false statement.

### `client_chat_protocol_anomaly`
**Question**: the agent produced output — did the UI it was supposed to
become actually appear?

`question_form_parse_failed`, `question_form_empty`,
`next_step_marker_missing`, `artifact_card_missing`,
`turn_block_build_failed`. These are **silent** failures: nothing throws,
so exception tracking never sees them, and they reach us as "sometimes the
buttons just don't show up".

**Sampling**: deduped per `(anomaly, run_id)`. Anomalies are detected
during *render*, and a React tree re-renders freely — un-deduped, a parse
failure in an on-screen message would emit once per keystroke in the
composer, and the metric would measure typing speed rather than defects.

Carries `source_length`, never `source`. A malformed question form is
agent output about the user's project.

### `client_chat_recovery`
**Question**: when the connection broke, did the client heal itself?

`sse_reconnect` / `run_resume` / `hard_refresh_restore` × `success` /
`failed` / `abandoned`, with `attempt` and `duration_ms`.

**Sampling**: none, deliberately. Every attempt is its own fact and the
attempt count *is* the signal — three failures then a success is a
different story from one clean reconnect. Volume is already bounded by the
daemon's own `DAEMON_STREAM_RECONNECT_LIMIT = 5`.

### Privacy

Every field is a count, a duration, a byte length, an enum, or an opaque
id. No message text, no file path, no prompt, no form answer, and no other
user-authored string is read by any of these modules. `source_length`
exists precisely so `source` never has to.

---

## 3. What was deliberately NOT built

The instruction was "every event must answer a question; delete the ones
that can't". These were considered and cut.

| Cut | Why |
|---|---|
| A client-side run-result event | **Already exists.** Daemon-emitted `run_finished` carries `result`, `error_code`, `artifact_count`, `time_to_first_token_ms`, `generation_duration_ms`, `total_duration_ms`, `token_count_source` and `langfuse_trace_id`. Duplicating it client-side would create two numbers that disagree. The dashboard queries `run_finished` directly. |
| FPS / `requestAnimationFrame` frame sampling | `long-task.ts` already argues rAF counting is a worse signal *and* costs main-thread time. Frame drops during streaming **are** long tasks. `blocked_ratio_pct` answers the same question for free. |
| Per-message render timing | Would fire thousands of times per conversation, and "message #417 was slow" is not actionable. The actionable unit is "this conversation is slow at N messages" — `first_paint` + `dom_growth` cover it. |
| Scroll-jank event | Scroll jank is long tasks. Already covered. |
| A chat-specific visibility event | `client_visibility_change` exists and is global. Reused as a trust input instead. |
| React Profiler component timings | Component names are minified in production, so the output cannot name what to fix — and the Profiler is expensive in the hot path. |
| Chat bundle/chunk load timing | `client_boot_timing` + `resource-error.ts` already cover asset loading. |
| A "chat rendered" counter | Answers no question. Render counts are an implementation detail, not a user-visible property. |

---

## 4. From symptom to root cause

This is the half that makes the other half worth having. **For every tile,
what the next click is.**

Correlation block stamped on every `client_chat_*` event:
`conversation_id`, `project_id`, `run_id`, `agent_id`, `model_id`,
`release_channel`, `build_sha`, `replay_session_id` — plus `app_version`,
`session_id`, `env` and `distinct_id` added by the transport.

`run_id` is the highest-value key in the set. It is simultaneously the
PostHog join key, **the Langfuse trace id** (`langfuse-trace.ts:1969`:
`const traceId = ctx.run.runId;`), and the handle the diagnostics bundle
can be matched on (`agent-logs.ts` writes `runs/<runId>/events.jsonl` into
`manifest.files[].name`).

| Tile got worse | Next click | What you get | What's still missing |
|---|---|---|---|
| ① First paint P95 | Break down by `open_kind`, then `stream_event_count` vs `dom_node_count` | Whether it is data volume or a rendering-path regression — the two have opposite fixes | — |
| ② Run outcome mix | Break down by `error_code`, take a `run_id` | Langfuse trace at `<langfuse>/project/<p>/traces/<run_id>` | **No Langfuse deep link is ever constructed in the repo.** Base URL must be supplied by hand; the internal host is not the `us.cloud.langfuse.com` default in `langfuse-trace.ts:67` |
| ③ Streaming jank ratio | Break down by `virtualized`, then `message_count` | Whether the >80-message virtualization threshold is set wrong | — |
| ④ Heap pressure users | Open one event → read `breadcrumbs` + `heap_trend_mb` | The run-up: `surface_attach@0,run_start@1200,run_end@41000,heap_band@42000` plus `[120,180,260,410]` MB | The OOM **itself** emits nothing — the process is dead. This is a pre-crash warning only |
| ⑤ Median vs P95 | Compare the gap | Widening gap = a *subset* of conversations degraded, not a uniform slowdown | — |
| ⑥ First paint by `app_version` | Identify the bad build | Which release regressed | **`release_channel` and `build_sha` are not plumbed.** `/api/version` returns `channel`, but `provider.tsx:109` destructures only `version`. No build SHA exists anywhere in the repo |
| ⑦ INP idle vs streaming | Break down by `area` (`composer` / `chat_log`) | Whether typing or the message list is the slow half | — |
| ⑧ Worst task by `virtualized` | Cross-reference tile ⑨ | Same story from the DOM side | — |
| ⑨ DOM nodes P95 | Compare `details_count` (tile ⑪) | Both climbing = collapsed tool blocks mounting eagerly again (the 2,799/29 regression) | — |
| ⑩ Heap pressure P95 | Filter to Chromium; take `distinct_id` → session replay | The actual session | **`replay_session_id` needs `registerChatReplaySessionSource` wired** — see below |
| ⑪ `<details>` P95 | Pair with ⑨ | Lazy-mount health | — |
| ⑫ Run failures by `error_code` | Take a `run_id` → Langfuse trace → diagnostics bundle | Full agent trace | Same Langfuse-link gap as ② |
| ⑬ Protocol anomalies | Break down by `anomaly`, take `run_id` | The run whose output failed to render | Diagnostics bundle **does** carry the run's `events.jsonl`, so the raw agent output is recoverable |
| ⑭ Recovery outcomes | Break down by `path` + `attempt` | Whether reconnect exhausts (5 attempts) or heals | — |
| ⑮ Trust watchdog | Break down by `untrusted_reason` | How much of ①/⑤/⑥ was excluded, and why | — |

### The session-replay link is currently broken, and looked implemented

PostHog **Session Replay is enabled** and unsampled
(`analytics/client.ts:345-353`, `disable_session_recording: false`, all
text masked). But:

- `client_*` safety events are posted by raw `fetch` to `/i/v0/e/`,
  bypassing posthog-js entirely — so posthog-js's automatic `$session_id`
  stamping **never applies to them**.
- The `session_id` those events already carry is *not* PostHog's replay
  id. It is a home-grown `sessionStorage` UUID from
  `analytics/identity.ts:46`.
- The obvious fix — `globalThis.posthog.get_session_id()` — silently
  returns `undefined` forever, because `client.ts` loads posthog-js with
  `await import('posthog-js')` and the **ESM build does not publish itself
  as `window.posthog`** (only the `array.js` snippet the landing page uses
  does).

So `chat-context.ts` exposes `registerChatReplaySessionSource(reader)`.
Until `client.ts` calls it, every replay link on the dashboard is dead
while looking implemented. This is on the wiring checklist as a **P0**.

### Gaps that block root-cause, and what fixes each

| Gap | Impact | Fix |
|---|---|---|
| `release_channel` not sent | Cannot separate a beta-only regression from a stable one | 1 line in `provider.tsx` — `/api/version` already returns `channel` |
| No build SHA anywhere | "Does this build contain the fix?" is answerable only by reverse-inference. **The diagnostics manifest has the same hole** — `manifest.app` is `{name, version, channel, packaged}` with no commit | Bake a SHA at build time; add to `AppVersionInfo` **and** `DiagnosticsManifest.app` |
| `replay_session_id` unwired | No dashboard → replay jump | `registerChatReplaySessionSource` (above) |
| No Langfuse deep link | run_id → trace is a manual URL paste | Emit a base URL through `/api/analytics/config`, or document the internal host in this file |
| `client_*` events lack `device_id` / `locale` / configure globals | Cannot slice chat health by CLI availability the way product events can | Extend `dispatch()` in `error-tracking.ts` |

---

## 5. Trusting the measurement

A reading taken under the wrong conditions is worse than no reading,
because it looks like evidence.

The precedent is recent and human: an agent measured computed styles in the
browser, read `font-weight: 400` where 500 was expected, and reported it as
proof of a bug. The real cause was that **Next dev injects CSS Module
stylesheets after the DOM lands** — every number read was a browser
default. The instrument lied while appearing rigorous.

A first-paint timer has the identical failure mode. So every timing event
carries `measurement_trusted`, and when false, `untrusted_reason`:

| Reason | Detected by | Why the reading is fiction |
|---|---|---|
| `document_hidden` | Sticky flag set on `visibilitychange` during the window | Background tabs are throttled; the duration is the OS scheduler's, not the app's |
| `fonts_pending` | `document.fonts.status !== 'loaded'` | "Painted" is not yet "readable" |
| `stylesheets_pending` | Any `link[rel=stylesheet]` with `.sheet == null` | Layout was not final — the exact Next-dev race above |
| `bfcache_restore` | reserved | Clock origin is not the user's open |

The hidden-tab flag is **sticky per window** and read at emit time,
because by then `visibilityState` has usually flipped back to `visible`
and can no longer tell you the window was throttled.

Headline tiles filter `measurement_trusted = true`. Tile ⑮ shows what was
excluded — and a spike in `fonts_pending` is itself a font-loading
regression.

---

## 6. Dashboard

**[ChatPanel Runtime Health →](https://us.posthog.com/project/420348/dashboard/2056756)**
· PostHog US Cloud · project `420348` · 15 tiles, verified attached.

> Query host is `us.posthog.com`. The ingest host `us.i.posthog.com` is a
> different service and will not answer management API calls.

| # | Tile | Event | Data today? |
|---|---|---|---|
| ① | First paint P95 (trusted) | `client_chat_first_paint` | After wiring |
| ② | Run outcome mix | `run_finished` | **Yes** — 219,653 runs / 7d |
| ③ | Streaming jank: blocked-ratio P95 | `client_chat_stream_health` | After wiring |
| ④ | Users hitting heap pressure | `client_chat_memory_pressure` | After wiring |
| ⑤ | First paint median vs P95 | `client_chat_first_paint` | After wiring |
| ⑥ | First paint P95 by `app_version` | `client_chat_first_paint` | After wiring |
| ⑦ | Input latency: idle vs streaming | `client_chat_interaction_latency` | After wiring (observer is already installed at boot) |
| ⑧ | Worst task by `virtualized` | `client_chat_stream_health` | After wiring |
| ⑨ | Chat DOM nodes P95 | `client_chat_dom_growth` | After wiring |
| ⑩ | Heap pressure P95 | `client_chat_dom_growth` | After wiring |
| ⑪ | `<details>` count P95 | `client_chat_dom_growth` | After wiring |
| ⑫ | Run failures by `error_code` | `run_finished` | **Yes** — 15.2% failure rate |
| ⑬ | Protocol anomalies | `client_chat_protocol_anomaly` | After wiring |
| ⑭ | Recovery outcomes | `client_chat_recovery` | After wiring |
| ⑮ | Trust watchdog | `client_chat_first_paint` | After wiring |

Current chat-panel baseline from tiles ② / ⑫ (7 days):
success **76.0%**, failed **15.2%**, cancelled **8.9%**.

### API notes for whoever edits these tiles

- Auth: `Authorization: Bearer phx_…` (personal API key). Dashboard and
  insight **writes both succeed** with the current key — this contradicts
  an earlier note that `insight:write` returns 403; re-verified working.
- Percentiles: PostHog's math enum spells p50 as **`median`**. Passing
  `"p50"` fails validation with a `parse_error`. `p75`/`p90`/`p95`/`p99`
  are accepted as written.
- Boolean property filters must be **strings**: `"value": ["true"]`.
- Every insight must be wrapped in `InsightVizNode`.
- A `201` on POST is not proof. Verify with
  `GET /api/projects/420348/dashboards/2056756/` and count `tiles`.

---

## Wiring checklist

The modules below are complete and tested. What remains is calling them
from components other agents currently own. **Grouped by file, in
dependency order.**

### P0 — without these, several tiles stay empty or lie

**`apps/web/src/analytics/client.ts`** (after `posthog.init`, near the
`loaded:` handler ~line 358)
```ts
import { registerChatReplaySessionSource } from '../observability/chat-context';
// inside loaded(ph) — the ESM build never sets window.posthog, so this
// registration is the ONLY way a safety event can reach a replay.
registerChatReplaySessionSource(() => ph.get_session_id());
```

**`apps/web/src/analytics/provider.tsx`** (~line 109, the `/api/version`
response destructure)
```ts
// currently: const body = await res.json() as { version?: { version?: string } };
// also read `channel` — the daemon already returns it, we just drop it.
setChatCorrelation({ release_channel: body?.version?.channel });
```

**`apps/web/src/providers/daemon.ts`** — owns the authoritative run
lifecycle; use the module-level seam, no handle needed.

| Line | Anchor | Insert |
|---|---|---|
| ~1070 | beside existing `trackRunStart(runId, …)` | `setChatCorrelation({ run_id: runId, agent_id, model_id }); chatSurfaceRunStarted(runId);` |
| ~1673 | `noteReconnectAttempt()` | record `reconnectStartedAt = Date.now()` |
| ~1678 | `clearReconnect()` | `reportChatRecovery({ path:'sse_reconnect', outcome:'success', attempt: reconnectAttempt, durationMs: Date.now()-reconnectStartedAt })` |
| ~2039 | `emitReconnect('exhausted')` | `reportChatRecovery({ path:'sse_reconnect', outcome:'failed', attempt: reconnectAttempt, durationMs: …, errorCode: GENERIC_DAEMON_DISCONNECT_CODE })` |
| ~2168 | beside existing `trackRunTerminal(runId, …)` in the `finally` | `chatSurfaceRunEnded(runId); setChatCorrelation({ run_id: undefined });` — **clearing matters**: `client_chat_interaction_latency.streaming` is derived from `run_id` being present |

### P1 — the chat surface itself

**`apps/web/src/components/ChatPane.tsx`** *(W1 owns — do not apply until W1 lands)*

| Line | Anchor | Insert |
|---|---|---|
| ~3485 | the `.chat-log` div, `ref={logRef}` | add `data-od-chat-area="chat_log"` |
| ~2243 | conversation-change reset effect, deps `[activeConversationId]` | `handleRef.current = openChatSurface({ element: logRef.current, messageCount: displayMessages.length, virtualized })` ; return `handleRef.current.detach` from the cleanup |
| ~2352 | initial-scroll effect, deps `[activeConversationId, displayMessages, tab]` | once `displayMessages.length > 0`: `handleRef.current?.markFirstPaint({ renderedRowCount: virtualWindow.rows.length ?? displayMessages.length })` |
| ~4623 | `const virtualized = items.length > CHAT_MESSAGE_VIRTUALIZE_THRESHOLD` | `handleRef.current?.setVirtualized(virtualized)` in an effect |
| — | wherever the raw event count is known | `handleRef.current?.setStreamEventCount(n)` — this is the 63,472 discriminator; **without it tile ① cannot separate "big conversation" from "slow renderer"** |

**`apps/web/src/components/ProjectView.tsx`**

| Line | Anchor | Insert |
|---|---|---|
| ~10396 | `handleSelectConversation(id)`, first statement | `markChatOpenIntent('conversation_switch')` — must be before the `navigate()`, or the routing cost is not counted |
| ~10327 | `handleNewConversation()` | `markChatOpenIntent('conversation_switch')` |
| ~3495 | after `listMessages` resolves in the load effect | `setChatCorrelation({ conversation_id: activeConversationId, project_id: project.id })` |
| ~9736 | `handleResumeRun` | mark episode start; on the resulting run's terminal (`meta.entryFrom === 'resume_continue'`) call `reportChatRecovery({ path:'run_resume', … })` |

**`apps/web/src/components/ChatComposer.tsx`** (~3291,
`data-testid="chat-composer"`) — add `data-od-chat-area="composer"`.
*Optional*: the observer already falls back to the test id, so tile ⑦ works
without this. The attribute is the durable form.

### P2 — protocol anomalies

**`apps/web/src/artifacts/question-form.ts`** *(G1 owns)* — every failing
path already funnels through one function:
```ts
// recordQuestionFormParseFailure(reason, tagName, body) at ~964
reportChatProtocolAnomaly({
  anomaly: reason === 'empty-questions' ? 'question_form_empty' : 'question_form_parse_failed',
  sourceLength: body.length,   // length only — never `body`
});
```

**`apps/web/src/components/AssistantMessage.tsx`** *(G6 owns)* — at
`showNextStepActions` (~1229), a run that succeeded and produced a
deliverable but yielded `nextStepSuggestions.length === 0` is exactly the
"marker expected but missing" case:
```ts
reportChatProtocolAnomaly({ anomaly: 'next_step_marker_missing', scope: message.id });
```

### Not required
`installChatInteractionObserver()` is **already registered** in
`observability/install.ts` and needs no further wiring.

---

## Files

| File | Status |
|---|---|
| `packages/contracts/src/analytics/client-observability.ts` | new, additive |
| `packages/contracts/src/analytics/index.ts` | +1 export line |
| `apps/web/src/observability/chat-health.ts` | new — first paint, DOM/heap, memory pressure, stream jank |
| `apps/web/src/observability/chat-context.ts` | new — correlation, breadcrumbs, measurement trust |
| `apps/web/src/observability/chat-protocol.ts` | new — protocol anomalies, recovery |
| `apps/web/src/observability/chat-interaction.ts` | new — INP |
| `apps/web/src/observability/install.ts` | +1 observer registration |
| `apps/web/tests/observability/chat-health.test.ts` | new — 14 specs |
| `apps/web/tests/observability/chat-context.test.ts` | new — 9 specs |
| `apps/web/tests/observability/chat-protocol.test.ts` | new — 9 specs |
