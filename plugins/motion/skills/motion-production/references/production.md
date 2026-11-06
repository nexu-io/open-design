# Motion runtime adapter · phase one

Use the nine Tools actually returned by tools/list. Read [Native authoring](native.md) and the pinned engine guide before authoring. Keep one native project and one renderer; creative code is authored by the host Agent.

| Responsibility | Public Tool / supported scope |
| --- | --- |
| Create | motion_create_project: independent project, saved requirements, optional builtin template/reference; returns IDs and initial version |
| Read | motion_get_project: project list page5, explicit details, bounded text file reads, associated export status |
| Import | motion_import_assets: real local image/audio/video attachments, per-item results, immutable asset IDs, no automatic placement |
| Save | motion_edit_project: revision + version check, one atomic text batch and optional requirements, one content version |
| Preview | motion_open_preview: explicit project or bound session, native lint, exact editable Studio URL; host opens browser |
| Version | motion_list_versions / motion_restore_version: page5 history, restore as a new version, retain later history/resources |
| Export | motion_export_request: immutable snapshot, background MP4, automatic lint and technical verification |
| Cancel | motion_export_cancel: explicit owned job, distinguish cancelling/cancelled/completed |

## Execution

1. Reuse complete guidance already read. Installed Skills and MCP resources/read provide the same documents; production start only routes a task that lacks a specialist. Changes to existing content use [edit workflow](edit.md). Missing instructions/source reads return to the model before dependent writes.
2. Reuse the target projectId or explicitly create a new one. Read its current revision and content version. No global most-recent project fallback. Five is a list page size, not a retention policy.
3. Use returned asset paths and native HTML/CSS/JS. Import and file save are separate operations. Images/footage/music generation belongs to the host's available tools or Studio; no generation Tool is exposed by this phase-one MCP package. Missing media capabilities must be stated.
4. Follow the [native loop](native.md), preserve locked content and existing Studio manifests. Inspect actual frames, motion and sound. A saved source file or successful lint is not creative acceptance.
5. Export only when requested. Reuse an applicable job before submitting another. Save a stable requestId per action: exact retry returns the original outcome; changed input with the same requestId is rejected. Failed request correction uses a new requestId.
6. Poll the named job through project details. Only completed exposes its real MP4 and technical verification. Inspect [final playback and evidence](verification.md) separately; record unavailable checks as not_run.

## Handoff

Preserve index.html, referenced compositions/media/scripts, hyperframes.json and native Studio manifests. A copied folder is a handoff artifact, not proof it is active. Never edit projects.json, workspace.json or export.json to simulate project selection or task completion. Documents/evidence belong outside the live project. Do not publish or upload as an incidental step.
