# Update lifecycle observations

`update_install_result` remains an installer/payload request result, not a restart acknowledgement. `update_apply_observed` remains a later daemon's version-match observation, not proof that a desktop window became usable. Neither event's historical meaning changes.

`update_lifecycle_observed` adds a finite set of stages joined by the existing installer observation `flow_id`. It is emitted through the daemon's existing consent-gated PostHog client, not the safety-event consent bypass.

| Stage | Meaning | Detail |
|---|---|---|
| install_requested | A persisted install attempt was created | Not installation success |
| shutdown_started | The desktop entered its single shared teardown | Not proof that it exited |
| cleanup_daemon / cleanup_web | The owned sidecar cleanup returned | Duration, forced and remaining process counts |
| shutdown_completed | Desktop teardown reached its final boundary | Duration and repeated quit count; failed if a caught teardown error occurred |
| predecessor_wait_started | An updater successor started waiting for the old desktop | Only present on after-quit launches |
| predecessor_wait_completed | The predecessor gate resolved | Normal completion, forced termination, or failure; duration |
| desktop_ready | The web mount signal was observed and a healthy main window was revealed | A splash timeout or crash fallback does not count |

Common properties: `flow_id`, `from_version`, `to_version`, `channel`, `platform`, `arch`, `occurred_at`, `observation_version=1`. Stage-specific fields are nonnegative bounded integer milliseconds/counts. No process IDs, file paths, raw errors, credentials or task content are added to these events.

## Persistence and delivery

Each stage is written once to an immutable file beside the existing installer observation. Different stages never rewrite the shared summary. Creation uses a completed temporary file and an exclusive link; duplicate callbacks keep the first observation. Telemetry I/O is best effort with a 100 ms caller budget, and cannot turn an updater operation into a failure.

The daemon scans at startup and every ten seconds. This catches stages written after daemon startup (particularly desktop readiness), and replays old shutdown stages on a subsequent launch. Collection is stopped with the existing telemetry disposal. Only observations within seven days and the same channel/namespace are considered.

A persisted receipt records `queued` only after the analytics client returns a local queue acknowledgement. This is **not** a PostHog ingestion acknowledgement. Failures retain the stage for retry; the deterministic `$insert_id` is `update_lifecycle_observed:<flow_id>:<stage>`. Opted-out/disabled observations receive skipped receipts and are not replayed later after consent changes.

## Queries and interpretation

Group by `flow_id` and slice by from/to version, channel, platform and architecture. Use `occurred_at` for lifecycle ordering; a replay's ingestion time is not the original event time.

- Predecessor-wait latency: duration percentiles of predecessor_wait_completed; split normal/forced/failed.
- Shutdown latency and retries: duration percentiles and repeated_quit_count of shutdown_completed, split by outcome.
- Forced cleanup fraction: forced cleanup events divided by observed cleanup completions, separately for daemon and web.
- Desktop readiness coverage: distinct flows with desktop_ready divided by observed install-request flows, with a defined observation horizon and matching instrumentation versions. Report missing stages as **unknown**, not failure.
- Version-apply success and desktop readiness are separate outcomes. The existing update_apply_observed event supplies the former; do not substitute one for the other.

Old versions can supply their existing flow summaries to the new target but cannot retroactively report their shutdown stages. A client that never starts again or never sends telemetry remains unobserved. This is an observed-cohort metric, not an unbiased success rate for all installations. Missing records, local queue loss and telemetry opt-out must not be counted as failed updates.

Zero remaining processes means the cleanup primitive found no survivors within its owned scope. It is not proof of no unrelated/orphaned processes or of task/data integrity. No claim is made that collection shortens shutdown or rescues an already failed client.

## Acceptance

Exercise both macOS and Windows with a source build containing this instrumentation, then upgrade to the next instrumented candidate. Check flow continuity, normal and forced predecessor waits, slow cleanup, repeated quit requests, and mounted window readiness. Repeat with metrics disabled and with enqueue failure/recovery. Do not use normal launch or a crash-screen reveal as evidence of successful update restart.
