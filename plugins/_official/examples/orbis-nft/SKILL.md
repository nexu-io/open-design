---
name: orbis-nft
description: "Use this plugin when the user wants a dark, space-themed NFT collection landing page (\"Orbis.Nft\") with full-bleed CloudFront video backgrounds, a liquid-glass UI, Anton + Condiment fonts, and a neon-green accent. Invoke for 'NFT landing page', 'space NFT site', 'crypto collection page', or when the user references the Orbis NFT template."
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

# Orbis.Nft — Dark Space NFT Landing Page

Produce a premium, dark space-themed **NFT collection landing page** named **"Orbis.Nft"** with **4 sections**, full-bleed looping CloudFront video backgrounds, a **liquid glass** UI effect, and a locked color/font system. A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then adjust copy and data; do not rewrite the CSS or invent a new visual language. The seed already encodes the exact tokens, glass treatment, layout, fonts, and section structure described below.

This is the authoritative build brief. Follow it exactly — named colors, fonts, video URLs, radii, and per-section layout are locked.

## Stack

- Default output: a single self-contained HTML file (the `example.html` seed). Everything is inline.
- If the user explicitly asks for a **React + TypeScript + Vite + Tailwind** project, port the seed faithfully: same tokens, same markup structure and section order, `lucide-react` for the `Mail` / `Twitter` / `Github` icons, Anton + Condiment from Google Fonts. Do not change the design while porting. Alias `Anton` as `font-grotesk` and `Condiment` as `font-condiment` in the Tailwind config; map body text to `font-mono`.

## Fonts (Google Fonts)

Load via:
```
https://fonts.googleapis.com/css2?family=Anton&family=Condiment&display=swap
```
- **Anton** (`font-grotesk`) — all headings and navigation text. Uppercase.
- **Condiment** (`font-condiment`) — cursive script for accent/overlay text only (NORMAL case, never uppercased).
- **System monospace** (`font-mono`) — body/description paragraphs.

## Color System — locked

```
--bg:    #010828   /* deep dark navy blue page background */
--cream: #EFF4FF   /* off-white, used for ALL text */
--neon:  #6FFF00   /* bright green: cursive accent text + underline bars */
```

