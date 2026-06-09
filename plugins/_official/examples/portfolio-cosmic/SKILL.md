---
name: portfolio-cosmic
description: "Use this plugin when the user wants a premium dark single-page portfolio landing: cinematic HLS hero video, Instrument-Serif italic display type, a loading screen counter, a bento works grid, a scroll-pinned parallax exploration gallery, and a marquee contact footer. Invoke for 'cosmic portfolio', 'dark portfolio landing', 'designer portfolio with video hero', or when the user references the Portfolio Cosmic template."
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

# Portfolio Cosmic — Dark Single-Page Portfolio Landing

Produce a premium **dark single-page portfolio landing page**. A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then adjust copy, names, and project data; do not rewrite the CSS or invent a new visual language. The seed already encodes the exact tokens, fonts, gradient, sections, and animations described below.

This is the authoritative build brief. The named colors, fonts, gradient, animation curves, and section structure are **locked**.

**Images (critical):** `example.html` ships every project / journal / exploration image as an **inlined `data:image/svg+xml;base64,…` URI** (dark gradient placeholders). Keep those exactly as they are. Do **not** swap them for `i.pravatar.cc`, `api.dicebear.com`, `picsum.photos` avatars, or any remote avatar host — external avatar hosts rate-limit / 403 inside the preview sandbox and render broken. The hero + contact **background videos** use a stable Mux HLS stream and may stay remote. Only replace an image if the user supplies a real asset, and prefer a data URI over a remote host.

## Stack

- Default output: a single self-contained HTML file (the `example.html` seed). It already inlines everything.
- If the user explicitly asks for a **React + Vite + Tailwind + TypeScript** project, port the seed faithfully: same tokens, same section structure, **GSAP** for entrance/marquee/ScrollTrigger pin, **Framer Motion** for `whileInView` reveals and role `AnimatePresence`, **hls.js** for the background video. Use `react-router-dom` + `tailwindcss-animate` and add smooth-scroll nav + page transitions. Do not change the design while porting.
- **Motion loading (locked).** If you emit a single self-contained inline-JSX file instead of the Vite project, Motion's React hooks (`useScroll`, `useTransform`, `useAnimationFrame`, …) exist only in the **React** UMD build: load `<script src="https://unpkg.com/framer-motion@11.11.13/dist/framer-motion.js"></script>` and read them off `window.Motion` — never the vanilla `https://unpkg.com/motion@.../dist/motion.js` DOM bundle, which lacks `useScroll` and renders a blank page. (The Vite project imports from npm and is unaffected.)

## Fonts

Google Fonts: **Inter** (300–700) and **Instrument Serif** (italic, 400).
- `--font-body: 'Inter', sans-serif` → body text.
- `--font-display: 'Instrument Serif', serif` (italic) → all display headings, names, the italic accent words, stat numbers. Class `.font-display`.

## CSS Custom Properties (HSL channels, no `hsl()` wrapper — Tailwind adds it) — locked

```
--bg: 0 0% 4%;
--surface: 0 0% 8%;
--text: 0 0% 96%;
--muted: 0 0% 53%;
--stroke: 0 0% 12%;
--accent: 0 0% 96%;
```

Tailwind colors: `bg = hsl(var(--bg))`, `surface = hsl(var(--surface))`, `text-primary = hsl(var(--text))`, `muted = hsl(var(--muted))`, `stroke = hsl(var(--stroke))`.

**Forced dark theme — no light-mode toggle.** Body gets `bg-bg text-text-primary`.

## Accent Gradient — locked

`linear-gradient(90deg, #89AACC 0%, #4E85BF 100%)` — used on the logo ring, hover border rings, and progress bars. Utility class `.accent-gradient`. The animated-border variant uses `background-size: 200% 100%` + `gradient-shift`.

## Keyframe Animations (in `index.css`)

