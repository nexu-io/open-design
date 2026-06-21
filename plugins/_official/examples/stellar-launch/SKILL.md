---
name: stellar-launch
description: "Use this plugin when the user wants a premium awards / venture-prize landing page in the Launchex Awards style: an inset white card shell with rounded corners, a fullscreen video hero with chamfered (clip-path) CTA, a three-column submissions section with angular nomination cards flanking a square video, and an about-the-founders stats grid with plus-darker image cards. Invoke for 'awards landing page', 'launch / prize landing', 'Stellar Launch', 'Launchex awards', or any geometric chamfered-corner editorial hero."
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

# Stellar Launch — Launchex Awards Landing Page

Produce a premium **awards / venture-prize landing page** ("Launchex Awards") with an editorial, angular, clip-path-driven aesthetic. A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then adjust copy, video URLs, and image URLs; do **not** rewrite the CSS or invent a new visual language. The seed already encodes the exact shell, fonts, colors, clip-path chamfers, section layout, and responsive behavior described below.

This is the authoritative build brief. Follow it exactly — the named colors, fonts, clip-paths, video/image URLs, and breakpoints are locked.

## Stack

- Default output: a single self-contained HTML file (the `example.html` seed). Vanilla HTML/CSS plus one small `<script>` of vanilla JS for the scroll-driven page indicator.
- If the user explicitly asks for a **React + Vite + Tailwind + TypeScript** project, port the seed faithfully: same shell, same tokens, same markup structure, same clip-paths. Use **lucide-react** for the `Sparkles` and `ArrowUpRight` icons only. Do not change the design while porting.

## Fonts

Load via `<link>`:
- Google Fonts **Inter**: weights 300, 400, 500, 600, 700 (`https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap`).
- **TT Firs Neue** (display headings): `https://db.onlinewebfonts.com/c/69f2576e7ca287875bf8d089130e292c?family=TT+Firs+Neue`.

CSS:
```
html, body { font-family: 'Inter', system-ui, -apple-system, sans-serif; -webkit-font-smoothing: antialiased; background: #ffffff; }
.font-firs { font-family: 'TT Firs Neue', 'Inter', system-ui, sans-serif; }
.no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
.no-scrollbar::-webkit-scrollbar { display: none; }
```

## Color palette — locked

- Primary dark: `#154359`
- Teal accent: `#066377`
- Light background (submissions): `#F0F0F0`
- Lighter background (about): `#F0F5F7`
- Gradient text: `linear-gradient(294deg, #185B7B 20%, #4BBDF0)`
- Nomination stroke: `rgba(6, 99, 119, 0.25)`

## Outer shell structure

- `.shell`: `height: 100vh`, `background: #fff`, padding `12px` (mobile) / `20px` (≥640px).
- `.frame`: `position: relative; width:100%; height:100%; overflow:hidden; background:#fff`, `border-radius: 28px` (mobile) / `36px` (≥640px). This rounded container **clips all content**.
- `.scroll`: `position: absolute; inset: 0; overflow-y: auto; overflow-x: hidden`, with `.no-scrollbar`. Sections live here; persistent overlays live **outside** `.scroll` but inside `.frame`.

## Section 1 — Hero

- `min-height: calc(100vh - 40px)`, `position: relative; overflow: hidden`.
- Background `<video>` (`autoplay loop muted playsinline`, `object-fit: cover`, fills the section, `z-index:0`):
  `https://plugin-assets.open-design.ai/plugins/stellar-launch/hf_20260511_151648_2bdfbd1c-6bde-4f5d-a967-f57cbced97f6-fb3729.mp4`
- Overlay gradient on the video (`z-index:1`): `linear-gradient(to bottom, rgba(0,0,0,0.10), transparent 50%, rgba(0,0,0,0.20))`.
- **Top bar** (`z-index:20`, flex row, justify-between, padding `20px 16px 0` → `32px 40px 0` at ≥640px):
  - Left: logo = lucide `Sparkles` (20px → 24px, strokeWidth 1.5, white) + "launchex" (14/15px, font-semibold, tracking-tight) and "awards" below (10/11px, font-light, opacity 0.9, `-mt-0.5`). All white.
  - Right: CTA. Teal `#066377` bg, white text, 10/11px, uppercase, letter-spacing `0.14em`, font-medium, padding `12px 18px`. Chamfered via `clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)`. Contains lucide `ArrowUpRight` (14px) that shifts `translate(2px,-2px)` on hover; button `hover: brightness(1.25)`. Label "Send in your entry form" ≥640px, "Enter" on mobile.
