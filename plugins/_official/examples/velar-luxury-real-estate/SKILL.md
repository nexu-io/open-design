---
name: velar-luxury-real-estate
description: "Use this plugin when the user wants a high-end luxury real-estate / architecture landing page with cinematic scroll choreography: a typewriter preloader that lifts away, a scroll-driven house image that rises from below and scales up while pinning to a dark statement section, a sticky dark stats band with count-up numbers, and a hover-expand video gallery that slides up over the dark section. Invoke for 'luxury real estate landing page', 'architecture brand site', 'scroll-driven hero with rising building', or when the user references the Velar template."
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

# Velar. — Luxury Real Estate Landing Page

Produce a single-page, cinematic luxury real-estate landing page. A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then adjust copy and data; do not rewrite the choreography or invent a new visual language. The seed already encodes the exact tokens, preloader typewriter, scroll-driven house animation, sticky dark stats band, count-up, and hover-expand gallery described below.

This is the authoritative build brief. Follow it exactly — the named colors, fonts, timings, image URLs, and the scroll-math are locked.

**Inlined image (critical):** `example.html` ships the building/house silhouette (`HOUSE_IMG`, originally `res.cloudinary.com/.../building_bzziky.png`) as an inlined `data:image/webp;base64,…` URI — keep it exactly as-is. The 5 cloudfront gallery `.mp4` videos and the `BG_IMG` higgs.ai hero background stay as remote URLs (large stable CDNs); the cloudinary host is the one to inline because it is the load-bearing, repeatedly-scaled centerpiece asset.

## Stack

- Default output: a single self-contained HTML file (the `example.html` seed) using vanilla CSS + JS. It already includes everything inline.
- If the user explicitly asks for the React project: port the seed faithfully to **React 18 + TypeScript + Vite + Tailwind CSS** with **only** `lucide-react` for icons (the hamburger→`X`). All animation logic lives in a single `src/App.tsx` using `useState`, `useEffect`, `useRef`, `useCallback`, and `IntersectionObserver`. No other libraries. Do not change the design while porting.

## Global setup — locked

- Page background `#f5f0ea` (warm off-white). Body wrapper `overflow-x: clip`.
- Fonts via `@import` in an inline `<style>`: **Syne** (400, 700, 800, 900) + **Inter** (300, 400, 500, 600) from Google Fonts.
- Constants: `GRASS_GREEN = '#213138'` (preloader bg + default logo color), `FULL_TEXT = 'Velar.'`, `HOUSE_IMG` (inlined data URI in the seed), `BG_IMG` (higgs.ai hero bg), and the 5 cloudfront gallery videos (in order — keep them).

## Section 1 — Preloader / intro overlay

Fixed full-viewport overlay (`z-index:100`, bg `#213138`, centered flex). Typewriter of `Velar.` in Syne `2.6rem`, white, `letter-spacing:-0.02em`; letters weight 700 except `.` weight 900. Blinking white cursor (3px × 1.1em rounded bar, `blink 0.7s step-end infinite`, opacity 0↔1) follows the last typed letter.

Timings (`setTimeout`): `CHAR_INTERVAL=140ms`, `TYPE_START=600ms`. Reveal letter `i` at `TYPE_START + i*CHAR_INTERVAL`. `LIFT_AT = TYPE_START + 6*CHAR_INTERVAL + 700`. Hide cursor at `LIFT_AT-150`. At `LIFT_AT`, lift overlay `translateY(-100%)` with `transform 1.5s cubic-bezier(0.45,0,0.15,1)` AND trigger the house rise. At `LIFT_AT+1300`, fade in hero text (`opacity 0→1`, `translateY(-28px)→0`, `0.7s cubic-bezier(0.22,1,0.36,1) 0.1s`). At `LIFT_AT+2100`, set `liftDone`, disable overlay transition (parked off-screen), and hand house control to the scroll handler.

## Section 2 — Fixed nav

