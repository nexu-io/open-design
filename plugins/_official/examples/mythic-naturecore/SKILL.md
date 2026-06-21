---
name: mythic-naturecore
description: "Use this plugin when the user wants a cinematic mythic-naturecore landing page — the 'Reverie' template: a scroll-linked zoom-through-a-portal hero with mirrored opening curtains, a layered world background, mouse-parallax 3D depth, and an elegant Viaoda-Libre/Imprima serif+sans pairing. Invoke for 'naturecore landing', 'portal scroll page', 'Reverie', 'cinematic parallax hero', or when the user references the Mythic Naturecore template."
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

# Mythic Naturecore — "Reverie" Cinematic Parallax Landing

Produce a high-fidelity, premium interactive landing page named **"Reverie"**. A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then adjust copy and imagery only; do **not** rewrite the scroll/parallax math or invent a new visual language. The seed already encodes the exact fonts, asset map, scroll timeline, parallax magnitudes, and entrance sequence below.

The native spec asks for **React + TypeScript + Tailwind + inline styles**; the bundled seed is **vanilla HTML/CSS/JS** with the framework features mapped down (no `useScroll`/`useTransform`/Framer — a passive `scroll` listener writes `scrollProgress`, a `requestAnimationFrame` loop writes inline `transform`, a `mousemove` handler drives the magnetic parallax). When the user explicitly asks for a React/Vite project, port the seed faithfully: same tokens, same layer structure, same math.

This is the authoritative build brief. The named curve constants, magnitudes, scroll heights, and asset URLs are **locked**.

## Stack & fonts

- Default output: the single self-contained `example.html` seed.
- Fonts via Google Fonts `<link>`:
  - Headings: `'Viaoda Libre', serif`.
  - Body, nav links, captions: `'Imprima', sans-serif` (also the body default).

## Global reset

```css
html, body { margin: 0; padding: 0; background: #0a0608; scroll-behavior: auto; }
html { scrollbar-gutter: stable; }       /* prevent layout shift */
body { font-family: 'Imprima', sans-serif; }
@keyframes bobUp { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
```

## Asset map — LOCKED (large stable CDN stills, kept REMOTE)

Define these exact constants at the top of the script. These are big background stills on a stable CDN (`res.cloudinary.com`); per the inline-vs-remote rule they **stay remote** — do NOT re-host, swap the host, or inline them.

```
PORTAL_BG    = https://plugin-assets.open-design.ai/plugins/mythic-naturecore/portal_bg_mu60k9-78f20d.webp
CURTAIN_LEFT = https://plugin-assets.open-design.ai/plugins/mythic-naturecore/curtain_left_cdht6q-c85f2f.webp
CURTAIN_RIGHT= https://plugin-assets.open-design.ai/plugins/mythic-naturecore/curtain_right_a9bn3i-1ca8f6.webp
WORLD_BG     = https://plugin-assets.open-design.ai/plugins/mythic-naturecore/world_bg_jzzcn1-dfd909.webp
// Cards MUST remain in this exact order (Card 3, Card 1, Card 2):
CARD_IMAGES = [
  https://plugin-assets.open-design.ai/plugins/mythic-naturecore/card_3_nbwm25-de0132.webp,  // Card 3
  https://plugin-assets.open-design.ai/plugins/mythic-naturecore/card_2_wr6al6-b3a8c5.webp,  // Card 1
  https://plugin-assets.open-design.ai/plugins/mythic-naturecore/card_1_jz8otj-096be2.webp   // Card 2
]
```

## Math helpers — LOCKED

```
easeInOut(t) = t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t
lerp(a,b,t)  = a + (b - a) * t
clamp(v,min,max) = Math.max(min, Math.min(max, v))
MAG = { world: 6, portal: 7, curtainL: 14, curtainR: 14 }
```

## Scroll + mouse system

- **Page height is exactly `480vh`** (`#scroll-root`); inside it a single **sticky `#stage` spans `100vh`** (`position: sticky; top: 0; overflow: hidden`).
- `scrollProgress` ∈ `[0,1]` = `clamp(scrollY / (scrollRootHeight - innerHeight), 0, 1)`, written by a **passive** `scroll` listener.
- `useIsMobile()` ⇒ a `matchMedia('(max-width: 767px)')` flag.
- Mouse parallax: normalize `rx`, `ry` ∈ `[-1,1]` from cursor vs viewport center. A `requestAnimationFrame` `tick()` lerps current→target with **step `0.07`** every frame (kills frame-rate stutter), then writes inline transforms.

## Animation timeline (applied every frame)

