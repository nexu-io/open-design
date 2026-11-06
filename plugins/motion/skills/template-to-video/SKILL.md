---
name: template-to-video
description: Use an existing editable HyperFrames template folder, ZIP or selected gallery source to deliver a video or adapt its content. Includes the accepted first-run Product Promo experience. Reuse the current project for continued edits; a video reference alone belongs to motion-recreate, while producing a reusable template belongs to video-to-template.
---

# Template project → video

## Scope and shared execution

Turn the selected editable template into the requested draft, editable project or finished video, preserving its agreed structure, motion and style. This is the implemented template route, including direct Skill selection. Read [shared context](../motion-production/references/context.md) once and apply only dependencies needed by this scope; reuse complete bodies and completed operations. Continue here without returning to production/start. MCP-only clients use resources/read `motion://workflow/template/start`, which returns this same file with `status: "ready"`.

Changes to existing content use the [shared edit workflow](../motion-production/references/edit.md), including required related changes and preserved content. Missing instructions and target sources must finish returning to the model before a later call applies a template, imports, writes or exports. Entering this Skill again does not create another copy, apply the template again or repeat a completed export.

The accepted installation experience follows [first-run defaults](../motion-production/references/templates.md#first-run-experience-defaults): builtin `product-promo`, unchanged sample content, one separate 20-second project, the right-side editable preview and a completed MP4 are already selected. Resume an existing experience project; otherwise create it once. This invitation explicitly includes opening the editor and delivering the MP4, with no new template/assets/export questionnaire.

## Open the supplied project

A template is a complete native HyperFrames project, not necessarily a catalog entry. For a supplied folder or ZIP, inspect/unpack it and make a working copy when editing or rendering is needed; resume that copy on later turns. Read `index.html`, native configuration and `TEMPLATE.md` (older templates may have `EDITING.md`/`REPLICA.md` instead) for changes or a fresh render. Unchanged preview delivery only needs the preview's identity and decode check. Preserve source, assets and hidden Studio manifests. Do not require `template.json`, a local template ID or catalog registration.

If the user selected a gallery/catalog item instead, read its exact source/guide and ID, then follow [catalog capabilities](../motion-production/references/templates.md). Bundled projects use `motion_create_project` with projectType=template, templateId, requestId, title and requirements only when the selected project has not already been created. Editable registry sources are inspected and adapted from their real source and assets; external IDs are not apply-template IDs. An external reference video is not an editable template: ordinary video recreation uses [motion-recreate](../motion-recreate/SKILL.md); a request to produce a reusable template uses the separate video-to-template source extension, which is not shipped in the phase-one package. Correct the route once, carrying the selected source and scope, rather than substituting an unrelated example.

See the [portable project contract](../motion-production/references/portable-project.md) for the handoff layout. HTML/CSS/JS is authoritative; metadata and editable variables are aids, not modification limits.

For a plugin-managed artifact, use the [runtime adapter](../motion-production/references/production.md): confirm session/artifact ownership, read the current project and revision, and use existing MCP source/import/export tools with that revision. A real conflict requires reading the newer source and forming the edit again; preserve Studio changes and never bypass the guard or replay an old full file. For an independent folder/ZIP, work on its actual source/copy and record before-edit file evidence; a revision from an unrelated active MCP artifact cannot protect this directory.

## Unchanged: deliver the preview; changed: edit the working project

With no requested changes to the supplied template, deliver its `preview.mp4`, which represents that source. Copy it into the current workspace (for example as `<template-name>.mp4`) without re-rendering, re-encoding or comparing it. On a continued project that has already been edited, the original template preview is no longer the current result: reuse an applicable completed export or render the latest inspected source/revision. Otherwise render only when the template has no preview (older or gallery projects) or the user explicitly asks for a fresh render. Use the existing working project, or create a copy once, without re-creating its design or changing its content/assets, using the pinned HyperFrames runtime identified in the project notes. Read its authoring guide/help; `motion_open_preview` can supply the runtime path if needed. Render the directory directly, for example with HyperFrames 0.9.7:

```sh
node /absolute/path/to/hyperframes/bin/hyperframes.mjs render /absolute/path/to/project-copy -o /absolute/path/to/output.mp4
```

Do not open a browser unless the user asks to preview or use the editor. Native lint, snapshots and rendering work in the background. Plugin-managed projects may instead use the existing MCP inspection/export/verification tools.

Before editing, ask the user when the request needs facts or assets only they can supply (brand, product, claims, prices, images), or when an ambiguous request would materially change the result. Ask all needed questions at once. Decide minor layout and timing details yourself and mention them briefly. Do not ask anything for an unchanged render.

With requested changes, apply the shared edit workflow to the current working project. Use variables when helpful; edit HTML/CSS/JS, scene structure and media directly when the request needs it. Preserve unrelated content and motion. For longer wording, make the necessary related wrapping/layout/reading-time changes instead of forcing it into an unreadable original interval. Keep replaced wording in the template's type character (the same pixel, stencil, wide or display style), not a generic fallback face. Check text fitting and media cropping after edits. If brand, image or named-object replacements recur, update their relevant repeated appearances, not just the most prominent one. Do not invent prices, claims or other missing facts.

When a reading hold shifts later pictures, inspect existing audio timing too. Preserving the audio file does not prove synchronization or continuous sound. Report any retained mismatch or silent tail; do not introduce audio generation services to resolve it.

## Verify and deliver

For an unchanged request delivered from `preview.mp4`, only probe that the copied file exists and decodes; do not compare it with anything. If you had to render because there was no preview, decode/probe the output and inspect representative frames. For an edited request, decode/probe the actual exported MP4 and inspect representative frames.

For an edited request, inspect the requested content, its related layout/timing and unchanged sections against the template's `preview.mp4`. Verify that supplied replacement assets are actually used and old brand content does not remain at another relevant appearance. Record passed, failed and unrun checks separately in the copy's `TEMPLATE.md`. Save outputs in the current workspace and link them by absolute local path, with only the plain path in each link target; never a relative path or a temporary localhost URL. Keep the reply short and in the user's words: the MP4, the edited project when applicable, one or two sentences on what changed, and only the limitations the user would notice. For an unchanged request, the MP4 and one sentence are enough. Humans decide visual acceptance; do not give a subjective pass/fail verdict. Do not claim independent-agent verification unless a separate session actually performed it.

For edited or freshly rendered requests, apply the relevant [review standards](../motion-director/references/motion-review.md); changed multi-scene relationships use [production decisions](../motion-director/references/production-decisions.md), and sound changes load the shared context's sound references. These standards do not restart original creative intake or impose a new style on the template. For a fresh managed export, follow [verification](../motion-production/references/verification.md) using the completed job/revision; reuse a matching existing job. Copied unchanged previews use only the existence/decode branch above and create no export job. Stop at the user's requested delivery stage; a draft or review-only request does not automatically render.

If source edits change exposed variables, keep those shortcuts connected or remove stale declarations and explain the source editing entry. A variable declaration alone does not prove the control still works.
