---
name: motion-hand-painted
description: "Hand-painted Motion — motion design template. A 5-second, 16:9, silent hand-painted character film painted with p5.brush and John Heibel's MIT painting/timeline toolkit. Delivers an editable, replayable source plus the rendered MP4."
od:
  mode: video
  scenario: video
  preview:
    type: video
    entry: example.html
---

# Hand-painted Motion

A five-second hand-painted character film: paper texture, flat colour washes,
boiling ink outlines and an iris opening and close. `example.html` shows the
finished reference video (an original rounded bird meeting a butterfly).

Use this template when the brief asks for a brush, ink, charcoal, watercolour or
hand-drawn cartoon look. For anything else — typography, product films, data,
longer films, portrait formats or films with sound — use the regular Motion
GSAP workflow instead.

## Limits of this first version

Exactly 5 seconds, 16:9, 1920×1080, 24 fps, silent. If the user needs another
duration, aspect or audio, say so and offer the regular Motion workflow rather
than stretching this one.

## Workflow

Follow the general motion-design delivery guidance (visible source plus MP4),
with these template-specific steps:

1. Scaffold the visible source with the hand-painted template:
   `"$OD_NODE_BIN" "$OD_BIN" media scaffold --project "$OD_PROJECT_ID" --composition-dir "motion-source/<name>" --template hand-painted`.
   It writes `index.html` (the starter scene), pinned local `p5.min.js`,
   `p5.brush.js`, the painting engine `core.js` / `timeline.js`, the player
   clock `hand-painted-clock.js` and `licenses/`. Keep every one of those
   files; the licenses must travel with the copied libraries.
2. Edit only the inline scene script in `index.html`. It ends with
   `shots([[0, scene]])`. Every frame must be a pure function of `t`: no
   accumulated state, no `Math.random()` (use `hash()` / `boilSeed()`), no
   audio, no CDN scripts. Keep the single `<canvas id="out">`, the composition
   root's 5-second / 1920×1080 attributes, the `od-motion-audio` `silent`
   meta and the shared player script. Update the
   `<link rel="alternate" type="video/mp4">` href to the planned MP4 path and
   choose a representative `data-poster-time`.
   Read `references/ANIMATION_GUIDE.md` for timing, the original-character
   recipe and the painting API. Prefer flat `wash` fills to slow watercolour
   `fill` shapes.
3. Render through the host with the hand-painted renderer:
   `"$OD_NODE_BIN" "$OD_BIN" media generate --project "$OD_PROJECT_ID" --surface video --model claude-animation-p5 --length 5 --aspect 16:9 --composition-dir "motion-source/<name>" --output "<name>.mp4"`.
   If it returns a task ID, wait with `media wait <id>` until it succeeds.
4. Link BOTH the MP4 and `motion-source/<name>/index.html` in the final reply.
   Opening the HTML replays the painted film through the shared player.

Never describe a failed or unfinished render as a finished video.

## Attribution and characters

The painting/timeline engine is adapted from John Heibel's MIT-licensed
ClaudeAnimationBase (commit `0ac8bf2b31942376cb6b8c4074715595d512acd2`); see
`runtime/UPSTREAM.md`. p5.js is LGPL-2.1 and p5.brush is MIT; the scaffold
copies their notices into each source. This is an independent Open Design
integration without Anthropic affiliation or endorsement. Author original
characters or use user-supplied material with the necessary rights; no
third-party mascot artwork is bundled.
