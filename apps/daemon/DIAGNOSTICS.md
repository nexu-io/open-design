# Automatic fault diagnostics (OPEND-3397)

The daemon observes Run errors, failed terminal fallbacks, automatic/model retries,
OD Next `blocked` outcomes, and chat/resume admission errors. Main-path API failures emitted through
`sendApiError` additionally cover runs, projects/conversations/files, uploads,
artifacts, previews and exports. Its existing desktop
observability route also captures renderer/child-process crashes, unclean exits and
packaged startup failures. Fatal daemon handlers synchronously register evidence;
active Run markers recover daemon interruptions on restart. User-stop requests are recorded before awaiting process termination, with elapsed
and last-agent-activity ages, first-model-event presence, retries and cancellation
origin. A repeated request and its canceled terminal fallback share one source ID.
Project cleanup and unattributed cancellations are not labeled user stops.
Terminal persistence write failures (including metadata refresh failure) and
explicitly invalid deliverables also produce evidence, even on execution success.
Healthy successful terminal callbacks do not create incidents. An error followed by
its terminal callback is one fault; independent error events keep their identities.

This is background behavior controlled by the existing metrics/content preferences,
including their shared UI/CLI configuration path. No new interactive capability,
Vela role, query service, or download endpoint is introduced. Manual diagnostics
exports include `summary/automatic-log-upload.json` with queue states and loss reasons.
All daemon-owned paths derive from the resolved data root; see the root `AGENTS.md`
**Daemon data directory contract** for ownership and launch propagation.

## Delivery and privacy

`storage/diagnostic-outbox.ts` owns an independent SQLite incident queue with leases
and version checks. Same source IDs deduplicate, stale callbacks cannot overwrite
new outcomes, and upload receipts persist before content is considered delivered.
Recovery updates the same incident's `recoveredAt`; already captured chunks remain
unchanged and the relay writes a new immutable manifest generation.

`packages/diagnostics` writes a gzip JSONL archive as at-most-4-MiB chunks. Text is
redacted before compression. Native dumps, binary attachments, environment dumps
and unrelated agents' CLI logs are excluded. The incident Run is selected explicitly;
host text logs and that agent's log tails supplement it. Missing/truncated sources
are reported as partial. Fault summaries include version/runtime context.

Both metrics and content must be true at registration and each transport step.
Malformed preferences fail closed. Disabling cancels transport, clears pending
content and invalidates its leases. File watermarks prevent a later opt-in from
uploading old text; an old source whose boundary cannot be proved is omitted and
marked partial. Already transmitted remote bytes expire under the remote policy.

Pending content expires after 7 days; delivered local content after 24 hours. The
queue budgets payloads plus serialized metadata within 1 GiB, reserving 100 MiB
before collection. Old delivered copies go first, then oldest pending incidents.
Collection uses a 96-MiB raw envelope budget and checks compressed output against
100 MiB. Small loss counters and at most 1024 recent scrubbed tombstones retain
eviction reasons without an unbounded content queue. SQLite allocation/WAL overhead
is separate from the content budget. Disk/DB failures leave a host warning; hard
OOM, disk failure, permanent offline devices and silent unrecognized faults cannot
be guaranteed lossless.

`integrations/diagnostic-relay.ts` derives the relay origin from the existing object
or telemetry URL. It needs no Run registration, login, Vela token or Langfuse trace.
Device credentials are local mode-0600 files. Backoff honors `Retry-After`; each retry
gets a fresh short-lived grant and preserves incident/chunk identities. Losing a
previously bound device identity fails explicitly instead of claiming the old scope.
Completed object references go to existing observability; telemetry failure does not
block R2 delivery. These records do not change the Run SLO success calculation.

## Validation and rollout

Focused tests cover durable dedupe/restart, stale leases, consent revocation and
re-enabling, corrupt preferences, recovery outcomes, byte/age pruning, no-run delivery,
and a lost completion receipt. The Worker contract is maintained in
[open-design-telemetry-worker](https://code.powerformer.net/core/open-design-telemetry-worker),
whose `DIAGNOSTICS.md` contains the verified wrangler download/reassembly commands.

Before releasing a client, enable and validate the compatible Worker with a
prefix-scoped 30-day R2 lifecycle rule. Its production switch remains disabled in
the change until the existing CUTOVER process authorizes activation. Dry-run builds
and in-memory R2 tests are not real cloud or macOS/Windows packaged acceptance.

## Experience coverage boundary

The 2026-09-22 expansion reuses existing evidence hooks, without changing SLO
classification or adding relay endpoints. Inactivity ages are observations, not
proof of a hang. User cancellation alone is not classified as a system failure.
API summaries retain route templates and error codes, not request bodies or URLs.
Telemetry/diagnostic API errors are outside the selected business route families,
so delivery failures cannot recursively generate more diagnostic bundles.

The frontend bridge below supplements cards, visible failures and existing
white-screen/hang detectors. Legacy handlers without a visible-error or typed
result signal, unavailable-daemon host compensation, and silent unrecognized
failures remain coverage gaps. Existing host crash events do not prove delivery
while the daemon is unavailable. Do not claim universal failure detection.

## Frontend evidence bridge

The `client_experience_diagnostic` branch of `/api/observability/event` is separate
from safety analytics: it validates bounded metadata, checks BOTH consent flags,
and calls the same diagnostic queue. It never falls through to `captureSafety`.
Frontend delivery is independent of PostHog setup and accepts no free-text error,
URL, stack or page content. It carries category/surface/code, optional project,
conversation and Run IDs, and an observation timestamp. Server registration time
owns retention; client time is only evidence.

Sources: chat card (including missing Run/code), typed failed result events,
start-blocked and preview failure surfaces; failed/incomplete projects in workspace
tabs, recent cards and the recent rail; existing white-screen, preview runtime/
resource errors and stuck-run detectors; file version, refresh, source loading,
manual edit, template save, deployment, image export and workspace upload errors.
Awaiting-input, healthy success and canceled export result events do not trigger
this bridge. Manual Run cancellation remains the separate daemon lifecycle hook.

Run/code and project status identities deduplicate repeated displays across reloads
at the durable daemon queue. Operation/runtime events coalesce identical metadata
for 10 seconds in a bounded 100-entry browser map. Local transport retries at most
twice with five-second request timeouts and bounded in-memory outstanding work;
transport errors never create more diagnostics. Closing the browser can lose
unacknowledged events. No persistent browser queue or unavailable-daemon host
uploader is claimed. Different kinds of evidence can still create distinct incidents
for one Run; full cross-layer incident merging is not implemented.
