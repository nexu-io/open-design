---
name: dreamcore-landing
description: "Use this plugin when the user wants a single-page immersive parallax landing page with a scroll-driven portal/curtain entrance and a curved arc card slider — a 'dreamcore' / 'reverie' hero that scales a portal image toward the viewer as the user scrolls into a second dream-world scene. Invoke for 'parallax landing', 'scroll cinematic hero', 'portal zoom landing', 'arc card slider', or when the user references the Dreamcore Landing template."
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

# Dreamcore Landing — Immersive Parallax Scroll Hero

Produce a single-page immersive **parallax landing page** with two scroll-driven scenes inside one sticky viewport. A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then adjust copy and data; do not rewrite the layer math, the easing, or the visual language. The seed already encodes the exact layer stack, scroll mapping, entrance sequence, mouse parallax, and arc-slider geometry described below.

This is the authoritative build brief. Follow it exactly — the layer z-order, scale ranges, scroll breakpoints, MAG values, fonts, image URLs, and card data are locked.

## Stack

- Default output: a single self-contained HTML file (the `example.html` seed). Vanilla HTML/CSS/JS, no build step. Framework features are mapped down: `useScroll`/`useTransform` → a passive `scroll` listener writing scrollProgress; per-frame transforms → a `requestAnimationFrame` loop; mouse parallax → a `mousemove` handler lerped at `speed = 0.07`; entrance animation → `setTimeout` milestones.
- If the user explicitly asks for the React + TypeScript + Tailwind + Vite project, port the seed faithfully into a single `src/App.tsx`: same layer stack, same easing helpers (`easeInOut`, `lerp`, `clamp`), same MAG values, `lucide-react` as a (largely unused) dependency, Tailwind only for the responsive breakpoints. Override the `xl` breakpoint to `1100px` (`screens: { xl: '1100px' }`). Do not change the design while porting.

## Fonts & Global

- Google Fonts via `<link>`: `https://fonts.googleapis.com/css2?family=Viaoda+Libre&family=Imprima&display=swap`. **Viaoda Libre** = serif headings; **Imprima** = sans-serif body. Title: "Step Into Wonder".
- Global reset, dark background `#0a0608`, `font-family: 'Imprima', sans-serif`, `scrollbar-gutter: stable`.
- `@keyframes bobUp`: translateY `-6px` at 50% (drives the scroll-cue chevron, `animation: bobUp 1.8s ease-in-out infinite`).

## Image Assets (use these EXACT remote URLs — keep them remote)

These are large stable CDN stills; **do not inline them and do not swap the host**.

```
PORTAL_BG     = https://plugin-assets.open-design.ai/plugins/dreamcore-landing/image_1_vdzwae-464f73.webp
CURTAIN_LEFT  = https://plugin-assets.open-design.ai/plugins/dreamcore-landing/curtain_left_znkmva-f9eb4c.webp
CURTAIN_RIGHT = https://plugin-assets.open-design.ai/plugins/dreamcore-landing/curtain_right_paeyym-9fa947.webp
WORLD_BG      = https://plugin-assets.open-design.ai/plugins/dreamcore-landing/image_2_gkcdlx-5f252f.webp
BOTTOM_CLOUDS = https://plugin-assets.open-design.ai/plugins/dreamcore-landing/bottom_clouds_xskut6-c56b42.webp
CARD_IMAGES[0] = https://plugin-assets.open-design.ai/plugins/dreamcore-landing/hf_20260525_160507_2ccbb4eb-1469-484f-af25-59168ad9a233-0c7429.webp&w=1280&q=85
CARD_IMAGES[1] = https://plugin-assets.open-design.ai/plugins/dreamcore-landing/hf_20260525_160644_072a7f68-a101-4ded-a332-7d37707dbdd1-bfae0e.webp&w=1280&q=85
CARD_IMAGES[2] = https://plugin-assets.open-design.ai/plugins/dreamcore-landing/hf_20260525_160706_1c153d04-0dfb-4ac9-a4ef-e74f301c329c-8b9d4e.webp&w=1280&q=85
```

