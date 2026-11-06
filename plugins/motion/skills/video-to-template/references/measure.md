# Measure the reference

Use the pinned native CLI: `node <hyperframesCli> measure …`. Use an existing runtime or obtain its path from `motion_open_preview`. These commands answer specific questions; running every measurement command is not mandatory. Images go to `.hyperframes/measure/` by default; use `--out` to write into the working directory, then read them with the host's image reading.

Put the numbers you measure into `TEMPLATE.md` at the project root (template at the end of this file). Rebuilding, comparing and writing approximations all refer back to it.

## 1. Canvas: probe

```
node <cli> measure probe <original>
```

Use the returned `canvas` for the root composition: `data-width`, `data-height`, `data-fps`, `data-duration`.

- For constant-rate sources preserve the intended rational rate, such as `30000/1001`. For variable-rate sources inspect timestamps; choose and record a suitable supported output rate rather than blindly copying the advertised maximum.
- Use the measured picture duration/timestamps. Frame count divided by fps is useful for constant-rate sources; do not silently extend the picture to the audio container length.
- Set dimensions, rate and duration from the measured reference/request in the new native project; do not assume a default template or catalog ID.

## 2. Cuts: cuts

```
node <cli> measure cuts <original>
```

Use actual source timestamps, or zero-based frame index divided by the exact rational fps for constant-rate footage. For variable-rate footage, map actual presentation timestamps onto the recorded output rate. Preserve enough precision for the runtime's sampling convention. Verify detector candidates against adjacent source frames, then check adjacent rendered frames around sensitive boundaries instead of applying one truncation rule to every timeline.

`shots` is a first draft of the segmentation. Films built around gradients, growth and morphing have few cuts; segment further by picture content.

## 3. What changes: events

```
node <cli> measure events <original> --map --out <dir>
```

Lists appearance, disappearance, change and hold times, alongside sound onsets and beats. Use it to find when each element enters and leaves, and which windows need frame-by-frame inspection.

## 4. Frame by frame: frames

```
node <cli> measure frames <original> --range a,b --roi x,y,w,h --max 16 --out <dir>
node <cli> measure frames <original> --events --out <dir>
```

Read consecutive frames around every cut, entrance, exit and transition. Sampling once a second or half-second drops 1–3 frame timing differences, entry directions, blur and flashes at cuts.

Read four things clearly: which direction it comes from and how (pop, scale, fade, type, word by word, wipe); how it changes on screen (colour, fill, counting, morphing); how it leaves; whether edges are solid, stroked, gradient or glowing.

A one-per-second overview is for navigation only — **never evidence of motion**: it drops 1–3 frame differences. Judging motion requires reading consecutive native frames of that range.

## 5. Motion curves: curve

```
node <cli> measure curve <original> --start a --end b --roi x,y,w,h
```

The ROI frames the whole move (including overshoot) and contains only one thing moving. It returns start, end, duration, overshoot and the closest GSAP ease. Use the result as a starting estimate for the motion. Multiple phases, constraints or procedural motion can require a richer representation than one tween.

## 6. Text size: ink

```
node <cli> measure ink <original> --at t --roi x,y,w,h
```

For a text-size mismatch, measure the ink width and height in the original and render; adjust size, tracking or layout according to the request. Substitute fonts are usually wider, so compare numerals too.

Choose fonts by character: geometric shapes, contrast, x-height, stroke terminals. Start with the built-in fonts listed in `authoringGuide`; if none fit, take from Google Fonts, put the file in `assets/fonts/` and write the `@font-face`. Any substitute goes into `approximations`.

## 7. Background and colour: look

```
node <cli> measure look <original> --at t --grid 8x6
```

The background fills most of the frame and moves the score most. Sample the background grid at several moments and match the gradient direction and its light-to-dark falloff.

## 8. Texture: depth, light, blur

Take the background grid at one moment (step 7) and look at three more things:

- **Depth layering**: how much sharper one layer is than the one behind at the same moment. Use `measure frames --range a,b --roi <back layer>` to see whether the back layer is blurrier and darker than the front.
- **Highlights**: how bright the brightest part of the original is (near pure white, or grey). Use `measure ink` or read the colour values in one frame.
- **Motion blur**: direction and length on the fast-moving frames. Consecutive `measure frames` show it.

Record these properties in `TEMPLATE.md` only where the reference has them: how much the back layer blurs, where it glows, which frames carry blur. Do not add missing effects for polish.

## 9. Crop assets: extract

```
node <cli> measure extract <original> --at t --roi x,y,w,h --out <workdir>/logo.png
```

Crop photos, screenshots, logos and avatars inside their own frame into separate files, then copy them into local `assets/` or use `motion_import_asset` for a plugin-managed project. Crop a logo from its largest, sharpest frame.

## TEMPLATE.md

One file, read mainly by the next agent and by template producers. Users may open it, so keep it plain.

```markdown
# <film name> template

## What to change
| Content | Variable or source entry | Also affects |
|---|---|---|
| headline | `headline` / compositions/title.html | line wrap, hold before cut at 3.2 s |

## Differences from the original
- Plain words, where and why

## Rebuild record

Original: <path>, <width>×<height>, <fps>, <frames> frames, <duration> s, sound: yes/no

| Segment | Frames [start,end) | Seconds | Content | Element ids | Motion (duration / ease) |
|---|---|---|---|---|---|
| s1 | [0,71) | 0–2.366666 | black dot rotating | bot-dot | rotate 1.2s / power2.inOut |

## Text
| Element id | Copy | Font (substitute?) | Size | Ink width×height (original / mine) |

## Checks
Passed / did not pass (where) / did not run, one line each. Include the HyperFrames version and the tested render command.
```
