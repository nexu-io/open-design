---
name: ai-designer-portfolio
description: "Use this plugin when the user wants a premium single-page creative-studio / designer portfolio landing page on a white background: serif-accented hero, an infinite GIF marquee, parallax testimonial, two-card pricing, an auto-scrolling testimonial carousel, vertical project showcase, a mouse-trail partner CTA, and a fixed floating bottom nav. Invoke for 'designer portfolio', 'creative studio landing page', 'agency one-pager', or when the user references the Viktor Oddy / AI Designer Portfolio template."
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

# AI Designer Portfolio — "Viktor Oddy" Creative Studio Landing

Produce a premium **single-page creative-studio landing page** on a **white background throughout**. A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then adjust copy and data only; do not rewrite the CSS or invent a new visual language. The seed already encodes the exact tokens, fonts, section order, animations, button shadows, and responsive behavior described below.

This is the authoritative build brief. Follow it exactly — the named colors, button shadows, fonts, section order, asset URLs, and animations are locked.

## Stack

- Default output: the single self-contained `example.html` seed. It already includes everything inline.
- If the user explicitly asks for a React + TypeScript + Vite + Tailwind project, port the seed faithfully into the file structure below. Same tokens, same markup structure, `lucide-react` for icons. Do not change the design while porting.

```
src/App.tsx                          — hero, marquee, section composition
src/components/Button.tsx            — primary/secondary/tertiary variants
src/components/TestimonialSection.tsx — quote + parallax image
src/components/PricingSection.tsx    — two pricing cards
src/components/TestimonialCarousel.tsx — auto-scrolling cards
src/components/ProjectsSection.tsx   — project showcase
src/components/PartnerSection.tsx    — mouse-trail CTA
src/components/Footer.tsx
src/components/CopyrightBar.tsx
src/components/BottomNav.tsx
src/hooks/useInViewAnimation.ts      — IntersectionObserver scroll-trigger
src/index.css                        — font faces, marquee + fade-in-up keyframes
```

## Fonts — locked

Two custom fonts via `@font-face`:

```css
@font-face { font-family: 'PP Neue Montreal';
  src: url('https://assets.website-files.com/6009ec8cda7f305645c9d91b/60176f9bb43e36419997ecfe_PPNeueMontreal-Book.otf') format('opentype'); font-weight: 400; font-display: swap; }
@font-face { font-family: 'PP Neue Montreal';
  src: url('https://assets.website-files.com/6009ec8cda7f305645c9d91b/60176f9b39c5673e51a86f5a_PPNeueMontreal-Medium.otf') format('opentype'); font-weight: 500; font-display: swap; }
@font-face { font-family: 'PP Mondwest';
  src: url('/PPMondwest-Regular.woff2') format('woff2'); font-weight: 400; font-display: swap; }
```

- **Body default**: PP Neue Montreal with system fallbacks.
- **Serif accent**: PP Mondwest — used for the logo, the highlighted words inside headings ("next wave", "bold way.", "Apple", "builders"), project names, the partner heading, and the "V" / "Viktor Oddy" wordmarks.
- The seed also loads free near-equivalent web fonts (Space Grotesk / IBM Plex Mono / DM Serif Display) so the page renders cleanly when the commercial fonts are unreachable. Keep that fallback link — the real `@font-face` declarations win when reachable. Tagline uses a **monospace** font.

## Color palette — locked

```
--dark:           #051A24   (primary dark, hero logo/heading, dark pricing card, buttons)
--dark-2:         #0D212C   (secondary dark, large headings)
--light-on-dark:  #F6FCFF   (text on dark)
--light-on-dark-2:#E0EBF0   (muted text on dark)
--body:           #051A24   (body text)
--muted:          #273C46   (muted text, quote author)
background:       #ffffff   throughout
```

Project descriptions use `rgba(5,26,36,0.7)`. Do not introduce other accent hues — there is no colored accent; the design is a near-monochrome dark-on-white.

