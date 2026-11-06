# Stock-search diagnostics and analytics

## Confirmed delivery behavior

The takeover of PR #8691 follows the user's 2026-10-13 decision:

| ID | Behavior | Acceptance |
| --- | --- | --- |
| S1 | Company-managed Vela search; provider keys remain server-side. | A logged-in client without Pexels/Pixabay keys searches successfully. |
| S2 | Admin-configured channel priority; one attempt per channel, default cap two. | Both providers failing returns an explicit per-slot failure within the time budget. |
| S3 | AI searches independently after tool/service failure. | Guidance covers unavailable service, timeout, failed downloads and missing results; successful slots are retained. |
| S4 | Only valid local images count as acquisition success. | An HTTP 200 HTML body is rejected and no image is written. |

The service is a synchronous endpoint in the maintained `core/amr` API,
accessed through the existing Vela control-key/workspace client. This iteration
does not introduce a cache, async tasks, or an independent asset platform.

`od media stock-search` is an authenticated client of the running daemon.
Provider credentials stay on the company API server; the agent shell needs only its
run-scoped `OD_TOOL_TOKEN` and `OD_DAEMON_URL`. Standalone callers select an
authorized project with `--project` and optional workspace flags.

Both `/api/tools/media/stock-search` and the local project route
`/api/projects/:id/media/stock-search` use the same executor and shared request
contract. Tool tokens bind the project/run and require `media:stock-search`;
requests cannot supply provider keys, cwd, or substitute project/run identity.
Output directories and image/credits paths use the existing symlink-aware
project boundary. The CLI never searches providers directly or reads their keys. The daemon invokes
`vela media stock-search` through its existing login/binary/workspace adapter,
then downloads only allowlisted provider CDN URLs without authorization headers.
The Vela client makes one API request; the service tries each configured provider
at most once per slot. A service error exits 5; every non-ok slot triggers the
Agent's bounded independent web search instead of repeating the stock tool.

