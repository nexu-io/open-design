---
name: layered-depth
description: "Use this plugin when the user wants a cinematic, layered-parallax architecture-studio landing page (brand 'Qelora'): fullscreen background video, a giant center brand wordmark behind a parallax sculpture slab, an animated bird video state machine, frosted-glass nav pills and bottom info panels, and a second full-viewport video section with a centered editorial headline. Invoke for 'layered depth', 'architecture studio landing', 'parallax hero with video', 'Qelora', or when the user references the Layered Depth motionsites template."
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

# Layered Depth — Architecture Studio Landing (Qelora)

Produce a cinematic, depth-layered landing page for an architecture studio called **Qelora**, built on stacked z-index layers (background video → warm overlay → animated birds → giant brand wordmark → parallax sculpture slab → frosted nav → frosted info panels) plus a second full-viewport video section with a centered editorial headline.

A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then adjust copy and data; do not rewrite the CSS or invent a new visual language. The seed already encodes the exact tokens, layer stacking, parallax math, bird state machine, and 768px responsive behavior described below.

This is the authoritative build brief. Follow it exactly — the named colors, fonts, asset URLs, z-indexes, and parallax constants are locked.

## Stack

- Default output: a single self-contained HTML file (the `example.html` seed). It already includes everything inline.
- If the user explicitly asks for a **React + Vite + TypeScript + Tailwind** project, port the seed faithfully into `Hero.tsx` + `Section2.tsx` (mounted by `App.tsx` → `main.tsx` in `StrictMode`, no routing). Tailwind is used **only for base reset** (`@tailwind base/components/utilities`); every element is styled with **inline styles**, no utility classes in JSX. Dependencies are only `react`, `react-dom`, `lucide-react` (lucide is declared but the page's icons are all inline SVG and lucide is not actually rendered). Do not change the design while porting.

## Fonts (Zimula Trial — locked)

Load all three in `<head>` / `index.css`:

```
<link href="https://db.onlinewebfonts.com/c/076f8c5b3b67616658dd1e4e9bac62ec?family=Zimula+Trial+Med" rel="stylesheet">
<link href="https://db.onlinewebfonts.com/c/08d8ca53f66ab5b48659912fa0136b78?family=Zimula+Trial+Bd" rel="stylesheet">
@import url('https://db.onlinewebfonts.com/c/46024824a3dd3309c3a7f46f4f1283ba?family=Zimula+Trial+Reg');
```

- Body / default: `'Zimula Trial Med', sans-serif` (primary weight, used everywhere).
- Bold / logo / hero wordmark: `'Zimula Trial Bd', sans-serif`.
- `Reg` is imported and available but Med is the primary weight.

## Global CSS (`index.css`)

```
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body { font-family: 'Zimula Trial Med', sans-serif; background: #0e0c0a; overflow-x: hidden; }
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: #0e0c0a; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
```

## Color palette — locked

- Dark background: `#0e0c0a`
- Primary text: `#241f21`, `#282425`, `#2a2420`
- White: `#fff`
- Dark accent: `#100e0c`
- Warm transparent overlays: `rgba(235,230,218,0.12)` (hero), `rgba(242,238,230,0.38)` (section 2)
- Frosted glass backgrounds: `rgba(248,245,240,0.72)`, `0.88`, `0.92`, `0.96`

## Assets (Cloudinary + Pexels — keep these remote)

These are stable CDN media; keep them as remote URLs (do not try to inline the videos). The Cloudinary background videos / bird webm clips and the Pexels CTA photo stay as URLs.

Videos:
- Hero background: `https://plugin-assets.open-design.ai/plugins/layered-depth/bg-video_xsmysw-f9ba1c.mp4`
- Bird enter: `https://plugin-assets.open-design.ai/plugins/layered-depth/bird-entrada_e72qt7-102269.webm`
- Bird idle 1: `https://plugin-assets.open-design.ai/plugins/layered-depth/bird-idle_fzjami-a7d50b.webm`
- Bird idle 2: `https://plugin-assets.open-design.ai/plugins/layered-depth/bird-idle2_rajmgo-a2bfbb.webm`
- Bird leave: `https://plugin-assets.open-design.ai/plugins/layered-depth/bird-saida_ifroz1-4ad3cb.webm`
- Section 2 background: `https://plugin-assets.open-design.ai/plugins/layered-depth/bg-2-video_sgbpqt-cdc7da.mp4`

Images:
- Q logo (declared, unused): `https://plugin-assets.open-design.ai/plugins/layered-depth/q-logo_isvugc-be3611.webp`
- Center sculpture / slab: `https://plugin-assets.open-design.ai/plugins/layered-depth/slab_v1_kb4vqk-eb36b8.webp`
- CTA card photo (Pexels): `https://plugin-assets.open-design.ai/plugins/layered-depth/pexels-photo-3184465-a44809.webp`

> Do not swap these CDN URLs for other hosts and do not introduce remote avatar hosts (`i.pravatar.cc`, dicebear, etc.) — there are no avatars in this template.

## Section 1 — Hero

Container: `position: relative; width: 100%; min-height: 100vh; overflow: visible; font-family: 'Zimula Trial Med'`.
Responsive breakpoint: `isMobile = window.innerWidth < 768`, checked on mount and resize.

Stack the layers by z-index exactly:

- **Layer 1 — Background video (z-index 0):** `<video autoplay muted loop playsinline>`, `position:absolute; inset:0; width:100%; height:100vh; object-fit:cover`, source = hero bg mp4.
- **Layer 2 — Warm overlay (z-index 1):** div, `background: rgba(235,230,218,0.12); height:100vh; pointer-events:none`.
- **Layer 3 — Bird animation system (z-index 8):** container `position:absolute; top:0; left:0; width:100%; height:100vh; pointer-events:none; aria-hidden`. Four `<video>` elements (enter, idle1, idle2, leave) toggled via `display`. Desktop: each `position:absolute; inset:0; width:100%; height:100%; object-fit:cover`. Mobile: each `position:absolute; top:50%; left:0; transform:translateY(-50%); width:100%; height:auto`. **State machine** `'enter'|'idle1'|'idle2'|'leave'|'hidden'`: on load play `enter`; `enter` ended → `idle1`; `idle1` ended → `idle2`; `idle2` ended → `idle1` (infinite loop); scroll past 10px → pause/reset enter+idles, play `leave`; scroll back below 10px → pause/reset leave, play `enter` again. Use both state and a ref to avoid stale closures in the scroll handler. Preload all four with `.load()` on mount. The `playVideo` helper sets `currentTime=0`, checks `readyState>=2`, then plays (or waits for a `canplay` event).
- **Layer 4 — Center brand text "Qelora" (z-index 5):** container fills `100vh`, flex centered, `pointer-events:none`. Text `Qelora` in `'Zimula Trial Bd'`, font-size mobile `26vw` / desktop `22vw`, `letter-spacing:-0.05em; color:#241f21; line-height:1; margin-bottom:` mobile `8vh` / desktop `12vh`.
- **Layer 5 — Sculpture slab (z-index 5):** `<img>` `position:absolute; top:50%; left:50%`, `transform: translateX(-50%) translateY(${-heroScroll * 0.3}px)` — parallax that moves **UP** as the user scrolls down. Width mobile `220vw` / desktop `160vw`; `height:auto; pointer-events:none; will-change:transform`.
- **Layer 6 — Fixed navbar (z-index 100):** `position:fixed; top:0`, full width, padding mobile `16px 20px` / desktop `20px 36px`. Left: brand "Qelora" with `®` superscript (`'Zimula Trial Bd'`, size mobile `20px`/desktop `24px`, `letter-spacing:-0.03em; color:#241f21`; the `®` sup is `font-size:0.4em; vertical-align:super`). Right desktop: **NavPills** — pills for `['Projects','Studio','Responsibility','Archive']` plus an `EN` language selector. Each pill: `background:rgba(248,245,240,0.92); border-radius:12px; padding:13px 22px 8px; height:40px; font-size:13px; text-transform:uppercase; letter-spacing:0.07em; color:#241f21`. Active pill: `font-weight:700` + a 3px round dot at `bottom:3px`, centered; non-active `font-weight:500`. Default active = "Projects". Language pill: separate capsule `border-radius:100px; padding:8px 14px; background:rgba(248,245,240,0.88); backdrop-filter:blur(12px); box-shadow:0 2px 20px rgba(0,0,0,0.1)`, "EN" + chevron-down SVG. Right mobile: hamburger button `42×42; border-radius:100px`, same frosted style — X icon when open, 3-line hamburger when closed.
- **Layer 7 — Mobile dropdown menu (z-index 99):** `position:fixed; top:70px; left:16px; right:16px; background:rgba(248,245,240,0.96); backdrop-filter:blur(16px); border-radius:18px; padding:8px; box-shadow:0 8px 40px rgba(0,0,0,0.14)`. Each item: full-width button `padding:14px 20px; font-size:13px; uppercase; letter-spacing:0.07em; border-bottom:1px solid rgba(40,36,37,0.08)`. Bottom: EN language row.
- **Layer 8 — Bottom panels (z-index 20):** `bottom = bottomOffset + heroScroll * 0.5` where `bottomOffset` = 24px mobile / 36px desktop — parallax push-DOWN as the user scrolls.
  - *Desktop (side-by-side):*
    - Bottom-left panel: `position:absolute; left:36px; border-radius:18px; padding:22px 28px; max-width:270px; background:rgba(248,245,240,0.72); backdrop-filter:blur(8px)`. Headline `"Designing places\nbeyond\nwhat's expected"` — `font-size:clamp(17px,2vw,24px); line-height:1.28; color:#282425; letter-spacing:-0.01em`. Then a 1px border-top divider (`rgba(40,36,37,0.2)`), then "EXPLORE OUR APPROACH" link + down-arrow SVG, `font-size:11px; uppercase; letter-spacing:0.1em`.
    - Bottom-right panel: `position:absolute; right:36px; border-radius:18px; width:clamp(210px,21vw,290px); height:180px; overflow:hidden`. Pexels photo covers the card. Dark gradient overlay `linear-gradient(to bottom, rgba(16,14,12,0.55) 0%, transparent 60%)`. Top text `"Every lasting space begins\nwith a quiet dialogue."` — `color:#fff; font-size:13px; line-height:1.35`. Bottom: inline flex with a white circle (envelope SVG, `36×36; border-radius:12px`) and a white "START A PROJECT" button (`font-size:11px; uppercase; letter-spacing:0.07em; font-weight:700; border-radius:12px; height:36px`).
  - *Mobile (stacked):* single flex column, `left:20px; right:20px; gap:12px`. Top card: tagline panel `background:rgba(248,245,240,0.72); backdrop-filter:blur(8px); border-radius:16px; padding:18px 20px`; same text on a single line "Designing places beyond what's expected", `font-size:17px`; same divider + link. Bottom card: CTA card `border-radius:16px; height:120px`, same structure as desktop right panel adapted (text `font-size:12px`, same button row).

## Section 2

Container: `position:relative; width:100%; min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; overflow:hidden; font-family:'Zimula Trial Med'`.

- **Layer 1 — Background video (z-index 0):** `<video autoplay muted loop playsinline>`, `position:absolute; inset:0; width:100%; height:100%; object-fit:cover`, source = section 2 bg mp4.
- **Layer 2 — Warm overlay (z-index 1):** `background:rgba(242,238,230,0.38); position:absolute; inset:0; pointer-events:none`.
- **Layer 3 — Center headline (z-index 2):** absolutely positioned `inset:0`, flex centered, `pointer-events:none; text-align:center; padding:0 24px`. Text `"What stands the\ntest of time is all\nthat guides the\nwork."` using `<br>` tags. `font-size:clamp(32px,5.5vw,80px); line-height:1.18; color:#2a2420; max-width:780px; letter-spacing:-0.025em; font-weight:400`.
- **Layer 4 — Bottom element (z-index 2):** `position:absolute; bottom:clamp(24px,4vh,48px)`, full width, flex column centered, `padding:0 24px`. Vertical line `width:1px; height:56px; background:rgba(42,36,32,0.25)`. Below (`margin-top:22px`), flex column centered `gap:14px`: a 24×28px outline map-pin SVG (`stroke:#2a2420; stroke-width:1.4`), then subtext `"Civic bodies and private clients trust us to shape resilient communities and purposeful places."` — `font-size:clamp(11px,1.4vw,13px); color:#2a2420; letter-spacing:0.04em; line-height:1.6; max-width:340px; opacity:0.75`.

## Key behaviors — hard

- **Bird state machine:** enter → idle1 ⇄ idle2 loop; scroll triggers leave; scroll back triggers re-enter. Driven entirely by native `<video>` `ended`/`play` events + scroll, no animation library. In the vanilla seed this is a `mousemove`/`scroll`-free pure state machine; in React use refs to avoid stale closures.
- **Parallax (passive scroll listener writing inline style):** sculpture `translateY(-scrollY * 0.3)` (moves up); bottom panels `bottom = offset + scrollY * 0.5` (pushes down). Map any `useScroll`/`useTransform` down to a single passive `scroll` listener that writes inline `transform`/`bottom`.
- **Responsive at 768px:** nav collapses to hamburger; panels stack vertically; bird videos switch from cover-fill to `width:100%/height:auto/vertically-centered`; sculpture grows `160vw → 220vw`; brand text grows `22vw → 26vw`.
- **All styling is inline** — no CSS utility classes in JSX, no Tailwind utilities on elements (Tailwind base reset only).
- **No third-party animation libraries** — all motion is native video playback + scroll-driven inline style changes.

## Color rules — hard

Stay in the warm dark-stone palette above. Background is always `#0e0c0a`; text is the `#241f21 / #282425 / #2a2420` warm-ink family; frosted panels use the `rgba(248,245,240, …)` set; overlays are the warm `rgba(235,230,218,0.12)` / `rgba(242,238,230,0.38)` pair. Do not introduce a cool/blue/purple accent — the whole piece is monochrome warm stone with white only inside the CTA card.
