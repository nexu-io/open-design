---
name: innovation
description: "Use this plugin when the user wants a premium dark editorial landing page with an Instrument-Serif headline, liquid-glass nav/cards, a crossfading fullscreen hero video, and scroll-revealed about / featured-video / philosophy / services sections. Invoke for 'innovation landing', 'agency landing page', 'dark serif hero with glass', 'Asme template', or when the user references the Innovation / motionsites Innovation template."
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

# Innovation — Dark Editorial Liquid-Glass Landing

Produce a premium single-page **agency / studio landing site**: bg-black, an Instrument-Serif hero headline over a seamlessly-looping fullscreen hero video, liquid-glass nav and buttons, and four scroll-revealed sections (About, Featured Video, Philosophy, Services). A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then adjust copy and swap video URLs; do not rewrite the CSS or invent a new visual language. The seed already encodes the exact `.liquid-glass` treatment, fonts, layout, scroll reveals, and the hand-written hero-video crossfade loop described below.

This is the authoritative build brief. Follow it exactly — the named tokens, fonts, animations, and section structure are locked.

## Stack

- Default output: a single self-contained HTML file (the `example.html` seed). It already includes everything inline.
- If the user explicitly asks for a React + TypeScript + Vite + Tailwind project, port the seed faithfully: same tokens, same markup structure, `framer-motion` for `whileInView` reveals + `whileHover`/`whileTap`, `lucide-react` for icons, **Instrument Serif** (regular + italic) from Google Fonts. Do not change the design while porting.

## Fonts

- Load **Instrument Serif** (italic + regular) from Google Fonts:
  `@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap');`
- Instrument Serif is used for: the hero `<h1>`, the "ideas"/"minds…" emphasis in About, the "Innovation x Vision" heading (with italic `x`), and the service-card titles. Body/UI copy stays in the system sans stack.

## Liquid Glass CSS (locked — used on every glass element)

```
.liquid-glass {
  background: rgba(255, 255, 255, 0.01);
  background-blend-mode: luminosity;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border: none;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.1);
  position: relative;
  overflow: hidden;
}
.liquid-glass::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1.4px;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.45) 0%,
    rgba(255, 255, 255, 0.15) 20%,
    rgba(255, 255, 255, 0) 40%,
    rgba(255, 255, 255, 0) 60%,
    rgba(255, 255, 255, 0.15) 80%,
    rgba(255, 255, 255, 0.45) 100%
  );
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}
```

Apply `.liquid-glass` to: the nav pill, the Login button, the email-input pill, the manifesto button, the three social buttons, the "Our Approach" card, the Explore-more button, each service card, and the service-card arrow circles.

## Global

- `body { background:#000; color:#fff; overflow-x:hidden; }` — the entire page is black.
- Default UI ease: `cubic-bezier(0.23, 1, 0.32, 1)`. No `ease-in` on UI elements.

## Section 1 — Hero (full-viewport)

- `min-height:100vh; position:relative; overflow:hidden; display:flex; flex-direction:column`.
- **Background video** (`absolute inset-0 w-full h-full object-cover object-bottom`, `z-index:0`):
  `https://plugin-assets.open-design.ai/plugins/innovation/hf_20260405_074625_a81f018a-956b-43fb-9aee-4d1508e30e6a-6993b9.mp4`
  Attributes: `muted autoPlay playsInline preload="auto"`. **Starts at `opacity: 0`.**
- **Hero video fade logic (vanilla JS via refs, NOT CSS transitions):**
  - On `canplay`: play, then animate opacity 0 → 1 over **500ms** with `requestAnimationFrame`.
  - On `timeupdate`: when `duration - currentTime <= 0.55s`, animate opacity (current) → 0 over 500ms.
  - On `ended`: set opacity 0, wait 100ms, reset `currentTime = 0`, play again, fade back to 1 over 500ms.
  - Net effect: a seamless loop with a smooth crossfade to black between plays. Keep this exact behavior; the seed implements it in `<script>`.
- **Navbar** (`relative z-20 px-6 py-6`): a `.liquid-glass` rounded-full pill, `max-w-5xl mx-auto px-6 py-3`, flex space-between.
  - Left: Globe icon (24px, white) + "Asme" (white, font-semibold, text-lg). Hidden on mobile: nav links "Features", "Pricing", "About" (`text-white/80 hover:text-white text-sm font-medium`, gap-8, ml-8).
  - Right: "Sign Up" text button (white, text-sm) + "Login" `.liquid-glass` rounded-full px-6 py-2 button.
