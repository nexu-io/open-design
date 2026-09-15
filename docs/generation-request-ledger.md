# Generation request ledger

`GET /api/runs/:id?include=requestLedger` and `od run info <id> --json` expose
an additive `requestLedger` receipt using `generation-request-ledger-v1`.
The CLI explicitly requests this expansion for evaluation consumers. Ordinary
`GET /api/runs/:id` status/recovery probes omit the ledger and never start or
wait for its external subprocess, including when an expanded request is pending.
Existing status, deliverable checks, and authorization remain authoritative.
Only explicitly expanded terminal AMR Runs query Vela. Expanded responses for
other runtimes and active Runs return an incomplete receipt without starting a
ledger subprocess. Direct API evaluation consumers must send the include query;
a missing receipt must not be interpreted as zero cost or complete capture.

The daemon uses its existing `integrations/vela-command` resolver and the Run's
frozen Workspace. Vela must provide
`vela request-ledger get --open-design-run-id <id> --json` in the same profile,
runtime key, Link URL, and AMR home used to generate the Run. No new credentials
or wallet endpoint are involved. An unavailable or older CLI leaves
`vela_request_ledger_unavailable`; it never changes the Run's outcome.

## Coverage and unknown values

- Each physical provider attempt is retained, including failed attempts and
  provider retries. `requestId` encodes `[gatewayRequestId, attemptId]`; both
  original identifiers remain visible. A rejection before any provider attempt
  remains a row with a null attempt and null usage, not an inferred zero.
- Token fields and input/output semantics are passed through independently.
  The consumer must include cache reads/writes only when input excludes them,
  and add reasoning only when output excludes it. Missing semantics or usage
  cannot establish complete costs.
- Gateway `captureComplete` describes registered gateway requests. Complete
  inventory also requires the independent Vela caller receipts: every producer
  closed, every caller request terminal, every caller/gateway pair matched in
  both directions, and every host-observed Run attempt covered. Host Run status
  must also be terminal. The response query's IDs cannot manufacture inventory.
- `complete` proves inventory and usage capture, not that an optimization
  improved quality or passed performance gates. `identity` and timing can still
  be incomplete; consumers must check them separately. `incompleteReasons`
  lists those remaining gaps.
- Actual model names come only from provider responses. Public model aliases
  and actual backend names are preserved separately. `observedModelRoutes`
  covers all attempts, including auxiliary calls. Missing model responses do
  not inherit the requested or routed model. `observedGatewayRuntimeVersions`
  records external gateway versions separately from the OD candidate revision.

## Source, input, and timing identity

The daemon build command rebuilds its workspace runtime dependencies and then
compiles the daemon. It records the clean Git SHA before and after that build,
plus a hash of the actual daemon/dependency output trees, in
`apps/daemon/dist/execution-source-receipt.json`. Dirty or changing source leaves
the SHA null. `dist` and `node_modules` stay ignored by normal Git rules; tracked
changes and untracked source are not ignored.

At module load, the daemon validates that receipt against the actual output
bytes and clean checkout. New Runs retain a process-bound snapshot in their
existing durable Run state. Before assigning a verified source to another Run,
the daemon also checks the execution tree has not changed since process load.
A later GET never fills historical source identity from the current checkout.
Missing legacy or packaged build receipts stay unknown. Deployments that build
through a different command must first adopt the same build receipt boundary.

`promptSha256` is SHA256 of the ordered JSON array of caller
`requestBodySha256` values. The order is the observed caller start timestamp,
then caller request ID as a deterministic tie-breaker. Each body hash covers
the actual HTTP bytes forwarded by Vela, including messages and tools; no
prompt bodies are stored in these receipts. This identifies the actual full
input sequence rather than a configured system prompt alone.

Execution duration is the persisted host Run start-request timestamp to its
immutable terminal timestamp; it includes retries and their waits. Queue time
is Run creation to that first start. `retryWaitMs` stays null because the full
provider/platform retry-wait boundary is not currently observed; recharge-only
timing is not substituted for it. Historical missing timestamps stay null.

## Verification boundary

Focused tests cover unknown usage and identity, retries, pagination, caller
inventory mismatch, all host attempts, active Runs, CLI failures, route
authorization, source changes, and stale executable output. The existing Run
lifecycle suite is also run. These local fixtures prove the integration
contract; they are not a real TEST-environment quality/performance experiment.
For new evaluation Runs, install the companion Vela CLI and Link service,
commit the candidate, build from the clean commit, and start a new daemon
through the normal orchestration entry point. Missing data is not backfilled
into historical Runs.