The result keeps provider search/download attempts in stdout JSON and the CLI
prints diagnostics to stderr. The daemon journals content-free request results
and final slot results under its resolved data root.
Data ownership and propagation follow [AGENTS.md](../AGENTS.md#daemon-data-directory-contract).
There is no project-cwd or user-home fallback when `OD_DATA_DIR` is absent.

The JSON result includes `telemetry.callId` and `telemetry.collectionStatus`.
The call id names its JSONL journal and delivery receipt. `complete` means all
request results and one final result per input slot were written locally; it
does not mean PostHog has indexed them. `failed` means local capture failed,
including capacity or filesystem errors. Image acquisition continues either way.

The running daemon checks for completed journals every 30 seconds, at most four
calls per pass. Each call sends one HTTP batch, at most 240 events / 512 KiB.
Delivery failures use exponential backoff from one minute to 30 minutes and
retain the journal. Stable `$insert_id` values survive retransmission. A 2xx
receipt means ingestion accepted the batch, not query-visible completeness;
an ingestion `quota_limited` response remains retryable. A daemon with no
PostHog configuration never starts this collector. CLI execution does not
wait for a network upload or create a PostHog client. Graceful daemon shutdown
also makes a bounded two-second delivery pass; undelivered records remain retryable.

Journals are limited to 512 KiB per call, with a 32 MiB / 1024-call spool
admission ceiling. Admission uses an atomic cross-process lock with a 250 ms
contention budget and reserves maximum size for each active call. Completed,
acknowledged or consent-disabled journals are retained seven days;
pending and invalid records are retained until admission fails. Active journals
are considered partial only after ten minutes and after their writer exits.
An interrupted final line is ignored; complete, malformed lines fail validation.
This is local diagnostic retention, not an unlimited historical archive.

Metrics consent is recorded when the call starts and rechecked before upload.
An opted-out call, including one disabled before upload, is never retroactively
uploaded after consent changes. Missing sink configuration or identity stays retryable.
No query, slot label, prompt, URL, output path, API key, or free-form error is
sent in analytics. `slot_index` distinguishes repeated labels; `credential_ref`
is null for company-managed searches. Historical local-key records may contain
a truncated SHA-256 fingerprint, never the key.
Detailed scrubbed failures remain in the CLI execution output.

## Events and attribution

- `media_stock_request_result`: one event per observed provider search or
  download outcome, including HTTP status, error category, monotonic duration,
  Pexels quota fields and normalized Retry-After. Download duration includes
  image inspection and writing bytes. Null quota fields remain unknown.
- `media_stock_slot_result`: one final result per input slot. The configured primary channel, attempted channel IDs,
  fallback attempts, fallback reason and successful fallback recovery are
  explicit fields. Duration is the sum of its observed request-stage durations.

Upload device/session identity is pinned in the journal when collection starts;
Run cleanup or installation identity changes cannot reassign a retry.

Both carry call id, slot index, run/project/node/evaluation association, source commit when
provided, execution source, schema version and collection status. Tool calls derive run/project association from the validated token and session
identity from the daemon run. Standalone calls retain null Run ids. `OD_STOCK_SOURCE_COMMIT` is an optional exact source
identity supplied by the launch environment; absent identity stays null, never
inferred from an application version. `OD_STOCK_EXECUTION_SOURCE=validation`
keeps authorized instrumentation checks separate from product traffic.
Evaluation launchers can supply `OD_STOCK_EXECUTION_SOURCE=evaluation`,
`OD_STOCK_NODE_ID`, `OD_STOCK_EVALUATION_RUN_ID` and `OD_STOCK_CASE_ID`.
These associations stay null when the launcher does not supply them.

## Dashboard definitions

Use the same time range and filters for all counts, rates and durations. Exclude
`execution_source=validation` from product metrics and expose collection status.
Use request events for traffic/error rates and slot events for recovery rates.

| Metric | Definition |
| --- | --- |
| Channel API volume | Request events by configured channel ID with stage=search |
| Channel API 429 rate | Search events with HTTP 429 / search events for that channel |
| Configured fallback rate | fallback_attempted slots / slots with a primary search attempt |
| Recovery success rate | fallback_succeeded slots / fallback_attempted slots |
| Latest known monthly quota | Latest non-null quota response per credential_ref and reset window, with observation time |
| Latency | P50/P95 duration, split by provider and search/download |

CDN 429s are separate from search API limits. Monthly headers do not describe
the hourly remaining budget. A 429 alone does not establish which window was
exceeded. Do not sum remaining quota or replace unknown values with zero. Call
counts cover only instrumented stock-search traffic; other uses of a shared
key are reflected in provider quota snapshots, not in these event counts.

Before creating or relying on a dashboard, reconcile a real CLI call's journal
event ids/counts with its receipt and PostHog query results. A mock test or HTTP
200 alone does not establish that reconciliation.

Company provider keys are unavailable to the daemon, so new request events use
`credential_ref: null`. Quota headers remain observations, and a dashboard must
not infer per-key remaining quota from a missing credential reference.

## Admin-managed channel compatibility (2026-10-13)

AMR PR #257 owns channel/key/priority configuration. The service returns stable
channel IDs, and the client advertises `max_attempts: 6` while the Admin policy
default remains two. Service errors still hand only missing slots back to AI
search. Shared public-asset fetching validates HTTPS, each redirect and the
connection-time DNS answer, without a client-maintained supplier/CDN list.
The brand module keeps its original API through re-exports of that same guard.

Slot telemetry adds optional `primary_provider` and `attempted_providers`;
existing version-1 journals remain readable. `pexels_attempted` is retained only
for compatibility and counts the legacy channel ID; it is not the denominator
for configurable routing. Six channels plus download/final events across 30 slots
need up to 240 events, so spool and uploader use shared 240-event/512-KiB bounds.
The global spool remains 32 MiB.

Validation includes generic third-channel parsing/download/telemetry, priority
reversal, redirect refusal, existing brand DNS-rebinding coverage and failures
returning to AI. Supplier/CDN responses are fixtures, not live-provider quality
or deployment evidence.

DNS pre-validation obeys the same download abort signal. A stalled resolver
reproduced `still_pending_after_deadline` before the fix and `TimeoutError`
after it; the permanent stock regression preserves timely AI fallback.