- **Hero content** (`relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12 text-center -translate-y-[20%]`):
  - Heading: `text-7xl md:text-8xl lg:text-9xl`, white, `tracking-tight whitespace-nowrap`, Instrument Serif. Text: `Know it then <em italic>all</em>.`
  - Email input: `max-w-xl w-full`. A `.liquid-glass` rounded-full pill `pl-6 pr-2 py-2 flex items-center gap-3`: transparent `<input>` placeholder "Enter your email" (`text-white placeholder:text-white/40`) + white circular submit button (`bg-white rounded-full p-3 text-black`) with an ArrowRight icon (20px).
  - Subtitle: `text-white text-sm leading-relaxed px-4` — "Stay updated with the latest news and insights. Subscribe to our newsletter today and never miss out on exciting updates."
  - Manifesto button: `.liquid-glass` rounded-full px-8 py-3 `text-white text-sm font-medium hover:bg-white/5`.
- **Social footer** (`relative z-10 flex justify-center gap-4 pb-12`): three `.liquid-glass` rounded-full `p-4` buttons — Instagram, Twitter, Globe icons (20px), `text-white/80 hover:text-white hover:bg-white/5`.

## Section 2 — About

- `bg-black pt-32 md:pt-44 pb-10 md:pb-14 px-6 overflow-hidden`.
- Subtle radial overlay: `radial-gradient(ellipse at top, rgba(255,255,255,0.03) 0%, transparent 70%)`.
- Label "About Us" — `text-white/40 text-sm tracking-widest uppercase`. Reveal: opacity 0 / y 20 → in, 0.6s.
- Heading `text-4xl md:text-6xl lg:text-7xl text-white leading-[1.1] tracking-tight`. Reveal: opacity 0 / y 40 → in, 0.8s, delay 0.1. Text:
  - "Pioneering " + *ideas* (Instrument Serif italic, `text-white/60`) + " for"
  - line break (hidden on mobile)
  - *minds that create, build, and inspire.* (Instrument Serif italic, `text-white/60`).

## Section 3 — Featured Video

- `bg-black pt-6 md:pt-10 pb-20 md:pb-32 px-6 overflow-hidden`, `max-w-6xl`.
- `rounded-3xl overflow-hidden aspect-video` container, reveal opacity 0 / y 60 → in, 0.9s.
- Video `w-full h-full object-cover`, `muted autoPlay loop playsInline preload="auto"`:
  `https://plugin-assets.open-design.ai/plugins/innovation/hf_20260402_054547_9875cfc5-155a-4229-8ec8-b7ba7125cbf8-eee511.mp4`
- Gradient overlay on video: `bg-gradient-to-t from-black/60 via-transparent to-transparent`.
- Bottom overlay (`absolute bottom-0 inset-x-0 p-6 md:p-10`): flex row on desktop, column on mobile.
  - Left: `.liquid-glass` rounded-2xl `p-6 md:p-8 max-w-md` card. Label "Our Approach" (`text-white/50 text-xs tracking-widest uppercase mb-3`) + body (`text-white text-sm md:text-base leading-relaxed`): "We believe in the power of curiosity-driven exploration. Every project starts with a question, and every answer opens a new door to innovation."
  - Right: "Explore more" button (`.liquid-glass` rounded-full px-8 py-3) with `whileHover scale 1.05` / `whileTap scale 0.95`.

## Section 4 — Philosophy (Innovation x Vision)

- `bg-black py-28 md:py-40 px-6 overflow-hidden`, `max-w-6xl`.
- Heading `text-5xl md:text-7xl lg:text-8xl text-white tracking-tight mb-16 md:mb-24`, reveal opacity 0 / y 40 → in, 0.8s. Text: "Innovation " + *x* (Instrument Serif italic, `text-white/40`) + " Vision".
- Two-column grid (`grid-cols-1 md:grid-cols-2 gap-8 md:gap-12`):
  - Left: video `rounded-3xl overflow-hidden aspect-[4/3]`, reveal from opacity 0 / x -40. `muted autoPlay loop playsInline preload="auto"`:
    `https://plugin-assets.open-design.ai/plugins/liquid-glass-agency/hf_20260307_083826_e938b29f-a43a-41ec-a153-3d4730578ab8-b7258e.mp4`
  - Right: reveal from opacity 0 / x 40. Two text blocks split by a `w-full h-px bg-white/10` divider.
    - Block 1: label "Choose your space" (`text-white/40 text-xs tracking-widest uppercase mb-4`) + body (`text-white/70 text-base md:text-lg leading-relaxed`): "Every meaningful breakthrough begins at the intersection of disciplined strategy and remarkable creative vision. We operate at that crossroads, turning bold thinking into tangible outcomes that move people and reshape industries."
    - Block 2: label "Shape the future" + body: "We believe that the best work emerges when curiosity meets conviction. Our process is designed to uncover hidden opportunities and translate them into experiences that resonate long after the first impression."