## Button shadows — critical for the design feel

```
Primary:   0 1px 2px 0 rgba(5,26,36,0.1), 0 4px 4px 0 rgba(5,26,36,0.09), 0 9px 6px 0 rgba(5,26,36,0.05),
           0 17px 7px 0 rgba(5,26,36,0.01), 0 26px 7px 0 rgba(5,26,36,0), inset 0 2px 8px 0 rgba(255,255,255,0.5)
Secondary: 0 0 0 0.5px rgba(0,0,0,0.05), 0 4px 30px rgba(0,0,0,0.08)
Card:      0 4px 16px rgba(0,0,0,0.08)
```

- **Primary** button: `bg #051A24`, white text, `rounded-full`, `padding 12px 28px`, the multi-layer primary shadow incl. the inset highlight.
- **Secondary**: white bg, `#051A24` text, no border, secondary shadow.
- **Tertiary**: white bg, combined secondary + card shadow (used for Custom Project "Start a chat").

## Section order (exact)

1. **Hero** — centered narrow column `max-width:440px`, `padding:48px 24px 0` (`pt-12 md:pt-16`).
   - Logo "Viktor Oddy" in **PP Mondwest serif**, `32 / 40 / 44px`, weight 600, `#051A24`, tracking-tight, `mb-4`, delay `.1s`.
   - Tagline "The creative studio of Viktor Oddy" in **monospace**, `text-xs md:text-sm`, `#051A24`, `mb-2`, delay `.2s`.
   - Heading two lines: "Build the next wave," / "the bold way." with **"wave,"** and **"bold way."** in serif. `32 / 40 / 44px`, `leading-[1.1]`, `#0D212C`, tracking-tight, `whitespace-nowrap`, delay `.3s`.
   - Description: three paragraphs in `flex-col gap-6`, `text-sm md:text-base`, `#051A24`, `leading-relaxed`, `mt-5 md:mt-6`, delay `.4s`. (1) "I spent seven years at Apple…", (2) "The studio is deliberately small…", (3) "Projects start at $5,000 per month."
   - Two buttons in `flex-col sm:flex-row`, gap 3/4, `mt-5 md:mt-6`, delay `.5s`: "Start a chat" (primary) + "View projects" (secondary).

2. **Infinite marquee** — full width, `mt-16 md:mt-20 mb-16`. 8 GIFs **duplicated (16 total)** in a flex row, `animate-marquee` `translateX(0) → translateX(-50%)`, **30s linear infinite desktop / 10s mobile**. Images `h-[280px] md:h-[500px]`, `object-cover`, `mx-3`, `rounded-2xl`, `shadow-lg`. URLs (keep as remote — stable motionsites CDN):
   - `https://plugin-assets.open-design.ai/plugins/ai-designer-portfolio/hero-space-voyage-preview-eECLH3Yc-475920.gif`
   - `https://plugin-assets.open-design.ai/plugins/ai-designer-portfolio/hero-portfolio-cosmic-preview-BpvWJ3Nc-89ab29.gif`
   - `https://plugin-assets.open-design.ai/plugins/ai-designer-portfolio/hero-velorah-preview-CJNTtbpd-626d83.gif`
   - `https://plugin-assets.open-design.ai/plugins/ai-designer-portfolio/hero-asme-preview-B_nGDnTP-7fb29d.gif`
   - `https://plugin-assets.open-design.ai/plugins/ai-designer-portfolio/hero-transform-data-preview-Cx5OU29N-910cf9.gif`
   - `https://plugin-assets.open-design.ai/plugins/ai-designer-portfolio/hero-aethera-preview-DknSlcTa-097fee.gif`
   - `https://plugin-assets.open-design.ai/plugins/ai-designer-portfolio/hero-orbit-web3-preview-BXt4OttD-f84442.gif`
   - `https://plugin-assets.open-design.ai/plugins/ai-designer-portfolio/hero-nexora-preview-cx5HmUgo-d2d4a4.gif`