- `scroll-down` — `translateY(-100%) → translateY(200%)`, 1.5s ease-in-out infinite (hero scroll indicator).
- `role-fade-in` — opacity 0 + `translateY(8px) → opacity 1 + translateY(0)`, 0.4s ease-out (hero role word).
- `gradient-shift` — `background-position 0% 50% → 100% 50% → 0% 50%`, 6s ease infinite (animated gradient borders).
- `pulse-dot` — green availability dot pulse (footer).

## Section 1 — Loading Screen

Full-screen overlay (`fixed inset-0 z-[9999] bg-bg`). A `requestAnimationFrame` counter from `000 → 100` over **2700ms**.
- Top-left: "Portfolio" label — `text-xs muted uppercase tracking-[0.3em]`.
- Center: rotating words `["Design", "Create", "Inspire"]` cycling every **900ms**, `font-display italic` `text-text-primary/80`, with y-20→0→-20 swap (in vanilla: fade/translate via `setInterval` + transition).
- Bottom-right: counter display `font-display tabular-nums`, `String(count).padStart(3,"0")`.
- Bottom: `h-[3px] bg-stroke/50` bar with an inner `.accent-gradient` div, `scaleX(count/100)`, `box-shadow: 0 0 8px rgba(137,170,204,0.35)`.
- On reaching 100: 400ms delay then dismiss (`opacity → 0`, `pointer-events: none`).

## Section 2 — Hero

Full-viewport section, background HLS video + centered content.
- **Background video:** HLS source `https://stream.mux.com/Aa02T7oM1wH5Mk5EEVDYhbZ1ChcdhRsS2m1NYyx4Ua1g.m3u8` via hls.js (native HLS fallback). `autoplay muted loop playsInline`, centered with `min-w-full min-h-full object-cover -translate-x/y-1/2`. The seed also ships a CSS radial-gradient `.video-fallback` behind it so the card renders even when HLS does not autoplay in the sandbox — keep it.
- Dark overlay `bg-black/20`; bottom fade `h-48 bg-gradient-to-t from-bg to-transparent`.
- **Navbar** (fixed, floats top-center): pill `inline-flex rounded-full backdrop-blur-md border-white/10 bg-surface px-2 py-2`; gains `shadow-md` when `scrollY > 100`. Contents: 9×9 logo circle with accent-gradient ring (rotates on hover) + "JA" `font-display italic`; divider; nav links `["Home","Work","Resume"]` (active = `text-text-primary bg-stroke/50`); divider; "Say hi ↗" button with accent gradient ring on hover.
- **Hero content (centered, z-10):** eyebrow "COLLECTION '26" (`blur-in`); name "Michael Smith" `text-6xl→9xl font-display italic leading-[0.9]` (`name-reveal`); role line "A {role} lives in Chicago." with roles cycling every **2s** through `["Creative","Fullstack","Founder","Scholar"]` (role word `font-display italic animate-role-fade-in`, re-key to retrigger); description `max-w-md muted`; CTA row: "See Works" solid (`bg-text-primary text-bg`, hover gradient ring) + "Reach out..." outlined (`border-2 border-stroke`, hover gradient ring). Both `rounded-full px-7 py-3.5 hover:scale-105`.
- **GSAP entrance** (`ease: power3.out`): `.name-reveal` opacity 0→1 / y 50→0 / 1.2s / delay 0.1s; `.blur-in` opacity 0→1 / blur(10px)→0 / y 20→0 / 1s / stagger 0.1 / delay 0.3s.
- **Scroll indicator** (bottom-center): "SCROLL" label `text-xs muted tracking-[0.2em]` over a `w-px h-10 bg-stroke` line with an `.animate-scroll-down` highlight.

## Section 3 — Selected Works

