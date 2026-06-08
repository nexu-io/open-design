---
name: art-landing
description: "Use this plugin when the user wants a two-section, scroll-based art/agency landing page: a fullscreen video hero with an Italiana display headline, then a bold #FF0000 red section with a parallax cloud transition, a Marck Script signature, and a bottom looping video. Invoke for 'art landing', 'video hero landing', 'red cloud landing page', 'SaaS automation hero', or when the user references the Art Landing template."
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

# Art Landing — Video Hero + Red Cloud Section

Produce a premium **two-section scroll landing page**: a fullscreen video hero followed by a bold red (`#FF0000`) section with a parallax cloud transition and a bottom looping video. A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then adjust copy and data; do not rewrite the CSS or invent a new visual language. The seed already encodes the exact fonts, tokens, layout, breakpoints, and the cloud-parallax scroll behavior described below.

This is the authoritative build brief. Follow it exactly — the named fonts, the `#FF0000` red, the SVG logo path, the Cloudinary asset URLs, and the parallax mapping are locked.

## Stack

- Default output: a single self-contained HTML file (the `example.html` seed). It already includes everything inline (one `<style>` block, one `<script>` of vanilla JS).
- If the user explicitly asks for the original framework project, port the seed faithfully to **React 19 + TypeScript + Vite + Tailwind CSS v4 + `motion/react`** (Framer Motion). Same fonts, same markup structure, `lucide-react` available for icons. Do not change the design while porting.

### Framework mapping (vanilla seed ⇄ React port)
- `useScroll({ container: containerRef })` + `useTransform(scrollY, [0,300], [0,-100])` → a passive `scroll` listener on the scroll container that clamps `scrollTop` into `[0,300]` and writes the mapped value into the cloud's inline `transform`. The seed implements exactly this.
- `motion.div style={{ y: cloudY }}` → inline `transform: translateY(...)`. The cloud's CSS base is `translateY(-50%)`, so the JS must compose it as `translateY(calc(-50% + <y>px))` to preserve the `-translate-y-1/2` offset.
- Button hover (`hover:bg-white/10 hover:backdrop-blur-[48px] transition-all duration-300`) → a `:hover` rule with a 300ms `transition`.

## Fonts (locked)

Load via Google Fonts:
`https://fonts.googleapis.com/css2?family=Italiana&family=Manrope:wght@400;600&family=Marck+Script&display=swap`

- `--font-manrope: "Manrope", sans-serif` — body / default.
- `--font-italiana: "Italiana", serif` — the CTA label and the big hero headline.
- `--font-marck: "Marck Script", cursive` — the `S.P.D` signature only.

In a Tailwind v4 port these map to a `@theme` block: `--font-manrope`, `--font-italiana`, `--font-marck`, and `@import "tailwindcss";`.

## Assets (locked — Cloudinary only)

These are the **only** external URLs in the project. They are stable Cloudinary CDN media; keep them as remote URLs (do NOT inline them, do NOT swap to CloudFront — there are no CloudFront URLs here):

- Hero video: `https://plugin-assets.open-design.ai/plugins/cinematic-landing-page/hf_20260515_113235_88e0d62e-8103-40c1-948e-f0a4f886ffd1-e00afb.mp4`
- Cloud PNG: `https://plugin-assets.open-design.ai/plugins/art-landing/cloude_ws7l3z-bd818d.webp` (used by BOTH cloud overlays; add `referrerpolicy="no-referrer"`)
- Bottom video: `https://plugin-assets.open-design.ai/plugins/cinematic-landing-page/hf_20260515_114315_ee3663e6-bd79-41b4-9e5b-0fae62827eb9-b97001.mp4`

All videos are `autoplay loop muted playsinline`. The SVG logo is inline markup (white fill), not an image asset.

## Root scroll container

`<main>` is the scroll container: `height: 100vh; overflow-y: auto; overflow-x: hidden; font-manrope; background: #000; position: relative`. The cloud parallax is driven off **this container's** `scrollTop`, not the window.

## SVG logo (locked path)

Reused at 48/64px in the hero and 80px in the red section, white fill, `viewBox="0 0 120 120"`:

```
M60 120C26.8629 120 0 93.1371 0 60V0C22.5654 0 42.2213 12.4569 52.4662 30.8691C38.4788 34.2089 28.0787 46.7902 28.0787 61.8006V63.1443C28.0787 79.9648 41.7146 93.6006 58.5353 93.6006H59.8789L59.8785 61.8006C59.8785 79.3633 74.1159 93.6006 91.6787 93.6006L91.6787 61.8006C91.6787 44.2783 77.5071 30.0661 60 30.0008L60 0H62.5352C94.2722 0 120 25.7279 120 57.4648V60C120 93.1371 93.1371 120 60 120Z
```

## Section 1 — Video Hero

`relative h-screen w-full overflow-hidden`.