Do not introduce other accent hues for text/bars. The neon green `#6FFF00` is locked. (The only other vivid color allowed is the NFT-card arrow button's purple gradient — see Section 3.)

## Liquid Glass CSS Effect

Applied via a `.liquid-glass` class on the navbar, social icon buttons, NFT cards, and card overlay bars:

```css
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

## Texture Overlay

A full-screen FIXED texture overlay sits on top of everything (`z-index: 50`, `pointer-events: none`), `mix-blend-mode: lighten`, `opacity: 0.6`, `background-size: cover`, covering the whole viewport. The original prompt uses a `/texture.png` grain image. **The seed inlines a small SVG fractal-noise data URI** in its place so the page is self-contained and never 404s in the sandbox — keep that inline data URI. If the user supplies a real `texture.png`, swap only the `background-image` URL; do not change the blend mode / opacity / z-index.

## Layout primitives

- Every section's content is centered in a container with `max-width: 1831px` and responsive horizontal padding (24px / 640px:40px / 1024px:64px).
- All text is **uppercase** except the Condiment cursive accents (normal-case).
- Condiment accent text is neon green with `mix-blend-mode: exclusion` and is positioned absolutely, slightly rotated, relative to the heading it decorates.
- All videos: `autoplay loop muted playsinline`.

## Section 1 — Hero (full viewport)

- Full-bleed looping muted autoplaying video, `object-fit: cover`, covering the section. Section has `border-bottom-left-radius: 32px` + `border-bottom-right-radius: 32px` clipping the video.
- Video: `https://plugin-assets.open-design.ai/plugins/orbis-nft/hf_20260331_045634_e1c98c76-1265-4f5c-882a-4276f2080894-f71ad1.mp4`
- **Header:** left = "Orbis.Nft" logo (Anton, 16px, uppercase). Center = nav bar with `.liquid-glass`, `border-radius: 28px`, padding `24px 52px`, 5 links (Homepage, Gallery, Buy NFT, FAQ, Contact), each Anton 13px uppercase with `hover` → neon. Nav is `display:none` below `lg` (1024px).
- **Hero heading** (Anton, uppercase): `Beyond earth` / `and ( its ) familiar boundaries`. Responsive font-size 40px / sm:60px / md:75px / lg:90px; line-height 1.05 mobile, 1 tablet+. `max-width: 780px`, offset `margin-left: 8rem` at lg.
- **Cursive accent** "Nft collection" in Condiment (24px→48px responsive), absolutely positioned to the right of the heading, `rotate(-1deg)`, neon, `mix-blend-mode: exclusion`, `opacity: 0.9`.
- **Social icons — desktop:** 3 square 56×56 buttons stacked vertically in the top-right corner, each `.liquid-glass` + `border-radius: 1rem`. Icons: Mail, Twitter, Github (20×20). `hover` → `background: rgba(255,255,255,0.1)`. Shown only at `lg+`.
- **Social icons — mobile:** same 3 buttons centered horizontally below the heading, shown only below `lg`.

## Section 2 — About / Intro (full viewport)

- Full-bleed looping muted autoplaying video, `object-fit: cover`.
- Video: `https://plugin-assets.open-design.ai/plugins/orbis-nft/hf_20260331_151551_992053d1-3d3e-4b8c-abac-45f22158f411-2620ce.mp4`
- Container has generous vertical padding (64px → 96px responsive).
- **Top row** (flex column on mobile, row at lg):
  - Left: heading (Anton, uppercase, 32px→60px): `Hello!` / `I'm orbis`. Overlaid Condiment "Orbis" (neon, `mix-blend exclusion`, 36px→68px), absolutely at bottom-right of heading, slightly rotated.
  - Right: monospace paragraph (14px→16px, uppercase, cream, `max-width: 266px`): "A digital object fixed beyond time and place. An exploration of distance, form, and silence in space".
- **Bottom row** (flex, space-between): two columns, each with 2 identical decorative copies of the same paragraph at `opacity: 0.1` (nearly invisible). Right column hidden below `lg`. On mobile, ghost text uses color `#010828` (dark on the video, effectively invisible).

## Section 3 — NFT Collection Grid

- Background: solid `#010828` (NO video).
- **Header row** (column on mobile, row aligned to bottom at lg):
  - Left: heading (Anton, 32px→60px, uppercase): `Collection of` then an indented second line `Space objects`, where "Space" is Condiment cursive neon and "objects" is Anton. Second line indented `ml-12 / ml-24 / ml-32` responsive (3rem / 6rem / 8rem).
  - Right: a "SEE ALL CREATORS" button — "SEE" large (32px→60px), "ALL" + "CREATORS" stacked smaller (20px→36px) beside it; below the text a neon-green bar (`background: var(--neon)`, height 6px→10px, full button width).
- **Card grid:** `lg:grid-cols-3`, `sm:grid-cols-2`, 1 col mobile, gap 24px. Render the 3 NFT cards from the data array in the seed's `<script>`.
- **Each card:** `.liquid-glass`, `border-radius: 32px`, padding 18px, `hover` → `background: rgba(255,255,255,0.1)`. Inside: a square video container (`padding-bottom:100%` aspect trick), `border-radius: 24px`, `overflow: hidden`, the looping video filling it.
- **Card videos + rarity scores:**
  - `hf_20260331_053923_22c0a6a5-313c-474c-85ff-3b50d25e944a.mp4` → 8.7/10
  - `hf_20260331_054411_511c1b7a-fb2f-42ef-bf6c-32c0b1a06e79.mp4` → 9/10
  - `hf_20260331_055427_ac7035b5-9f3b-4289-86fc-941b2432317d.mp4` → 8.2/10
  (all under `https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/`)
- **Overlay bar** at the bottom of each card's media: a `.liquid-glass` bar, `border-radius: 20px`, padding `16px 20px`, showing a "RARITY SCORE:" label (11px, cream at 70% opacity) and the score value (16px). On the right: a circular purple-gradient button 48×48 (`linear-gradient(to bottom right, #b724ff, #7c3aed)`) with a right-chevron SVG inside, `box-shadow` purple glow, `hover` → `scale(1.1)`.

## Section 4 — CTA / Final

- Background: full-WIDTH video, NOT `object-cover` — use `display:block; width:100%; height:auto` so it renders at native aspect ratio.
- Video: `https://plugin-assets.open-design.ai/plugins/orbis-nft/hf_20260331_055729_72d66327-b59e-4ae9-bb70-de6ccb5ecdb0-afc7a8.mp4`
- **Text content** positioned absolute over the video, right-aligned block offset `lg:pr-[20%] lg:pl-[15%]`:
  - Small "Go beyond" in Condiment cursive (neon, `mix-blend exclusion`, 17px→68px responsive), absolutely at top-left of the heading block, slightly rotated.
  - Heading (Anton, 16px→60px, uppercase): `JOIN US.` / `REVEAL WHAT'S HIDDEN.` / `DEFINE WHAT'S NEXT.` / `FOLLOW THE SIGNAL.` "JOIN US." has extra bottom margin (16px→48px) before the remaining lines.
- **Social icons (bottom-left, absolute):** positioned `left-[8%]`, `bottom-[12%]`→`bottom-[20%]` responsive. A vertical `.liquid-glass` container (`border-radius: 0.5rem`→`1.25rem` responsive) holding 3 stacked icon buttons (Mail, Twitter, Github). Buttons use responsive viewport/rem sizing (`w-[14vw] sm:w-[14.375rem] md:w-[10.78125rem] lg:w-[16.77rem]` and matching heights). Buttons separated by `border-bottom: 1px solid rgba(255,255,255,0.1)` dividers except the last.

## Responsive

Mobile-first with `sm:` (640px), `md:` (768px), `lg:` (1024px) breakpoints throughout. Nav hides below `lg`; hero social switches from vertical-desktop to horizontal-mobile; about right ghost column hides below `lg`; card grid steps 1 → 2 → 3 columns.

## Color Rules — hard

Page background `#010828`, all text cream `#EFF4FF`, neon `#6FFF00` for cursive accents and bars. Do not substitute the neon hue. The only other vivid color is the NFT card's purple arrow-button gradient (`#b724ff` → `#7c3aed`); keep it as-is.
