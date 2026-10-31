# Stability telemetry metrics

Authoritative definition for the integrated stability telemetry on this branch
(based on `9b5dc619d`). This definition supersedes the earlier local launch and
project-entry drafts wherever they differ. These are internal product diagnostics;
no new user-facing capability or CLI command is introduced.

## Launch

A launch is a new desktop main process, including the packaged process before
sidecar startup. Start is Node's main-process `performance.timeOrigin` (monotonic
offset zero), never Electron `ready`, module evaluation, window creation, or
an inferred OS icon click. Installed launcher work before this process is outside
the span. Hidden-window activation/focus does not start another process launch.
Headless-only/delegating processes do not synthesize desktop success. Restoring
a window in the same deferred headless process, including retries after a failed
restore, does not create a launch attempt or any launch timing.

`client_launch_attempt`, `client_business_ready`, and `client_launch_result`
share `launch_attempt_id` and `app_session_id`. Terminal results are idempotent.
The three duration fields are milliseconds from the same process origin:

| Field | End point |
| --- | --- |
| `launch_to_window_shown` | Actual main-window reveal (`onRevealed`), including fallback reveal |
| `launch_to_first_visible` | First committed content surface, checked on a foreground animation frame |
| `launch_to_interactive` | Usable inputs/actions and required data ready, on a foreground frame; headline |

The renderer obtains attempt/session IDs through the optional host `startup`
bridge. Preload forwards only context/readiness messages; main verifies the
owning main WebContents, top frame and app origin. Pet/splash/foreign frames
cannot declare Ready. Merely mounting a loading placeholder or showing a window
does not declare business readiness. Home requires a successful project-list
read for the current account/workspace/view, with no failure recorded for that
scope, successful agent discovery and config, and current-scope resource catalogs;
merely clearing loading flags is insufficient. Skills, design templates, design
systems and prompt templates must each finish a successful catalog read; a
successful empty catalog is usable, while a failed request cannot declare Home
Ready. Workspace-scoped catalogs must succeed under the current identity.
Non-startup callers retain their existing empty-list fallback on request failure. A project waits for current detail,
workspace scope, conversation/message
authority, initialized messages and enabled send/new-conversation actions. The
layout effect runs after the corresponding React controls commit. A hidden
window waits for foreground reveal. Later route changes cancel pending effects.

Main retains sidecar/runtime phase offsets. The foreground renderer signal marks
`first_visible`; `interactive_ready` also requires `required_data_ready=true`
and `actions_ready=true`. `duration_ms` on business Ready and ready result is the
headline duration. A launch failure/cancellation does not manufacture success or
missing phase durations. Window reveal alone can still have a cancelled result.

### Launch type heuristic

`launch_type` is `cold` or `warm`; it describes an operational heuristic rather
than verified filesystem/OS cache state. A small `stability-launch.json` in
Electron `userData` holds `{version,lastRunAt}`. Cold means any of:

- marker absent, unreadable, malformed, or timestamp invalid/future;
- active payload app version differs (first run after install/upgrade, also downgrade; not the carrier version);
- `now - lastRunAt > os.uptime() * 1000` (first run since OS boot);
- `now - lastRunAt > 30 minutes` (exactly 30 minutes remains warm).

Otherwise it is warm. Classification is independent of the measurement origin:
a warm process launch still starts at main-process origin. The compatibility
`startup_type` field follows the same classification for process launches.
A crash fallback is written at launch; normal `will-quit` or process `exit`
updates lastRunAt to the end. A hard kill cannot write an end timestamp, so a
long-running process killed shortly before restart can be classified cold.
Clock adjustments and missing metadata conservatively bias toward cold.
The marker has no account, project, prompt, or credential data; write failure
cannot block the app. Classification is not a precise OS cache measurement.

## Project entry

The click/open intent starts a navigation attempt before async project resolution.
`client_navigation_result` carries `navigation_id`, `started_at`,
`navigation_type=project_enter`, source/target type, and `result`:

- `started`: intent receipt;
- `first_visible` with `readiness_point=first_visible`: first committed project
  content on a foreground frame; this is not terminal;
- `ready` with `readiness_point=interactive_ready`: current project data, message
  authority, editor/inputs and actions usable; **headline metric**;
- `cancelled` / `failed`: explicit terminal reason, excluded from success latency.

Both visible and interactive durations use the same intent origin. First-visible
is deduplicated; terminal results are deduplicated and stale completions ignored.
Readiness failure, switching away, supersession, scope change, page exit,
router guard rejection and same-route no-op cannot emit success. Router
`onCancel` is per navigation, so an older guard cannot cancel a newer attempt.
Conversation-switch attempts use the same schema with a distinct navigation type.
Initial direct routes, create/import/duplicate and external deep links do not
invent a click intent; their launch can still have desktop readiness signals.
Read-only or otherwise disabled actions do not satisfy actionable Ready.

Conversation-switch surfaces become eligible for first-visible and Ready only
after that navigation commits. A pending guard cannot declare either point;
a rejected guard cancels the correlated navigation attempt.

## Memory

