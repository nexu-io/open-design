# Hand-painted animation guide for OpenDesign

This guide adapts animation principles from John Heibel's MIT-licensed
ClaudeAnimationBase. Copyright (c) 2026 John Heibel for the upstream material;
see `../runtime/LICENSE`. The character recipe below is an OpenDesign composition.
The original upstream guide is linked in `../runtime/UPSTREAM.md`; its mascot kit and
reference sheets are not included in this integration.

## Story and timing

Write a storyboard before coding. Give the five-second story a clear cause,
a readable reaction and a payoff. Use broad poses and enough time to read each
beat. Suggested timing: 0–0.4 iris opening, 0.4–1.1 anticipation, 1.1–1.7
surprise, 1.7–3.2 happy movement, 3.2–4.6 hold the reaction, 4.6–5 iris closing.
The event can differ; the total duration stays five seconds.

## Drawing style

Keep the scene flat 2D. Use paper, flat colour washes and boiling ink outlines.
Prefer a few strong shapes over small detailed props. Keep the palette, character
proportions, eye placement and movement direction consistent across the shot.
Avoid lettering, audio and slow watercolour fills. Make every frame a pure
function of time; do not accumulate simulation state or use Math.random().

## Original characters

The starter draws a rounded teal bird with an oval body, side wings, two feet,
round eyes and a yellow beak. The scene owns its drawing function: change it
or write another original character with the painting primitives below. Build
expressions from eye size, gaze, wing position and the body's pose. Do not use
another company's mascot or logo as the default character.

## Runtime in the source directory

`media scaffold --template hand-painted` copies p5 2.3.3, p5.brush 2.2.3, the
upstream core.js and timeline.js, and a player clock into the source directory
and declares PROJECT={duration:5,bpm:120,offset:0}. No character kit is
supplied. Do not load a CDN, install packages or launch another browser.

| Helper | Use |
|---|---|
| `shots([[0, scene]])` | Register a scene called with absolute time in seconds |
| `boilSeed(key)` | Give each drawn object a stable seed at the current boil frame |
| `rectPts(x,y,w,h)` | Rectangle outline points |
| `ellPts(cx,cy,rx,ry,n,j)` | Ellipse outline points with optional irregularity |
| `paint(points,{wash,ink,sw})` | Flat colour wash with an optional ink outline |
| `inkLine(points,sw,col)` | Draw an ink stroke |
| `camBegin(cx,cy,zoom)` / `camEnd()` | Pair camera transforms around the world |
| `seg(t,start,end)` / `ease(p)` | Normalize and ease a timing interval |
| `iris(cx,cy,r)` | Cover the frame except for a circular opening |
| p5 `push`, `pop`, `translate`, `scale` | Isolate a character's transforms |

## Delivery

Edit the inline scene script in the scaffolded `motion-source/<name>/index.html`.
Keep one canvas#out and the local scripts. Render with the generate/wait
workflow in ../SKILL.md. Deliver both the editable source and the silent MP4.
