---
name: create-audio-with-open-design
description: Create or refine an audio artifact with Open Design, including music, speech, narration, and sound effects. Use only when the user explicitly selects or names Open Design and wants a standalone audio result rather than video.
---

# Create Audio with Open Design

Apply `$open-design-basics`, then execute this audio contract.

## Dynamic decision dimensions and execution

- Use `artifactType: audio` for `collect_brief`, `create_project`, and `start_run`.
- Treat the following as decision dimensions to consider only when unknown and outcome-changing, never as fixed form rows or a checklist to ask in full:
  - The audio's job, use context, and listening environment.
  - Audio type: music, speech, narration, announcement, sound effect, or a combination.
  - Listener, channel, and desired response when they affect delivery.
  - Duration, loop behavior, cue structure, and variant count.
  - Sonic mood, energy, instrumentation, reference audio, and brand motif.
  - Spoken language, voice character, pronunciation, captions or transcript, and output format.
- Tailor choices to the requested use. A UI success sound, podcast narration, and launch-film score should not receive the same duration, structure, or sonic options.
- Normalize selected sonic direction into the structured brief's creative-direction field. Put supplied script, pronunciation, mood, duration, and reference audio in `knownAnswers`; do not re-ask them or request a free-text audio prompt.
- Call `create_project`, then `start_run` with the confirmed structured brief. The server maps `audio` to the Open Design audio media-generation workflow.

## Delivery standard

Require a successful terminal run, `artifactCount > 0`, a readable playable audio file, and a real `previewUrl`. Verify the chosen audio type, duration, content, and sonic direction. Open the exact Studio and preview URLs in separate in-app-browser tabs. A script or generation prompt without an audio file is incomplete.