## Architecture

- Outer container: `height: 480vh; position: relative`. Inside it: a `position: sticky; top: 0; height: 100vh; overflow: hidden; background: #0a0608` viewport. All layers stack via absolute positioning + z-index.
- `scrollProgress = clamp(window.scrollY / (container.scrollHeight - window.innerHeight), 0, 1)`.
- Helpers: `easeInOut(t) = t<0.5 ? 2*t*t : -1+(4-2*t)*t`; `lerp(a,b,t)`; `clamp(v,mn,mx)`. `isMobile()` = `matchMedia('(max-width: 767px)')`.
- `ep = easeInOut(scrollProgress)` drives every layer's scale.

## Layer Stack (bottom → top by z-index)

1. **World Background** (z 0): `WORLD_BG`, inset 0, `object-fit: cover`, `transform-origin: 50% 50%`. Scale `lerp(1, 1.18, ep)`. Mouse MAG = 6.
2. **Bottom Clouds** (z 10): `BOTTOM_CLOUDS`, bottom 0, `width:100% height:auto`, `transform-origin: 50% 100%`. Scale `lerp(1, 1.4, ep)`. Mouse MAG = 9 (Y dampened ×0.4). Opacity fades 0.7→1 in first 5% of scroll.
3. **Arc Card Slider** (z 9): absolute, `bottom: 60px (mobile)/80px (desktop)`, centered. Opacity = `scene2Opacity`. Holds `<ArcCardSlider>` (geometry below).
4. **Portal Frame** (z 15): `PORTAL_BG`, inset 0, `object-fit: cover`, `transform-origin: 52% 38%`. Scale `lerp(1, 7.5, ep)` — the zoom-into-portal. Mouse MAG = 7. Opacity 1 until scroll 0.65, fades to 0 by 0.85.
5. **Bottom Fade** (z 16): bottom, `height: 40%`, `linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 100%)`, `pointer-events: none`.
6. **Curtain Left** (z 16): `CURTAIN_LEFT`, inset 0, `object-fit: cover`, `object-position: right center`, `transform-origin: left center`. Entrance: after 100ms shift `translateX(-62%)` with `transition: transform 1.8s cubic-bezier(0.16, 1, 0.3, 1)`. On scroll: additional `translateX -lerp(0,150,ep)%`, scale `lerp(1,1.3,ep)`. Mouse MAG = 14 (Y ×0.3). After 2200ms, transition → `none` for instant parallax.
7. **Curtain Right** (z 16): mirror — `transform-origin: right center`, `object-position: left center`, shifts `+62%` then `+lerp(0,150,ep)%`, MAG = 14.
8. **Top Fade** (z 45): top, `height: 42vh`, `linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 100%)`, `pointer-events: none`.

## Navigation (z 50)

Absolute top, full width, `flex; space-between; center`. Link style: Imprima, `12px`, `letter-spacing: 0.12em`, uppercase, `#fff`, opacity 0.9.

- **Mobile** (`padding: 18px 20px`): "Explore" (11px) · StarLogo · "Connect" (11px).
- **Desktop** (`padding: 22px 48px`): left group `["Worlds","Atelier","Immersions"]` gap 36 · StarLogo center · right group `["Craft","Codex","Connect"]` gap 36.
- **StarLogo** — inline SVG 28×28: white star path `M14 2l2.09 6.42H23l-5.45 3.96 2.09 6.42L14 14.84l-5.64 4.06 2.09-6.42L4.96 8.42h6.95L14 2z` (opacity 0.9) + 3 small circles (cx/cy 14/24 r1.5 op .6; 6/6 r1 op .4; 22/6 r1 op .4).

## Scene 1 UI (z 20)

Opacity = `clamp(1 - scrollProgress/0.22, 0, 1)`. Three Tailwind-responsive layout blocks (no JS layout branching):

