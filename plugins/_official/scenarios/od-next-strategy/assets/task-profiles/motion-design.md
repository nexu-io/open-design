---
name: motion-design
description: "Apply motion craft to an active task: refine a brief, beat map, visual continuity, typography, pacing, and timeline implementation. Use when planning or improving motion graphics; the host task owns artifact creation, output format, and export."
triggers:
  - motion design
  - motion graphics
  - 视频动效
  - 动态设计
  - MG动画
  - kinetic typography
  - animated explainer
od:
  mode: utility
  category: animation-motion
  featured: -100
  example_prompt: Create a 15-second motion film for a focus timer. Show scattered thoughts converging into one clear task, with expressive typography, a continuous visual motif, and a confident closing frame.
---

# Motion Design

Use this functional helper to refine the user's brief or work in progress with
one clear idea expressed through composition, transformation, rhythm, and sound
when requested. Apply the relevant craft guidance within the current task; this
skill is not a rendering template and does not create a project or choose an
output format. The Motion Design creation route owns those decisions. Quality
means viewers understand and remember the idea while wanting to watch it move.

## Execution context

Follow the active host's task route, stage, capability, and delivery contract.
This skill supplies motion craft; it does not create tool access or change the
host's workflow. In OD Next, retain its Core, general orchestration, machine
blocks, and ship-on-write boundary. Plan during planning; author during Build.
Do not add a post-generation quality-review phase. For a video brief (a timed
film, promo, explainer or showreel), declare BOTH editable HTML source and MP4
as required deliverables. Rendering the MP4 is Build production and must finish
before delivery. For pointer/scroll-driven interaction or UI micro-animation,
deliver runnable HTML/code instead; do not flatten the requested interaction
into video. Never describe an unrendered video file as complete.

Where the active task's tools and scope permit visual iteration, examine the
opening, key transformation, transition,
text hold and ending at intended size, plus continuous playback. Correct the
largest observable defect, then revisit only affected moments. A runnable file
alone is not proof of successful motion. Distinguish what was observed from
what was only specified; never invent quality measurements.

## Resolve the brief without stalling

Use the user's assets, references, script and previous decisions first. Resolve:
message and audience; destination/aspect; duration; exact copy; must-show assets;
visual direction; audio; and required output. Ask only when missing information
would change the story or make the result misleading. Otherwise choose a coherent
direction and state the meaningful assumption briefly. Do not impose three
style options or an approval round on a user who asked you to make the piece.

For an unconstrained short film, a useful starting point is 12–18 seconds,
16:9, 1920×1080, 30fps, no invented voiceover, and a replayable source. A portrait
social brief calls for 9:16. Existing brand, timing, platform and copy override
these defaults. Do not invent product claims, metrics, testimonials or assets.

Create a compact beat map as part of the existing plan, not a second document:
`time → viewer takeaway → focal object → transformation → copy/audio → exit`.
Time budget includes entrances, reading holds and exits. Choose a recurring
object, shape, line or typographic motif that connects the beats.

Example mechanism for a focus product (adapt, do not copy as a universal style):
scattered words orbit → one word attracts the others → orbit becomes a timer →
timer completes and becomes the wordmark. Each movement changes the meaning;
four unrelated title cards would lose the mechanism.

## Art direction before adding movement

Resolve one strong representative frame in the composition before expanding
all scenes. Choose the actual hierarchy, crop, type, palette, texture and focal
object. A weak still will not be rescued by particles, camera shake or effects.
When planning-only, describe this frame; do not create an artifact early.

- Use a specific visual premise tied to the subject. "Premium", "cinematic"
  and "modern" alone are not art directions. Define what fills the frame,
  where attention rests, the material language and the contrast structure.
- Typography is a graphic object. Compose with scale, alignment, line breaks,
  negative space and font character. Choose fonts that cover the actual
  language; use tested fallbacks and wait for font readiness before capture.
- Prefer a small palette with intentional contrast. No default neon gradient,
  glass cards, glowing orb or beige background independent of the brief.
- Choose one material/world logic: editorial ink, precise instrument, folded
  paper, tactile collage, vector geometry, painterly field, or another justified
  system. Carry its lighting, edges and textures through the film.
- A scene may be asymmetric, full-bleed or sparse. Avoid repeatedly centering
  a headline above three cards. Keep subtitles and platform chrome out of the
  focal area; use destination-specific safe margins, not one universal ratio.
- Supplied product screens and logos retain their proportions and content.
  Crop deliberately rather than stretching. Keep data axes, units and values
  correct through their entire animation.

## Choreograph attention

Choose the lead action and let supporting motion answer it. Offset independent
objects when that clarifies reading; move them together when collective motion
is the idea. Do not mechanically stagger every word or enforce a fixed moving
fraction of the screen.

Use three possible layers, not three mandatory effects:
1. Primary action carries the idea.
2. Secondary action conveys weight or causality: a trailing label, a shadow
   settling, an elastic edge, a reaction in a connected object.
3. Ambient motion provides life only when the scene needs it. Quiet scenes
   and reading holds may be genuinely still.

