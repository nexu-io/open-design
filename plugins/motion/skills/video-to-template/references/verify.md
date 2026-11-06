# Check and deliver the project

Native directory workflow: run the pinned CLI lint/timeline/info and render commands in the project directory, then inspect the actual output. The MCP calls below are alternatives for projects managed by the plugin, not requirements for portable projects.

## 1. Inspect the project

- `motion_inspect_project`, `view: "lint"`: fix every error. Things the original genuinely has (its colours, its small text) stay even when flagged — keep matching the original.
- `motion_inspect_project`, `view: "timeline"`: check every element's start and end against `TEMPLATE.md`.

## 2. Export and compare with the original

For a plugin-managed project:

1. `motion_get_project` for the latest revision, then `motion_request_export`.
2. Poll `motion_get_export` until `completed` (on `failed`, read the error, fix, export again).
3. `motion_verify_export` with the jobId and revision, `audio: "required"` (use `silent` when the original has no sound).
4. `motion_compare_video` with the original's absolute path as reference and `latest-export` as candidate.

Read from the result:

| Field | What to look at |
|---|---|
| `ssim.mean` / `ssim.p05` | For locating only: find the moment the score drops and compare the original there. Never a pass line |
| `worst` | The worst moments and cells. **Open the `picture` image** and compare the same moment in the original |
| `cuts` | Verify detected candidates against adjacent source frames; automatic detections can be false positives. Restore a missing original hard cut unless the user requested a change; accidental smoothing is a defect |
| `duration` / `sound` | Does the length match; how many milliseconds is the audio offset |
| `missingContent` | Is any whole stretch missing |

Fix locatable issues relevant to the request, then re-export the changed source. Use the cause and expected benefit to choose a further correction, a different approach or delivery with a clear limitation. Repeating an unproductive change is not progress; there is no fixed number of permitted rounds. A limitation note does not turn an unresolved defect into a passed check. For reference-to-rebuild comparison, similarity scores locate differences; humans decide visual acceptance. The package self-containment check is below.

**Record checks in one of three states** in `TEMPLATE.md`:
- Ran, passed
- Ran, did not pass (say where it differs)
- Did not run (environment, tooling, timeout). **A check that didn't run is never reported as passed**, and never left out.

## 3. Package the native project

Follow the [portable project contract](../../motion-production/references/portable-project.md). Deliver the complete project directory or ZIP with source, required assets, preview, cover and `TEMPLATE.md`. Rendering must not require a local template ID, custom `template.json` or a custom registration tool.

Check that intended content and motion remain reasonably editable. A whole reference video, full-frame sequence or unadaptable contour transcription is not a substitute for that work; ordinary time-driven arrays and functions are allowed. Keep optional root variables as convenient edits, not the only allowed changes. Check local file references and required Studio manifests before packaging.

`preview.mp4` must come from exactly the source being delivered. If source changes after export, re-export before packaging.

## 4. Verify the delivered copy

This checks that the ZIP works on its own, so later edits can render. It is not a pixel comparison: an unchanged request is served by delivering `preview.mp4` itself.

Unpack the ZIP into another directory. Do not use a registered template ID or read files back from the original working project. Run the pinned native CLI there; consult its help for the runtime's supported options. For HyperFrames 0.9.7:

```sh
node /absolute/path/to/hyperframes/bin/hyperframes.mjs render /absolute/path/to/unpacked-project -o /absolute/path/to/reproduced.mp4
```

- The render completes without missing files, fonts or assets, creator-machine paths or undeclared remote dependencies.
- Frame rate, actual decoded frame count and duration equal those of `preview.mp4`.
- A few representative frames look like the preview.

Do not compare every frame, and do not spend repair rounds on pixel differences that are not visible (for example GPU antialiasing). Fix a failed render, a missing file or a visible difference. Record the result in `TEMPLATE.md` as passed, failed or not run.

This is a self-containment check, not independent-agent proof. Do not claim an independent test happened inside the creating session.

## 5. Delivery

Reply briefly with absolute local file paths, not relative paths (they break when the reply is copied or opened in another host) or a temporary localhost URL that stops when the session ends. Put only the plain path in each link target. Link the preview, the folder/ZIP and the original-versus-template comparison video for human review (saved next to the ZIP, outside the package). Then state what can be changed (the Studio Variables panel or source) and the remaining differences from the original in plain words. Leave measurements, scores and check states in `TEMPLATE.md` unless one affects the user. A score is diagnostic, not a visual-quality verdict. Optional catalog IDs are secondary and never replace the portable files.