3. **Testimonial quote** — `py-12 px-6`, `max-w-2xl`, centered.
   - lucide `Quote` icon `w-6 h-6 text-slate-900`, delay `.1s`.
   - Large quote "I left **Apple** to build the studio I always wanted to work with" ("Apple" serif), `32 / 40 / 44px`, `leading-[1.1]`, `#0D212C`, tracking-tight, delay `.2s`.
   - Author "Viktor Oddy" italic, `text-sm`, `#273C46`, delay `.3s`.
   - Three text logos: "Apple" (80px / 24px), "IDEO" (83px / 24px), "Polygon" (110px / 24px), `font-medium text-slate-900`, delay `.4s`.
   - **Parallax image** below: `w-full max-w-xs rounded-2xl shadow-lg`, alt "Chris Halaska", delay `.5s`. Keep this URL (stable higgs CDN):
     `https://plugin-assets.open-design.ai/plugins/ai-designer-portfolio/hf_20260330_103804_7aa5494f-4d5b-432e-9dc7-20715275f143-069da9.webp&w=1280&q=85`
     Parallax = IntersectionObserver + passive scroll listener with `requestAnimationFrame`, max offset 200px.

4. **Pricing** — full width, `py-12 px-6`. Two cards `grid-cols-1 md:grid-cols-2 gap-8`, right-aligned on desktop (`md:justify-end md:max-w-4xl`, container `margin-left:auto`). Each `rounded-[40px]`, `pl-10 pr-10 md:pr-24 pt-3 pb-10`.
   - **Card 1 (dark)**, delay `.1s`: `bg #051A24`, inset shadow, text `#F6FCFF / #E0EBF0`. Title "Monthly Partnership" (`22px`, medium). Desc "A dedicated creative design team. / You work directly with Viktor." Price "$5,000" (`text-2xl`, `#F6FCFF`) + "Monthly". Buttons "Start a chat" (primary) + "How it works" (secondary), both → `https://halaskastudio.com/./book`.
   - **Card 2 (light)**, delay `.2s`: `bg white`, card shadow. Title "Custom Project" (`22px`, medium). Desc "Fixed scope, fixed timeline. / Same team, same standards." Price "$5,000" (`text-2xl`, `#0D212C`) + "Minimum". One button "Start a chat" (tertiary).

5. **Testimonial carousel** — full width, `py-20`. Header row (`md:max-w-4xl md:ml-auto`): title "What **builders** say" ("builders" serif, large heading size) left; right = 5 filled black `Star` icons (`w-5 h-5 fill-black`) + "Clutch 5/5". Auto-scroll **3s interval, pauses on hover**, prev/next circular buttons (`w-12 h-12 rounded-full border border-[#0D212C]/20`, lucide `ChevronLeft/ChevronRight`). Cards **427.5px wide desktop** (full width minus 48px mobile), `gap-6`, exit anim (opacity fade + scale down). Each card: `bg-white rounded-[32px] md:rounded-[40px]`, card shadow, `px-6 md:pl-10 md:pr-24 py-8`. Content: custom SVG quote mark, quote text (`text-base #0D212C leading-relaxed`), author row with circular avatar (`w-12 h-12`), name (`font-semibold text-sm`), role with `→` arrow prefix. **Testimonials tripled for infinite scroll**; transform `cubic-bezier(0.4,0,0.2,1)` `0.8s`.
   - Marcus Anderson — CEO, Data.storage
   - alexwu — Founder, Nexgate
   - James Mitchell — VP Product, LaunchPad
   - Rachel Foster — Co-founder, Nexus Labs
   - David Zhang — Head of Design, Paradigm Labs

