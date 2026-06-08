---
name: urban-jungle
description: "Use this plugin when the user wants a cinematic, scroll-driven hero landing page: a fixed full-screen video that scrubs with scroll, oversized display-font headline that floats away as you scroll, a frosted-glass About panel that slides up from the bottom, a liquid-fill pill navigation, and a text-logo marquee. Invoke for 'scroll video hero', 'scrubbing video landing page', 'urban jungle', 'glass panel reveal', or when the user references the Urban Jungle template."
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

# Urban Jungle — Scroll-Driven Video Hero

Produce a cinematic, single-page **scroll-driven hero** where a full-screen background video scrubs frame-by-frame with scroll, an oversized display headline floats away, and a frosted **About Us** glass panel slides up. A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then adjust copy/data; do not rewrite the CSS or invent a new visual language. The seed already encodes the exact tokens, fonts, layer stack, scroll mechanics, and animations described below.

This is the authoritative build brief. The named fonts, colors, video URL, marquee names, SVG paths, and animation values are **locked**.

## Stack

- Default output: the single self-contained `example.html` seed (vanilla HTML/CSS/JS, hls.js from CDN). It already includes everything inline.
- If the user explicitly asks for the production stack, port the seed faithfully into **React 19 + Vite + Tailwind CSS v4 (`@tailwindcss/vite`) + GSAP (ScrollTrigger + ScrollToPlugin) + hls.js + react-router-dom (BrowserRouter)**, `lucide-react` for any icons, wrapping `<App/>` in `<StrictMode>` + `<BrowserRouter>`. Do not change the design while porting. Map the vanilla mechanics back to their framework equivalents:
  - passive `scroll` listener writing inline transforms → `ScrollTrigger.create({ scrub })`
  - per-char manual interpolation → `gsap.fromTo('.char', …, { stagger, scrub })`
  - `mousemove` handlers → `gsap.to(..., { ease, duration })`
  - manual `smoothScrollTo` → `gsap.to(window, { scrollTo, ease: 'power3.inOut' })`

## Fonts — locked

- Headline display font: **Dirtyline 36 Days of Type 2022**. In the seed it is registered via `@font-face` from `https://dirtylinestudio.com/wp-content/uploads/2022/05/Dirtyline-36daysoftype-2022.woff2` (family `Dirtyline36Daysoftype2022`). In the React port, download that woff2 into `public/Dirtyline-36daysoftype-2022.woff2` and register it via `@font-face`. Fallback `Manrope`.
- Google Fonts (CSS `@import`/`<link>`): `Manrope:wght@400;500;600;700` (body, `--font-sans`) and `Instrument+Serif:ital@0;1` (panel copy, `--font-serif`).

## Tailwind v4 theme tokens (for the React port — index.css)

```
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap');
@import "tailwindcss";
@theme {
  --font-sans: "Manrope", ui-sans-serif, system-ui, sans-serif, …;
  --font-serif: "Instrument Serif", ui-serif, Georgia, …;
  --font-dirtyline: "Dirtyline36Daysoftype2022", sans-serif;
  --animate-marquee: marquee 20s linear infinite;
  @keyframes marquee { 100% { transform: translateX(-50%); } }
}
@font-face { font-family: 'Dirtyline36Daysoftype2022'; src: url('/Dirtyline-36daysoftype-2022.woff2') format('woff2'); font-display: swap; }
body { background-color: black; color: white; }
```

Page body: **black background, white text**. The scroll root container is **500vh tall**.

## LAYER 1 — Background ScrollVideo (z-0)

A fixed full-screen `<video>` that scrubs playback by scroll progress (top = frame 0, bottom = last frame).

