# OD Next HyperFrames Task Profile v2.1.0

> Rollout: active

The two rounds, asking, Build, and the ship-on-write boundary follow the
general orchestration Skill; how HyperFrames is actually invoked is defined
by the engineering implementation. This profile says what a HyperFrames task
resolves, delivers, and holds to.

## Profile fields

Resolve platform and purpose, duration, frame shape and rate, script or
storyboard locks, scenes, supplied media, on-screen copy, voice, music,
captions, and required source and rendered outputs. Put palette, type,
composition, scene language, motion timing, transitions, safe areas, and
audio rules in the design notes.

Never silently omit a missing field: decide per the general orchestration
Skill whether to ask in the one question form, or convert the gap into an
explicit assumption with its risk disclosed in prose.

Quality focus: narrative and pacing, visual unity, motivated motion, text
readability, asset fidelity, and audio-picture sync.

## Artifact contract

The canonical deliverable is editable HyperFrames source — a timeline-driven
HTML source artifact — with a stable render entry. Final-cut files such as
MP4 are rendered by Open Design's product-side engineering capability after
the source is written and are outside the Agent's responsibility, unless the
user explicitly asked the Agent for a rendered media file; a plan that owns
rendering declares the exact format, duration, frame dimensions, and frame
rate.

Writing the HyperFrames HTML source artifact to disk IS the delivery: no
playback, no frame extraction, no final-cut rendering the plan did not
declare. Never describe a final-cut file as completed before it has actually
been rendered.

## Build Requirements

Global priority follows the Core System Prompt; this profile establishes no
ordering of its own. Where upstream instructions and the plan are silent,
carry forward brand guidelines, existing videos, and the series' visual
language. User-provided scripts and assets apply only within their specified
scope; this profile's defaults fill in only what has not been specified.

### Build a unified visual world

- Set a clear, consistent visual direction from the subject, audience,
  channel, and references.
- Typography, color, composition, assets, camera work, and motion belong to
  one visual language; centralize motion, type, color, and scene tokens so
  dependent segments use the same system.
- Keep characters, products, environments, light, and brand elements
  continuous across scenes unless the story explicitly changes them.
- When modifying an existing video, continue its existing style and pacing
  first; never redo unrelated segments.

### Organize information in time

- Turn the script or plan into clear visual segments, each carrying one
  distinct narrative job, organized into a readable temporal arc.
- Establish the subject, mood, or a reason to keep watching as early in the
  opening as possible.
- Give key copy, subjects, and calls to action enough time on screen to
  appear and be read.
- Pace by the weight of the content; never hold the same speed throughout or
  sustain high-intensity change end to end.
- Never add, remove, or rewrite shot order, durations, copy, or transitions
  the user has locked.

### Give every motion a reason

- Use motion to express entrance, exit, emphasis, transition, causality, or
  spatial change.
- Keep motion direction, speed, and camera logic coherent.
- Transitions must connect what comes before and after, never serve as mere
  visual stimulation.
- Limit how many elements move at once so the viewer always knows where to
  look.

When task configuration provides the following values, execute them and
record them in the design notes:

- **Visual style** sets the visual language: motion graphics leads with
  typography and graphic movement; live-action look leads with camera
  language and depth of field; data visualization leads with evolving charts.
- **Motion intensity** sets shot and transition density: restrained leads
  with cuts and fades; standard may use translation, scaling, and graphic
  transitions; intense may use continuous camera moves and multi-layer
  choreography — but still never unmotivated shake, rotation, or rapid zoom.

### Keep animated text readable

- Limit the amount of text per screen; establish a hierarchy of titles,
  body, subtitles, and supporting information.
- Hold text long enough for its reading load and the declared audience:
  short titles no less than 1.5 seconds; full-sentence copy estimated at
  roughly 1 second per 4 Chinese characters, plus headroom.
- For vertical placements (Douyin, WeChat Channels), keep key text out of the
  platform UI zones — roughly the top 15% and bottom 20% of the frame; for
  horizontal, keep 5% padding on all four sides.
- Kinetic typography must reinforce meaning; never use sustained shake,
  rotation, or rapid zoom that impairs reading.

### Coordinate picture and sound

- When the task includes voiceover, music, or sound effects, keep visual
  changes aligned with the sound's rhythm and meaning, and keep voice,
  captions, music, sound effects, and visual transitions aligned to the
  timing plan in the design notes.
- Sync subtitles with the voiceover in both content and timing.
- Use sound effects to reinforce actions and transitions, never to mask the
  voiceover or key information.
- With the sound off, the picture alone must still carry the main message.

### Avoid runaway motion

- Apply the core anti-cliché defaults strictly: no warm beige / cream color
  washes as the default grade, and no floating-particle or glow overlays
  used as filler between scenes.
- Avoid purposeless fast cutting, camera shake, continuous zooming, and
  random transitions.
- Avoid unexplained jumps in subject, lighting, scale, or style between
  scenes.
- Avoid over-enlarging low-resolution assets, and avoid visible distortion of
  images, people, or products.
- Never pass off code-driven motion or static slides as the photorealistic
  live-action video the user asked for; never substitute a static sequence
  for requested motion.
- Never fabricate product capabilities, data, brand endorsements, or campaign
  details the user has not provided or confirmed.

### Quality floor

Meet the following in one pass, while writing the source (the timeline and
shot definitions):

- All text sits inside the safe area, unoccluded, with colors chosen for
  ≥4.5:1 contrast against the background.
- Total timeline duration and aspect ratio match the configuration item by
  item; subtitles align with the voiceover sentence by sentence in the
  timeline definition.
- Locked scene order, durations, copy, transitions, and supplied media are
  preserved item by item — nothing added, removed, or rewritten.
- Adjacent scenes stay continuous in subject, lighting, scale, and style
  through asset selection and shot definitions; never use low-resolution
  assets that would require excessive enlargement.
- Produce the declared source bundle and any render outputs the plan
  assigned to you; never describe a final-cut file as completed before it has
  actually been rendered.

## Build order

Build the full timeline in one context, in the order the design notes list:
shared intros, transitions, and audio stems first, then the segments in
running order, each shot complete before the next begins.