6. **Projects** — `max-w-[1200px] px-6 py-12`, vertical stack of 3, `gap-16 md:gap-20`. Each: text block offset left (`ml-20 md:ml-28`) with project name in **serif** (`text-2xl md:text-3xl`, weight 600, `#051A24`) + description (`text-sm md:text-base`, `#051A24/70`); full-width image below (`rounded-2xl shadow-lg object-cover`). Each item fades in independently via IntersectionObserver.
   - "evr" — "From idea to millions raised for a web3 AI product" — `…/hero-evr-ventures-preview-DZxeVFEX.gif`
   - "Automation Machines" — "Streamlining industrial automation processes" — `…/hero-automation-machines-preview-DlTveRIN.gif`
   - "xPortfolio" — "Modern portfolio management platform" — `…/hero-xportfolio-preview-D4A8maiC.gif`

7. **Partner** — full width, `py-12 px-6`. Large white container `max-w-7xl py-48 rounded-[40px]` subtle shadow. On mouse hover, GIF thumbnails (from the marquee array) **spawn at cursor** with random rotation (−10..+10°), fade out over **1000ms** with scale-down, spawn no faster than **every 80ms**, cleaned up via timeout/rAF. Centered heading "Partner with us" in **serif**, `48 / 64 / 80px`, `#0D212C`, `mb-12`. CTA = dark pill with circular avatar + "Start chat with Viktor", primary shadow.

8. **Footer** — `py-12 px-6 max-w-[1200px]`, flex row (`md:flex-row`). Left: "Start a chat" primary button. Right: lucide `ArrowUpRight`, then two columns: (1) Services, Work, About (anchors); (2) x.com, LinkedIn (`target="_blank"`). Links `text-base #051A24 hover:opacity-70`.

9. **Copyright bar** — `max-w-[1200px] px-6 py-4`, flex `justify-between`: "Vortex Studio Limited" left, "Austin, USA" right. `text-sm #051A24`.

10. **Fixed bottom nav** — `z-50`, fixed `bottom-6`, centered `left-1/2 -translate-x-1/2`. White bg, `rounded-full`, `px-8 py-2`, primary layered shadow. Contains "V" in serif (`text-2xl`, weight 600, `#051A24`) + "Start a chat" primary button.

## Animations — locked

```css
@keyframes fadeInUp { 0% { opacity: 0; transform: translateY(30px); } 100% { opacity: 1; transform: translateY(0); } }
.animate-fade-in-up { animation: fadeInUp 0.8s ease-out forwards; opacity: 0; }
@keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
```

- All sections use a `useInViewAnimation` hook (IntersectionObserver threshold 0.1, triggers once). Elements get `animate-fade-in-up` when in view, otherwise `opacity-0`. In the vanilla seed this is one IntersectionObserver that toggles an `.in-view` class on `.reveal` elements.
- Each element within a section carries a **staggered `animationDelay`** (0.1s, 0.2s, 0.3s, …).
- Parallax: passive scroll listener + `requestAnimationFrame`, max ±200px offset.
- Partner mouse-trail: `mousemove` handler throttled to 80ms, random rotation, 1s fade+scale-down, removed on timeout.

## Avatars (critical)

`example.html` ships every avatar as an **inlined `data:image/svg+xml;base64,…` URI** generated from initials (colored circle + letters) — keep that approach. The prompt mentions Pexels avatars; do **not** fetch `i.pravatar.cc`, `api.dicebear.com`, Pexels, or any other remote avatar host — external avatar hosts rate-limit / 403 inside the preview sandbox and render as broken images. Generate small inline SVG data URIs instead. The large GIF previews (motionsites CDN) and the parallax still (images.higgs.ai) **stay as remote URLs** — they are large stable CDN media.

## Responsive

- `<768px`: single-column hero CTA, marquee duration 10s, carousel cards `calc(100vw - 48px)`.
- `≥768px`: hero CTA row, marquee images 500px tall, pricing two columns, carousel header row, larger headings, footer row.
- `≥1024px`: largest heading sizes (44px headings, 80px partner heading).

## Start from the seed

Copy `example.html` first. Only swap copy/data (studio name, testimonials, projects, prices). Do not rewrite the CSS variables, button shadows, fonts, section order, or animation logic — they are the fidelity anchor.