- Video source (Mux HLS): `https://stream.mux.com/43NlHXsaMrmyzWamMk87m01fNyxSTekAD669BBAPBNm00.m3u8` — **keep this remote** (large stable CDN; do not try to inline an HLS stream).
- hls.js config: `maxBufferLength:120, maxMaxBufferLength:600, maxBufferSize:200*1024*1024, startPosition:0, capLevelToPlayerSize:false, startLevel:-1, autoStartLoad:true`. On `MANIFEST_PARSED`, force highest quality: `hls.currentLevel = maxLevel; hls.startLevel = maxLevel`. Track buffer % via `FRAG_BUFFERED` → `(bufferedEnd/duration)*100`. For Safari native HLS, set `video.src = src`.
- The `<video>` renders directly (no canvas). Classes/attrs: `w-full h-full object-cover scale-[1.35]`, `muted playsInline crossOrigin="anonymous"`.
- Scroll-to-seek: `ScrollTrigger.create({ trigger: document.documentElement, start:'top top', end:'bottom bottom', scrub:true })`, `onUpdate` → `targetTime = self.progress * duration`. **Throttle the decoder**: track a `currentTarget`; only seek when `!video.seeking`, otherwise set `seekPending = true` and re-seek on the `seeked` event with the latest target. (Seed implements this with a passive scroll listener + rAF + the same `seekPending`/`seeked` guard.)
- Mouse parallax on the wrapper: on `mousemove`, tween wrapper `x = moveX*-30`, `y = moveY*-30` (moveX/moveY normalized −1..1 from center), `duration:1.5, ease:power2.out`.
- Loading overlay: fixed, `z-50`, centered black overlay, white `text-2xl font-sans` reading `Loading... {progress}%`; hide once `canplay` fires. (Seed also has a 6s safety timeout so the loader never traps the page.)
- Wrapper div: `fixed top-0 left-0 w-full h-full z-0 scale-[1.05] origin-center`.

## LAYER 2 — Hero Text ScrollFloat (z-10)

A fixed overlay pinned to the bottom: `fixed inset-0 flex flex-col justify-end p-4 md:p-8 pointer-events-none`.

- Text: `"Unleash The\nFull Power"` (literal newline between the two lines).
- Split: by `\n` into lines (`<span style="display:block">`), by spaces into words (`<span style="display:inline-block;white-space:nowrap">`), then into chars (`<span class="char">`). Word separator is a space text node.
- Animation: `gsap.fromTo('.char', FROM, TO)` — **FROM** `{opacity:1, yPercent:0, scaleY:1, scaleX:1, transformOrigin:'50% 0%'}`, **TO** `{opacity:0, yPercent:250, scaleY:1.2, scaleX:0.9}`. Text starts fully visible and animates away as you scroll. `ScrollTrigger { trigger: document.body, start:'top top', end:'+=1000', scrub:1.5 }`. `stagger:0.05, ease:power2.inOut, duration:1`.
- Typography: `font-dirtyline`, `font-size: clamp(4rem, 15vw, 317px)`, `line-height:0.85`, `letter-spacing:0`, white.
- `ScrollFloat.css`: `.scroll-float-text{display:inline-block}` `.char{display:inline-block}`.

## LAYER 3 — Glass Panel / About Us (z-20)

Anchored to the bottom of the 500vh container: `absolute bottom-0 left-0 w-full h-screen`. Slides up from below as you scroll to the bottom.

- Slide-up: `gsap.fromTo(panelWrapper, { y:'100%' }, { y:'0%', ease:none })`, `ScrollTrigger { trigger: container, start:'top bottom', end:'bottom bottom', scrub:1.5 }`.
- Panel wrapper: `w-full max-w-[1250px] h-[900px] max-h-[85vh] pointer-events-auto`, inline `perspective:1000px`.
- Panel: `w-full h-full flex flex-col justify-between rounded-3xl relative overflow-hidden`, inline styles `backgroundColor: rgba(0,0,0,0.16)`, `backdropFilter: blur(160px)` (+ `-webkit-`), `border: 1px solid rgba(255,255,255,0.1)`, `transformStyle: preserve-3d`, `willChange: transform`.
- 3D mouse parallax on panel: on `mousemove` tween `x: moveX*20, y: moveY*20, rotationY: moveX*4, rotationX: -moveY*4`, `ease:power3.out, duration:1`.
- Content (centered, `flex flex-col items-center justify-center px-6 md:px-12 text-center`):
  - Subtitle `<p>`: `font-serif italic text-white/70 text-base md:text-lg mb-4 md:mb-6` → "About Us".
  - Heading `<h2>`: `font-serif text-white text-4xl md:text-6xl lg:text-[96px] leading-[1.1] lg:leading-[92.6px] tracking-tight w-full max-w-[1000px] mx-auto`. Copy: "We transform sterile concrete into thriving **urban** jungles. Our innovative designs bring wild **nature** back to modern cities. Experience the **bloom**" — wrap the words `urban`, `nature`, `bloom` in `<span className="italic">`.

### Bottom marquee (text logos, NOT images)