Timing and spacing have different jobs: timing places story beats; spacing
controls acceleration and weight between them. Suggested starting ranges:

| Job | Starting range | Shape |
| --- | --- | --- |
| Small accent / punctuation | 120–220ms | decisive snap, then settle |
| Main element arrival | 350–650ms | quick travel, controlled landing |
| Meaningful shape transformation | 600–1200ms | readable setup and resolution |
| Large reveal / camera move | 900–1800ms | sustained trajectory, clear destination |

These are film heuristics, not UI response-time limits. Fit distance, mass,
emotion and soundtrack. Use ease-out for an arrival, ease-in for a motivated
exit, and smooth acceleration/deceleration for a camera. Constant-speed travel
is appropriate for conveyors, clocks, scans and intentional mechanical motion.
Playful material can overshoot; precise instruments should not bounce by default.

- Give fast actions preparation and recovery. Anticipation may be tiny, but
  there should be a legible cause rather than an unexplained teleport.
- Change position on arcs when physical motion calls for it. Use straight
  paths for precision, direction or mechanical intent.
- Match-cut across shared shapes, track a moving object into the next scene,
  reveal through a meaningful mask, or use a clean cut. Choose transitions
  because of the relationship between beats, not a desire for variety.
- Preserve velocity and direction at hand-offs. Avoid accidental jumps in
  scale, lighting or object identity. Morph only where topology supports it;
  a designed match-cut is better than an unreadable mesh distortion.
- Alternate action and rest. Reserve the strongest transformation for the
  central idea; endless maximum intensity makes everything feel equal.
- Close intentionally: resolve the motif and hold the final message. Loops
  need matching start/end state AND velocity, without a duplicated pause.

## Choose a visual grammar

**Product / brand film:** build around a real benefit and a concrete action.
Use actual screens where available, isolate what changes, and carry the brand
motif into the closing frame. A slow camera move over a static page is supporting
footage, not the entire demonstration.

**Kinetic typography:** let words act out meaning through weight, tracking,
direction and transformation. Keep a stable reading window; do not rotate,
blur or scatter every line. Animate a phrase as a unit when word-by-word entry
would obstruct comprehension. Reveal timing is not reading time.

**Explainer / data:** choose spatial metaphors that preserve the causal model.
Show the object before transforming it; maintain labels while relationships
change. Reveal axes before values when the scale matters. If narrated, align
beats to actual supplied or generated audio timing, not guessed timestamps.
Do not add unrelated decoration to cover a weak explanation.

**Art / procedural scene:** distinguish a style's structure from surface noise.
Define marks, material, palette, composition and one characteristic movement.
Examples: a woodcut uses cut-line direction and layered ink; a painted night
uses coherent curved strokes and moving light; paper cutouts use plane depth,
edge shadows and hinged motion. Seed texture once and move it coherently;
regenerating every mark each frame causes flicker. Animate elements inside the
world, not only the camera between static paintings. Human identity and complex
anatomy should use suitable supplied/generated assets when tools allow; keep
silhouette, palette and lighting consistent. Never pretend those assets exist.

**3D / professional-tool task:** retain the user's existing AE, Blender or
Remotion project if specified and available. Read its state, edit the smallest
relevant scene, and retain editable layers/keyframes. A tool-specific pipeline
is justified by the desired result, not by the name of this skill. Do not make
installation of AE, Blender, a paid provider or a new framework the default.

## Author reliable editable motion

For a new Open Design film, use timeline-driven HTML with GSAP and optional
SVG/Canvas. HTML/SVG suit typography, crisp diagrams and UI; Canvas suits dense
marks, fields and procedural worlds. Combine them when useful. Preserve an
existing supported renderer instead of rebuilding it just to fit this default.

Keep duration, frame size, palette, type scale, easing and scene timings in one
small configuration. Group each scene's elements and motion together. Separate
content/data from drawing. Reuse geometry and cached textures; cap offscreen
work and particle counts. Keep a scene stable at any requested timestamp.

The Open Design video composition contract:

```html
<div id="main" data-composition-id="main" data-start="0"
     data-duration="15" data-width="1920" data-height="1080">
  <!-- Real scene elements, sized for this stage. -->
</div>
<script>
// Load GSAP before this block; retain the host's pinned dependency when supplied.
const duration = 15;
const tl = gsap.timeline({ paused: true });
// Define initial states explicitly, then animate scene objects at absolute times.
// tl.fromTo(...); tl.to(...); Reading holds occupy real time in the timeline.
const clock = { t: 0 };
tl.to(clock, { t: duration, duration, ease: 'none' }, 0);
window.__timelines = { main: tl };
// A procedural layer must draw from clock.t, not increment state each frame.
// tl.eventCallback('onUpdate', () => drawWorld(clock.t));
</script>
```

This is a protocol skeleton, not a finished visual template. Author the real
composition. Root duration, timeline duration, aspect and the brief must agree.
Use the actual composition id consistently. Register timelines before signalling
readiness; all image/font dependencies need a known ready state. Keep assets
local when possible and avoid relying on inaccessible remote URLs.

