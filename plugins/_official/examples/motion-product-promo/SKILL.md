---
name: motion-product-promo
description: "Product Promo — motion design template. A 15-second product promo rebuilt from the viral original with a fictional brand: a halftone mascot asks 'Got something to sell?', product cards pop onto blue, a phone store fills in, a checkout board is stamped 'Handled.' and the wordmark closes it."
od:
  mode: video
  scenario: video
  preview:
    type: html
    entry: example.html
---

# Product Promo

A 15-second product promo rebuilt from the viral original with a fictional brand: a halftone mascot asks "Got something to sell?", product cards pop onto blue, a phone store fills in, a checkout board is stamped "Handled." and the wordmark closes it. `example.html` is the finished reference — start from it.

The reference timing and beat map describe the demo. Adapt them to the user's
requested duration and content; do not force the reference duration or music.

## Source
A remake of a viral post by @achxvi: https://x.com/achxvi/status/2103918792845963545 (1.14M views · 9.1K likes · 8.2K bookmarks on X (as of 2026-10-13)). The composition is
rebuilt in code from the published piece; the soundtrack is original. The original promotes a real company; this remake uses the fictional brand Pennyflow.

## Reference files
Copy `example.html`, `assets/fraunces-OFL.txt`, `assets/fraunces-bold.ttf`, `assets/gsap.min.js`, `assets/instrument-serif-OFL.txt`, `assets/instrument-serif-italic.ttf`, `assets/inter-OFL.txt`, `assets/inter-regular.ttf`, `assets/inter-semibold.ttf`, `assets/jetbrains-mono-OFL.txt`, `assets/jetbrains-mono-regular.ttf` into the composition, preserving the `assets/` path.
Copy the demo soundtrack only if selected under the Sound guidance below.
Font licenses travel with their fonts. Use these frozen local bytes; no runtime
script or font CDN is needed.

## Art direction
- White `#FFFFFF`, blue `#1F70F3`, ink `#111111`, a light board `#FBFBFB` and near-black `#060606`.
- Fonts (SIL OFL, bundled): Inter Regular and SemiBold for headlines and UI, Fraunces Bold for the wordmark, Instrument Serif Italic for the accent words, JetBrains Mono for labels and the HUD.
- The mascot is a girl with two buns, a rounded bob, fringe locks and a hair clip; she nods and hops on the beat, blinks, follows what appears, and hops with a squash on each reveal.
- The mascot and the product objects are drawn in grey at quarter resolution and ordered-dithered into a halftone, one `halftone()` pass per layer.
- HUD: the chapter label top left, the brand and a 60 fps timecode top right; hidden on the end card.

## Beat map (15s)
- 0–2.45s HOOK: the mascot slides in and whispers "psst…"; "Got something / to sell?" with a blue underline; the question's dot swells into blue.
- 2.45–4.45s ANYTHING: the mascot rises; course, ebook and app cards pop in one by one.
- 4.45–6.95s STORE: a whip to white; "Pennyflow turns it into / a store / in minutes."; a phone store fills in (address, LIVE, avatar, products); the cursor clicks Get it now.
- 6.95–11.2s HANDLED: the camera pulls out of the express-pay button onto a checkout bento: the card number is typed, $9 / month, the workbook upsell, VAT, payouts counting up, Paid, check badges and the "Handled." stamp.
- 11.2–13.3s FLOW: on black, "You create." / "We handle the", the mascot winking and grinning.
- 13.3–15s END: a dithered wipe; "flow." becomes the wordmark's tail, the letters drop in, the head pops up behind it; tagline, Start selling and the footer.

## Character and close
- `SPEECH` lists the visual mouth gestures' start, length and openness; `mouth(t)` opens the mouth and nods the head alongside the copy. These are visual gestures only: the soundtrack is background music, with no voice or simulated speech.
- At the close, "flow." springs out of "We handle the", travels to centre stage and pops into the wordmark's tail while the other letters drop in; the head peeks out from behind the wordmark, hops up and winks.

## Adapting the template
- Swap `CFG.brand`, `CFG.domain`, `CFG.store`, the card, product and checkout copy, prices and palette; keep the six chapters on their timing, and retime `SPEECH` to new lines.

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
`assets/soundtrack.mp3` is an original 15-second background music track made
for this template and timed to its beats, with no voice or simulated speech;
no audio from the source video is used.
The percussion is a quiet, sparse pulse beneath the melody, with no hi-hat,
clap pattern or extra kick impacts on transitions. This describes the demo, not
a restriction on the user's requested audio.
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
