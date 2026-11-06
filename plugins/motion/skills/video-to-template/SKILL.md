---
name: video-to-template
description: Turn a supplied Motion video file or link into a reusable editable HyperFrames template folder or ZIP, with source, assets, preview and editing notes. Use when the requested deliverable is a reusable template; ordinary video recreation belongs to motion-recreate, and using an existing template belongs to template-to-video.
---

# Motion reference → editable project

This is the separate video-to-template production entry, selected for a requested reusable template. Read [shared context](../motion-production/references/context.md) for the current scope and reuse available bodies without returning to the router. MCP-only clients read this same file with `motion_get_workflow({"workflow":"video-to-template","section":"start"})`; follow supporting references only when needed. Revisions to an existing template draft use the [shared edit workflow](../motion-production/references/edit.md). A request to recreate a finished video without a reusable-template deliverable stays with [motion-recreate](../motion-recreate/SKILL.md), whose specialist implementation remains pending.

Deliver the requested reusable template as a native HyperFrames project with local assets and an actual preview. Phase one covers Motion graphics. Preserve supplied sound when relevant; do not introduce live-action, voice, music or multimodal generation services to complete this workflow.

Closely match the reference's pictures, composition, motion and pacing while preserving editability. Reproduce texture, depth and lighting present in the reference; do not add decorative effects merely to make it look more polished.

A reference plus change requests is not a phase-one workflow of this Skill. Deliver the faithful template first and report that requested changes belong to `template-to-video` applied to the delivered template; do not mix changes into the rebuild.

## Understand the requested result

Read the reference as a whole before choosing implementation. Inspect representative frames and continuous frames around important changes. Explain what persists, enters, changes, holds and exits; keep an object's identity across cuts when it is the same object. Learn from observable behavior rather than guessing the original author's code.

Preserve the reference's content, wording, brand, composition and motion as they are; do not pre-substitute them. Content replacement happens later with `template-to-video`.

For a link, obtain a local decodable reference using available host capabilities. No particular downloader is a prerequisite. Preserve the URL and checksum. Explain an actual access limitation rather than requiring a specific downloader installation.

Work from start to finish without asking questions. Where the reference is ambiguous, choose the most faithful reasonable option, finish it, and record the choice and trade-off in `TEMPLATE.md`. Stop only when the work cannot proceed, such as an inaccessible link or an undecodable file; then report that specific blocker instead of asking for preferences.

## Choose an editable representation

Choose source and component boundaries through shared behavior. Objects sharing geometry, state, layout or motion can form one SVG, Canvas, Three.js scene or native composition. Independent contributions can stay separate. There is no requirement for one HTML clip per object, one composition per cut, one tween per move or a fixed number of poses.

Keep content the user will change easy to locate: wording, brand, images, named objects and their motion. Use meaningful source names. Declare the common edits as root variables so the Studio Variables panel shows them; variables are useful shortcuts, not an editing whitelist. HTML/CSS/JS remains authoritative.

Use code for controlled text, geometry and motion; use supplied/cropped photos, logos, screenshots and textures as appropriate local assets. Choose 2D, perspective layers or real 3D according to the observed behavior and needed edits, not the number of perspective shots. Distinguish editable text from artwork that requires an asset replacement.

Do not pass off playback of the entire reference, a full-frame image sequence, target editable content baked into a background, or an unadaptable per-frame contour transcription as a rebuilt template. Judge independent assets by their purpose and effect on intended edits, not crop area alone. Time-driven functions, loops, arrays, simulations and shape interpolation are valid techniques when the project's content and behavior remain reasonably editable. The same input time and settings must produce a reproducible frame.

## Make and check the work

Read the pinned native authoring guide; create a separate project directory. Do not assume a catalog ID exists. Use native source directly, or the team's existing tools when useful. `motion_open_preview` can initialize the runtime and return its CLI/guide paths; it does not require displaying the editor. Keep routine work in the background. Provide a real preview when requested; open the editor only when requested.

Use [reference measurement](references/measure.md) for questions that need exact timing, dimensions or layout. Use [rebuild guidance](references/rebuild.md) for grouping, media and edit dependencies. For an unfamiliar or difficult visual system, a short representative segment can establish a useful approach before expanding the film; this is advice, not a mandatory extra stage.

Compare actual frames with the reference while developing. Fix concrete issues such as omitted content, wrong text, broken assets and incorrect timing. When two consecutive fixes for the same issue do not visibly reduce the difference at the same moment, change the approach once; if that also fails, record the issue in `TEMPLATE.md` and move on.

Verify detected hard cuts against adjacent source frames. Restore a missing original hard cut unless the user requested a change; do not accept accidental smoothing or an automatic detector's false positive as intended behavior. Recording a remaining defect is not evidence that it passed.

Finish with [technical checks and packaging](references/verify.md) and the [portable project contract](../motion-production/references/portable-project.md). Deliver the complete folder/ZIP, preview and cover, with one `TEMPLATE.md` inside. Do not require registration, a template ID or a custom content schema. Keep the reply short and in the user's words: absolute-path links to the preview, the template and the original-versus-template comparison; what can be changed; and where it still differs from the original. Technical check results stay in `TEMPLATE.md`; mention one in the reply only when it affects the user, such as a silent tail or a substituted font. Humans decide visual acceptance. Do not reject or repeatedly rework a deliverable solely because of a similarity score or your own taste.

Keep two checks separate: reference-to-rebuild uses diagnostics and human visual judgment; the package check confirms the unpacked ZIP renders elsewhere without missing files or creator-machine paths, with the frame rate, frame count and duration of `preview.mp4`. It is not a pixel comparison; do not spend repair rounds on invisible differences.

[Guidance sources](references/rule-sources.md) separates reviewed material, observed evidence and advice. Do not treat one sample or another product's documentation as a universal effect guarantee.
