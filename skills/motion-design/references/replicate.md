# Replicating a reference film

Shared rules for rebuilding a reference video as an editable Open Design
Motion film. Open Design uses them when a user asks to replicate a video;
ODEval's template pipeline uses the same rules and adds its packaging on top.

## The one rule that matters

**Measure the timeline; never estimate it.** Eyeballing beat boundaries from
a contact sheet has been wrong by more than a second in a 15-second film.
`od media reference` gives the measured cuts; build every timing from them.

## Precedence

When instructions conflict, decide in this order:

1. What was measured in the reference — timing, motion, layout, palette.
2. What the user said about the reference — what to keep, what to change.
3. Your own taste, last.

Other guidance (including the general motion-design craft) governs syntax,
the composition contract and project rules only. Do not bring in a house
style — a default palette, art direction or "pick one material world" — when
it contradicts the reference. Say in the final reply what you changed and why.

## 1. Read the measurements

`facts.json` holds duration, size, fps, whether there is audio, and `cuts` in
seconds. `contact.jpg` shows the film at a glance; `frames/` holds a frame
early in every shot plus an even grid. View the contact sheet first, then the
frames. Hard cuts alone are not enough: motion graphics change type, layout
and stage colour inside a single shot, so the frames are the evidence and the
cut list is a hint. For a moment the frames miss, cut one yourself:
`ffmpeg -ss <t> -i <reference video> -frames:v 1 out.png`.

Write the beat map before any code: for each beat its start and length (from
the cuts), what fills the frame, the exact copy, palette, type, the motion
mechanism (what transforms into what) and how it exits.

## 2. Fidelity follows the request

- "Replicate / 复刻 / make the same film": rebuild it as it is — the same
  beats, timing, copy, composition, palette and motion. Keep its brand names,
  products, characters and numbers unless the user asks otherwise.
- "Like this, for my brand / change X": keep the reference's form and feel —
  beat structure, rhythm, motion grammar, composition, palette mood — and swap
  only the content named. An adapted film does not carry the reference's
  words, phrasing, logo, footage, people or places unless the user asks to
  keep them; a scene whose content only holds for the reference's brand (what
  its name means, its story) is rewritten for the user's brand in the same
  form, or cut with its time given to a neighbour.

## 3. Author editable source

Write the film so a later "change this" is a one-place edit:

- One configuration holds the clock: `duration`, `scenes: [{ id, name, dur }]`
  with each scene starting where the previous one ends, and `cues: [{ id,
  scene, at }]` for key events (`at` in seconds from the scene start; an exit
  or transition tied to the scene's end is `{ from: "end", at: 0.35 }`). Read
  event times from the cues, never hard-code them in drawing code.
- Copy, colours, image paths and fonts a user might swap live in that
  configuration, not scattered through the markup.
- Every element a person might point at — headline, logo, product shot,
  price, figure — carries `data-od-id="kebab-case-id"`. On a canvas film the
  configuration keys and cue ids are the only handles; name them clearly.
- Every scene keeps some ambient motion written as a function of time, so a
  scene stretched later never freezes on its last frame.

## 4. Type and pictures

Match the reference's type with a redistributable Google Fonts family
(substitute the closest when the original is a commercial or brand face, and
say which), bundle every weight you draw with, and declare
`--od-font-heading` / `--od-font-body` on `:root` with `"Noto Sans SC"` in the
chain so Chinese copy renders. The type section in the general motion-design
skill has the details; follow it rather than inventing another chain.

A static still (photo, product shot, logo) may be cut from the reference's
cleanest frame into `assets/` only when the user says it is theirs or asks to
keep it; otherwise rebuild it or use a neutral stand-in of the same shape.
Anything that performs — blinks, deforms, a wordmark arriving letter by letter
— is rebuilt in HTML, SVG or Canvas. The reference video, and whole reference
frames used as a backdrop, never go into the film.

## 5. Check against the reference

Run `od media compare --reference <the video> --candidate <the film you just
rendered>`. It pairs both films at the same timestamps — the opening, an even
grid, and the head of every shot when you pass the cuts from `facts.json` — and
writes `.motion-compare/<id>/`: `pair-NN.jpg` (reference left, your film right),
`sheet.jpg` and `facts.json` with a per-timestamp `ssim` score.

Open the pairs. The score only tells you where to look first (`worst`); it
cannot see a wrong headline or a beat in the wrong order, and it punishes
changes the user asked for. Judge by eye, in this order: beat timing,
composition, palette, type, then the state of the motion. Fix the single
largest real difference and re-render once. Still frames cannot show motion: if
the reference's figure blinks or boils, compare a few consecutive frames in
that scene by hand. Do not fix a difference the user asked for.

## 6. Sound

The reference's soundtrack is part of the reference. When `facts.json` has an
`audio` file and the user did not ask to change the sound, keep it: copy it
into the composition's `assets/` and declare it as one track from 0 for the
film's length, as the general sound policy describes. Do not compose, replace
or remix it, and do not add effects on top.

- Same length: use it as is.
- Different length: cut it at the reference's scene boundaries, moving each
  cut to the nearest quiet point so no word or note is split, and change each
  piece's tempo with `atempo` to fit its new scene — within 0.8–1.25× for
  music, within 0.95–1.05× when a voice is heard (on-screen captions, a
  speaking presenter, or the user says so). Join pieces with 20–50 ms
  crossfades, fade in over 0.15 s and out over the last second, and write the
  result as a new WAV.
- A piece that needs more than its range: keep it at its own tempo and trim
  its tail (or pad with its own last second faded out) rather than stretch it
  further or swap in other music, and say in the final reply which scenes the
  original sound no longer lines up with.
- If the reference has a voice and the user changed what it would say (a new
  brand, new claims), keep the soundtrack anyway and say in the final reply
  that the voice still says the original words.

Follow the general sound policy instead only when the user asks for different
sound (new music, their own track, silence, a voiceover) or the reference has
no audio.