- **Center content** (`z-index:10`, flex-col, items-center, text-center, color `#154359`, padding-top `128px` → `160px`, padding-bottom `96px`):
  - Eyebrow "Prize for ventures": 11/12px, uppercase, letter-spacing `0.3em`, font-medium, margin-bottom 24px, opacity 0.9.
  - Heading "launchex" `<br/>` "prizes": `.font-firs`, font-normal, letter-spacing `-0.04em`, line-height `0.9`, sizes 48px / 76px (≥640) / 100px (≥1024) / 120px (≥1280).
  - Subtext "Bridging visions with reality, helping ventures soar up to the stars": 12/14px, uppercase, letter-spacing `0.22em`, font-medium, max-width 28rem, line-height 1.8, opacity 0.9, margin-top 32px.

## Section 2 — Submissions (nominations)

- Background `#F0F0F0`, padding `80px 24px` → `112px 40px`, `position: relative; overflow: hidden`.
- Layout: `max-width: 64rem; margin: 0 auto`. Mobile = stacked, order **center → left → right**. ≥1024px = 3 columns (left | center | right), gap 40px → 48px; left and right columns pushed down with `margin-top: 144px` (`lg:mt-36`).
- **Center column:**
  - Kicker "[submissions]" (12px, letter-spacing `0.24em`, uppercase, color `#154359`).
  - Title "submissions" below (`.font-firs`, 44px → 54px, font-semibold, tracking-tight, uppercase, `#154359`).
  - Square video below (margin-top 24px → 32px), 220px → 380px → 460px, `object-fit: cover`, `autoplay loop muted playsinline`:
    `https://plugin-assets.open-design.ai/plugins/stellar-launch/hf_20260514_154120_b89bfedd-530d-4ebb-9eb7-42eeafe08667-c6b971.mp4`
- **Left nominations** (3 cards): "Lead" / "AI venture for commerce" · "Emerging innovations" / "in food commerce" · "The finest innovations" / "for learners and young students".
- **Right nominations** (3 cards): "Innovations for advanced" / "career training" · "The finest innovations" / "in finance" · "Categories" / "coming soon".
- **NominationCard**: `<a>`, `max-width: 20em`, `height: 5em`, `hover: translateY(-2px)`. Border is an SVG chamfered rectangle `polygon(points="14,0 100,0 100,86 86,100 0,100 0,14")`, `viewBox="0 0 100 100"`, `preserveAspectRatio="none"`, stroke `rgba(6,99,119,0.25)`, stroke-width 1, `vector-effect="non-scaling-stroke"`, fill none. Centered text: title 13px font-semibold, subtitle 12px font-normal opacity 0.8, color `#154359`.
- **Bottom fade** (`pointer-events:none; position:absolute; bottom:0; width:100%; z-index:10`, height 160px → 224px): `linear-gradient(to bottom, rgba(240,245,247,0) 0%, rgba(240,245,247,0.7) 60%, #F0F5F7 100%)`.

## Section 3 — About the founders

- Background `#F0F5F7`, padding `80px 24px` → `112px 40px`, `max-width: 80rem; margin: 0 auto`, relative + overflow hidden.
- **Top row** (color `#154359`): flex-col mobile, flex-row at ≥1024px (justify-between).
  - Left heading "About the" `<br/>` "founders": `.font-firs`, 36px / 48px / 54px, font-semibold, uppercase, tracking-tight, line-height 0.95.
  - Right (max-width 36rem): two paragraphs (17/18px, line-height 1.5):
    - "Launchex.Hub is a platform that is part of a portfolio of companies Launchex, for sourcing and showcasing groundbreaking innovations."
    - "Launchex.Hub's mission is to offer every local-language innovator the chance to reshape our world with their pioneering creation."
  - Link "Launchex.Hub website" → `https://base.launchex.vc/` (margin-top 24px, 14px, font-medium). Arrow in a chamfered 32×32 box, border `#154359`, `clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)`; `hover: translateY(-2px)`. Use lucide `ArrowUpRight`.
