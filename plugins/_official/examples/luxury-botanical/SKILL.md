---
name: luxury-botanical
description: "Use this plugin when the user wants a cinematic luxury-fragrance / botanical landing page: a fullscreen video hero, a scroll-driven elliptical clip-path reveal, an orbiting carousel of perfume bottles that scales up at a focal point, plus a 'Stay in the collection' newsletter section and a warm parchment footer. Invoke for 'luxury botanical', 'perfume landing page', 'fragrance hero', 'orbit carousel', or when the user references the Bentley — Beyond The Collection template."
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

# Luxury Botanical — Beyond The Collection

Produce a cinematic, scroll-driven **luxury fragrance landing page**. A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then adjust copy, bottle imagery, and section text; do not rewrite the motion system or invent a new visual language. The seed already encodes the exact fonts, tokens, scroll-keyframes, orbit math, clip-path reveal, and responsive behavior described below.

This is the authoritative build brief. The named fonts, colors, scroll stops, radii, and asset URLs are locked.

## Stack

- Default output: a single self-contained HTML file (the `example.html` seed). It uses **vanilla HTML/CSS/JS** — the scroll engine is one passive `requestAnimationFrame` loop reading `getBoundingClientRect()`, and `whileInView` reveals use an `IntersectionObserver`. Everything is inline.
- If the user explicitly asks for a **React + TypeScript + Vite + Tailwind** project, port the seed faithfully into **Framer Motion**: the hero stage is a `useScroll({ offset: ["start start","end end"] })` over a `600vh` container with a `sticky top-0 h-screen` child; every animated value maps to a `useTransform`; the orbit carousel is the `OrbitImages` component driven by a `useAnimationFrame` progress value. Same fonts, same colors, same keyframe stops. Do not change the design while porting.

## Fonts (Google Fonts, locked)

Load once via `<link>`:
`Instrument+Serif:ital@0;1` + `Manrope:wght@300;400;500;600` + `Great+Vibes`.

- **Instrument Serif** — display serif for headlines, the "Beyond *The*" wordmark (the *The* is italic), the big "Stay *in*" title, overlay numbers/labels, and uppercase tracked labels.
- **Manrope** — body / UI sans; weight 400 default, 500/600 for labels and the wordmark "BENTLEY".
- Great Vibes is loaded for optional script accents (not heavily used in the seed).

## Colors / tokens (locked)

- Page background: `#000` (black behind the hero video).
- Hero overlay text sits on the **white** clip-reveal, so all hero overlay copy is `#000` (black on white).
- Reveal surface: pure white `#fff`.
- Stay section: white `#fff` background, black text; body copy `rgba(0,0,0,0.78)`.
- Footer: warm parchment `#f4ecdc`, black text; muted labels `rgba(0,0,0,0.55)`, body `rgba(0,0,0,0.65)`.
- Buttons / pills: solid black `#000`, white text, hover `rgba(0,0,0,0.9)` / `0.85`.
- Orbit label text: title `#000`, description `rgba(0,0,0,0.72)`.
- No purple/indigo. The palette is monochrome (black/white) warmed only by the parchment footer.

## Assets (keep these remote — stable CDN)

These are large, stable CDN media; keep them as remote URLs (do **not** try to inline them, and do **not** swap them for other hosts):

- Hero background video (autoplay/muted/loop/playsinline, `object-fit:cover`, fixed inside the sticky stage):
  `https://plugin-assets.open-design.ai/plugins/luxury-botanical/hf_20260520_114550_b72cc2b7-2267-4d9e-b19f-f3bb4b0c7084-e5c560.mp4`
- Six fragrance-bottle `.webp` stills on `res.cloudinary.com/dsdhxhhqh` (the orbit images), in this order:
  1. Wild Vetiver — `…/v1780390315/BL1996-Beyond_wild_vetiver_Flakon_100ml_300dpi_a55ie5.webp`
  2. Radiant Osmanthus — `…/v1780390315/BL2156_BEYOND_RADIANT_OSMANTHUS_hoc3up.webp`
  3. Vibrant Hibiscus — `…/v1780390315/BL2157_BEYOND_VIBRANT_HIBISCUS_pgiehq.webp`
  4. Mellow Heliotrope — `…/v1780390315/BL2158_BEYOND_MELLOW_HELIOTROPE_agqych.webp`
  5. Magnetic Amber — `…/v1780390317/BL2371-BL2372-BL2373-Magnetic-Amber_web_2_dbmtpy.webp`
  6. Crystal Edition — `…/v1780390315/BL2156_BEYOND_RADIANT_OSMANTHUS_1_hlc4v1.webp`
- Stay-section bottom decoration still: `https://plugin-assets.open-design.ai/plugins/luxury-botanical/pasted-1779282335552-1_gmztyi-eccf42.webp`

There are **no avatar / face images** in this template — nothing needs base64 inlining. Keep the CDN URLs exactly as above.

## Scroll stage (the heart of the page)

