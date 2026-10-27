# OD Next Audio Task Profile v3.1.3

Deliver actual playable audio with route=media-audio and kind=audio; a script or prose is not audio. Resolve narration/music/sound-effect intent, language, duration, character or voice requirements, and output format first.

Use `"$OD_NODE_BIN" "$OD_BIN" media --help` and generate --help to confirm available models, audio-kind, and parameters. Do not guess model or voice IDs. Execute media generate --project "$OD_PROJECT_ID" --surface audio --model <available-model> --prompt <user-request> --output <planned-file>, supplying required parameters from tool help. Existing media permissions, configuration, and quotas still apply. Do not bypass services, request credentials, or print credentials.

If a taskId is returned, continue with media wait <taskId> --since <nextSince> until actual completion. A failed generation leaves that audio undelivered. Report the failure while preserving other successful deliverables; do not silently switch providers or substitute an ad-hoc synthesized file for a failed service. Use an alternative only when it is explicitly available or authorized for this run. An explicit request for locally synthesized audio may use local tools without a generation provider.

Before reporting completion, verify the actual audio file rather than just a task status, filename, successful encoder exit, or container duration. With available media tools, decode the file and check that it contains non-silent samples when the user requested audible speech, music, or sound effects. All-zero decoded samples are not a completed chime even if the MP3 has the right duration. An explicitly requested silent test file is the exception. If verification is unavailable or fails, state the gap instead of claiming the requested sound was delivered. This is a minimum delivery check, not aesthetic scoring or repeated optimization. Do not invent playback checks. Editing one specified audio file does not authorize remaking other deliverables.

During planning, query registered models with `"$OD_NODE_BIN" "$OD_BIN" media models --json`. Select an actual model ID matching the surface from the catalog and retain that choice internally. Use the same model in production; do not silently switch providers.

The model catalog lists supported models, not proof of configured providers or available quota. Prefer an explicitly requested service; otherwise keep the currently configured service that supports the required capability. Do not switch providers because of catalog order. If configuration or quota is missing, explain the missing capability and settings entry point; do not ask the user to paste keys into chat.

A request for an audio file alone does not authorize a local synthesis fallback. When the registered service is unavailable or unconfigured, stop that output and report the blocker; do not use operating-system speech commands or a different synthesis route merely because they can produce a playable container. Explicitly authorized local synthesis remains the exception described above.

## Voice and script rules

- Use the user-approved narration verbatim without adding an introduction or summary. Preserve the specified language, proper names, numbers, and pauses. TTS is not a substitute for music or sound effects; confirm speech/music/sound-effect capability matches first.
- Keep voice, character, speed, and emotion consistent within and across segments. Use only voice/language parameters supported by the interface. Do not claim to reproduce a real person's voice without voice-cloning capability and authorization.
- Speech length depends on the script and speaking speed; do not promise an exact duration. Explain conflicts between strict duration and locked copy rather than cutting speech without permission. Name multiple outputs in sequence, and match file extensions to the actual encoding returned by the tool.
- When background music is requested, keep dialogue clear and handle fades and joins without abrupt volume changes. Mix only when existing tools support it and the user requests it; do not add unrequested music.
