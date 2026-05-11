# Connector Policy Reference

Live artifacts may use connector or local data, but they must persist only compact, preview-oriented data and provenance. Never persist credentials or raw provider envelopes inside live artifact files.

## Connector safety model

Connector tools are classified by side effect and approval requirement:

- `read` + `auto`: eligible for agent preview and potential refresh.
- `write` + `confirm`: not refreshable; requires explicit user confirmation if exposed later.
- `destructive` + `disabled`: never refreshable.
- `unknown` + `confirm` or `disabled`: fail closed until classified.

If a tool name, scope, or description suggests write/create/update/delete/admin/send/post/manage behavior, treat it as write-capable unless the daemon catalog explicitly proves otherwise. Destructive hints must be disabled for refresh.

## Execution boundaries

- Use daemon wrapper commands or `/api/tools/connectors/*`; do not call provider APIs directly from the artifact workflow when a daemon connector exists.
- Tool endpoints require the injected `OD_TOOL_TOKEN`; do not invent or pass `projectId`.
- Agent calls and refresh-runner calls must share the same daemon connector execution service.
- Re-check connector status, allowlists, current scopes, tool safety, and refresh eligibility at execution time.
- For connector-backed refresh, saved `connectorId`, `accountLabel`, tool name, input shape, and approval policy must still match current connector state.

## Connector listing

List connectors before using connector-backed data:

```bash
"$OD_NODE_BIN" "$OD_BIN" tools connectors list --format compact
```

The compact result includes each connector's `id`, display metadata, `status`, optional `accountLabel`, and callable tool summaries with `name`, `description`, `safety`, and `inputSchema`. Use this output to select a connector and tool; do not guess tool names.

Only execute tools from connectors whose status is `connected`. Local/public connectors may already be connected by the daemon; OAuth-backed connectors must be connected by the user through the UI before agent execution.

If the user already named a connector or app, treat that as the intended data source. For example, “create a Notion live artifact” means: list connectors, find `notion`, and if it is `connected`, use its read-only tools instead of asking where the Notion data comes from. Ask a follow-up only when the matching connector is missing/unconnected, when several connected matches are equally plausible, or when there is no searchable topic/page/database clue in the user’s request.

For Notion, prefer this selection order:

1. Use `notion.notion_search` with a concise query derived from the user’s requested artifact/topic.
2. Use `notion.notion_fetch_database` only when the user provided a database id or a prior search result identifies a specific database.
3. If the user simply says “Notion live artifact” with no topic, ask what Notion page/database/topic to visualize or whether to search broadly.

## Connector execution

Create a bounded JSON object input file that matches the selected tool's `inputSchema`, then execute through the wrapper:

```bash
"$OD_NODE_BIN" "$OD_BIN" tools connectors execute --connector "$CONNECTOR_ID" --tool "$TOOL_NAME" --input input.json
```

The wrapper reads `OD_NODE_BIN`, `OD_BIN`, `OD_DAEMON_URL`, and `OD_TOOL_TOKEN`, sends the request to `/api/tools/connectors/execute`, and prints compact JSON. Successful output includes `connectorId`, optional `accountLabel`, `toolName`, `safety`, `outputSummary`, redacted `output`, and daemon metadata. On failure, fix the input/schema/connection issue and retry; do not bypass connector validation with direct provider calls.

Execution is fail-closed:

- connector and tool IDs must be in the daemon catalog allowlist;
- the connector must still be connected and not disabled;
- current runtime safety must be `read` + `auto` for agent execution;
- input must match the current tool schema;
- run rate limits and total call limits apply;
- output is size-bounded and redacted before the agent receives it.

Use execution output as an intermediate source only. Normalize it into `data.json` and provenance, keeping only fields the preview needs.

## Read-only refresh rules

Connector-backed live artifact refresh is allowed only for tools that remain read-only and refresh-eligible at refresh time. A saved refresh source must include non-sensitive connector metadata and permission state, for example:

```json
{
  "type": "connector_tool",
  "toolName": "github.public_repo_summary",
  "input": { "owner": "open-design", "repo": "open-design" },
  "connector": {
    "connectorId": "github_public",
    "accountLabel": "public",
    "toolName": "github.public_repo_summary"
  },
  "outputMapping": {
    "dataPaths": [{ "from": "summary", "to": "repository" }],
    "transform": "metric_summary"
  },
  "refreshPermission": "manual_refresh_granted_for_read_only"
}
```

During refresh, the daemon revalidates `connectorId`, `accountLabel`, tool name, saved input schema, and allowlist membership. If anything drifts, the refresh fails without changing the previous valid preview.

Never mark write, destructive, unknown, confirmation-required, disabled, unconnected, or schema-drifted connector tools as refreshable.

## Persistence rules

Persist only:

- compact normalized values needed by the preview in `data.json`;
- high-level provenance in `provenance.json`;
- connector references and refresh metadata in `sourceJson`.

Never persist:

- OAuth tokens, API keys, cookies, headers, authorization values, or session material;
- raw provider HTTP bodies, envelopes, payloads, or full responses;
- credential-like values under alternate names;
- connector credentials under `.live-artifacts/`.

Credential storage is daemon-controlled and outside project artifact directories. Artifacts may contain connector IDs and non-sensitive account labels only.

## Credential handling constraints

- Do not ask the user for connector secrets inside the artifact workflow.
- Do not ask the user to re-specify a data source that is already named and connected; inspect the connector catalog first.
- Do not write OAuth material, API keys, cookies, sessions, HTTP request metadata, or provider auth state into `artifact.json`, `data.json`, `provenance.json`, tile JSON, snapshots, refresh history, or `.live-artifacts/`.
- Do not include secret-like values in connector tool inputs or source metadata. If a connector requires credentials, the daemon-owned connector UI/storage must handle them outside project artifacts.
- Safe persisted connector references are limited to catalog IDs, tool names, non-sensitive account labels, selected normalized output fields, and concise provenance notes.
- If connector output contains unredacted sensitive or envelope-like fields, stop and return a validation/safety error instead of storing it.

## Output protection

Connector outputs must be bounded and redacted before returning to agents or entering artifact files. Use compact summaries and selected fields. If redaction cannot prove the result is safe, fail with a validation error instead of storing it.