A `600vh` tall `.stage` container with a `position: sticky; top: 0; height: 100vh` child. Normalized scroll progress `p ∈ [0,1]` = `-rect.top / (stageHeight - innerHeight)`, clamped. One `requestAnimationFrame` loop reads `p` each frame and drives everything via a piecewise-linear `track(p, stops, values)` helper (the vanilla equivalent of Framer's `useTransform`).

### Hero chrome (logo, header, scroll hint)
Opacity follows `track(p, [0, 0.03, 0.08], [1, 1, 0])` — visible at top, faded out by `p=0.08`.
- Top-left logo: "Beyond *The*" (Instrument Serif, *The* italic) over "Collection" (Manrope). `top:120px; left:96px`, black.
- Header: brand mark (inline SVG winged-B crest) + "BENTLEY" (Manrope 600, letter-spacing `0.42em`), and a black "Shop the collection" pill with a circular arrow cap.
- Scroll hint: a 20×34 well with a `scrollArrow` keyframe arrow (translateY -6→10px, opacity pulse, 1.6s loop), bottom-center.

### Clip-path reveal
A `150vw × 150vh` layer offset `left:-25vw; top:-25vh`, rotated `-15deg`, with `clip-path: ellipse(R% R% at 50% 50%)` where `R = track(p, [0, 0.08, 1], [0, 55, 55])` — an ellipse that opens from nothing to 55% by `p=0.08` and holds. Inside: a full-bleed white surface and a counter-rotated (`rotate(15deg)`) inner that hosts the orbit.

### Orbit carousel (`OrbitImages`)
Six bottles ride an **elliptical offset-path**. Scroll keyframes at stops `[0.15, 0.25, 0.85, 0.95, 1]`:
- `itemSize`: `[80, 360, 360, 80, 80]` px
- `radiusX`: `[330, 650, 650, 330, 330]`
- `radiusY`: `[140, 650, 650, 140, 140]` (becomes a circle of radius `TARGET_RADIUS=650` in the middle)
- `rotation` of the whole ring: `[-15, 0, 0, -15, -15]` deg
- `translateX`: `[0, -850, -850, 0, 0]` (= `-(TARGET_RADIUS+200)`), sliding the ring left mid-scroll
- `focusStrength`: `[0, 1, 1, 0, 0]`

Carousel progress advances continuously: when `0.15 < p < 0.85` it tracks `scrollDelta * 200` (scroll-scrubbed); otherwise it idles at `~2.5 deg/sec`. Each item's position on the ellipse is `(progress + i/6*100) % 100`. Item scale uses a cosine focal falloff: within 20% of the focal point (`50`) it eases `0.4 → 1.0` via `(cos(ratio·π)+1)/2`, else `0.4`; final scale = `1 - focusStrength·(1 - targetScale)`. Each item's content is **counter-rotated** by `-rotation` so bottles stay upright, and `zIndex = round(scale·100)` so the focal bottle is on top. A focal bottle reveals its **label** (Instrument Serif title + Manrope description, fading in with `focusStrength`) at `left:115%`.

### Hero overlay copy (fades in on the white reveal)
Opacity/blur/translateY follow `track(p, [0.03, 0.08, 0.15, 0.22, 0.90, 0.98, 1], …)`:
- opacity `[0, 1, 1, 0, 0, 1, 1]`, blur `[15, 0, 0, 15, 15, 0, 0]` px, translateY `[20, 0, 0, 20, 20, 0, 0]` px (center brand uses opacity+blur only, no y).
- Center brand: "Beyond *The*" + "Collection", black, `top:48%`.
- Top-right: "2K26" + "JOIN AN EXCLUSIVE / COMMUNITY".
- Bottom-left: "0651" + "COLLECTION".
- Bottom-right: a tracked uppercase paragraph + black "BUY COLLECTION" pill with an overlapping circular arrow button.

## Stay section (after the stage)

`min-height:100vh`, white. A bottom-anchored decoration image (`stay-bg`, `object-position:center bottom`). Content max-width `1480px`, padding `80px 32px`, flex column gap `32px`:
- Title: "Stay *in*" (Instrument Serif, `clamp(60px,11vw,160px)`, *in* italic) over "the collection" (Manrope 400, 64px).
- Newsletter blurb + an underlined email `<input>` + "Subscribe →" button (border-bottom black/40).

## Footer

Warm parchment `#f4ecdc`, black text, max-width `1480px`, padding `48px 32px`.
- 4-column grid (2 cols ≤767px, 4 cols ≥768px), gap `48/40px`, `margin-bottom:80px`: **Discover**, **Studio**, **Contact**, **Newsletter** (with its own email form).
- Column headings: Manrope 500, 11px, letter-spacing `0.3em`, uppercase, `rgba(0,0,0,0.55)`.
- Bottom row (border-top black/15, padding-top 32px): "© 2026 Beyond The Collection", social links Instagram · TikTok · Spotify, and "EN · USD".

## Animations / reveals

- All hero motion is **scroll-driven** through the single rAF loop and `track()` — do not bolt on time-based tweens for the hero.
- Stay + footer blocks use a **blur-up reveal** (`opacity 0→1`, `translateY(40px)→0`, `blur(20px)→0`, 1s ease) triggered once by an `IntersectionObserver` at `threshold 0.3`, with optional staggered `data-delay` (150/200/250ms).
- Orbit image hover: `scale(1.2)`, 0.3s.

## Responsive

- ≤900px: pull the logo / overlay anchors inward (logo `left:32px`, info blocks to `6vw`/`32px` insets), reduce Stay padding to `64px 24px`. The orbit/reveal math is viewport-relative and reflows automatically (radii are scaled by `frameWidth / 800`).
- ≥768px: footer grid expands from 2 to 4 columns.

## Color rules — hard

Monochrome black-on-white hero and Stay section; the **only** warm tone is the parchment footer `#f4ecdc`. No purple/indigo/teal accents. Buttons are solid black. Keep all the locked asset URLs (cloudfront video + the six cloudinary `.webp` bottles + the cloudinary stay decoration) exactly as shipped.
