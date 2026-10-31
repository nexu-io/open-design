# Update stage telemetry (OPEND-3719)

## Delivery status

This candidate adds stage journals and next-launch attribution.
`client_update_stage_result` is registered additively in `CLIENT_METRIC_SCHEMAS`
in `packages/contracts/src/analytics/client-metrics.ts`, so the common parser
admits validated stage records and strips undeclared fields before submission.
The contract admission and front-stage replay regressions cover this integration.
No release, real installation, remote ingestion, QA acceptance or seven-day
outcome is established by these local changes.

## Contract and compatibility

The new `client_update_stage_result` metric uses the common client telemetry
builder and parser: event schema 4, metric schema 1 (a new event, not a revision
of existing event meanings). `update_install_result`, `update_lifecycle_observed`
and `update_apply_observed` retain their meanings and formats. Installer apply
summaries retain schema 1 and their existing flow IDs. New stage files are
independent of those summaries, so failures before installation can be replayed.

A new check allocates an opaque flow ID before fetching metadata. The subsequent
download, validation, install handoff and next-launch result share it. Periodic
checks have their own check denominator; when they rediscover the same available
or downloaded release, the original release flow is restored for installation.
Explicit retries after a failed stage allocate a new flow. Starting installation
from a restored cache in a new process can have no corresponding check/download
records: those stages are unknown for that flow, not invented successes.

Each stage has separate immutable `started` and terminal `result` records.
Terminal values are `success`, `failed`, `cancelled`, `unknown`, and (restart
only) `not_applied`. Cancellation is emitted only for an actual AbortError;
there is no new user cancellation capability. Missing terminal records remain
unknown at the reporting cutoff; killing a process cannot guarantee a final event.
`occurred_at` is the observation time, preserved in replay. `reported_at` is the
receiver's report time. Durations are null: this work does not claim pure hash,
installer execution, or restart latency measurements. Unknown versions, session
identity and OS capabilities are null. Installation identity is not a user ID.

| Stage | Attempt boundary | Result boundary |
| --- | --- | --- |
| check | Supported check requested | Metadata/candidate processing completes or fails; no available update is a successful check |
| download | Candidate transfer/preparation requested | Verified artifact is prepared/promoted, or the download/preparation operation fails |
| verify | Checksum resolution and managed verified-download transaction requested | Managed checksum plus final updater hash passes; checksum mismatch fails; incomplete transfer gives unknown |
| install_verify | Existing artifact rehash requested before opening/activation | Rehash passes, bytes are unavailable, or checksum differs |
| install_open | Validated artifact activation/helper launch requested | Installer helper armed or payload activation/relaunch helper armed, or synchronous failure |
| restart | Successful install handoff recorded | A later desktop session reaches its main-window-ready boundary and observes the running version |

The managed-download library combines transfer and verification. Consequently
`verify.started` is the start of the verification pipeline, which includes
prerequisite transfer, **not** the instant hashing begins. A network error is
`download.failed` and `verify.unknown/download_incomplete`; a checksum mismatch
is `verify.failed/checksum_mismatch` and a failed verified-download operation.
Those two stage counts overlap and must not be added as independent incidents.
Post-download preparation failures can fail download while verification succeeds.
Pre-install checksum errors fail `install_verify`; they do not fabricate an
`install_open` attempt. Reason codes are a closed allowlist, never raw errors.

## Denominators and deduplication

For a stage S, the denominator is distinct `(flow_id, S)` with a valid started
record in the eligible version/channel/path/trigger cohort. The observed failure
fraction is terminal `failed` joined to those starts divided by that denominator.
Report success, cancellation, unknown and unresolved counts beside it. This is
an attempt metric, not a user rate. A zero or absent denominator is **not
calculable**; do not display zero percent. Orphan results have no denominator.

Use a fixed reporting cutoff and allow for late next-launch/replay delivery.
Missing results, disk failures, old clients and clients that never
restart are unknown or absent, not successes. Old clients with only legacy
observations have unknown stage capability. Their legacy version-match results
must not be counted in the new complete-attempt cohort.

Restart success requires the target version to be running in the matching
channel/namespace. The previous version still running is `not_applied`, never
installation failure: the installer may have been cancelled or never completed.
Another version/identity is unknown. Same-version reinstall is unknown because
version equality cannot prove replacement. Installer execution failures after a
helper has armed remain unobservable; a synchronous open/activation error is a
separate `install_open.failed`. The new result requires a different desktop session ID at main-window readiness.
A daemon-only restart, repeated window-ready callback or periodic scan cannot
close the new restart metric. Legacy apply classification remains compatible.

