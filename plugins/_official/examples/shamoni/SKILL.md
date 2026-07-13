---
name: shamoni
description: "Use this plugin when the user wants an immersive, scroll-driven fashion / collection landing page with a full-bleed background video, an expanding ellipse clip-path reveal, and a mathematically-precise orbiting image gallery that grows and sweeps across the viewport on scroll. Invoke for 'Shamoni', 'orbit gallery landing', 'scroll-driven hero', 'master the elements', 'cinematic collection page', or when the user references the Shamoni template."
version: 0.1.0
od:
  mode: prototype
  surface: web
  scenario: design
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
---

# Shamoni — Scroll-Driven Orbit Landing Page

Produce an immersive, highly interactive, **scroll-driven** landing page. A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then adjust only copy, imagery, and data; do **not** rewrite the timeline math or invent a new visual language. The seed already encodes the exact tokens, fonts, clip-path reveal, orbit gallery, fade timeline, and responsive behavior described below.

This is the authoritative build brief. The named fonts, colors, video/image URLs, and every Framer Motion keyframe array are **locked**.

## Stack

- Default output: a single self-contained HTML file (the `example.html` seed). It already includes everything inline — vanilla HTML/CSS/JS, no build step.
- If the user explicitly asks for the React project, port the seed faithfully: **React + Vite + Tailwind CSS v4 + `motion/react` (Framer Motion)**, `lucide-react` for icons. Same tokens, same markup structure, same numbers. The vanilla seed maps 1:1 to the React spec below — do not change the design while porting.
- **Motion loading (locked).** If you emit a single self-contained inline-JSX file instead of the Vite project, Motion's React hooks (`useScroll`, `useTransform`, `useAnimationFrame`, …) exist only in the **React** UMD build: load `<script src="https://unpkg.com/framer-motion@11.11.13/dist/framer-motion.js"></script>` and read them off `window.Motion` — never the vanilla `https://unpkg.com/motion@.../dist/motion.js` DOM bundle, which lacks `useScroll` and renders a blank page. (The Vite project imports from npm and is unaffected.)

### Framework → vanilla mapping (already done in the seed)
- `useScroll({ offset: ["start start","end end"] })` → a `getProgress()` reading `scrollRoot.getBoundingClientRect().top` over `(scrollHeight - innerHeight)`, clamped 0..1.
- `useTransform(p, inputs, outputs)` → an `interp(t, inputs, outputs)` linear-interpolation helper. **Reuse the exact input/output arrays.**
- `useMotionTemplate\`ellipse(${rx} ${ry} at 50% 50%)\`` → writing `style.clipPath`.
- `useAnimationFrame` velocity-driven `orbitProgress` → a `requestAnimationFrame(render)` loop that advances `orbitProgress` by scroll delta.
- `offsetPath` / `offsetDistance` / `offsetRotate` → the same CSS Motion Path properties (with `-webkit-` fallbacks) set per item.

## Fonts (Google Fonts, loaded via `<link>`)

`Instrument+Serif:ital@0;1` + `Manrope:wght@300;400;500;600` + `Great+Vibes`.

Tailwind v4 `@theme` tokens (locked):
```
--font-serif: "Instrument Serif", serif;
--font-sans: "Manrope", sans-serif;
--font-script: "Great Vibes", cursive;
```

## Page skeleton

- `scroll-root`: `position: relative; width: 100%; height: 600vh; background: #000;` (this is the scroll track — `h-[600vh]`).
- `sticky-stage`: `position: sticky; top: 0; height: 100vh; overflow: hidden;` (the `sticky top-0 h-screen` viewport that everything renders into).

## Background video (z-0)

`<video autoplay loop muted playsinline>` covering the stage (`position:absolute; inset:0; object-fit:cover`), plus a `rgba(0,0,0,0.10)` tint layer. Source (locked):
`https://plugin-assets.open-design.ai/plugins/luxury-botanical/hf_20260520_114550_b72cc2b7-2267-4d9e-b19f-f3bb4b0c7084-e5c560.mp4`

