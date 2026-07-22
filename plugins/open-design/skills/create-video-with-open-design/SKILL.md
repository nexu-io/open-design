---
name: create-video-with-open-design
description: Create or refine a video artifact with Open Design, including product demos, social promos, explainers, motion stories, and brand films. Use only when the user explicitly selects or names Open Design and wants a time-based visual result.
---

# Create Video with Open Design

Apply `$open-design-basics`, then execute this video contract.

## Dynamic decision dimensions and execution

- Use `artifactType: video` for `collect_brief`, `create_project`, and `start_run`.
- Treat the following as decision dimensions to consider only when unknown and outcome-changing, never as fixed form rows or a checklist to ask in full:
  - Communication objective, channel, and desired viewer action.
  - Audience only when it changes the story, pace, or terminology.
  - Duration, aspect ratio, placement, and variant requirements.
  - Required scenes, opening hook, sequence, and pacing.
  - Visual treatment, source media, product footage, and references.
  - Voice, music, sound effects, captions, and language.
- Tailor choices to the requested channel and content. A silent product demo, vertical social teaser, and cinematic brand film need different pacing, scene, and audio options.
- Put supplied storyboard beats, reference media, aspect, duration, captions, and audio requirements in `knownAnswers`; do not re-ask them or request a free-text video prompt.
- Call `create_project`, then `start_run` with the confirmed structured brief. The server maps `video` to the Open Design video media-generation workflow.

## Delivery standard

Require a successful terminal run, `artifactCount > 0`, a readable playable video file, and a real `previewUrl`. Verify duration and aspect, the selected key scenes, and requested captions or audio. Open the exact Studio and preview URLs in separate in-app-browser tabs. Still frames or a storyboard without the requested video file are incomplete.
