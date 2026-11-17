---
name: motion-showreel
description: "Motion Designer Showreel — motion design template. A 15-second motion designer showreel at 128 BPM, rebuilt from the viral original: an Open Design mark opener, a stretching wordmark, six easing curves, a morphing shape, a truchet field, a 3D point cloud, kinetic type and an end card."
od:
  mode: video
  scenario: video
  preview:
    type: html
    entry: example.html
---

# Motion Designer Showreel

A 15-second motion designer showreel at 128 BPM, rebuilt from the viral original: an Open Design mark opener, a stretching wordmark, six easing curves, a morphing shape, a truchet field, a 3D point cloud, kinetic type and an end card. `example.html` is the finished reference — start from it.

The reference timing and beat map describe the demo. Adapt them to the user's
requested duration and content; do not force the reference duration or music.

## Source
A remake of a viral post by @stephanlivera: https://x.com/stephanlivera/status/2103315922098470926 (2.25M views · 17K likes · 13K bookmarks on X (as of 2026-10-05)). The composition is
rebuilt in code from the published piece; the soundtrack is original.

## Reference files
Copy `example.html`, `assets/archivo-OFL.txt`, `assets/archivo-condensed-black.ttf`, `assets/archivo-expanded-black.ttf`, `assets/archivo-extrabold.ttf`, `assets/gsap.min.js`, `assets/instrument-serif-OFL.txt`, `assets/instrument-serif-italic.ttf`, `assets/jetbrains-mono-OFL.txt`, `assets/jetbrains-mono-bold.ttf`, `assets/jetbrains-mono-medium.ttf` into the composition, preserving the `assets/` path.
Copy the demo soundtrack only if selected under the Sound guidance below.
Font licenses travel with their fonts. Use these frozen local bytes; no runtime
script or font CDN is needed.

## Art direction
- Hard colour cuts in the Open Design palette: near-black `#202020`, Open Design green `#87EA5C`, paper `#FAFAFA`, deep green `#007106` and pale green `#D0FFB5`; ink `#26251E`.
- Fonts (SIL OFL, bundled): Archivo Expanded Black and Condensed Black for display type, Archivo ExtraBold, Instrument Serif Italic for the role line, JetBrains Mono for the HUD.
- HUD on every frame: corner marks, brand and "MOTION REEL — 2026", chapter label, timecode, 60 FPS, 128 BPM with four beat squares, BAR n/8 and a progress line.

## Beat map (15s)
- 0–2.0s IDENTITY: rays burst from a dot and spin, the Open Design mark draws on and fills with a flash, orbiting type, a paper circle wipe.
- 2.0–3.5s the wordmark slides in on two lines, squeezes and settles; "motion designer" in serif italic.
- 3.5–5.5s EASING: "Six ways to get from A to B." — linear, ease-in-out, expo-out, back-out, elastic, bounce.
- 5.5–7.45s MORPHING: circle → triangle → star → squircle with green echoes and twelve satellites.
- 7.45–9.75s SYSTEMS: a paper tile splits into a truchet field crossed by a green wave.
- 9.75–11.2s DEPTH: a point plane folds into a lantern, then a torus.
- 11.2–13.1s KINETIC TYPE: EASE / IN. / EASE / OUT. / NEVER / LINEAR.
- 13.1–15s END: a white ring rolls out, the spinning Open Design mark with confetti settles beside the stacked wordmark, role line and footer.

## Adapting the template
- Swap `CFG.brand`, `CFG.role`, footer copy and palette to the brief; keep the seven chapters on the 128 BPM grid.

## How the reference is built
- One composition root with canvas layers. A single `render(t)` draws the
  whole frame from the master timeline time `t`; constants at the top hold copy,
  palette and timing so the film can be re-themed in one place.
- Every visible value is a pure function of `t` (eases, springs or keyframes
  evaluated from time). No state carries between frames.

## Preview and video export
Keep the stage edge to edge in both gallery and MP4 capture. Playback controls
are an overlay that stays transparent until hovered or focused; never reserve
stage space for them or include them in the poster. Inside an Open Design
project the motion source player fits the stage and owns the controls, so the
preview shell yields its own fit and controls there.

The GSAP master timeline is the only clock. Render every visible layer from
its current time in the per-frame loop: export seeks suppress timeline
callbacks. Schedule the next animation frame before drawing so one failed
frame cannot stop the loop. Backward seeks must reproduce identical frames.
Await bundled fonts before playback and signal preview-ready at a legible hero
frame. Preserve `window.__timelines` and the composition's timing attributes.
Avoid large canvas gradients and per-pixel noise: they make every captured
frame expensive and slow the MP4 export.

## Sound
`assets/soundtrack.mp3` is an original 15-second score made for this template
and timed to its beats; no audio from the source video is used.
The bundled track is demo material, not a requirement for generated films.
The user's current brief takes priority over this reference and its seed prompt,
including duration, music choice, genre, mood, voiceover and sound effects.
Follow the general motion-design audio guidance; this template does not disable
available audio tools or original audio synthesis.

- If the user requests a silent film, remove all audio. If they request only
  no background music, remove the music but retain any requested sound effects
  or voiceover. No voiceover does not mean no music.
- Use the user's supplied audio when requested. If they request different music,
  choose or create a suitable real local asset using the available audio tools,
  licensed sources or original synthesis. Do not silently substitute the demo
  track for an unmet request; briefly disclose any limitation.
- Without a specific music request, add appropriate audio when it benefits the
  film. Reuse the demo track only when it suits the actual story, mood and timing;
  it is an option, not the default for every adaptation.
- Fit the visuals and audio to the requested film duration, not to the demo's
  duration. For example, a 15-second brief stays 15 seconds even when the demo
  score is 20 seconds. Edit the selected track with a deliberate ending/fade;
  use the same edited local file in HTML and MP4. For a longer film, arrange or
  replace the track to cover the intended beats rather than leaving an accidental
  silent tail. Do not rely on an HTML-only loop or playbackRate for export.

For background music keep `id="soundtrack"`, `data-start="0"` and a numeric
`data-volume`; update `src` and `data-duration` to the actual edited asset and
film. Remove unused demo audio from the generated composition. Set the source's
`od-motion-audio` metadata to `required` when sound is intended, or `silent` for
an intentionally silent film, using the general motion-design delivery guidance.
Verify the ending and audio in both HTML playback and the exported MP4.

The `<audio>` element stays inside the composition root; the desktop exporter
mixes its local file into the MP4. Preview sound starts with the film; when the
browser blocks autoplay, the first click or key press turns it on, and Sound off
mutes it. Sound follows the master timeline, including pause and backward
seeks. Keep it silent during frame capture and in sandboxed gallery thumbnails.