## Brand wordmark (z-10, bottom-left)

`width:80vw; left:3vw; bottom:3vw`. An SVG `<text>` "Shamoni" in `Instrument Serif`, `font-size:90`, fill `#FDFFB7`, with a `©` `<tspan font-size:28.8 dx=4 dy=-40>`. `viewBox="0 10 350 72"`, `preserveAspectRatio="xMinYMax meet"`, big drop-shadow.

## Expanding ellipse mask (z-20)

A layer `width:150vw; height:150vh; left:-25vw; top:-25vh; transform: rotate(-15deg)`, `overflow:hidden`, animated `clip-path: ellipse(rx ry at 50% 50%)`. Inside: an absolute white fill (`background:#fff`) and a counter-rotated inner (`transform: rotate(15deg)`, `100vw × 100vh`) holding the orbit stage. As the ellipse grows it wipes the white scene over the video.

- `rx = ry = interp(p, [0, 0.08, 1], [0, 55, 55])` (as `%`). So the white wipe completes by ~8% scroll.

## Orbit gallery (`OrbitImages`)

`orbit-stage`: `90vw; max-width:1200px; aspect-ratio:1/1`. Design space `baseWidth = 800`, center `(400,400)`. Responsive: a `ResizeObserver` computes `stageScale = containerWidth / 800` and applies `translate(-50%,-50%) scale(stageScale)` to the scaling wrapper. A rotation wrapper applies `rotate(rot)deg translateX(tx)px`.

Six images distributed evenly along an **ellipse motion path** via `offset-path: path("…")` + `offset-distance: <pos>%`. Images (locked, cloudinary — keep remote, do NOT inline; they are large stable CDN stills):
```
.../v1776966860/202604232047_gxyqne.jpg
.../v1776966856/202604232052_ihyslg.jpg
.../v1776966299/15112343_tuzrbg.jpg
.../v1776966299/202604232043_vhb6u9.jpg
.../v1776967124/02604232058_nh1qd1.jpg
.../v1776967611/202604232105_lv3fhp.jpg
```
Each item: `width=height=itemSize`, `object-fit:cover; border-radius:50%`, `whileHover` brightness lift. Inner element counter-rotates by `-rot` so images stay upright.

### Ellipse path generator (locked)
```
M (cx-rx) cy A rx ry 0 1 0 (cx+rx) cy A rx ry 0 1 0 (cx-rx) cy
```

### Focal scale curve (locked — `itemScaleFor(rawPos, strength)`)
```
dist = |rawPos - 50|; if dist > 50 dist = 100 - dist
if dist < 20: ratio = dist/20; target = 0.4 + ((cos(ratio*π)+1)/2)*0.6
else: target = 0.4
return 1 - strength*(1 - target)
```
`zIndex = round(scale*100)`.

### Velocity-driven progress (locked)
```
scrollDelta = p - prevScroll; prevScroll = p
if (p > 0.15 && p < 0.85)  frameSpeed = scrollDelta * 200
else                       frameSpeed = (1/60) * 2.5   // idle drift (React: delta/1000*2.5)
orbitProgress += frameSpeed
```
Per item: `rawPos = ((orbitProgress + (index/N)*100) % 100 + 100) % 100`.

## Scroll timeline — keyframe arrays (DO NOT change any number)

Progress `p ∈ [0,1]`.

