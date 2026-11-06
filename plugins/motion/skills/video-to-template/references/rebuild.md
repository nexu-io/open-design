# Native source and useful editing boundaries

Use the pinned HyperFrames authoring guide for its actual runtime contract. This page describes editing decisions, not a replacement engine or mandatory project architecture.

## Group by behavior

A composition can own a coordinated scene; independent captions or graphics can remain peers. One object can contain SVG subpaths, nested geometry or code-defined children. Preserve useful identity through names, IDs, source functions or asset references. Studio selects existing native elements; code-defined subobjects remain editable in source even when they lack separate Studio controls. Explain that distinction in `TEMPLATE.md`.

Choose the number of compositions, clips and files for the work. Keep relative scene time distinct from the root timeline. Use as many meaningful key states or procedural relationships as the observed behavior needs. Do not reduce arbitrary motion to one tween or require one track per visual object.

Canvas/WebGL must follow the pinned runtime's seek/readiness contract. In HyperFrames 0.9.7 a host without a GSAP timeline uses `data-no-timeline`; time-driven rendering listens to the documented seek mechanism. Derive the picture from input time/settings, including deterministic randomness or reproducible simulation state. Wall-clock playback must not make exported frames change unpredictably.

## Use assets and text appropriately

Photos, screenshots, textures, logos and extracted independent figures can remain local assets. Record their source and useful crop/mask relationship. A whole reference video or full-frame sequence is not an editable reconstruction merely because it sits inside HTML. Per-frame evaluations are normal; a copied contour table is inadequate when it prevents reasonable changes to the intended objects or motion.

Keep requested editable wording as addressable text/string content. Bundle a stable font when the project uses it. A stylized logo or calligraphic artwork can instead be an image/vector asset; document the replacement location and limitation. Do not build a new font just to satisfy an all-text rule when an appropriate independent asset meets the task.

Preserve or adapt supplied sound according to the request. Referencing the original as audio, extracting its soundtrack, trimming it or using several tracks are all valid when timing and dependencies remain correct. Audio production and new generation services are outside this phase.

## Make common edits discoverable

Use root variables for common content when useful, with labels the user understands. Do not require every object or decorative property to be a variable. Source edits can also change structure, layout, media and timing.

When an image changes, inspect its crop, masks and coupled effects. When wording changes, inspect wrapping and reading time. When a scene's duration changes, update dependent scene starts and media timing. When a brand or named object appears several times, check all relevant appearances. Preserve unrelated content.

`TEMPLATE.md` connects observed reference objects/behaviors to their reconstruction and differences, and identifies source/asset entry points, common edits and related effects on layout/timing. Record meaningful systems, not every decorative subpath. Keep existing variable shortcuts functional or remove stale declarations; direct source editing remains available.

## Inspect actual results

Choose static frames for layout, consecutive frames for entrances or shape changes, and playback for rhythm. Native lint/timeline/info and optional diff diagnostics help locate problems. Use either the native CLI in the supplied project directory or MCP tools for a plugin-managed project; the latter are not required for direct project authoring.

If results lose texture, depth, blur or a hard cut, inspect how the reference produces that observable effect before choosing a correction. Do not prescribe fixed glow/blur values. Human review decides whether the overall result is acceptable; report technical problems and concrete remaining differences separately.