- **Background video**: `absolute inset-0 z-10 w-full h-full object-cover`, autoplay/loop/muted/playsinline; the hero video URL above.
- **Overlay**: `absolute inset-0 z-30 pointer-events-none`.
- **Top-left logo block** (`absolute top-[24px] left-[20px] md:top-[64px] md:left-[64px] pointer-events-auto max-w-[calc(100vw-140px)] md:max-w-none`): flex row, `gap-[16px] md:gap-[24px]`, items-center.
  - SVG logo, white, `48×48` mobile / `64×64` desktop.
  - Tagline: white, `text-[11px] md:text-[16px] w-[112px] md:w-auto leading-[1.2] font-semibold tracking-[0.02em]`.
    - Desktop (`hidden md:block`): "Effortless Growth / Operations. We Handle All Tasks. / Stay Calm." with `<br />` after each line.
    - Mobile (`block md:hidden`): "Complete Business / Automation. We Handle All / Tasks. You Relax."
- **Left description** (desktop only, below logo): `hidden md:flex mt-[400px] flex-col gap-[24px] w-full max-w-[320px] text-white text-[14px] font-normal leading-relaxed` — two paragraphs about SaaS automation.
- **Top-right CTA** (`absolute top-[24px] right-[20px] md:top-[64px] md:right-[64px]`): `px-5 py-3 md:px-10 md:py-7 border border-white rounded-[100%] text-white text-[12px] md:text-[18px] font-italiana uppercase tracking-widest hover:bg-white/10 hover:backdrop-blur-[48px] transition-all duration-300 cursor-pointer bg-black/10 backdrop-blur-sm md:bg-transparent md:backdrop-blur-none`. Label: "Get started".
- **Bottom heading container** (`absolute bottom-[32px] left-[20px] right-[20px] md:left-auto md:bottom-[64px] md:right-[64px] md:max-w-[1200px] text-left md:text-right`):
  - Mobile paragraphs (`md:hidden flex flex-col gap-[16px] max-w-[280px] text-white text-[12px] font-normal mb-[32px]`).
  - `<h1>` `text-white text-[36px] leading-[1.1] md:text-[96px] font-italiana md:leading-[88px]`:
    - Desktop: "Intelligent Daily / Routine Automation / For Your Business. / You Relax".
    - Mobile (`text-[32px]`): "Intelligent Daily Routine / Automation For Your / Business. You Relax".

## Section 2 — Red Background

`relative min-h-screen w-full bg-[#FF0000] flex flex-col z-10`.

- **Cloud overlays**: two overlays (one desktop, one mobile), both `absolute top-0 left-0 w-full z-[100] pointer-events-none -translate-y-1/2`. Each holds `<img class="w-full h-auto block" referrerPolicy="no-referrer">` with the cloud PNG URL. The desktop one uses the desktop parallax mapping, the mobile one uses the mobile mapping.
- **Content wrapper**: `flex-1 flex flex-col items-center w-full pt-[100px] md:pt-[400px]`.
- **Inner content block** (`flex flex-col items-center w-full px-8 text-center z-20 relative max-w-[900px] h-auto md:h-[620px] mx-auto`):
  - SVG logo, `80×80`, white.
  - Lead paragraph: `text-white text-[16px] h-[100px] max-w-[400px] leading-[1.6] mb-[40px] uppercase tracking-wider mx-auto` — "We built this platform with a single purpose to eliminate operational chaos and restore balance to your daily business routine".
  - Signature: `font-marck text-white text-[120px] leading-none mb-[32px]` reading `S.P.D`.
  - Two centered paragraphs: white, `text-[16px] w-[400px] max-w-full font-light`, first with `mb-[24px]`, container `mb-[100px] md:mb-24`.
- **Bottom video block** (`relative w-full shrink-0`):
  - Top fade: `absolute top-0 left-0 w-full h-[100px] bg-gradient-to-b from-[#FF0000] to-transparent z-10 pointer-events-none`.
  - Video: autoplay/loop/muted/playsinline, `w-full h-auto block object-contain`; the bottom video URL above.

## Animations

- **Cloud parallax**: map container `scrollTop` `0 → 300px` to cloud `translateY` `0 → -100px` (desktop) and `0 → -24px` (mobile). Clamp outside the input range. Compose with the base `-translate-y-1/2` (`translateY(calc(-50% + <y>px))`).
- **CTA hover**: background fades to `white/10` with `backdrop-blur-[48px]` over 300ms.

## Responsive (breakpoint: `md` = 768px)

The seed is mobile-first; the `@media (min-width: 768px)` block applies all desktop overrides:
- Logo block moves to `64px/64px`, gap 24, logo 64×64, tagline 16px and auto width; swap tagline copy.
- Left description becomes visible.
- CTA grows to `28px 40px`, 18px, transparent bg (no blur).
- Bottom heading right-aligns at `right/bottom 64px`, max-width 1200px; `<h1>` 96px / 88px line-height; swap headline copy; hide the mobile paragraphs.
- Red section padding-top → 400px; inner block height → 620px.
- Cloud: desktop overlay visible, mobile hidden (and vice-versa below 768px).

## Color Rules — hard

The red is locked at `#FF0000` (pure red) — do not soften it to crimson/scarlet/maroon. Hero text and red-section text are white. Keep the black (`#000`) page background behind the hero video.