`bg-bg py-12 md:py-16`, inner `max-w-[1200px] px-6→16`.
- **Header** (`whileInView` opacity 0→1 / y 30→0 / 1s / ease `[0.25,0.1,0.25,1]` / once / margin "-100px"): eyebrow `w-8 h-px bg-stroke` + "Selected Work"; heading "Featured *projects*" (italic word `font-display`); subtext "A selection of projects I've worked on, from concept to launch."; "View all work" button (desktop only, gradient hover ring).
- **Bento grid:** `grid-cols-1 md:grid-cols-12 gap-5 md:gap-6`, column spans alternate **7 / 5 / 5 / 7**. 4 cards: **Automotive Motion, Urban Architecture, Human Perspective, Brand Identity**. Each: `bg-surface border-stroke rounded-3xl`, background image `object-cover group-hover:scale-105`, halftone overlay `radial-gradient(circle,#000 1px,transparent 1px)` 4×4px `opacity-20 mix-blend-multiply`, hover `bg-bg/70 + backdrop-blur-lg` revealing a white pill "View — *Title*" (title `font-display italic`) with an animated gradient border.

## Section 4 — Journal

`bg-bg py-16 md:py-24`. Same header pattern: eyebrow + "Recent *thoughts*" + subtext + "View all" button. 4 entries as horizontal pills (`rounded-[40px] sm:rounded-full`): `flex items-center gap-6 p-4 bg-surface/30 hover:bg-surface border border-stroke` with a 72px rounded image, title, read time, and date.

## Section 5 — Explorations (Parallax Gallery)

`min-h-[300vh]` scroll-driven section.
- **Layer 1 — pinned center (z-10):** `h-screen` pinned via GSAP `ScrollTrigger.create({ pin, pinSpacing:false })` (in vanilla: `position: sticky; top:0`). Eyebrow "Explorations", heading "Visual *playground*", subtext + Dribbble button.
- **Layer 2 — parallax columns (z-20, absolute):** `grid grid-cols-2 gap-12 md:gap-40` inside `max-w-[1400px]`. 6 items split into 2 columns with GSAP scroll-driven parallax (in vanilla: a passive `scroll` listener computing section progress and writing `translateY` per card, opposite direction per column). Cards `aspect-square max-w-[320px]`, slight rotation, **lightbox on click**.

## Section 6 — Stats

`bg-bg py-16 md:py-24`. 3-column grid: **20+ Years Experience, 95+ Projects Done, 200% Satisfied Clients**. Numbers `font-display`.

## Section 7 — Contact / Footer

`bg-bg pt-16 md:pt-20 pb-8 md:pb-12 overflow-hidden`.
- **Background video:** same Mux HLS source as the hero, **flipped vertically (`scale-y-[-1]`)**, heavier overlay `bg-black/60`. Keep the `.video-fallback` behind it.
- **GSAP marquee:** "BUILDING THE FUTURE • " repeated 10×, GSAP `xPercent:-50`, duration 40, `ease:"none"`, `repeat:-1` (in vanilla: rAF translateX loop, duplicate the track for a seamless wrap).
- **CTA:** email button `mailto:hello@michaelsmith.com` with gradient hover ring.
- **Footer bar:** social links `[Twitter, LinkedIn, Dribbble, GitHub]` + a green `pulse-dot` + "Available for projects".

## Vanilla → Framework Mapping (how the seed encodes the React spec)

- Framer Motion `whileInView` → `IntersectionObserver` toggling `.reveal.in`.
- `useScroll` / `useTransform` parallax → passive `scroll` listener writing inline `transform: translateY()`.
- GSAP `ScrollTrigger` pin → `position: sticky; top: 0`.
- GSAP marquee / role `AnimatePresence` → `requestAnimationFrame` loop / `setInterval` swap.
- hls.js video → `<video>` with the `.m3u8` source plus a CSS radial-gradient fallback layer.

## Color Rules — hard

Forced dark only. Palette: near-black `--bg` (`0 0% 4%`), `--surface` (`0 0% 8%`), off-white text (`0 0% 96%`), grey `--muted`/`--stroke`. The **only** chromatic accent is the blue gradient `#89AACC → #4E85BF` and the green availability dot `#4ade80`. Do not introduce purple/indigo or a different accent hue — the blue gradient is locked.

## Responsive

- ≥768px: bento spans 7/5/5/7 with `aspect 4/3` and `3/4`.
- <768px: bento stacks to 1 column (`aspect 4/3`), stats grid → 1 column centered, parallax columns tighten gap/padding, journal pills use the smaller radius.
