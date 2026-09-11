# Environment evidence in diagnostics exports

The existing **Export diagnostics** action and `od diagnostics export --json`
use the same daemon export endpoint. Its ZIP includes
`summary/environment-evidence.json` alongside the existing machine, version,
login-health and log summaries.

## Reading the evidence

- `directory` records up to 50 workspace/member IDs and workspace types from the
  last successful cloud directory response. `truncated` reports omitted rows.
- `context` records the last workspace context returned by the daemon. It is
  **not** an assertion about the currently selected browser tab. Both observations
  carry timestamps; names, project contents, roles and billing information are omitted.
- `runtime-health.json` additionally includes the current login's opaque user ID.
  This is export-time identity; it must not be assumed to identify every historical
  request in the bundle.
- `environments` retains four timestamped samples of system proxy configuration,
  the daemon proxy environment, PAC configuration presence, and non-loopback
  IPv4/IPv6 address counts. Interface names, addresses and routes are omitted.
- `failures` coalesces directory/context, team-project CLI, shared-resource CLI,
  and existing API-journal failures by operation, category, status and available
  workspace identity. Each group retains a count, first/last times, latest request
  ID when supplied, and references to cached environment sample times.
- CLI failures include a sanitized summary of the environment actually supplied
  to that child. This is **configuration**, not proof of the route used by the
  request. Proxy endpoint fingerprints allow comparison without revealing the host.

No automatic connectivity probes run. `coverage` explicitly reports that actual
network routing and VPN state are not determined. First failures can precede the
first asynchronous OS sample; their environment reference is then null. Referenced
older samples may have been evicted from the four-sample window.

## Cost and retention

The new collector does no work at daemon startup. Successful workspace observations
only replace bounded in-memory metadata. Failures update an in-memory group and
schedule work; they never wait for a subprocess or filesystem write.

- At most 100 failure groups; least recently updated groups are evicted.
- At most one OS collection in flight, with a minimum 60-second interval.
- One asynchronous system command per supported OS sample, with a 1.5-second
  timeout, forced termination and a 64 KiB output limit. Windows reads Internet
  Settings; macOS reads `scutil --proxy`. Other platforms still report daemon
  environment and interface counts, with OS proxy discovery marked unsupported.
- At most one checkpoint write in flight. Dirty state is coalesced; no write queue
  grows behind a slow disk. Automatic writes and failed-write retries are spaced
  by at least 60 seconds. No recurring timer remains after a successful clean flush.
- Each serialized checkpoint is capped at 256 KiB. Current and previous process
  checkpoints are retained, with one temporary file during atomic replacement
  (at most 768 KiB of new checkpoint files). The JavaScript heap also has ordinary
  object overhead; 256 KiB is the serialized evidence budget, not a total heap claim.
- An abrupt exit can lose the last unflushed minute. This is best-effort support
  evidence, not a durable audit log. The export also includes the current in-memory
  state and any available checkpoint files under `logs/diagnostics/` in the ZIP.

Persistence receives the resolved daemon data root. See the repository's
[Daemon data directory contract](../../AGENTS.md#daemon-data-directory-contract).
Existing log-file collection limits are unchanged.

## Privacy and verification

The collector uses a field allowlist. It never serializes an environment object,
error message, command arguments, stdout, stderr, proxy credentials, PAC URL or
workspace name. A bounded stderr tail may be inspected transiently to categorize
CLI timeout, proxy, DNS or TLS failures; only the category is retained.

`apps/daemon/tests/services/diagnostics-evidence.test.ts` covers a 100,000-error
burst, distinct-group and byte limits, idle behavior, collection single-flight,
slow/failed writes, proxy redaction, and checkpoint rotation. Export tests open
real ZIPs, verify the added summary and prior checkpoint, and assert redaction.
Directory and CLI adapter tests verify error evidence without changing business
results. Windows configuration parsing is exercised with fixtures; it does not
substitute for Windows-native performance measurements.