- **Mobile** (`md:hidden`, `padding 80px 24px 100px`, centered column): heading "FALL › INTO" (`clamp(26px,7vw,42px)`, tracking-widest, `#3b1a0a`) then "REVERIE" (`clamp(52px,16vw,80px)`, tracking-tight, leading-none, `#3b1a0a`). The `›` is `#6b2e0e` at `0.8em`; "INTO" is italic. Subtext `15px`, `#5c2d0e`, max-width 280. One 140×140 reel card.
- **Tablet** (`hidden md:flex xl:hidden`, gap 28): same heading dark-brown (sizes `clamp(28px,5vw,44px)`/`clamp(60px,12vw,86px)`), subtext `16px` max-width 400. Three 140×140 cards (`gap 14`): card1 reel, card2 number "32" + "World Patrons", card3 reel.
- **Desktop** (`hidden xl:block`/`flex`): heading block absolute `top:46% left:60px maxWidth:440px translateY(-50%)`, white with `text-shadow: 0 2px 24px rgba(0,0,0,0.7), 0 1px 4px rgba(0,0,0,0.9)`. "FALL › INTO" `clamp(32px,4.5vw,54px)` line-height 1.1 ls 0.04em, `›` = `rgba(255,220,180,0.7)`. "REVERIE" `clamp(50px,7.5vw,88px)` line-height 0.9 ls -0.02em. Subtext `18px` line-height 1.7 `rgba(255,245,235,0.88)` max-width 300 with shadow. Cards block absolute `right:40px top:50% translateY(-50%)` gap 12, three 158×158 cards radius 28 `box-shadow: 0 8px 32px rgba(0,0,0,0.45)`.

Reel card anatomy (all sizes): `border-radius 22px (mobile/tablet) / 28px (desktop)`, `CARD_IMAGES[i]` background-cover, gradient overlay (60% height), backdrop-blur layer (44% height, masked gradient), bottom content at 12px inset. Play cards = white circle (26/30px) + play-triangle SVG + "View Reel" (13/18px). Number card = "32" Viaoda Libre (28/36px) + "World Patrons".

- **Slider dots** (bottom): `28px (mobile centered) / 40px (desktop left:60px)`. 4 dots, first `28px` wide active, rest `14px`, all `4px` tall radius 2. Active `rgba(255,255,255,0.9)`, inactive `rgba(255,255,255,0.35)`.
- **Scroll cue** (desktop only, `bottom:36px` centered): "DESCEND" (`10px`, ls 0.22em, uppercase, `rgba(255,255,255,0.6)`) + ScrollChevron (34px circle, `1.5px border rgba(255,255,255,0.5)`, chevron SVG, `animation: bobUp 1.8s ease-in-out infinite`).

## Scene 2 UI (z 46)

Opacity = `clamp((scrollProgress - 0.68)/0.16, 0, 1)`. Centered column, margin-top `8vh (mobile)/12vh (desktop)`.

- Heading (Viaoda Libre): "FORGE BEYOND THE REAL" — `clamp(28px,8vw,44px)` mobile / `clamp(38px,6.5vw,78px)` desktop, white, ls 0.03em, line-height 1.05, `text-shadow: 0 2px 20px rgba(0,0,0,0.4)`.
- Subtext (Imprima): "Singular voyages to astonishing destinations, shaped for those who seek beauty beyond the ordinary and the known." — `14px`/`20px`, line-height 1.6, ls -0.01em, max-width `260`/`480`, `rgba(255,255,255,0.82)`.

## Arc Card Slider Component

9 cards (data below). Props: `cards[]`, `rotationOffset`, `isMobile`.

Layout math — `cardSpacingDeg`: 12 (mob)/9 (desk); `centerIndex = floor(9/2) = 4`; `arcRadius`: 700/1100; `cardW`: 160/220; `cardH`: 175/230; `sliderH`: 260/360. `arcSweepDeg = (9-1)*10 = 80`. `rotationOffset = lerp(0, arcSweepDeg, clamp((scrollProgress - 0.70)/0.30, 0, 1))`.

