---
name: mindloop-landing
description: "Use this plugin when the user wants a dark, pure-monochrome newsletter / content-platform landing page (Mindloop): fullscreen video hero, Instrument-Serif italic accent words, liquid-glass controls, scroll-driven word-by-word mission reveal, and an HLS-video CTA. Invoke for 'Mindloop landing', 'black monochrome newsletter landing page', 'video hero content platform', or when the user references the Mindloop template."
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

# Mindloop — Dark Monochrome Content-Platform Landing

Produce a premium, **pure-black monochrome** landing page for **Mindloop**, a newsletter / content platform. A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then adjust copy and data; do not rewrite the CSS or invent a new visual language. The seed already encodes the exact HSL tokens, liquid-glass treatment, fonts, section layout, fadeUp reveal, scroll-driven mission reveal, and the HLS CTA.

This is the authoritative build brief. Follow it exactly — the HSL variables, fonts, video URLs, and animation patterns are locked.

**Monochrome is hard-locked.** Background is pure black `#000` (`0 0% 0%`), foreground pure white. There are **no colors or gradients beyond monochrome** — the only non-grey token is `--accent: 170 15% 45%` (a muted teal-grey) and it is essentially unused in the visible UI. Do not introduce brand colors, blues, purples, or vivid gradients.

**Assets (critical):** `example.html` already ships the 3 hero avatars and the 3 platform icons (ChatGPT / Perplexity / Google AI) as **inlined `data:image/svg+xml;base64,…` URIs**. Keep them exactly as they are. Do **not** swap them for `i.pravatar.cc`, `api.dicebear.com`, `dicebear`, or any other remote avatar / icon host — external hosts rate-limit or 403 inside the preview sandbox and render broken. Only replace an asset if the user supplies a real image, and prefer a data URI over a remote URL. The four large background videos stay on their stable `cloudfront.net` / `stream.mux.com` CDNs.

## Stack

- Default output: a single self-contained HTML file (the `example.html` seed). It already includes everything inline.
- If the user explicitly asks for the full project, port the seed faithfully to **React + Vite + TypeScript + Tailwind CSS + shadcn/ui + Framer Motion**. Same tokens, same markup structure. Install `hls.js` and `framer-motion`. Fonts via `@fontsource/inter` (400, 500, 600, 700) and `@fontsource/instrument-serif` (400, 400-italic). `lucide-react` for icons. `tailwindcss-animate` plugin. Do not change the design while porting.

## Fonts

- **Inter** (sans) — body and UI, weights 400/500/600/700.
- **Instrument Serif** (serif, italic) — used ONLY for the italic accent word inside headings (`.serif`: `font-style: italic; font-weight: 400`). Loaded from Google Fonts in the seed; `@fontsource/instrument-serif` in the React port.

## Design System — locked HSL tokens (`:root`, values only, no `hsl()` wrapper)

```
--background: 0 0% 0%
--foreground: 0 0% 100%
--card: 0 0% 5%
--card-foreground: 0 0% 100%
--primary: 0 0% 100%
--primary-foreground: 0 0% 0%
--secondary: 0 0% 12%
--secondary-foreground: 0 0% 85%
--muted: 0 0% 15%
--muted-foreground: 0 0% 65%
--accent: 170 15% 45%
--accent-foreground: 0 0% 100%
--border: 0 0% 20%
--input: 0 0% 18%
--ring: 0 0% 40%
--hero-subtitle: 210 17% 95%
```

Consume tokens via `hsl(var(--token))` / `hsl(var(--token) / 0.3)`.

## Liquid Glass (`.liquid-glass`) — locked

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
  position: absolute; inset: 0; border-radius: inherit; padding: 1.4px;
  background: linear-gradient(180deg,
    rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.15) 20%,
    rgba(255,255,255,0) 40%, rgba(255,255,255,0) 60%,
    rgba(255,255,255,0.15) 80%, rgba(255,255,255,0.45) 100%);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}
```

Used on: the 3 navbar social buttons (circular `w-10 h-10`), the hero email-form container (rounded-full), and the "Start Writing" CTA button (rounded-lg).

## Animation pattern — fadeUp (Framer-Motion `whileInView`)

Reusable staggered reveal. In React:

```ts
const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-100px" },
  transition: { duration: 0.6, delay, ease: "easeOut" },
});
```

In the seed this is mapped down to an `IntersectionObserver` (threshold ~0.08, `rootMargin: -100px`) that adds a `.in` class; siblings within a parent get a staggered `transition-delay` (~0.08s steps). Keep `once: true` semantics (unobserve after reveal).

## Page structure (top to bottom)

### Navbar — fixed, transparent, `top-0 z-50`, padding `px-8 md:px-28 py-4`
- Left: concentric-circles logo (outer `w-7 h-7` `border-2 border-foreground/60`, inner `w-3 h-3` `border border-foreground/60`) + bold "Mindloop".
- Center-left: nav links `["Home", "How It Works", "Philosophy", "Use Cases"]` separated by `•` dots; links `text-muted-foreground hover:text-foreground`. Hidden on mobile.
- Right: 3 social icons (Instagram, LinkedIn, Twitter — `lucide-react` in the port, inline SVG in the seed) in liquid-glass circular `w-10 h-10 rounded-full` buttons.

### Hero — full viewport height
- Background: autoplay/loop/muted/playsInline MP4 covering the section, `object-cover`.
  - URL: `https://plugin-assets.open-design.ai/plugins/mindloop-landing/hf_20260325_120549_0cd82c36-56b3-4dd9-b190-069cfc3a623f-9b476a.mp4`