The Electron sampler starts after `app.whenReady()`. Its first collection is
**30 seconds after ready**, then **every 60 seconds**. `app.getAppMetrics()`
provides main (`Browser`), owned renderer (`Tab`), GPU and utility process RSS.
The main process additionally uses `process.memoryUsage()` for JS heap/external
memory and as an RSS fallback. Renderer/GPU/utility heap/external are null,
not fabricated zeros. Electron workingSetSize is KiB and is converted to bytes.
A missing native process category is omitted, not zero-filled.

Each process emits `client_process_memory_sample`: session/version/platform/OS/
architecture, role, opaque process-instance ID, uptime, byte fields, sample time
and interval. PID/creation-time hashes distinguish PID reuse without transmitting
raw PIDs. Main has one process UUID. No paths/content are collected. App session
IDs are shared with launch; desktop renderer metric bootstrap obtains the native
session ID through the host bridge (browser session identity remains separate).

稳定性埋点沿用安全通道，不受匿名指标开关控制（`telemetry.metrics`）。
Memory collection, ingestion and safety capture continue when metrics is false
or the consent config is unavailable; no consent lookup is performed.
`before-quit`, `will-quit`, and explicit desktop shutdown stop the sampler
idempotently, including before its first sample. No new sample or remaining batch request is sent after stop;
in-flight HTTP is aborted, although an already-received remote event cannot be recalled.

Budget: less than 1% CPU, i.e. less than 600 ms sampler CPU per 60-second period.
Collection uses one app metrics call, one main memory read and at most 64 native
metrics. No heap snapshots, renderer evaluation, subprocesses, retained history,
retry queue or overlapping batches. Slow delivery skips ticks; requests time out
in 5 seconds. Fake-clock tests cover
cadence, long operation, safety capture after opt-out, PID reuse, absent processes, slow/failing sinks
and stop. A local macOS arm64 Electron probe (isolated userData, activation prohibited,
`show:false`, 32 ticks, main/renderer/GPU/utility present) measured 0.682 ms of
main CPU per sample, equivalent to 0.00114% at the production cadence. This
measures collection and fixture delivery, not production HTTP transport or every
OS/Electron build; Windows/Linux and production transport profiling remain.
The reproducible local probe and output are retained in the task validation logs.

The cherry-picked daemon-health memory extension remains opt-in and unarmed by
default; it is not one of the three Electron process categories above.

Product analytics retains its consent checks, including fail-closed config reads.
The optional daemon-health sampler remains unarmed by default. Safety capture
still requires the existing PostHog key/environment gates; missing credentials
do not trigger network traffic. Content consent and privacy projection are unchanged.

## Envelope and verification

Common fields/schema are owned by `packages/contracts/analytics`:
`event_schema_version=4`, `metric_schema_version=1`, event/install/app-session
identity, client/source, env/channel/app version, platform/product OS version,
architecture, occurrence/report times and capability. A Linux Node installation
under `/opt` or `/usr/share` alone is not evidence of a packaged runtime;
packaged resources or an injected app version establish that classification.
Unsupported values stay
null. Producers normalize draft names to this schema; undeclared properties are
stripped. The packaged HTTPS serializer preserves this validated metric envelope
instead of applying the legacy crash schema 2 / packaged_main envelope. Its
serialized-payload regression failed before that transport fix and passed after.
Tests check actual produced launch/navigation payload admission, not
only independently manufactured schema fixtures.

Integration includes local commits 36f88b286, 5b9c47556, 4bbe85fce and df1920f95
via cherry-pick, followed by wiring and regression fixes. The optional cc9f214cf
Top5 draft is omitted: it depends on unimplemented `client_metric_cohort`
eligibility and a historical candidate query model. No production Top5 or success
rate is claimed from this branch.

Run package tests and typechecks for contracts, host, desktop, packaged, web and
daemon, plus repo guard/typecheck. Results and exact commands are recorded in the
local delivery copy `stability-telemetry.md` requested by the integration owner.
Tests use unit/HTTP fixtures and hidden (`show:false`) Electron capture. No
interactive browser/runtime launch, deployment, remote query, push, PR or merge
is part of this work. Native installation QA, live ingestion verification,
real hardware CPU profiling, Top5/cohort analytics and product acceptance remain
outside local test evidence.

The full daemon validation exposed two existing cancellation-fixture races:
process/running markers could appear before the fake CLI installed its SIGTERM
handler. The fixtures now signal handler readiness before tests cancel them
(`connection-test.test.ts` and `od-next-automatic-simple-server.test.ts`). Both
failed before the fixture fix and passed afterward; assertions and production
cancellation behavior retain their existing contract. Claude auth tests require
unsetting inherited `ANTHROPIC_BASE_URL` for their standard-login scenarios;
this changes only the test command environment, not local credentials/config.

Two Codex preflight suites also inherited macOS managed preferences and therefore
exercised the managed-config fail-open branch instead of their declared ordinary
CLI fixtures. They now fixture the absence of host MDM while retaining explicit
system/managed-config cases. Their 12 tests pass; no actual host preference is
changed by the fixtures.
