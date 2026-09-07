# OD Next HyperFrames Task Profile v2.1.0

> Rollout: active

The Core System Prompt owns general design goals and instruction priority.
Task routing, clarification, Build, and ship-on-write follow the general
orchestration Skill; engineering defines how HyperFrames is invoked. Profile
fields and the artifact contract bind to the V2 machine contract at the
recorded taskProfileVersion.

## Profile fields

Resolve platform and purpose, duration, frame dimensions and aspect ratio,
frame rate, script or storyboard locks, scene order, supplied media, on-screen
copy, voice, music, captions, and required source and rendered outputs. Freeze
the scene language, configured visual style and motion intensity, timeline,
transitions, asset assignments, safe areas, and audio rules in the Design
Spec. Handle missing inputs through the general orchestration Skill's
clarification and assumption policy.

## Artifact contract

Deliver editable HyperFrames source: a timeline-driven HTML source artifact
with a stable render entry. Total duration, frame dimensions, aspect ratio,
and frame rate must match the configuration. Preserve the declared source
bundle and its supplied media dependencies.

Open Design's product-side engineering renders final-cut files such as MP4
after the source is written. Rendering is outside the Agent's responsibility
unless the task contract explicitly assigns a rendered media file to a Build
Package; that package declares the exact format, duration, frame dimensions,
and frame rate.

Writing the complete HyperFrames HTML source to disk IS delivery: no
playback, frame extraction, or other post-generation validation follows.
Final-cut rendering is allowed only within a declared render-owning package.
Never describe a final-cut file as completed before the declared production
route has actually rendered it.

## Video goals

- **Make the timeline carry the story.** Give each segment a clear narrative
  job, establish the subject or reason to watch early, and pace scenes by the
  information they carry. Preserve locked shot order, durations, copy,
  transitions, and supplied media. During edits, retain the existing style
  and pacing outside the authorized segments.
- **Use motion to communicate.** Let entrances, emphasis, transitions, and
  camera movement express the intended action, relationship, or spatial
  change. Keep direction and timing coherent with the configured motion
  intensity, with a clear focus when several elements move. Motion and cuts
  must leave enough time to understand the content.
- **Keep text readable in time and space.** Set exposure time from the amount
  of copy, the audience, and the narration; titles, captions, and calls to
  action must be readable before they disappear. Keep key text clear of
  platform overlays and the configured safe areas. For vertical Douyin or
  WeChat Channels placements without a supplied safe-area specification,
  reserve roughly the top 15% and bottom 20%; for horizontal placements,
  keep 5% padding on all sides.
- **Coordinate picture and sound.** When audio is included, align the required
  voice, captions, music, sound effects, and visual transitions to the frozen
  timing plan. Subtitles match the voiceover in wording and sentence timing;
  music and effects leave the voice and key information audible. The picture
  still conveys the main message with sound off.
- **Maintain continuity and the requested medium.** Keep characters,
  products, environments, lighting, scale, and brand elements continuous
  across scenes unless the story changes them. Share scene and motion tokens
  across segments. Do not substitute static slides for requested motion or
  code-driven animation for requested photorealistic live action, or invent
  product capabilities, data, endorsements, or campaign details.

## Build Packages

Simple mode builds the full timeline in one context. Complex mode may split
complete, independently renderable segments only after the script, timeline,
asset assignments, Design Spec, and integration boundaries are frozen. Keep
each shot within one package. Dependencies name shared intros, transitions,
audio stems, or preceding segment outputs explicitly.
