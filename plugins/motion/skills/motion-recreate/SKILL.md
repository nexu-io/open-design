---
name: motion-recreate
description: >-
  Use whenever the user pastes a video link (x.com, YouTube, Vimeo and similar) or a video file, even
  with no other words: in a workspace with the user's product material, a bare link means "make a film
  like this for us". Recreates a Motion reference video as the user's own film, whether the reference
  is their own film or one they like. Covers a bare link, "make one like this / identical / same
  style", "do this for our new feature", "I want this feel", and explicit change lists (wording,
  brand, images, colours, pacing, scenes), including a few small edits to the user's own finished
  video file when no editable project for it exists yet. Reads the user's project materials first,
  asks at most once, rebuilds in an OpenMotion editor project with the content the user wants, and
  delivers the film, the editable project and an original-versus-remix comparison. A reference used
  only as loose inspiration for an otherwise original brief goes to motion-director; adapting or
  reusing an editable template goes to template-to-video; ordinary local edits to an existing editable
  OpenMotion project do not start here.
---

# Motion Recreate — reference video → the user's own film

## Role and goal

The user supplies a video and wants a version of it for themselves. Deliver that film as an editable OpenMotion project, checked against the reference with numbers and with eyes. This Skill is self-contained: [rebuild](references/rebuild.md) covers reading, measuring and rebuilding the reference; [check and deliver](references/verify.md) covers export, numeric measurement and the comparison. Use only the Tools actually returned by tools/list.

Phase one covers Motion graphics. For live action, talking heads or AI footage, say that this workflow does not support them yet.

## 0. Shared context

On first entry read the [shared context](../motion-production/references/context.md) and add only the dependencies this scope still lacks; reuse bodies already read. When entered directly, do not go back to the production router. When the reference turns out to be only loose inspiration for an original film, correct once to [motion-director](../motion-director/SKILL.md) and do not bounce back. When revising an existing draft or turning an existing project into a recreation, apply the [shared edit workflow](../motion-production/references/edit.md) and keep decisions that still hold. Missing instructions and sources must return to the model before a later call performs dependent imports, writes or export.

MCP-only clients read this page with resources/read `motion://workflow/recreate/start`; the two references are `motion://workflow/recreate/rebuild` and `motion://workflow/recreate/verification`.

## 1. Read the user's context before anything else

Before asking anything, look in the current workspace for the user's own material: README and docs, product or marketing copy, brand files, logos, screenshots, colour or font definitions, package or site metadata. Read what is there. This is the user's brand, product and latest features; use it as the content of the film.

Then read the reference as [rebuild](references/rebuild.md) describes: a local decodable copy, its URL and checksum, the whole video and consecutive frames around important changes. Links and local files take the same route. A cover image or an unreachable link is not a viewed video; never claim to have watched it.

## 2. Decide what the user wants

Work out the film the user wants from everything available: their words, whose film the reference is, what the workspace holds and the conversation so far. Short requests often mean more than they say. A bare link in a workspace with product material usually asks for a film like this about that product; "do this for our new feature" or "I want this feel" usually asks for the reference's craft carrying the user's story; an explicit list of changes asks for exactly those changes.

Whether the reference's brand stays or becomes the user's is your judgement from the request and context, not a fixed rule. When a wrong guess would change the whole film, such as "make one identical" while the workspace holds the user's own brand, put it in the single question below; otherwise decide and state the assumption at delivery.

Parts the request does not cover keep the original. Requested changes are in scope without restriction: wording, brand, images, colours, typography, pacing, duration, adding or removing scenes.

## 3. Ask at most once

Ask only when the workspace and the request together still lack something only the user can supply (brand, product, claims, numbers, prices, logos, images), or when an ambiguity would materially change the result. With usable material in the workspace, do not ask who the film is for. Offer "you decide" where it fits. This package exposes no generation Tool: when a needed image, clip or sound is missing, use the user's material, ask for it, or offer a generation tool the host actually has; never generate a real logo, product photo or factual claim.

Ask all of it in one batch through the host's question interface, in the user's language. If nothing is missing, do not ask. Do not ask about technical choices, intermediate approval or storyboards. After the answers, work through to the finished film without stopping.

## 4. Create and open the project

Follow the [runtime adapter](../motion-production/references/production.md) and [Native authoring](../motion-production/references/native.md). A continued recreation reuses its projectId. Otherwise create one project with `motion_create_project` and a stable requestId: `projectType: "reference_video"` with `referenceUrl` for a link, or `projectType: "natural_language"` for a local file, with the file path and the agreed brief in `requirements`. Creation makes an empty carrier, not a film, and never overwrites another project.

