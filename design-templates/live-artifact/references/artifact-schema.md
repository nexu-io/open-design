# Live Artifact Schema Reference

Live artifacts are stored as daemon-owned project files under `.live-artifacts/<artifactId>/`. Agents author the source files, then register them through daemon tooling. The daemon assigns IDs, project scope, timestamps, run scope, and refresh status.

## Source files

| File | Owner | Purpose |
| --- | --- | --- |
| `artifact.json` | agent-authored input, daemon-validated | Artifact metadata, preview settings, document metadata, and source descriptors. Must not contain daemon-owned fields. |
| `template.html` | agent-authored | `html_template_v1` template used to render the preview. |
| `data.json` | agent-authored then refresh-runner-updated | Canonical preview data. API `document.dataJson` is only a derived cache. |
| `provenance.json` | agent-authored then refresh-runner-updated | Source summary and generation notes. |
| `index.html` | daemon-derived | Generated preview output. Do not treat as source of truth. |

## Create/update input

`artifact.json` should match `LiveArtifactCreateInput` or `LiveArtifactUpdateInput` from `packages/contracts/src/api/live-artifacts.ts`.

Allowed agent-owned top-level fields:

- `title`
- `slug`
- `sessionId`
- `pinned`
- `status`
- `preview`
- `document`

Daemon-owned fields are rejected in agent input:

- `id`
- `projectId`
- `createdAt`
- `updatedAt`
- `createdByRunId`
- `schemaVersion`
- `refreshStatus`
- `lastRefreshedAt`

## HTML document contract

MVP documents use `html_template_v1`:

```json
{
  "format": "html_template_v1",
  "templatePath": "template.html",
  "generatedPreviewPath": "index.html",
  "dataPath": "data.json",
  "dataJson": {}
}
```

`template.html + data.json` is rendered by the daemon into `index.html` and the preview route.

### Binding rules

- Use escaped interpolation: `{{data.path.to.value}}`.
- Paths must start with `data` and use dot-separated keys; numeric array indexes are allowed as path segments.
- Supported structural directive: `data-od-repeat="item in data.items"` for one-level array repeats.
- Nested repeats, conditionals, filters, helper functions, partials, and expression evaluation are not supported.
- Raw HTML insertion is forbidden: no triple braces, ampersand interpolation, `data-od-html`, `data-od-raw`, or equivalent.
- Interpolation in text and ordinary attributes is HTML-escaped by default.
- Do not interpolate inside tag names, attribute names, comments, `<script>`, `<style>`, `<iframe srcdoc>`, event-handler attributes, or unsupported URL-bearing attributes.

## Bounded JSON limits

All persisted JSON values must fit the shared bounded JSON envelope:

| Limit | Value |
| --- | ---: |
| Maximum object/array depth | 8 |
| Maximum keys per object | 100 |
| Maximum array length | 500 |
| Maximum string length | 16 KiB |
| Maximum serialized JSON size | 256 KiB |

Forbidden keys anywhere in persisted JSON include `raw`, `rawResponse`, `payload`, `body`, `headers`, `cookie`, `authorization`, `token`, `secret`, `credential`, and `password`.

## Minimal static artifact input

```json
{
  "title": "Release Status",
  "preview": { "type": "html", "entry": "index.html" },
  "document": {
    "format": "html_template_v1",
    "templatePath": "template.html",
    "generatedPreviewPath": "index.html",
    "dataPath": "data.json",
    "dataJson": {
      "summary": {
        "title": "Release Status",
        "status": "On track"
      }
    }
  }
}
```
