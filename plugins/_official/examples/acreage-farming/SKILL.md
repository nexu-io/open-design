---
name: acreage-farming
description: "Use this plugin when the user wants a premium precision-farming / agritech landing page: dark/light alternating sections, a fullscreen hero video background, an animated stats grid, an infinite logo marquee, and image-backed service cards. Invoke for 'farming landing page', 'agritech marketing site', 'precision agriculture site', or when the user references the Acreage Farming template."
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

# Acreage Farming — Precision Agriculture Landing Page

Produce a premium **precision-farming landing page** with **dark/light alternating sections**, a **fullscreen hero video background**, an **animated stats grid**, an **infinite logo marquee**, and **image-backed service cards**. A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then adjust copy and data; do not rewrite the CSS or invent a new visual language. The seed already encodes the exact tokens, layout, reveal animation, marquee, and responsive behavior below.

This is the authoritative build brief. Follow it exactly — the named colors, radii, fonts, and animations are locked.

## Stack

- Default output: a single self-contained HTML file (the `example.html` seed). It already includes everything inline.
- If the user explicitly asks for a **React + TypeScript + Vite + Tailwind** project, port the seed faithfully: same tokens, same section order, same markup structure. Map vanilla features back up: the `IntersectionObserver` reveal → Framer-Motion `whileInView`; the passive scroll listener that toggles `.scrolled` on the nav → `useScroll`; the CSS marquee → a Framer-Motion loop or duplicated-track CSS keyframe. Do not change the design while porting.

## Fonts

Load from Google Fonts: **Manrope** (weights 400, 500, 600, 700, 800) for UI/body and **Instrument Serif** (regular + italic) for editorial accent words. Manrope is the default body face; Instrument Serif italic is used only for the one or two emphasized words in the hero headline (`<span class="serif italic">`).

## CSS Variables (`:root`) — locked

```
--bg-dark: #0d120e;       --bg-darker: #080b09;
--bg-light: #f3f0e7;      --bg-cream: #e9e4d6;
--green: #6b8e3a;         --green-bright: #9ec94a;   --green-deep: #2e3b22;
--soil: #c9a06a;
--text-light: #f3f0e7;    --text-muted-light: rgba(243,240,231,0.6);
--text-dark: #1a1f17;     --text-muted-dark: rgba(26,31,23,0.55);
--radius: 28px;           --radius-lg: 40px;
--ease: cubic-bezier(0.22, 1, 0.36, 1);
--transition: all 0.5s cubic-bezier(0.22, 1, 0.36, 1);
```

Body: Manrope, `background: var(--bg-dark)`, `color: var(--text-light)`, `overflow-x: hidden`. `html { scroll-behavior: smooth }`. The page is **dark by default**; only the stats section uses the light/cream palette.

## Sections (in order)

### 1. Nav (fixed)
Pill that shrinks on scroll. At top: transparent, max-width 1240px, padding `22px 32px`. After `scrollY > 40` it gets `.scrolled`: floats inward (`top:14px; left:16px; right:16px`), gains `rgba(8,11,9,0.72)` + `backdrop-filter: blur(14px)`, a 1px `rgba(243,240,231,0.08)` border, and `border-radius:100px`. Left: brand = a `30px` gradient-mark (`linear-gradient(135deg, var(--green-bright), var(--green))`) holding an inline wheat/sprout SVG + "Acreage". Center: nav-links (Platform, Data, Services, Pricing), hidden ≤980px. Right: green-bright pill CTA "Book a demo".

### 2. Hero (fullscreen, video background)
`min-height:100vh`, content bottom-aligned. A `<video autoplay muted loop playsinline>` fills `inset:0` with `object-fit:cover` and a poster still. A gradient `::after` (top transparent → bottom `rgba(8,11,9,0.92)`) keeps text legible. Headline: `clamp(3rem, 8vw, 6.5rem)`, weight 800, `letter-spacing:-0.03em`, with one word in Instrument Serif italic ("every"). Sub-paragraph in `--text-muted-light`. Actions: green-bright primary button + ghost outline "Watch the film". Below: a hero-meta row of three big stats (`2.4M+ acres`, `31% yield lift`, `−40% water`).
- Hero video: `https://plugin-assets.open-design.ai/plugins/aerocore/23211-720-e83442.mp4` (large stable CDN — keep as remote URL). Poster: an Unsplash aerial-field still (remote URL OK).

