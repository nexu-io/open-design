# Refresh Contract Reference

Refresh updates live artifact data without redesigning the presentation. The refresh runner updates `data.json`, provenance, and audit history; it does not allow arbitrary template rewrites.

## Refreshable source metadata

Refreshable documents use `sourceJson`:

```json
{
  "type": "connector_tool",
  "toolName": "list_releases",
  "input": {},
  "connector": {
    "connectorId": "github",
    "accountLabel": "example/org",
    "toolName": "list_releases"
  },
  "outputMapping": {
    "dataPaths": [{ "from": "items", "to": "releases" }],
    "transform": "compact_table"
  },
  "refreshPermission": "manual_refresh_granted_for_read_only"
}
```

Supported source types:

- `local_file`
- `daemon_tool`
- `connector_tool`

Supported output transforms:

- `identity`
- `compact_table`
- `metric_summary`

## Source execution model

- `refreshPermission` is retained for backward compatibility with older artifacts, but the refresh runner does not require a separate connector approval step.
- If a safe source descriptor exists, manual refresh executes it through daemon-owned local or connector wrappers.
- Write, destructive, unknown, disabled, unconnected, or schema-drifted connector tools should not be authored as refresh sources.

## Connector-backed refresh

Connector-backed refresh sources use the same connector execution service as agent-initiated connector calls. Do not call provider APIs directly from refresh logic or from skill-authored scripts.

Before creating a connector-backed refresh source:

1. List connectors with `"$OD_NODE_BIN" "$OD_BIN" tools connectors list --format compact`.
2. If the user named a connector/source and it is connected, select that connector directly instead of asking where the source is. Then select a tool whose safety is `read` + `auto` and whose catalog metadata marks it refresh-eligible.
3. Execute once with `"$OD_NODE_BIN" "$OD_BIN" tools connectors execute --connector <id> --tool <name> --input input.json` to produce compact normalized preview data.
4. Store only non-sensitive connector references, the bounded input object, output mapping, and compatibility `refreshPermission` in `sourceJson`.

On each refresh, the daemon must re-check connector status, account label, allowlist membership, input schema, and output protection. If any check fails or output protection rejects the result, refresh fails all-or-nothing and preserves the previous valid preview.

Persisted connector refresh metadata may include `connectorId`, `toolName`, non-sensitive `accountLabel`, bounded `input`, `outputMapping`, and compatibility `refreshPermission`. It must not include credentials, auth/session material, raw provider envelopes, or unbounded provider responses.

## Commit behavior

Refresh is all-or-nothing:

1. Acquire one active refresh lock per artifact.
2. Execute each refreshable source with timeouts and current safety checks.
3. Build candidate `data.json`, provenance, and preview.
4. Validate all candidates with the same schemas used for create/update.
5. Commit only if every refreshable source succeeds.
6. Preserve the previous valid preview if any step fails.

Refresh IDs must be monotonic so stale runs cannot overwrite newer committed data.

## Audit storage

- Append compact records to `refreshes.jsonl`.
- Successful refresh snapshots live under `snapshots/<refreshId>/` and may include `data.json` and provenance.
- Failed refreshes are summarized in `refreshes.jsonl` without leaking raw provider output or credentials.
- On daemon startup, stale running refreshes should be marked failed or timed out while preserving the last valid preview.
