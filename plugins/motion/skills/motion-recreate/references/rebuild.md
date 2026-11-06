# Read, measure and rebuild the reference

This page carries the reconstruction method for motion-recreate. It is guidance for the host Agent; the native source is written by the Agent and saved through the project Tools.

## Read the whole reference

For a link, obtain a local decodable copy using the host's available capabilities; no particular downloader is a prerequisite. Keep the URL and the file's checksum. If the video cannot be obtained or decoded, report that specific blocker instead of guessing from a cover or description.

Read the reference as a whole before choosing an implementation. Inspect representative frames and consecutive frames around every cut, entrance, exit and transition. Explain what persists, enters, changes, holds and exits; keep an object's identity across cuts when it is the same object. Learn from observable behaviour rather than guessing the original author's code. A one-per-second overview is for navigation only and is never evidence of motion: it drops 1–3 frame differences, entry directions, blur and flashes at cuts.

## Measure with the pinned CLI

Run `node <hyperframesCli> measure …` with the `hyperframesCli` path from `motion_get_project`. These commands answer specific questions; running every one is not mandatory. Write images into a working directory outside the live project with `--out`, then read them.

| Question | Command | Use |
|---|---|---|
| Canvas, fps, duration | `measure probe <ref>` | Root `data-width`, `data-height`, `data-fps`, `data-duration`. Keep rational rates such as `30000/1001`; use the picture duration, not a longer audio container |
| Hard cuts | `measure cuts <ref>` | First draft of the segmentation; verify each candidate against adjacent source frames |
| What changes when | `measure events <ref> --map --out <dir>` | Appearance, disappearance, holds, sound onsets and beats |
| Frame by frame | `measure frames <ref> --range a,b --roi x,y,w,h --max 16 --out <dir>` | Entry direction and style, on-screen change, exit, edge treatment |
| Motion curve | `measure curve <ref> --start a --end b --roi x,y,w,h` | Start, end, duration, overshoot and the closest GSAP ease; a starting estimate |
| Text size | `measure ink <ref> --at t --roi x,y,w,h` | Ink width and height to match type scale |
| Background and colour | `measure look <ref> --at t --grid 8x6` | Gradient direction and light-to-dark falloff |
| Crop an asset | `measure extract <ref> --at t --roi x,y,w,h --out <dir>/logo.png` | Photos, screenshots, logos from their largest, sharpest frame; then import |

Also look for texture where the reference has it: how much a back layer blurs and darkens, how bright the highlights are, and the direction and length of motion blur on fast frames. Reproduce what is there; do not add effects for polish.

## Choose an editable representation

Choose source and component boundaries through shared behaviour. Objects sharing geometry, state, layout or motion can form one SVG, Canvas, Three.js scene or native composition; independent contributions can stay separate. There is no requirement for one clip per object, one composition per cut, one tween per move or a fixed number of poses. Keep relative scene time distinct from the root timeline.

Keep content the user will change easy to locate: wording, brand, images, named objects and their motion. Use meaningful source names and declare common edits as root variables so the Studio Variables panel shows them. Variables are shortcuts, not an editing whitelist.

Use code for controlled text, geometry and motion; use supplied or cropped photos, logos, screenshots and textures as local assets. Choose 2D, perspective layers or real 3D according to the observed behaviour and the needed edits. Canvas/WebGL follows the pinned runtime's seek and readiness contract: derive the picture from input time and settings, including deterministic randomness, so the same time always renders the same frame.

Do not pass off playback of the entire reference, a full-frame image sequence, editable content baked into a background, or an unadaptable per-frame contour transcription as a rebuild. Time-driven functions, loops, arrays, simulations and shape interpolation are valid when the content stays reasonably editable.

## Assets, text and fonts in this package

- Images, footage and sound go through `motion_import_assets` (PNG, JPEG, WebP, GIF, MP4, WebM, WAV, MP3, OGG, FLAC, AAC, M4A). Import does not place media on the timeline; reference the returned path.
- SVG logos and vector artwork are text: save them with `motion_edit_project`.
- Font files cannot be imported. Choose type by character (geometric shapes, contrast, x-height, terminals): start with the fonts listed in the authoring guide; when none fits, embed a permitted font as a base64 `@font-face` in a CSS file saved through `motion_edit_project`, or name the substitution at delivery.
- When replaceable text uses distinctive lettering (pixel, stencil, wide or hand-built wordmark), make any new word settable in that same style: the closest face of the same kind, or lettering built so other words can be set with it. Vectorising only the reference's own word leaves every later edit in a plain fallback font.
- Keep requested editable wording as addressable text. A calligraphic logo can be an image or vector asset instead.

## Rebuild and compare while working

Compare actual frames with the reference while developing. Fix concrete issues such as omitted content, wrong text, broken assets and incorrect timing. When two consecutive fixes for the same issue do not visibly reduce the difference at the same moment, change the approach once; if that also fails, record the issue and move on.

Verify hard cuts against adjacent source frames. Restore a missing original hard cut unless the user requested a change; do not accept accidental smoothing or a detector's false positive as intended behaviour.

When an image changes, inspect its crop, masks and coupled effects. When wording changes, inspect wrapping and reading time. When a scene's duration changes, update dependent scene starts and media timing. When a brand or named object appears several times, check all relevant appearances.

For an unfamiliar or difficult visual system, a short representative segment can establish the approach before expanding to the whole film; this is advice, not a mandatory stage.