Fixed top nav `z-50`, padding `px-6 md:px-10 lg:px-16`, `py-5 md:py-6`, flex justify-between. Left: `Velar.` in Syne `text-xl`, weight 700 letters / 900 dot, color = `navColor`. Right: hamburger — two stacked 28px×1px lines, top shrinks to `w-5` on hover; when open swaps to Lucide `X` (size 24).

Scroll behavior: if any **dark section** (Section 5 dark band + Section 6 gallery) overlaps the viewport top (`rect.top <= 0 && rect.bottom > 0`), `navColor = '#ffffff'`, else `'#213138'`. Transition `color 0.35s ease`.

Mobile menu: full-screen `#f5f0ea` overlay (`z-40`), centered, 4 stacked links — `Residences`, `Story`, `Listings`, `Inquire` — Syne `text-4xl`, font-light, tracking-widest, uppercase, black, hover `text-gray-500`. Click closes.

## Section 3 — Hero

`<section>` `position:relative; min-height:100vh; overflow:visible`, `BG_IMG` as cover/center background. Hero text block `z-index:10`, hidden initially, fades+slides in per preloader timing.

- Top row `.hero-heading-top` (`px-6 md:px-10 lg:px-16`, flex `items-end justify-between`, `margin-bottom:-0.04em`): left `LIVE IN` (`.hero-own-the`, Syne 800, uppercase, black, `letter-spacing:-0.03em`, `line-height:1`); right desktop-only `.hero-subtitle-desktop` (Syne 700, `clamp(10px,0.95vw,14px)`, max-width 300, opacity 0.7, right-aligned): "Stately homes built with vision, / scope, and architectural finesse."
- Headline row (wrapped in `overflow:hidden`): `IRREPLACEABLE` (`.hero-extraordinary`, Syne 800, uppercase, black, `letter-spacing:-0.03em`, `px-6 md:px-10 lg:px-16`).
- `.hero-subtitle-mobile` (`px-6`, Syne 600, `clamp(12px,3vw,15px)`, opacity 0.65, `margin-top:0.9em`): "Premium real estate with vision, / depth, and architectural clarity."

Responsive type sizes are locked — copy the three `@media` blocks verbatim from the seed (`<=639`, `640–1023`, `>=1024`); they swap desktop/mobile subtitles, set `padding-top`, and size `.hero-own-the` / `.hero-extraordinary`.

## Section 4 — Scroll-driven house animation (centerpiece)

`position:fixed` wrapper `z-index:22`, `pointer-events:none`, `will-change:transform`, default `bottom:0; left:50%; transform:translateX(-50%); width:100%; min-width:1400px`. Inner div entrance: starts `translateY(102vh)`, transitions to `translateY(0)` via `transform 1.5s cubic-bezier(0.45,0,0.15,1) 0.4s` when `lifting` becomes true; once `liftDone` the transition is removed so the scroll handler takes over. Renders `HOUSE_IMG` at `width:100%`, aria-hidden.

After `liftDone`, `updateHousePosition` (scroll+resize) computes — **locked math**:
- `baseW = max(innerWidth, 1400)`.
- `triggerPoint = -(heroH * 0.30)`; `endPoint = heroRect.top - (darkRect.bottom - vh)`; `progress = clamp((heroRect.top - triggerPoint)/(endPoint - triggerPoint), 0, 1)`.
- `t = smoothstep(smoothstep(progress))`, `smoothstep(x)=x*x*(3-2x)` applied twice.
- `startX=(vw-baseW)/2`, `startY=vh-imgH`; `finalScale=1.45`, `finalX=(vw-baseW*finalScale)/2`, `mobileOffset = vw<1024 ? -250 : 4`, `finalY = darkRect.bottom - imgH*finalScale + 500 + mobileOffset`.
- Interpolate `currentX/Y/Scale` linearly via `t`.
- `progress <= 0` → reset to resting (bottom-centered, scale 1). Else `top:0; left:0; transform: translate(currentX,currentY) scale(currentScale); transform-origin: top left`.

## Section 5 — Dark statement + stats (sticky)