- **World** (`WORLD_BG`): `scale` lerp `1 → 1.18`; `transform = scale(s) translate3d(rx*6px, ry*6px, 0)`.
- **Portal** (`PORTAL_BG`, `transform-origin: 52% 38%`, above world): `scale` lerp `1 → 7.5` (immersive zoom-through); `opacity = clamp(1 - (p - 0.65)/0.2, 0, 1)`; `transform = scale(s) translate3d(rx*7px, ry*7px, 0)`.
- **Curtain Left** (`CURTAIN_LEFT`): opening offset 62% left, scrolls further to 150% via `eased`: `totalShift = 62 + easeInOut(p)*88`. Scroll scale lerp `1 → 1.3`. `transform = translateX(calc(-totalShift% + rx*14px)) translateY(ry*14*0.3px) scale(scrollScale) translateZ(0)`.
- **Curtain Right** (`CURTAIN_RIGHT`): symmetric mirror — same but `translateX(calc(+totalShift% + rx*14px))`.

## Entrance sequence

Curtains start fully closed (`translateX(0)`); after **100ms** they open to the 62% resting offset; UI fades in after **600ms** (opacity + 20px slide-up, `0.9s ease`, hero delayed ~300ms). After **2200ms** disable the entry CSS transitions so mouse parallax has zero lag.

## Layout & components

### Navigation (`position: absolute; top:0; z-index:50`)
- Padding `18px 20px` mobile / `22px 48px` desktop.
- Desktop (≥768px): split nav — left links `Worlds · Atelier · Immersions`, center **SVG star logo** (`M14 2l2.09 6.42H23l-5.45 …` in a 28×28 viewport), right links `Craft · Codex · Connect`.
- Mobile (<768px): centered star logo, `Explore` on the left, `Connect` on the right.
- Links: uppercase, `12px`, letter-spacing `0.12em`, white, opacity `0.9`, no underline.

### Scene 1 — Hero (`z-index: 46`)
- Opacity fades out: `clamp(1 - scrollProgress/0.22, 0, 1)`. Entrance: slide up 20px on mount, `0.9s ease` opacity, ~300ms delay.
- **Mobile (<768px):** centered column, dark-brown text `#3b1a0a`. Heading `FALL › INTO REVERIE` (Viaoda Libre). Subheading max-width `280px`. One card with `CARD_IMAGES[0]` + white play button + "View Reel".
- **Tablet (768–1099px):** centered column, dark-brown text. All 3 cards in a row — Card 3 (`CARD_IMAGES[0]`, Play+"View Reel"), Card 1 (`CARD_IMAGES[1]`, "32 World Patrons" large serif), Card 2 (`CARD_IMAGES[2]`, Play+"View Reel").
- **Desktop (≥1100px):** split-screen, white text.
  - Left (`top:46%; left:60px`): title `FALL › INTO REVERIE`, subheading, max-width `440px`.
  - Right (`top:50%; right:40px`): row of 3 cards `158×158`, radius `28px`, bottom gradient label with `backdropFilter: blur(6px)` and gradient `rgba(0,0,0,0.72) 0% → rgba(0,0,0,0.18) 60% → transparent 100%`, play icon or patron metric overlay.

### Slider dots (bottom-left, `60px`; centered on mobile)
4 pill indicators: first wide (`28px`, opacity 1), other three thin (`14px`, lower opacity), white.

### Scroll cue (`bottom: 36px`, centered; hidden on mobile)
Uppercase "Descend" `10px`, letter-spacing `0.22em`, `rgba(255,255,255,0.6)`; chevron SVG inside a `34×34` round border animated `bobUp 1.8s ease-in-out infinite`.

### Scene 2 — CTA "Forge Beyond" (`z-index: 46`)
- Opacity fades in: `clamp((scrollProgress - 0.68)/0.16, 0, 1)`; centered vertical flex, interactive only when visible.
- Heading `FORGE BEYOND THE REAL` (Viaoda Libre, clamp `38px → 78px`, `#fff`, letter-spacing `0.03em`, line-height `1.05`, shadow `0 2px 20px rgba(0,0,0,0.4)`).
- Paragraph (Imprima): "Singular voyages to astonishing destinations, shaped for those who seek beauty beyond the ordinary and the known." — `20px` desktop / `14px` mobile, max-width `480px` desktop / `260px` mobile, line-height `1.6`, `rgba(255,255,255,0.82)`.

## Color rules — hard

Cinematic naturecore palette: near-black base `#0a0608`, warm dark-brown mobile text `#3b1a0a`, white desktop text, translucent white captions. Keep the serif/sans pairing (Viaoda Libre + Imprima). Do not introduce neon, purple, or flat material accents — the mood is dim, organic, painterly.

## Responsive

- `≥1100px` desktop split-screen white-text hero; `768–1099px` tablet centered 3-card row; `<768px` mobile centered single-card dark-brown hero, mobile nav, dots centered, scroll cue hidden.