Local exclusive file creation retains only the first record for each flow,
stage and phase. Receipts suppress repeated scans after local queue acceptance;
retries use the same insert ID `update_stage:<flow>:<stage>:<phase>`. A crash
between enqueue and receipt can resubmit that ID, requiring remote insert-ID
deduplication. Local enqueue, legacy `submitted`, and HTTP 200 do **not** prove
remote durable storage. Receipts are not delivery guarantees and do not imply
retry after the in-memory analytics queue loses an accepted event.

## Consent, privacy and cost

Unsupported configurations and dry runs do not create new metric records.
Requests rejected by restart-safety preflight before reaching the updater are
outside these stage denominators; they remain a coverage residual.

稳定性埋点沿用安全通道，不受匿名指标开关控制（`telemetry.metrics`）。
New stage records do not read consent. The desktop injects the existing startup
session ID and product OS version; neither is guessed. The daemon replays
`client_update_stage_result` through `captureSafety`, including after opt-out or
unavailable consent. Old consent/identity-skip receipts are reconsidered with the
original insert ID; accepted safety receipts still deduplicate.
Operational legacy product observations retain their existing
consent policy. No paths, URLs, prompts, contents or raw PIDs are transmitted.
The local namespace routes the journal and is stripped from the new metric.

The updater never awaits the new telemetry queue. It allows at most 32 pending
writes and at most 12 phase files per flow. The existing ten-second
daemon timer replays at most 64 flow directories per tick for the new metric,
rotating across the inventory (at most 768 fixed-name file reads). The incoming desktop scanner runs asynchronously once at main-window readiness,
reads one restart-start record per stored flow and records at most 64 outcomes.
Observation eligibility lasts seven days. Old operational journals and the existing legacy
scanner retain their previous storage/scanning policy; this change does not claim
bounded total directory size or implement journal garbage collection. Native
CPU/IO measurements and retention policy remain follow-up work.

## Local coverage and remaining acceptance

Local regressions cover common-schema admission and privacy projection, failed
enqueue retry with stable insert IDs, safety replay after metrics opt-out, and
private-field stripping. Cancellation fixtures abort metadata fetching or
checksum resolution; they do not claim a user-facing transfer-cancel control.
The new contract admission regression fails on `aa88f4387` and on the previous
candidate before registration, and passes with registration in place.

| Path / trigger | Local evidence | Remaining |
| --- | --- | --- |
| Installer / manual | Check, transfer, checksum, open success/failure and shared flow fixtures | Real DMG/NSIS installation and post-install process/version evidence |
| Installer / silent | Configured auto-open fixture; no default automatic installer policy is introduced | Validate supported release configuration; installer UI still requires OS/user interaction |
| Payload / manual | macOS prepared-payload activation fixture with shared stage/legacy flow | Native macOS and Windows full launcher lifecycle |
| Payload / silent | Same payload fixture with silent attribution; scheduler verifies silent arguments | Real startup preference, shutdown, exact executable identity, rollback and installed-outer cold start |
| Both paths / both triggers | Next-launch success, unchanged-version and unrelated-version fixtures | Actual restart and telemetry ingestion on supported release artifacts |

QA should use the repository's updater lifecycle harness and an isolated local
namespace; follow the authoritative daemon-data contract in `AGENTS.md` rather
than inventing data locations. For each applicable path/trigger:

1. Start an older supported package. Force metadata offline:
   one check start/result must share a flow and report `check_failed`.
2. Retry with metadata reachable and artifact transfer disconnected: check succeeds,
   download fails and verification is unknown. Retry is a different flow.
3. Serve mismatched checksum bytes: verify fails with `checksum_mismatch`; no
   install-open attempt appears. Also tamper with the downloaded file before install:
   `install_verify` fails and the installer is not launched.
4. Make helper opening fail: install-open has one start/failed pair. It must not
   create restart success or relabel the error as a version-unchanged outcome.
5. Apply successfully and restart: verify target running version and original
   flow correlation. Repeat scans/restart and verify stable insert IDs/receipts.
6. Reopen the old version without completing installation: restart is `not_applied`.
   Same-version reinstall and legacy journals must not imply new-stage success.
7. Opt out, corrupt/unreadably configure consent, then repeat: new safety metrics
   are still journaled/sent with the same schema and privacy projection.
   Product observations must continue to honor metrics consent.
8. Inspect remote persisted rows using an authorized read-only workflow; explicitly
   distinguish those rows from local capture mocks, queue receipts and HTTP responses.

No QA, live ingestion or seven-day observation is performed by this job. Owner:
QA/release owner for native execution and rollout, telemetry owner for persisted
rows and cohort queries; assignments and dates require confirmation. For a release
on 2026-10-22, the earliest complete seven-day observation is 2026-10-29. None of
these observations establishes a performance improvement or full ticket acceptance.