Outer `position:relative; height:200vh; z-index:20`. A `4vh` `#1a1a1a` spacer, then inner `.s2-section` `position:sticky; top:0; height:100vh; background:#1a1a1a; overflow:hidden`. Content `.s2-content` flex column, `px-6 md:px-10 lg:px-16`, `padding-top:clamp(30px,4vw,60px)`, `padding-bottom:clamp(60px,8vw,120px)`.

- `.s2-statement` (Inter 300, `#e8e4df`, `letter-spacing:-0.02em`, `line-height:1.35`, `white-space:nowrap`, `clamp(22px,2.6vw,42px)`); wrapper `max-width:1200px`, centered, `padding-left:25%`. Four hard-broken lines: "Every estate we present is hand-chosen / through a frame of permanence, refinement, / and timeless detail. Standards are not / a flourish. It is our discipline."
- `.s2-stats-row` (same max-width/centered/`padding-left:25%`, `margin-top:clamp(48px,6vw,80px)`): 3 flex columns, `flex:1`, left border `1px solid rgba(255,255,255,0.2)` between items, `padding-left:clamp(20px,2.5vw,40px)` on items 2–3:
  1. `120+` — Portfolio Holdings
  2. `12` — Global Locations
  3. `98%` — Patron Loyalty Rate
- Numbers: Inter 300, white, `clamp(36px,4.5vw,72px)`, `line-height:1.1`. **CountUp**: when the element first crosses 30% into viewport (IntersectionObserver), animate 0→`end` over 2000ms, easing `1-(1-t)^3`, render `Math.round(eased*end)+suffix`.
- Labels: Inter 400, `rgba(255,255,255,0.6)`, `clamp(12px,1.1vw,16px)`, `margin-top:clamp(4px,0.5vw,8px)`, `letter-spacing:0.01em`.
- `<=767px`: drop the 25% left padding to 0. `768–1023px`: padding-left 15%, `min-height:70vh`.

## Section 6 — Hover-expand gallery (slides over Section 5)

`.s3-gallery-section` `position:relative; z-index:25; margin-top:-100vh; background:#1a1a1a; height:100vh; overflow:hidden` — the negative margin + higher z slides it up over the sticky dark section. Background ticker `.s3-ticker-wrap` (`inset:0`, flex center, `overflow:hidden`, `z-index:0`, `pointer-events:none`) with `.ticker-track` of two copies of a giant repeating `Velar.` word-mark; each span Syne 800, `clamp(100px,14vw,220px)`, white, low opacity, `white-space:nowrap`, `letter-spacing:-0.02em`, `user-select:none`, `padding-right:0.3em`.

Gallery content `.s3-gallery-content` (`z-index:1`, flex center, full height, `clamp(24px,4vw,60px)`). Row `.gallery-expand-row` (flex, `gap:6px`, height 70%, max-width 1200px). Each `.gallery-expand-item` (`flex:1 1 0%`, full height, `border-radius:12px`, `overflow:hidden`, `cursor:pointer`, `transition: flex 0.5s cubic-bezier(0.4,0,0.2,1)`) holds its video (autoplay, loop, muted, playsInline, `object-fit:cover`). On hover the hovered item grows to `flex:4`, others shrink (accordion expand).

`<=1023px`: copy the mobile grid rules verbatim from the seed — `s3-gallery-section` becomes `height:auto; min-height:100vh; overflow:visible`; ticker becomes sticky; row becomes a `1fr 1fr` grid with `aspect-ratio:4/5` items and a centered full-width last-odd item; `<=479px` tightens padding/gap.

## Tech notes

- Only `react`, `react-dom`, `lucide-react`, Tailwind, Vite. No other libraries.
- All animation logic in a single `App.tsx`. Use Supabase only if persistence is later needed; this page has no data layer.

## Color Rules — hard

Warm off-white `#f5f0ea` page; deep teal `#213138` for preloader + default logo; dark `#1a1a1a` for the statement/gallery sections; statement text `#e8e4df`; hero text black. Do not introduce other accent hues — the palette is intentionally monochromatic-luxury.
