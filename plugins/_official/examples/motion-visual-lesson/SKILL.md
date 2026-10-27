---
name: motion-visual-lesson
description: "Bring Ideas to Life (让灵感成真) — a 20-second OpenDesign paper story, with interactive prototypes, websites, PPT, posters and motion films collected into a book of possibilities."
od:
  mode: video
  scenario: video
  preview:
    type: html
    entry: example.html
---

# 让灵感成真 / Bring Ideas to Life

A 20-second paper-cutout story for OpenDesign: a girl sends “OpenDesign, what can you design?” on a paper plane. The buddy demonstrates interactive prototypes, websites, PPT, posters and motion films. The works fold into a book and return to her: “It starts with your idea.” She hugs it, waves thanks, then pins “What will you design?” beside her window as an invitation to the viewer. `example.html` is the editable reference — start from it.

The reference timing and beat map describe the demo. Adapt them to the user's
requested duration and content; do not force the reference duration or music.

## Source
A story adaptation of a viral post by @kevin_t_ngo: https://x.com/kevin_t_ngo/status/2102437977435893771 (665K views · 6.2K likes · 3.0K bookmarks on X (as of 2026-10-13)). The composition is
inspired by the published piece’s paper craft and rebuilt in code; the soundtrack is original. The original is a 28-second square film; this is a 20-second cut framed in 16:9, and its character is the Open Design buddy built from the logo mark.

## Reference files
Copy `example.html`, `assets/gsap.min.js`, `assets/short-stack-OFL.txt`, `assets/short-stack-regular.ttf` into the composition, preserving the `assets/` path.
Copy the demo soundtrack only if selected under the Sound guidance below.
Font licenses travel with their fonts. Use these frozen local bytes; no runtime
script or font CDN is needed.

## Art direction
- Match the reference’s handmade paper craft: uneven torn white fibres, broad directional gouache strokes with dry bristles, and coloured paper layered around the characters. Vary each sheet’s brush angle; avoid a uniform repeated dash pattern or glossy UI styling.
- Night blues `#262D70` / `#30398A`, purple wall `#4A3A8A`, warm yellow window `#F4C443`, pink curtains `#EE8E96`, paper `#FFFCF3`, blue pen `#3B62B5`, red pencil `#D8443A`.
- The girl has a brown bob, yellow clip, separate paper eyes, painted teal sweater and pointed white collar. Head, upper arm, forearm and hand articulate separately; paper texture stays attached to each piece.
- The OpenDesign buddy retains its dark logo tile, white ring and green cursor. Give it short, plump paper mittens with rounded ends, each drawn as one soft piece. Keep shoulder-to-hand reach below one third of its body width; no thin segmented arms or tiny dot hands. Move or tilt the whole buddy toward a prop so the hand really touches it: lean in to tap, float beside the tape, and tuck behind the book to hold it close.
- Use Short Stack (SIL OFL, bundled) for English hand lettering. Preserve the source’s intimate central composition while extending walls and sky into 16:9.
- Give each capability a recognisable designed output and its own action. Use object-led cuts, hinges, creases, hand contact and overlap, with short anticipation and a readable hold.
- Keep capability labels clear of the buddy throughout each entrance and action. Give the prototype tap and PPT page turn enough time for both the action and its result to read.
- Start the collecting book with empty page slots. Move the five works into their own slots one at a time; each thumbnail appears only when its work lands. Close the cover after all five have arrived.
- Keep the reply physically continuous through its fold, flight and opening. The girl catches it at chest height with both hands; the incoming book must leave her eyes and expression visible.
- Make the final lined invitation note large enough to read at gallery-preview size. Raise and pin it beside the girl, keep her hand in contact until release, then hold the complete “What will you design?” while she brings her hands together. This is the audience's question.

## Beat map (20s)
- 0–1s: establish the night town and the girl at her window.
- 1–1.5s: she gets an idea and raises her pencil.
- 1.5–3.5s: she writes “OpenDesign, what can you design?” and holds the complete question.
- 3.5–4.25s: she folds the corners and wings of the paper plane.
- 4.25–4.75s: she throws the plane from her window.
- 4.75–5.5s: the plane crosses the night sky and reaches the buddy.
- 5.5–7s: the buddy reads, thinks and responds with a spark.
- 7–8.5s: an interactive prototype changes pages after a tap; hold the changed page.
- 8.5–9.5s: a paper website unfolds its hero and content blocks.
- 9.5–11s: a PPT cover turns to a chart slide; bars rise in sequence and settle.
- 11–12s: illustrated posters overlap; the buddy tapes one into place.
- 12–13s: a plane flies across a filmstrip while its timeline advances.
- 13–14.1s: the five works land one by one in the book's empty page slots; its cover then folds shut.
- 14.1–14.8s: the closed book folds into the reply and travels back through the night sky.
- 14.8–15.6s: the girl catches the book at her chest with both hands, leaving her face visible, and opens it.
- 15.6–17s: the open book shows all five works, with “It starts with your idea.” and a hand-drawn circle.
- 17–17.75s: close-up of the girl hugging the book, with a closed-eye smile.
- 17.75–18.5s: back in the town, she holds the book and waves to the buddy.
- 18.5–20s: she raises and pins a large, legible lined note beside the window, then brings her hands together. Hold on “What will you design?” with “you” circled. This is an invitation to the viewer, after the buddy has answered her question.

## Adapting the template
- Edit `CFG.question` (three lines), `CFG.answer`, `CFG.invitation` (three lines), `LIST` (labels), `S` (the five miniature renderers) and `PALETTE` together. Maintain the handwritten question’s safe margins.
- Preserve the reference's reaction, thank-you and pinned-note closing gestures. Keep the audience invitation on the physical note instead of a floating town banner.
- Keep each demonstration’s actual action and the same works in the closing book. A capability should be visible as a designed result.
- Choose and time audio for the current brief using the Sound guidance below.

## How the reference is built
- One composition root with canvas layers. A single `render(t)` draws the
  whole frame from the master timeline time `t`; constants at the top hold copy,
  palette and timing so the film can be re-themed in one place.
- Every visible value is a pure function of `t` (eases, springs or keyframes
  evaluated from time). No state carries between frames.
- Textures (brush, grain, newsprint, handwriting, knit) and every cut-paper
  backdrop and card sheet are painted once into offscreen canvases at load;
  each frame only composites them and draws the few moving parts.

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
`assets/soundtrack.mp3` is an original 20-second score made for this template
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