Per card: `baseDeg = (i - centerIndex)*cardSpacingDeg`; `deg = baseDeg - rotationOffset + (centerIndex*cardSpacingDeg)`; `rad = deg*PI/180`; `x = sin(rad)*arcRadius`; `y = arcRadius - cos(rad)*arcRadius`. Position absolutely at `bottom: -y + (140 mob/200 desk)px`, `left: calc(50% + x - halfW)`, `transform: rotate(deg)`, `transformOrigin: halfW arcRadius`.

Appearance: rounded rect (`18px`/`26px`), background = `card.color` (pastel), `box-shadow: 0 8px 40px rgba(80,40,60,0.18)`. Top-right numbered circle (24px, `1.5px border rgba(80,50,60,0.3)`, text `rgba(80,50,60,0.6)`, 10px Imprima, zero-padded index). Bottom: title Viaoda Libre (`22px`/`30px`, `#3a2530`) + desc Imprima (`12px`/`15px`, `rgba(58,37,48,0.65)`).

### Card Data (9 cards)

```
{ title: 'Hidden Realms',  desc: 'Luminous sanctuaries unseen by wandering eyes', color: '#f3cdd6' }
{ title: 'Wild Solitudes', desc: 'Dissolve into untamed horizons and deep calm',  color: '#dcedc2' }
{ title: 'Silent Havens',  desc: 'Remote escapes far beyond ordinary reach',      color: '#c3e3f4' }
{ title: 'Bespoke Quests', desc: 'Journeys shaped around your vision and soul',   color: '#f0e4c0' }
{ title: 'Vivid Drifts',   desc: 'Surreal passages through breathtaking terrain', color: '#dcd2f2' }
{ title: 'Mystic Crests',  desc: 'Timeless ridgelines wrapped in cloud and myth', color: '#f3cdd6' }
{ title: 'Deep Currents',  desc: 'Glowing depths alive with uncharted wonder',    color: '#c3e3f4' }
{ title: 'Gilded Dusk',    desc: 'Amber horizons that stretch past all reason',   color: '#f0e4c0' }
{ title: 'Glassy Tides',   desc: 'Calm waters holding skies of pure stillness',   color: '#dcedc2' }
```

## Entrance Sequence

- t=100ms: `curtainsOpen` → true → 62% horizontal shift on each curtain with `1.8s cubic-bezier(0.16, 1, 0.3, 1)`.
- t=600ms: `uiVisible` → true → Scene 1 UI fades/slides in (`opacity 0.9s ease, transform 0.9s ease`) with staggered delays: heading 0.3s, cards 0.55s, dots 0.8s, scroll cue 0.9s.
- t=2200ms: `entranceDone` → true → curtain transition switches to `none` so parallax is instant.

## Mouse Parallax (desktop)

`requestAnimationFrame` loop lerps raw mouse position at `speed = 0.07`. Each layer offsets by its `MAG` in the reverse direction of the mouse, combined with the scroll-driven scale/translate. MAG: world=6, clouds=9, portal=7, curtainL=14, curtainR=14.

## Hard Rules

- The portal scale range `lerp(1, 7.5, ep)` and curtain entrance `-62%/+62%` are the signature motion — do not reduce them.
- Keep all five Cloudinary stills and the three higgs.ai card images as **remote URLs**; they are large stable CDN media. Do not inline them, do not swap the host.
- No external avatar hosts (`i.pravatar.cc`, `api.dicebear.com`) — this template uses no avatars.
- Fonts are locked: Viaoda Libre (serif headings) + Imprima (body). Background `#0a0608`.
- Scroll breakpoints are locked: scene1 fades by 0.22; portal fades 0.65→0.85; scene2 fades in 0.68→0.84; arc rotation drives 0.70→1.0.