## Section 5 — Services (What we do)

- `bg-black py-28 md:py-40 px-6 overflow-hidden`, `max-w-6xl`.
- Subtle radial: `radial-gradient(ellipse at center, rgba(255,255,255,0.02) 0%, transparent 60%)`.
- Header row: flex space-between "What we do" (`text-3xl md:text-5xl text-white tracking-tight`) and "Our services" label (`text-white/40 text-sm`, hidden on mobile). Reveal opacity 0 / y 30 → in, 0.7s.
- Two-card grid (`grid-cols-1 md:grid-cols-2 gap-6 md:gap-8`):
  - Each card: `.liquid-glass` rounded-3xl `overflow-hidden`, `group`. Reveal opacity 0 / y 50 → in, 0.8s, **staggered by 0.15s** (use `data-delay` in the seed).
  - Media: `aspect-video object-cover transition-transform duration-700 group-hover:scale-105` + gradient `bg-gradient-to-t from-black/40 to-transparent`.
  - Body (`p-6 md:p-8`): tag (uppercase tracking-widest `text-white/40 text-xs`), ArrowUpRight icon in a `.liquid-glass` rounded-full `p-2` circle, title (`text-white text-xl md:text-2xl mb-3 tracking-tight`, Instrument Serif), description (`text-white/50 text-sm leading-relaxed`).
  - Card 1 — tag "Strategy", title "Research & Insight", desc "We dig deep into data, culture, and human behavior to surface the insights that drive meaningful, lasting change." Video:
    `https://plugin-assets.open-design.ai/plugins/innovation/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31-b2a357.mp4`
  - Card 2 — tag "Craft", title "Design & Execution", desc "From concept to launch, we obsess over every detail to deliver experiences that feel effortless and look extraordinary." Video:
    `https://plugin-assets.open-design.ai/plugins/innovation/hf_20260324_151826_c7218672-6e92-402c-9e45-f1e0f454bdc4-c2f128.mp4`

## Animations / Interactions

- **Hero video crossfade loop**: vanilla JS (canplay / timeupdate / ended) writing inline opacity over 500ms `requestAnimationFrame`. Not a CSS transition. See the seed `<script>`.
- **Scroll reveals** (framer-motion `useInView { once:true, margin:"-100px" }` → in vanilla, an `IntersectionObserver` with `rootMargin:"-100px 0px"` toggling an `.in` class). Variants: y-20/40/60, x-±40, all with the `0.23,1,0.32,1` ease. Service cards stagger 0.15s via `data-delay`.
- **Hover/tap**: Explore-more button scales 1.05/0.95; service-card video scales 1.05 on group hover (700ms).

## Assets

- All five videos are large stable CDN `.mp4` files on `d8j0ntlcm91z4.cloudfront.net` — **keep them as remote URLs**, do not inline. There are no avatars or small raster assets in this template, so nothing needs to be base64-inlined.
- Icons are inline SVG (Globe, ArrowRight, Instagram, Twitter, ArrowUpRight). When porting to React, swap them for the matching `lucide-react` components.

## Color Rules — hard

Monochrome: pure black `#000` background, white text at varying opacity (`/40`, `/50`, `/60`, `/70`, `/80`). No accent color, no purple/indigo/teal. The only "color" is the Instrument-Serif italic emphasis rendered in `text-white/40`–`/60`. Keep it strictly black-and-white editorial.

## Responsive

- ≤900px (md breakpoint): hide nav links, hero `<h1>` allowed to wrap (`white-space:normal`), philosophy + services grids collapse to one column, featured overlay stacks vertically, "Our services" label hidden.