Deterministic motion must survive forward/backward seeking: no Date.now-based
scene state, unseeded randomness, simulation that only works after playing from
zero, or independent CSS animation competing with the master timeline. Define
positions and reveals as functions of time, or as seekable timeline tracks.
Audio-reactive motion needs a precomputed envelope or known beat map when exact
replay matters. Never imply that an arbitrary pulse is analysis of the music.

Open Design scaffolds and embeds a shared source player with play/pause, scrub
and replay. Preserve its `script[data-od-motion-source-player]`. Do not create
competing controls or start a second playback clock. The renderer sets
`window.__odMotionRender` before author scripts to disable preview chrome and
scaling during capture. Use a local GSAP file (download the pinned 3.14.2 build
into the source directory if needed) so reopening the source does not require
a CDN. For an existing standalone source without the host player, put controls outside the
composition and connect them to the same master timeline. Scale the whole stage
uniformly to fit; do not reflow scene layout when the viewport changes. Controls
must not appear in the exported frames. Keep a useful poster when reduced motion
is requested and let the user explicitly start playback.

## Video production and dual delivery

For video briefs, use Open Design's existing local HyperFrames renderer during
Build. It needs no video-generation API key. Do not ask the user to render it
manually or run a second renderer. Plan declares `hyperframes-html` as the
production route, editable source as canonical, and MP4 as a required derived
output. For interactive briefs use `html` and source only.

In the accepted Plan Contract, set `taskProfile.taskSpecific.motionDelivery` to
`{"mode":"video","sourcePath":"motion-source/film/index.html","videoPath":"film.mp4"}`
for a film, or `{"mode":"interactive","sourcePath":"index.html"}` for interactive
motion. Use the actual planned paths. The host freezes and enforces this contract;
HTML metadata is descriptive and cannot change the required output. Include a
required `kind: "video"` deliverable with `derivesFrom` set to the canonical HTML
id. Omit `derivesFrom` on the canonical source entry; never set it to null.
A new film needs Full Plan; do not start it as a contract-free Direct Edit.
This applies only when the user's requested deliverable is motion, including an
explicit motion helper used in another task; adding hover/scroll animation to a
prototype does not turn it into a video request.

1. Scaffold a visible source directory with the native shell tool:
   `"$OD_NODE_BIN" "$OD_BIN" media scaffold --project "$OD_PROJECT_ID" --composition-dir "motion-source/film"`.
   Use a new descriptive directory for a new film; edit the existing source on
   revisions. Keep `hyperframes.json`, `meta.json`, HTML and local assets there.
2. Author `motion-source/film/index.html`. Its composition root must have
   `data-composition-id="main"`, `data-start="0"`, `data-duration`, `data-width`,
   `data-height` and `data-fps`. Register the seekable master timeline at
   `window.__timelines.main`. Use actual GSAP animations, not a placeholder
   timeline. Keep assets/fonts local and relative to this source directory.
   Include `<meta name="od-motion-output" content="video">` and
   `<link rel="alternate" type="video/mp4" href="../../film.mp4">` in the head.
   The href must identify the actual planned MP4 inside the project. The
   interactive equivalent declares `content="interactive"` and needs no MP4.
3. Render through the host:
   `"$OD_NODE_BIN" "$OD_BIN" media generate --project "$OD_PROJECT_ID" --surface video --model hyperframes-html --composition-dir "motion-source/film" --output "film.mp4"`.
   If it returns a task ID, use `"$OD_NODE_BIN" "$OD_BIN" media wait <id>` and wait for success.
   A queued task, HTML preview or failed command is not a completed film.
4. Preserve the source and assets, and link BOTH the actual MP4 and the source
   HTML in the final response using project-relative Markdown links. The file
   viewer provides preview/download. On later video edits re-render the same
   linked MP4 so the download matches the current source.

If the host reports a renderer failure, preserve the editable source and report
that blocker truthfully. Never fabricate a download or label HTML-only output
as a finished video. Rendering to produce the deliverable does not authorize a
post-generation playback/review loop.

## Quality while composing

For each beat, account for focal point, motion cause, reading time and exit.
At a transition, account for both outgoing and incoming states and their overlap.
At the end, account for resolution, holding time and replay behavior.

Use these concrete defect-to-decision pairs while building:

| Defect | Better decision |
| --- | --- |
| Feels like a slideshow | Carry one object through a meaningful transformation |
| Everything competes | Choose the lead action; reduce or delay support |
| No sense of weight | Adjust travel time, acceleration, anticipation and settle |
| Text is unreadable | Shorten copy only if allowed; increase hold and contrast |
| Looks generic | Strengthen type, composition and the subject-specific motif |
| Painterly texture flickers | Seed and cache marks; move a coherent field |
| Sequence feels monotonous | Vary shot scale and action/hold rhythm with purpose |
| Looks busy but says little | Remove decorative motion and show the causal action |

Do not invent a numeric score to certify aesthetics. Report the usable artifact,
its duration/aspect, and any missing asset, audio or export capability succinctly.
