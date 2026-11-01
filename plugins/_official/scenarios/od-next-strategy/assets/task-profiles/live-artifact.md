# OD Next Live Artifact Task Profile v3.1.5

Use for refreshable dashboards and synchronized reports with route=live-artifact and kind=live. Resolve the real data source and refresh method first, using user-authorized local data or existing connectors. Do not describe static examples as live synchronization.

When a connector is needed, first run `"$OD_NODE_BIN" "$OD_BIN" tools connectors list --format compact` and read through connected, read-only tools. Do not ask again for known sources, bypass permissions, or hold provider tokens directly. Clarify the specific gap when a source is disconnected or the request is unclear. Do not create scheduled refreshes or external writes on your own.

The current local refresh tool reads JSON files only. If the user explicitly requires CSV or another unsupported refresh source, explain the exact limitation and ask before converting or substituting the format. Do not create a JSON replacement, claim the original format is supported, or mark the requested live delivery complete without that agreement.

Create template.html, data.json, artifact.json, and provenance.json. Templates use only escaped {{data.path}} and single-level data-od-repeat="item in data.items", never unescaped HTML injection. Retain only fields, sources, and timestamps needed for the preview; do not store credentials, request headers, or complete raw responses.

Example artifact.json structure:
```json
{"title":"Data dashboard","slug":"data-dashboard","preview":{"type":"html","entry":"index.html"},"document":{"format":"html_template_v1","templatePath":"template.html","generatedPreviewPath":"index.html","dataPath":"data.json","dataJson":{"summary":{"value":42}}}}
```

Declare refreshable local JSON sources in document.sourceJson, for example:
```json
{"type":"local_file","toolName":"project_files.read_json","input":{"path":"source.json"},"outputMapping":{"dataPaths":[{"from":"json.tasks","to":"tasks"}],"transform":"identity"},"refreshPermission":"manual_refresh_granted_for_read_only"}
```
Use actual field names for outputMapping from/to; this example copies the source file's tasks into the preview data's tasks. Write actual data to data.json in the same directory; the CLI reads it into document.dataJson. Use {"generatedAt":"<current ISO timestamp>","generatedBy":"agent","sources":[{"label":"User-provided data","type":"local_file","ref":"source.json"}]} for provenance.json. Only a registration declaring an actual sourceJson can reread its source. Without one, deliver a static snapshot and say so explicitly.

The following commands, JSON, and file structures are internal production guidance, not text to copy into user-facing plans or completion messages. For ordinary design requests, describe dashboard content, data source, refresh method, and design direction, for example: "Create a task-status dashboard from your local sample, showing tasks and statuses in a clear light layout with manual refresh."

Use the existing OD_NODE_BIN/OD_BIN environment variables directly for the commands below. Do not enumerate the environment with env/printenv or read configuration or credentials. Use the existing CLI and input structures shown here; do not search host source code or reimplement the registration service. Use tools live-artifacts --help when command options are needed. Correct failures from returned structured fields rather than repeatedly guessing interfaces.

During production, run `"$OD_NODE_BIN" "$OD_BIN" tools live-artifacts create --input artifact.json`. Use update --artifact-id <known-id> --input artifact.json only when changing the registered artifact definition. For source-data-only changes, edit the authorized source and run `"$OD_NODE_BIN" "$OD_BIN" tools live-artifacts refresh --artifact-id <known-id>`; use the returned refresh status and generated preview. Keep the same registration, slug, and template; do not call create again or rewrite the template, generated preview, or fallback data to simulate a refresh. Do not supply daemon-owned id/projectId/timestamps; use only returned IDs and files. The daemon generates index.html as the preview; the Agent must not fabricate it. Tell the user the artifact's name. Choose a stable lowercase hyphenated slug internally and use it in create input without explaining the internal identifier to the user. Use the actual registered ID and preview entry returned by the tool; do not guess random IDs or pass copied static HTML off as a refreshable entry. Preserve the same registered ID and slug on updates.

Report registration failures honestly and retain source files. Rendering source data is a production step; do not start a repeated evaluation loop afterward.

## Data and refresh rules

- Manual source refresh is provided by the registered artifact’s host controls or the documented refresh CLI. Do not add a refresh button inside the template unless a supported source-refresh interface is actually wired to it. A link to the preview or a page reload does not reread the registered data source and must not be labeled as doing so.
- The word "dashboard" alone does not justify registering an ordinary static dashboard as a live artifact. When refresh is needed, prefer the user's specified local file or connected source. Use connected, read-only, refresh-capable tools; never bind external writes to a refresh button.
- Use the existing tools connectors execute entry point for connector calls. Record only safe connectorId, toolName, accountLabel, necessary input, and outputMapping. Map source fields to preview fields; refresh must not rebuild the template.
- When the user names a connected source, first locate content by topic using a read-only search tool actually present in the catalog. Do not ask again for a known source. For example, search Notion first and fetch a database only after its ID is supplied or confirmed by search. Clarify the specific page/topic only when several candidates remain or the topic is insufficient.
- JSON limits: depth 8, 100 keys per object, 500 items per array, 16KiB per string, and 256KiB total. Aggregate larger responses to the data needed for the preview; do not retain complete API responses.
- Every displayed field that changes with its source must update through sourceJson/outputMapping. A source containing only a task array can be displayed directly as a list. Do not hard-code initial total/completed counts into data.json and claim they refresh live. Omit derived metrics that cannot be recomputed reliably.
- Binding supports escaped text and single-level repeat only: no nested loops, filters, or script expressions. Do not interpolate into script/style, event attributes, tag names, or srcdoc. Design the empty state in the original template: for example, repeated `.task-row` elements inside `.task-list`, an adjacent `.empty-state`, and CSS that shows the empty state when `.task-list` has no `.task-row`. An empty source array must render zero previous rows without editing the template or substituting sample data. Show understandable stale-data and read-failure states.
- User-facing filters must work within the script-free template contract. For structural CSS selection, keep each item's selector and its data row in the same repeated wrapper; hide only nonmatching data rows while keeping the selector controls available. A checked control in a separate filter bar does not satisfy `:has(:checked)` inside a data row. Do not add decorative filters that hide every row, assume unsupported binding expressions, or bypass script validation. Explain the specific limitation if a requested interaction cannot be represented with supported controls.
- Initial registration and later updates both undergo host validation. Correct your input according to specific errors; do not bypass validation. Keep the last valid content when refresh fails, and do not label failure as synchronization success. Do not schedule refresh without user authorization.

## Stable list and empty-state structure

Put `data-od-repeat` on each row, never on the list container: the renderer repeats or removes the marked element itself. Keep one unmarked list container even when the array is empty, so the adjacent empty-state selector can still match. Adapt field names and translate the empty-state text to the user's language.

```html
<style>
  .empty-state { display: none; }
  .task-list:not(:has(> .task-row)) + .empty-state { display: block; }
</style>
<div class="task-list">
  <div class="task-row" data-od-repeat="item in data.tasks">
    <span>{{item.name}}</span><span>{{item.status}}</span>
  </div>
</div>
<p class="empty-state">No tasks yet.</p>
```

Define this structure at initial creation. A later data-only refresh must preserve it, including when the source becomes empty. Do not repair an empty state by changing a user-locked template during that refresh.