- Bottom gradient: `h-64` (`256px`) `bg-gradient-to-t from-background to-transparent` for a smooth fade to black.
- Content (centered, `z-10`, `pt-28 md:pt-32`):
  - Avatar row: 3 overlapping circular avatars (`-space-x-2`, `w-8 h-8 rounded-full border-2 border-background`, inlined data URIs) + "7,000+ people already subscribed" (`text-muted-foreground text-sm`).
  - Heading: `text-5xl md:text-7xl lg:text-8xl font-medium tracking-[-2px]` — "Get Inspired with Us", where **"Inspired"** is `.serif` (Instrument Serif italic, `font-normal`).
  - Subtitle: `text-lg`, color `hsl(var(--hero-subtitle))` — "Join our feed for meaningful updates, news around technology and a shared journey toward depth and direction."
  - Email form: `liquid-glass rounded-full p-2 max-w-lg` containing an email input and a `bg-foreground text-background rounded-full px-8 py-3` "SUBSCRIBE" button (`whileHover scale 1.03`, `whileTap scale 0.98`).

### "Search has changed" section — `pt-52 md:pt-64 pb-6 md:pb-9`, centered
- Heading: `text-5xl md:text-7xl lg:text-8xl` — "Search has changed. Have you?" with **"changed."** in serif italic.
- Subtitle: `text-muted-foreground text-lg max-w-2xl mx-auto mb-24`.
- 3 platform cards (`grid md:grid-cols-3 gap-12 md:gap-8 mb-20`): each = a ~200×200 icon image centered, platform name (`font-semibold text-base`), description (`text-muted-foreground text-sm`).
  - ChatGPT → inlined `icon-chatgpt` data URI. Perplexity → inlined `icon-perplexity` data URI. Google AI → inlined `icon-google` data URI.
- Bottom tagline: "If you don't answer the questions, someone else will." (`text-muted-foreground text-sm text-center`).

### Mission section — `pt-0 pb-32 md:pb-44`, centered
- Large ~800×800 looping autoplay muted video, centered.
  - URL: `https://plugin-assets.open-design.ai/plugins/mindloop-landing/hf_20260325_132944_a0d124bb-eaa1-4082-aa30-2310efb42b4b-d0e30d.mp4`
- **Scroll-driven word-by-word reveal** (`useScroll` + `useTransform` in the port; in the seed a passive `scroll` listener that maps each word's viewport position to opacity `0.15 → 1`).
  - Paragraph 1 (`text-2xl md:text-4xl lg:text-5xl font-medium tracking-[-1px]`): "We're building a space where curiosity meets clarity — where readers find depth, writers find reach, and every newsletter becomes a conversation worth having." Words **"curiosity", "meets", "clarity"** snap to `--foreground`; the rest sit in `--hero-subtitle`.
  - Paragraph 2 (`text-xl md:text-2xl lg:text-3xl font-medium mt-10`): "A platform where content, community, and insight flow together — with less noise, less friction, and more meaning for everyone involved."

### Solution section — `py-32 md:py-44`, `border-t border-border/30`
- Label: "SOLUTION" (`text-xs tracking-[3px] uppercase text-muted-foreground`).
- Heading: `text-4xl md:text-6xl` — "The platform for meaningful content" (serif italic on **"meaningful"**).
- Video: `rounded-2xl aspect-[3/1] object-cover`.
  - URL: `https://plugin-assets.open-design.ai/plugins/mindloop-landing/hf_20260325_125119_8e5ae31c-0021-4396-bc08-f7aebeb877a2-1f0a78.mp4`
- 4-column feature grid (`md:grid-cols-4 gap-8`): Curated Feed, Writer Tools, Community, Distribution — each title (`font-semibold text-base`) + description (`text-muted-foreground text-sm`).

### CTA section — `py-32 md:py-44`, `border-t border-border/30`, `overflow-hidden`
- Background video via **HLS (hls.js)**: `absolute inset-0 object-cover z-0`.
  - HLS URL: `https://stream.mux.com/8wrHPCX2dC3msyYU9ObwqNdm00u3ViXvOSHUMRYSEe5Q.m3u8`
  - Use `Hls.isSupported()`; fall back to native HLS (`canPlayType('application/vnd.apple.mpegurl')`) for Safari.
- Overlay: `absolute inset-0 bg-background/45 z-[1]`.
- Content (`z-10`, centered): concentric-circles logo (`w-10 h-10` outer, `w-5 h-5` inner); heading "Start Your Journey" (serif italic on "Journey"); subtitle `text-muted-foreground`; two buttons — "Subscribe Now" (`bg-foreground text-background rounded-lg px-8 py-3.5`) and "Start Writing" (`liquid-glass rounded-lg`).

### Footer — `py-12 px-8 md:px-28`
- Left: "© 2026 Mindloop. All rights reserved." (`text-muted-foreground text-sm`).
- Right: Privacy, Terms, Contact (`text-muted-foreground text-sm hover:text-foreground`).

## Responsive

- Headings use clamped / `md:`/`lg:` breakpoints exactly as listed; mobile drops the navbar center links.
- `platform-grid` and `feature-grid` collapse to a single (or 2) column under `md`.
- Mission video and hero video are `object-cover` and never letterbox.

## Color rules — hard

Pure black/white monochrome only. The ONLY tokens in play are the greyscale ramp plus `--hero-subtitle` (a near-white `210 17% 95%`) for hero/mission body text. **No accent colors in the visible UI — no blue, purple, teal swatches, no vivid gradients.** The single gradient allowed is the hero's black-to-transparent bottom fade and the liquid-glass border highlight. Keep it monochrome.