Brand names as text marquee items: **`VOICEFLOW`, `ZENDESK`, `PENDO`, `GLIDE`, `CANVA`**. Each item: white text, `opacity-40 hover:opacity-100 transition-opacity duration-300`, uppercase, `font-sans font-semibold text-sm tracking-widest`. Duplicate the row **4×** for a seamless loop using the `animate-marquee` keyframe (`translateX(-50%)` over `20s linear infinite`). The marquee sits at the bottom of the panel, separated by `border-t border-white/10 py-6`.

## LAYER 4 — Pill Navigation (z-100)

Fixed top-center: `position:fixed; top:24px; left:50%; transform:translateX(-50%); z-index:100`. Font Manrope, 600, 14px, uppercase, `letter-spacing:0.05em`.

- Logo: 48×48 black circle (`border-radius:50%`) with a 4-petal SVG (white fill, 24×24, `viewBox 0 0 100 100`). The four paths are **locked**:
  - `m50,50c0,18.2,14.77,32.98,32.97,32.98,0-18.2-14.77-32.98-32.97-32.98Z`
  - `m17.02,82.98c18.2,0,32.98-14.77,32.98-32.98-18.2,0-32.98,14.77-32.98,32.98Z`
  - `m82.98,17.02c-18.2,0-32.97,14.77-32.97,32.97,18.2,0,32.97-14.77,32.97-32.97Z`
  - `m17.02,17.02c0,18.2,14.77,32.97,32.98,32.97,0-18.2-14.77-32.98-32.98-32.97Z`
  On hover the SVG container rotates 360deg (GSAP `duration:0.2`).
- Nav items container: black bg, `border-radius:50px`, `padding:4px`, `border:2px solid #000`; a `<ul>` flex, `gap:4px`.
- Each pill: `padding:8px 24px; border-radius:50px; background:#f0f0f0; color:#000; font-weight:600; font-size:14px; letter-spacing:0.05em; text-transform:uppercase; overflow:hidden; position:relative`.
- **Pill hover liquid fill (GSAP)**: each pill holds a hidden `.hover-circle` (absolute, black, `border-radius:50%`, `scale:0`). Size it dynamically: `R = (w*w/4 + h*h)/(2*h)`, `D = 2*R + 2`, `delta = R - sqrt(R*R - w*w/4) + 1`, position `bottom:-delta`, `transform-origin: 50% ${D-delta}px`. A `.label-stack` holds `.pill-label` (dark, visible) and `.pill-label-hover` (white, hidden below). On enter: circle scales to 3, dark label slides up out, white label slides up in (timeline forward `0.3s`). On leave: reverse in `0.2s`.
- Nav items: **HOME, ABOUT, SERVICES, CONTACT**. `HOME` → `gsap.to(window,{duration:3,scrollTo:0,ease:'power3.inOut'})`; `ABOUT` → `gsap.to(window,{duration:3,scrollTo:document.body.scrollHeight,ease:'power3.inOut'})`.
- Initial load: logo scales 0→1 (`0.6s`); nav items container width animates 0→auto (`0.6s`).
- Responsive: at 768px the desktop pills are hidden and replaced by a hamburger (two 24×2px lines, gap 4px) that animates to an X (rotate ±45deg, y ±3px); a popover menu fades/slides in below.

## App assembly

```
<ScrollVideo src="https://stream.mux.com/43NlHXsaMrmyzWamMk87m01fNyxSTekAD669BBAPBNm00.m3u8" />
<PillNav />
<div style={{ position:'relative', height:'500vh' }}>
  <ScrollFloat>{`Unleash The\nFull Power`}</ScrollFloat>
  <GlassPanel />
</div>
```

## Color / asset rules — hard

- Body is pure black `#000`, text white `#fff`. Pills use `#f0f0f0` (rest) / `#e0e0e0` (active) / `#000` (fill + container). Glass panel is translucent black `rgba(0,0,0,0.16)` with `blur(160px)` and a `rgba(255,255,255,0.1)` hairline border. Do not introduce a brand accent hue — the palette is monochrome black/white/grey by design.
- The Mux HLS video URL and the Dirtyline woff2 URL are **load-bearing remote assets on stable hosts — keep them remote**. Do not swap the video for a different clip or substitute the headline font.
- The marquee is **text only** — never replace the brand names with image logos.
- Respect `prefers-reduced-motion`: skip the mouse-parallax tweens when reduced motion is requested (the seed already does this).
