# Native Hyperframes authoring · phase one

Read the pinned engine guide returned as `authoringGuide` by project details, or MCP resource `motion://engine/SKILL.md`. Relative engine Markdown references are available below `motion://engine/`. Skills are guidance; the host Agent writes the actual native video.

## Project loop

1. New work uses `motion_create_project` with a stable requestId, projectType, title and requirements. A prompt/reference creates a carrier, not a finished film. Template creation requires a real copyable builtin ID; select it through the Studio gallery or a provided guide. Existing work reuses its projectId.
2. `motion_get_project({projectId})` reads the explicit project, entry HTML, directory, file inventory, requirements, revision and current version. Without projectId it lists five projects per page; follow nextCursor. Never infer another chat's active project.
3. Read text through `motion_get_project({projectId,file:{path,offset,length},expectedRevision})`. Offsets are UTF-8 byte boundaries; follow nextOffset. Media bytes stay out of MCP text responses.
4. `motion_import_assets({projectId,requestId,items:[{itemId,sourcePath}]})` imports real local image/video/audio attachments in a batch. Source paths must exist on the server machine. Check every result and use the returned asset path. Import does not place media on the timeline. Keep stable itemIds for retries; never overwrite historical resources.
5. `motion_edit_project({projectId,requestId,expectedRevision,expectedVersionId,files:[{path,content}]})` saves one batch of text files and optional requirements. Maximum 100 files / 8 MiB; metadata paths are reserved. All-or-none failure protection uses Studio's exclusive native history window and a recovery journal. Reread after a conflict; do not replay an old patch against unknown GUI changes.
6. `motion_open_preview({projectId})` opens this existing project in Studio and runs lint. Open its exact previewUrl in the host browser before reporting it opened. A fresh unbound client must supply projectId or an OpenMotion sessionId. Preserve embed/query/hash. It does not silently create a project.
7. Inspect actual motion, timing, sound and affected joins. Local/Studio changes become native content snapshots; querying flushes saved history metadata without editing source. Return to step 2 after GUI edits.

## Native composition contract

- Root: `data-composition-id`, `data-start="0"`, `data-duration`, `data-width`, `data-height`, and optional `data-fps`.
- Scene hosts: unique `id`, matching `data-composition-id`, `data-composition-src="compositions/scene.html"`, `data-start`, `data-duration`, and `data-track-index`. Scene files wrap markup, styles and scripts inside `<template>`.
- Clips use native timing in seconds. A scene's clock starts at zero. Media trim is `data-media-start`; track index controls the Studio lane, while CSS controls paint order.
- Use the local `assets/gsap.min.js` installed with the default project. Register a paused GSAP timeline under `window.__timelines[compositionId]`. Prefer `fromTo` for repeatable seeking. Do not use wall-clock timers or call `.play()` to drive render animation.
- Use `<video muted playsinline>` for silent footage, or `data-has-audio="true"` to retain sound. Use timed `<audio>` with `data-volume` for separate music or voiceover. Hyperframes handles mixing.
- Keep root duration long enough for all scenes, animations and media. Choose dimensions/fps for the user's deliverable; the old fixed 540×960/24fps limits do not apply.

Only when the selected scope is video recreation, inspect the supplied reference and express its agreed pacing/structure using native clips and source trims; import reference media locally when needed for analysis or authorized final use. A style-only reference in original creation does not require copying its pacing or importing it into the finished project. Implement editable motion as native compositions and use upstream catalog blocks where suitable. Do not promise semantic or pixel-perfect reconstruction without comparison evidence. The old heuristic cut detector and shot-form UI are no longer the active workflow.

For upstream capabilities beyond the installed MCP tools, run `node <hyperframesCli> <command> ...` in the returned project directory using an argument-safe shell invocation. Use official `docs`, `catalog`, `add`, `snapshot`, `check` and other native commands according to their help and the bundled guide. CLI writes also change the content revision; read the project again afterwards. Do not install global skills or replace the pinned runtime as an incidental step.

## Versions and export

`motion_list_versions({projectId})` returns five content versions per page, not five individual-file saves. A version includes source, styles, timing/effects and local resources. `motion_restore_version` requires target versionId and the current expectedRevision/expectedVersionId. Restoring v3 at v5 creates v6; v4/v5 remain. Missing historical resources cause an explicit error before source changes.

Only when the scope includes export/final delivery, use `motion_export_request({projectId,requestId,versionId,expectedRevision,audio})`. The service freezes local files/media, lints, renders MP4 and verifies the real file with FFmpeg/ffprobe. Poll `motion_get_project({projectId,exportJobId:jobId})`; only completed with a passed verification is technical success. External URLs remain external dependencies. A later edit cannot change the frozen snapshot.

`motion_export_cancel({projectId,requestId,jobId})` returns cancelling until the owned process exits; cancelled is terminal. Completed jobs stay completed. Stopping a host conversation does not automatically cancel a background job.

Follow [verification](verification.md) for final frames, audio and actual play/seek/replay. Real review evidence can be recorded with action=record_review on preview/export tools; never invent evidence or treat declared user feedback as verified adoption. Keep documents/evidence outside the live project. Preserve native files, media and Studio manifests for editable handoff.