### 3. Logo marquee
Full-width band on `--bg-darker`, top+bottom hairline borders. Centered uppercase label, then an **infinite horizontal marquee**: a `.marquee-track` of duplicated partner logos animated `translateX(0 → -50%)` over `32s linear infinite`, paused on hover, edge-masked with a `linear-gradient` CSS mask. The track is built in JS by duplicating an 8-name partner array, each rendered as an inline leaf SVG + name. Logos are text + inline SVG only — **no remote logo images**.

### 4. Stats (light section)
`.section-light` flips to the cream palette (`--bg-light` bg, `--text-dark` text, green eyebrow). Header row: eyebrow + big `h2` on the left, descriptive paragraph on the right. Then a **4-column stat grid** (`repeat(4,1fr)`, gap 20px). Each `.stat-card` is white, rounded `--radius`, min-height 220px, with an icon chip (top), a big `stat-num` (`3rem`, weight 800, with a smaller `.unit` span for %/k) pushed to the bottom via `margin-top:auto`, and a label. **The first card has `.accent`** → `--green-deep` background, light text, tinted icon chip. Hover lifts cards `translateY(-6px)` with a soft shadow. Icons are inline SVG (refresh-cycle, trend-up, droplet, clock). Values: `98%` coverage, `31%` yield, `40%` water, `11k` autonomous hours.

### 5. Services (dark, image cards)
Back to `--bg-dark`. Centered head (eyebrow + h2 + paragraph). **3-column grid** of `.svc-card`, each `min-height:420px`, `--radius-lg`, an absolutely-positioned `.svc-bg` image that scales `1.06` on hover, a bottom gradient scrim, and bottom-aligned body: a green-tinted `.svc-tag` chip, `h3`, paragraph, and a green-bright "arrow" link. Three cards: **Sensing** (satellite & drone scouting), **Deciding** (variable-rate prescriptions), **Acting** (autonomous machinery). Card background images are Unsplash farm stills (remote URLs OK — large stable CDN).

### 6. CTA
Band on `--bg-darker` containing a rounded-48px panel with a `linear-gradient(135deg, var(--green-deep), #1c2616)` fill, a green radial glow `::before`, eyebrow, huge headline ("Put your fields on autopilot."), one line of copy, and a green-bright primary button.

### 7. Footer
`--bg-darker`, top hairline. Left: brand mark + one-line mission. Right: three link columns (Platform / Company / Resources). Bottom bar: copyright + legal links, separated by a hairline.

## Animations

- **Reveal**: every `.reveal` element starts `opacity:0; translateY(34px)` and transitions to visible over `0.9s var(--ease)` when it enters the viewport. Implemented with one `IntersectionObserver` (`threshold:0.15`, `rootMargin:'0px 0px -8% 0px'`, unobserve after firing). A small stagger is applied via `transitionDelay = (index % 4) * 0.07s`. In a React port this is `whileInView` + `viewport={{ once: true }}`.
- **Nav shrink**: passive `scroll` listener toggles `.scrolled` at `scrollY > 40`.
- **Marquee**: `@keyframes scroll-x { translateX(0) → translateX(-50%) }`, `32s linear infinite`, `animation-play-state: paused` on `:hover`.
- **Hover**: buttons lift `translateY(-2/-3px)` with green glow shadow; stat-cards and svc-cards lift `translateY(-6px)`; service background images scale `1.06` over `0.8s`.
- All interactive transitions use `--transition` (`0.5s cubic-bezier(0.22, 1, 0.36, 1)`).

## Assets / hosts

- **Inline (do not fetch remote):** all icons and partner logos are **inline SVG**. The brand mark, stat icons, service arrows, and marquee leaf are inline SVG. There are **no avatar images** in this template.
- **Keep remote (large stable CDN):** the hero `.mp4` on `cdn.coverr.co`, and the Unsplash hero poster + service-card stills on `images.unsplash.com`. These may stay as URLs.
- **Never** introduce `i.pravatar.cc`, `api.dicebear.com`, or any remote avatar host — none are needed here and they 403 in the sandbox.

## Responsive

- ≤980px: stats grid → 2 columns, services grid → 1 column, nav-links hidden.
- ≤620px: `.wrap` padding `0 20px`, stats grid → 1 column, tighter hero-meta gap, CTA panel padding reduced.

## Color Rules — hard

Earthy agritech palette only: deep greens (`--green`, `--green-bright #9ec94a`, `--green-deep`), near-black greens (`--bg-dark #0d120e`, `--bg-darker #080b09`), warm cream/off-white (`--bg-light #f3f0e7`, `--bg-cream`), and a soil tan accent (`--soil #c9a06a`). **`--green-bright #9ec94a` is the locked accent** — do not substitute blue/teal/purple. Light text on dark, dark text on cream; all contrast-safe.