- **Ellipse reveal**: `rx = ry = interp(p, [0, 0.08, 1], [0, 55, 55])` (`%`).
- **Text opacity**: `interp(p, [0.03, 0.08, 0.15, 0.22, 0.90, 0.98, 1], [0, 1, 1, 0, 0, 1, 1])`.
- **Text blur (px)**: `interp(p, [0.03, 0.08, 0.15, 0.22, 0.90, 0.98, 1], [15, 0, 0, 15, 15, 0, 0])`.
- **Corner Y (px)**: `interp(p, [0.03, 0.08, 0.15, 0.22, 0.90, 0.98, 1], [20, 0, 0, 20, 20, 0, 0])`.
- **Orbit itemSize**: `interp(p, [0.15, 0.25, 0.85, 0.95, 1], [80, 520, 520, 80, 80])`.
- **Orbit radiusX**: `interp(p, [...same...], [330, 650, 650, 330, 330])`  (`TARGET_RADIUS = 650`).
- **Orbit radiusY**: `interp(p, [...same...], [140, 650, 650, 140, 140])`.
- **Orbit rotation (deg)**: `interp(p, [...same...], [-15, 0, 0, -15, -15])`.
- **Orbit translateX (px)**: `interp(p, [...same...], [0, -650, -650, 0, 0])`.
- **focusStrength**: `interp(p, [...same...], [0, 1, 1, 0, 0])`.

So: white wipe (0–8%) → text/header/corner copy fade in & deblur (3–15%) → orbit explodes to full radius, items grow to 520, ellipse rotates upright and sweeps left by 650px while the focal curve magnifies the front item (15–85%) → everything reverses and the copy returns (90–100%).

## Overlay copy (z-60, above the mask, `color:#000`)

- **Center text** (`top:48%`, centered, `white-space:nowrap`): line 1 `Instrument Serif` 55px (45px ≤768px) — italic `M` + regular "aster the Elements"; line 2 `Manrope` 36px (28px) "embrace", `margin-top:-5px`. Fades/deblurs with the text timeline.
- **Top-right corner** (`top:128px; right:214px`): serif 40px "2K26"; serif 16px uppercase tracked "JOIN AN EXCLUSIVE / COMMUNITY". Uses corner-Y + blur + opacity.
- **Bottom-left corner** (`bottom:64px; left:64px`): serif 40px "0651"; serif 16px uppercase "COLLECTION".
- **Bottom-right corner** (`bottom:64px; right:10vw`): serif 16px uppercase tracked paragraph (`width:240px`) "JOIN AN EXCLUSIVE COMMUNITY OF SAILORS. WHETHER YOU CRAVE THE THRILL OF THE OPEN"; then a CTA row: black pill button `BUY COLLECTION` (`Instrument Serif`, radius 40px, padding 14×32, uppercase, tracking 0.1em) + a 46×46 black circular arrow button (`-ml-8`, right-arrow SVG).

## Fixed header (z-100)

`position:fixed; top:0; padding:40px; justify-content:space-between`. Left: `Instrument Serif` brand "Shamoni" 40px + `©` 14px, `color:#000`. Right: a 72×44 menu button — black `border-radius:50%` pill rotated `-15deg` + a white two-line hamburger SVG (`scale(1.05)` on hover). Whole header fades/deblurs with the text timeline.

## Color & aesthetic rules — hard

- Background is black; the revealed scene is pure white (`#fff`). All overlay copy is `#000`.
- Wordmark accent is the pale chartreuse `#FDFFB7` — locked. The tint over the video is exactly `rgba(0,0,0,0.10)` (subtle; no heavy overlay).
- No purple/indigo. Keep the monochrome black/white + single yellow-green wordmark accent.

## Responsive

- ≤768px: shrink the center/corner type per the breakpoints above, pull corners inward (`right:6vw`, `left:24px`), reduce header padding to 24px, wordmark to 92vw. The orbit `stageScale` already adapts to container width via the `ResizeObserver`.

## State / interactions

- The single source of truth is `scrollYProgress` (0..1). Everything else derives from it through `interp`.
- The orbit loop runs in `requestAnimationFrame`; it both advances `orbitProgress` (velocity-driven) and re-lays out every frame.
- Buttons (`BUY COLLECTION`, arrow, menu) are decorative hover-scale controls in the seed; wire real handlers if the user asks.
