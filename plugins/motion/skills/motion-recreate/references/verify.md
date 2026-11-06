# Check and deliver the remix

## 1. Export the inspected version

Read `motion_get_project({projectId})` for the current revision and version, then `motion_export_request({projectId,requestId,versionId,expectedRevision,audio})` with `audio: "required"`, or `"silent"` when the reference has no sound. Poll `motion_get_project({projectId,exportJobId})` until the job is `completed` or `failed`; on failure read the error, fix the source and export again with a new requestId. Only a completed job with passed automatic verification is a technical pass; it does not judge the picture. Follow the shared [verification](../../motion-production/references/verification.md) for playback and the record.

## 2. Inspect the exported MP4

Inspect representative frames of the exported file at the delivered size:

- Every requested change is present, and the reference's brand does not remain anywhere it was meant to be replaced.
- Unchanged parts and the reference's craft (density, camera motion, type) still look like the original.
- Text fits, media crops correctly, and the original's hard cuts stay hard unless a change removed them.

## 3. Measure with numbers

Looking is not enough, and this step cannot be skipped or recorded as "not run". Pick at least three moments: the opening title, the densest middle frame and the end card. For each one, view both frames at the delivered size and run the measurer bundled with this Skill (the Skill directory is the one holding this Skill's `SKILL.md`):

```sh
node <skill directory>/scripts/measure_frame.mjs reference.mp4 remix.mp4 --t <remix seconds> --ref-t <reference seconds> [--region x,y,w,h --ref-region x,y,w,h]
```

It needs only Node and `ffmpeg`/`ffprobe`; run it with the package's own Node when `node` is not on `PATH` (see the Skill's project step) and it finds the complete ZIP's FFmpeg itself. For npm installations, resolve and pass the native cache paths as environment variables using the Skill's project step; do not assume a `runtime/` folder exists. Without a region it compares the whole frame: brightness (`mean_luma`), line and label detail (`detail`) and strong colour (`accent`). With a region it also measures the box of the content inside it, light on dark or dark on light: `height_px`, `height_ratio` and whether it touches the frame edge (`clipped`). At each moment, measure the whole frame and every text or logo element: the headline, a typical label, and on the end card the tagline and the logo. Always pair an element with the one that replaces it (the remix's tagline against the reference's tagline), never with a different, larger element. The check fails when:

- `region_status` is not `measured`. `failed` means the remix region holds nothing: the element is missing or the region is wrong. `blocked` means the reference region holds nothing: choose a region around the reference element and measure again. Neither is ever recorded as passed. A region outside the frame stops the measurer with an error; fix the region.
- `height_ratio` is below 0.8 for any element. When the user's copy is longer, wrap or reflow before shrinking.
- `clipped` is true, or any text, logo or UI element touches or crosses the frame edge or its container. A logo is clipped only where the reference clips its own logo the same way; when the user's logo is a wide lockup and the reference shows a square emblem, use the logo's symbol or fit the whole lockup inside the frame.
- `brightness_ok`, `detail_ok` or `accent_ok` is false: the remix is darker, sparser (fewer lines, labels, wireframes) or has lost the reference's coloured lines and fills.

Fix failures by resizing, wrapping, moving, re-timing or adding the missing layers. Never fix them by deleting labels, tiles or layers the reference shows. Export again and re-measure until every row passes. Do not deliver while a row fails; when a row still fails after a changed approach, name it in the reply as a limitation.

## 4. Record

Keep the record outside the live project, in the workspace `VERIFY.md` described by the shared verification: the source video and checksum, the material used, requested changes, assumptions, remaining differences, the measurement table (moments, elements, regions, values, results) and every check as passed, failed or not run. Real review evidence can also be stored with `action: "record_review"` on `motion_export_request`. Humans decide visual acceptance.

## 5. Comparison video

Save a side-by-side `<name>-comparison.mp4` next to `<name>-remix.mp4` in the workspace: original left, remix right, on one clock, H.264 at web bitrate. For example, with both scaled to the same height (use the package's FFmpeg when `ffmpeg` is not on `PATH`):

```sh
ffmpeg -i reference.mp4 -i remix.mp4 -filter_complex "[0:v]scale=-2:540[a];[1:v]scale=-2:540[b];[a][b]hstack=inputs=2[v]" -map "[v]" -map 1:a? -c:v libx264 -crf 28 -pix_fmt yuv420p -c:a aac <name>-comparison.mp4
```

The comparison is for human review only; it is not part of the project.
