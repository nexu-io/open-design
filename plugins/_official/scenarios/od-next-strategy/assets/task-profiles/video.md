# OD Next Video Task Profile v3.1.6

Use this production Skill for an explicitly required video-generation model or production method. Generic video-making requests default to motion-design. Preserve the required model; capability, credential or provider failures must be reported without silent substitution.

Deliver an actual playable MP4. HTML animation, scripts, storyboards, and tool taskIds do not substitute for the MP4.

Resolve content, duration, aspect ratio, and audio requirements first. Use explicit user parameters directly and disclose defaults for low-impact gaps. Text-only motion graphics may use local HyperFrames rendering. Use available media models for live-action or generative imagery; do not pass text animation off as realistic video.

An internal HTML composition for this renderer is part of the video task, not an independently requested HyperFrames deliverable. Follow the scaffold and rendering steps in this profile; do not load the hyperframes production Skill just to implement an MP4. Load hyperframes only when the user also requests editable timeline-animation source as an independent output.

## Text-motion production route

Use the existing media CLI during production:

1. Run `"$OD_NODE_BIN" "$OD_BIN" media scaffold --project "$OD_PROJECT_ID" --composition-dir .hyperframes-cache/video` through the native shell.
2. Read the generated index.html and edit its text, palette, layout, and GSAP timeline. Preserve scaffold registration and match the root data-duration to the duration. Keep source files in the hidden directory; do not add a placeholder web page.
3. Run `"$OD_NODE_BIN" "$OD_BIN" media generate --project "$OD_PROJECT_ID" --surface video --model hyperframes-html --output video.mp4 --composition-dir .hyperframes-cache/video`.
4. If generate returns a taskId, continue with `"$OD_NODE_BIN" "$OD_BIN" media wait <taskId> --since <nextSince>`. Exit code 2 means still running, 0 means complete, and 5 means failed. Each wait is bounded; successful queue submission is not completion.

Rendering is an allowed Build step needed to produce the deliverable. After generation succeeds, do not add screenshots, playback scoring, or repeated evaluation. Report failures; do not fabricate a video or merely change a file extension.

Describe the production method and output path in the ordinary prose plan. After the video succeeds, continue with the user's other requested deliverables.

A failed render leaves the video undelivered. If the host reports that its renderer is unavailable, preserve the composition and report that the MP4 could not be produced. Do not substitute an ad-hoc shell or ffmpeg animation for that failed route. Use an alternative only when it is explicitly provided or authorized for this run; successful encoding alone does not establish delivery.

When media tools fail, explain the failure and gap. Do not directly invoke the HyperFrames CLI, search or modify the runtime environment, or install dependencies. Runtime problems belong to the host; an undeclared alternative path does not prove the official media flow succeeded.

For generative video, discover current models and parameters through media --help and generate --help, then use the same media generate / wait flow. Use only available models and retain existing permissions and quotas. Follow planned output paths; do not overwrite multiple videos at one fixed path.

During planning, query registered models with `"$OD_NODE_BIN" "$OD_BIN" media models --json`. Select an actual model ID matching the surface from the catalog and retain that choice internally. The local HyperFrames video modelId is hyperframes-html. Use the same model in production; do not silently switch providers.

The model catalog lists supported models, not proof of configured providers or available quota. Prefer an explicitly requested service; otherwise keep the currently configured service that supports the required capability. Do not switch providers because of catalog order. If configuration or quota is missing, explain the missing capability and settings entry point; do not ask the user to paste keys into chat.

Before claiming an actual video is complete, use the output evidence available from the supported rendering path to establish that the requested visible subject and motion are present. A decodable container or successful encoder exit does not establish that the requested subject or motion is present. An empty or background-only result is incomplete; do not describe missing content as delivered. Keep any necessary content check bounded to delivery correctness, without adding aesthetic scoring or repeated optimization.

## Visual and timing rules

- Break content into shots or segments with a narrative purpose. Lock copy, duration, aspect ratio, sound, and brand assets, and establish the subject early. Keep people, products, lighting, and palette consistent across scenes.
- Give text enough reading time, align subtitles with speech, and keep them clear of frame edges and player overlays. Do not hide information behind fast motion. Transitions serve the narrative; do not randomly change style for every shot.
- For local motion graphics, preserve the scaffold's fixed canvas, data-duration, paused timeline, and window.__timelines registration. Specify starts, ends, and easing on the timeline; do not depend on a random real-time clock that makes rendering nondeterministic. Cover every segment in the total duration and do not cut the audio track short.
- Preserve input-image aspect ratios and complete subjects. Use reference images when supported for generative shots. Explain limitations when characters or exact text cannot be locked; do not claim content beyond the duration returned by the tool was generated.
- Use separate composition directories and output files for multiple videos. Audio or timelines used as video dependencies do not automatically add independent main deliverables; deliver editable source separately only when requested.

## Required-model failure boundary

If the selected model reports missing or rejected credentials, unavailable catalog access, or a provider permission/quota failure, stop that production attempt and report the exact host diagnostic. Do not search host source code or external credential stores, read authentication files, extract or reuse tokens, call provider endpoints directly, or refresh/login on the user’s behalf. Use the existing host media catalog and generation/wait tools only. Keep the exact requested catalog model ID and provider/channel. A cloud-hosted alias, another provider’s offering of the same underlying model, or a different billing channel is still a change: do not switch to it after a failure without explicit user authorization. Preserve any completed outputs; do not retry the same rejected credentials or substitute Motion/HyperFrames to obtain a nominal success.

For a generic HTTP 400 invalid_request without a specific correctable parameter diagnostic, preserve the exact first error and stop. Do not resubmit the same model with guessed prompts, durations, credentials, or aliases, and do not probe another media surface for connectivity. A documented, explicit parameter correction permits one bounded correction only; otherwise report the blocker and wait for a new authorized request.