- **Stats grid** (margin-top 56px): 1 col / 2 col (≥768px) / 3 col (≥1024px), gap 20px. Card 2 pushed down with `margin-top: 96px` (`lg:mt-24`) at ≥1024px.
- Each stat card:
  - Outer: `width:100%; height: 280px → 340px; background-color: rgba(255,255,255,0.8); padding: 1.5px` (acts as border), clip-path applied.
  - Inner image: `width/height 100%; overflow:hidden; background-size: cover; background-position: center; mix-blend-mode: plus-darker`, same clip-path.
  - Text overlay (absolute): value `.font-firs`, font-semibold, uppercase, 36px → 52px, gradient text `linear-gradient(294deg, #185B7B 20%, #4BBDF0)` (`background-clip: text; color: transparent`). Description 14px, line-height 1.4, `#154359`, margin-top 12px, max-width 66%.
  - **Card 1** — "7+ years" / "Launchex has served the market, guiding ventures and their journeys"; no offset; text `left:24px; right:24px; bottom:24px`; clip-path `polygon(64px 0, calc(100% - 14px) 0, calc(100% - 4px) 4px, 100% 14px, 100% calc(100% - 14px), calc(100% - 4px) calc(100% - 4px), calc(100% - 14px) 100%, 14px 100%, 4px calc(100% - 4px), 0 calc(100% - 14px), 0 64px)`. Image: `https://plugin-assets.open-design.ai/plugins/stellar-launch/hf_20260514_154203_6c6f94dc-a07e-4ba5-8688-106f01ccd2c8-158c74.webp&w=1280&q=85`.
  - **Card 2** — "15000+" / "innovation ventures moved through the Launchex pipeline"; offset down `lg:mt-24`; text `left:24px; bottom:80px`; clip-path `polygon(0 14px, 4px 4px, 14px 0, calc(100% - 64px) 0, 100% 64px, 100% calc(100% - 14px), calc(100% - 4px) calc(100% - 4px), calc(100% - 14px) 100%, 64px 100%, 0 calc(100% - 64px))`. Image: `https://plugin-assets.open-design.ai/plugins/stellar-launch/hf_20260514_154151_45c62c60-3bcc-4f21-8f9d-03722ebb5df8-71cb96.webp&w=1280&q=85`.
  - **Card 3** — "120+" / "accelerator sessions delivered by Launchex across Eastern Europe"; no offset; text `left:24px; right:112px; bottom:24px`; clip-path `polygon(0 14px, 4px 4px, 14px 0, calc(100% - 64px) 0, 100% 64px, 100% calc(100% - 64px), calc(100% - 64px) 100%, 14px 100%, 4px calc(100% - 4px), 0 calc(100% - 14px))`. Image: `https://plugin-assets.open-design.ai/plugins/stellar-launch/hf_20260514_152238_24ec8db4-d728-4739-bb30-e985533e9637-8b9102.webp&w=1280&q=85`.
- **Bottom fade**: same as section 2.

## Persistent overlay elements (inside `.frame`, outside `.scroll`)

- **Top nav bar**: hidden on mobile (`display:none`; show `flex` at ≥768px), absolute, top 0, centered (`left:50%; translateX(-50%)`), `z-index:40`. White bg, `border-bottom-left-radius` + `border-bottom-right-radius: 28px`. Padding `16px 24px` (→ `16px 40px` ≥1024px), gap 24px → 40px. Links "About", "Submissions", "Venue", "Judges", "Connect": 11px, uppercase, letter-spacing `0.14em`, font-medium, `#262626`, hover `#737373`. Two decorative corner `<span>`s at `-left-6` / `-right-6` form inverted rounded corners via radial-gradient masks: left `radial-gradient(circle at 0 100%, transparent 24px, black 25px)`, right `radial-gradient(circle at 100% 100%, transparent 24px, black 25px)`.
- **Bottom-right page indicator** (`pointer-events:none`, absolute, bottom 16px → 24px, right 16px → 32px, `z-index:40`): "01" [line] "05", flex, gap 12px, `color: rgba(255,255,255,0.8)`, 10px, font-medium, uppercase, letter-spacing `0.18em`, `mix-blend-mode: difference`. Line = `width:32px; height:1px; background: rgba(255,255,255,0.4)`. The "01" updates with scroll position (1..5 across the page).
- **Bottom-left scroll indicator** (same offsets, left side): "Scroll to discover", same type treatment + `mix-blend-mode: difference`.

## Animations / interactions

- All transitions are subtle: translate, color, brightness. CTA arrow `translate(2px,-2px)` on hover; CTA `brightness(1.25)`; nomination + about-arrow `translateY(-2px)` on hover.
- The only JS is a passive `scroll` listener on `.scroll` that maps scroll ratio to the page indicator number (`Math.round(ratio*4)+1`, clamped 1..5). (In React: a `useScroll`/scroll handler updating a `currentPage` state.)

## Assets — keep remote

The two `cloudfront.net` `.mp4` videos and the three `images.higgs.ai` stills are large stable CDN media — **keep them as remote URLs**; do not inline them. There are no local avatars or small decorations to inline (icons are inline SVG / lucide). Do not introduce `figma.site`, `i.pravatar.cc`, `api.dicebear.com`, or any other remote avatar host.

## Responsive

- Mobile-first. Breakpoints: `sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px.
- Hero heading scales 48 → 76 → 100 → 120px. Submissions stacks (center first) below `lg`, 3-column at `lg`. Stats grid 1 → 2 (`md`) → 3 (`lg`) columns. Top nav hidden below `md`.

## Hard rules

- All chamfers use `clip-path: polygon()` with pixel-based cut corners — copy the exact polygons above; do not approximate with `border-radius`.
- Stat card images use `mix-blend-mode: plus-darker`; keep it.
- No visible scrollbar anywhere (use `.no-scrollbar`).
- The outer rounded `.frame` clips everything; scrolling happens inside `.scroll`, overlays sit on top.
- Keep the two display fonts: `.font-firs` (TT Firs Neue) for all headings/values, Inter for body.