Read `motion_get_project({projectId})` for the directory, revision, current version, `hyperframesCli` and `authoringGuide`; read the pinned engine guide before writing source. Commands you run yourself (`node <hyperframesCli>`, the measurer, `ffmpeg`) use `node` and `ffmpeg` from `PATH`. The self-contained package does not put them on `PATH`: its directory is the one holding `node_modules/hyperframes` in the `hyperframesCli` path, with Node at `runtime/node/bin/node` (Windows `runtime\node\node.exe`) and FFmpeg/ffprobe in `runtime/media/bin`. For an npm installation there is no bundled `runtime/` directory: the application root is the directory containing `node_modules/hyperframes`, and `scripts/npm-runtime.mjs` exports `ensureNativeRuntime(appRoot)` and `nativeConfiguration(appRoot)`. Prepare through the former when needed; the latter returns `paths.HYPERFRAMES_FFMPEG_PATH` and `paths.HYPERFRAMES_FFPROBE_PATH` for the verified cache. Pass these as environment variables to the measurer or direct media commands. When neither is available, record the affected check as blocked with the reason; never as passed. Call `motion_open_preview({projectId})` and visibly open the returned `previewUrl` in the host's built-in browser; without browser control, continue in the background and say so at delivery.

## 5. Rebuild, then change

Follow [rebuild](references/rebuild.md) for understanding the video, choosing an editable representation, measuring and rebuilding. Build the user's version directly: rebuild the parts that stay faithfully and put the user's content into the rebuilt structure. Do not build a complete copy of the reference first only to change it again.

Import real media with `motion_import_assets` and use the returned paths; save text files (HTML, CSS, JS, SVG, JSON) with `motion_edit_project` using the latest `expectedRevision` and `expectedVersionId`. Re-read the project after a conflict instead of replaying an old batch.

When the reference is the user's own finished film and the request changes only a few details (a year, a line of copy, a logo) while everything else stays, the project may keep the original video as its base layer: import it, cover only the changed areas with clean patches and set the new text or logo as editable native elements that follow the original's timing and motion. Check that each patch leaves no smudge or seam against its surroundings. This is still the editor project and delivery below; never deliver an MP4 edited outside the project. Otherwise, placing the whole original video on the timeline is not a recreation, and an unrelated built-in template is not a substitute.

New content must keep the reference's craft, not just its palette. Match its visual density (a screen full of tiles stays full), camera and 3D motion (a tilted orbit stays tilted), type scale and type character (the closest available face of the same kind, such as a pixel, mono or wide display face, instead of a generic system font), and its background layers (line drawings, grids, textures). A line, label or headline that is clearly visible in the reference must be equally visible in the remix, and the remix must not be darker or lower-contrast than the reference. Simplifying a dense or 3D passage into a few flat cards is a defect to fix, not an acceptable approximation.

Apply the changes with care: fit longer text with related layout and reading-time changes, update every relevant appearance of a replaced brand or object, keep unrelated content and motion, never invent facts, and check audio timing when changes shift pictures.

Sound: when the reference has sound, the remix has sound. Keep the reference soundtrack by default (extract it as AAC `.m4a` and import it) and re-time it to the new cut; remove a voiceover that names the reference's brand or product. Deliver a silent film only when the user asks or the reference is silent.

## 6. Export and check

Apply the [production decisions](../motion-director/references/production-decisions.md) and [Motion review](../motion-director/references/motion-review.md) to time structure, key actions, joins and state; still frames that look similar do not replace a moving comparison. Do not restart original creative direction.

Then follow [check and deliver](references/verify.md): export the inspected version, read the automatic technical verification, inspect the exported MP4, measure it against the reference with the bundled measurer and fix every failing row before delivery.

## 7. Deliver

Copy the exported MP4 into the current workspace as `<name>-remix.mp4` and save the side-by-side `<name>-comparison.mp4` next to it, as [check and deliver](references/verify.md) describes. Leave the project open in the editor.

Reply briefly in the user's language with absolute local paths for the files (only the plain path in each link target, never a relative path): the remixed film and the comparison. For the editor, give the `previewUrl` returned by `motion_open_preview` and say the project is open there for further edits. Say in one or two sentences what changed, which assumptions you made from the workspace material, and any limitation the user would notice. When the reference, analysis or tools fall short, name the specific gap and its effect; never claim a faithful result that was not achieved.

## 8. Follow-up requests

Apply follow-ups to the same project with the shared edit workflow and export again; never start over. `motion_list_versions` and `motion_restore_version` bring back an earlier version as a new one. When the user is unhappy without saying why ("not satisfied", "第一版不太满意"), ask at most three multiple-choice questions in one batch, for example: follow the reference's story or tell our own; which feature is the hero; size and duration. Offer "you decide" as an option. Then revise the existing project.
