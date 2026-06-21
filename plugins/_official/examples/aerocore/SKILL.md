---
name: aerocore
description: "Use this plugin when the user wants a premium dark-to-light aerospace / propulsion marketing site: a scroll-driven gradient hero with parallax wordmark and an engine still, a film-card that grows from a mission thumbnail into a fullscreen sticky video, a pinned tabbed showcase, a bento capabilities grid with looping video cards and a tool marquee, an animated dark stats chart with category tabs, a horizontal video-story rail, and a starfield footer. Invoke for 'aerospace landing', 'engine / propulsion site', 'EngineTech', 'scroll-cinematic hero', or when the user references the AeroCore template."
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

# AeroCore — Cinematic Aerospace Propulsion Landing

Produce a premium, scroll-cinematic **aerospace / custom-engine marketing site** (sample brand: *EngineTech*). A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then change only copy, data, and the remote media URLs; do **not** rewrite the CSS, the scroll math, or the section structure. The seed already encodes every token, layout, and animation locked below.

This is the authoritative build brief. The named colors, fonts, scroll constants, video URLs, and keyframes are locked.

## Stack

- Default output: a single self-contained HTML file (the `example.html` seed) with one `<style>` block and one vanilla-JS `<script>`. No build step.
- The seed maps the original React/TS/Tailwind/Framer-Motion intent down to vanilla:
  - The hero is a Custom Element `<engine-hero>` driven by a `requestAnimationFrame` loop reading `getBoundingClientRect()` (replaces `useScroll`/`useTransform`).
  - Scroll-driven transforms are written as inline `--scroll-y` CSS variables and inline `opacity`.
  - The showcase film-grow and tab progress are an rAF loop, not Framer layout animation.
  - The stats chart re-renders on tab click and toggles `.is-ready` to fire CSS keyframes (replaces `whileInView`/stagger).
- If the user explicitly asks for a React + TypeScript + Vite + Tailwind project, port the seed faithfully: same tokens, same DOM structure, **Phosphor Icons** (`@phosphor-icons/web` or `@phosphor-icons/react`), and the **Geist** (fallback **Inter**) font family from Google Fonts. Do not change the design while porting.

## Fonts & Icons

- Font stack: `"Geist", "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Load Geist + Inter from Google Fonts via `<link>`. Many headings use ultra-light weights (200–300); keep them.
- Icons: **Phosphor** regular set, loaded from `https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css`, used as `<i class="ph ph-*">`. Locked glyphs include `ph-arrow-elbow-down-right`, `ph-arrow-up-right`, `ph-gear-six`, `ph-fire`, `ph-gauge`, `ph-atom`, `ph-wrench`, `ph-cpu`, `ph-wave-sine`, `ph-shield-check`, `ph-rocket-launch`, `ph-chart-line-up`.

## CSS Variables (`:root`) — locked

```
--font-sans: "Geist", "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--geist-background: #ffffff;
--geist-foreground: #0a0a0a;
--geist-muted: #666666;
--hero-blue: #7191d0;
--hero-blue-soft: #aab8d5;
--hero-cloud: #ece9e6;
--hero-bg-bottom: linear-gradient(180deg, var(--hero-blue) 0%, var(--hero-blue-soft) 55%, var(--hero-cloud) 100%);
--hero-bg-top: linear-gradient(180deg, rgb(255 255 255 / 0.04), rgb(255 255 255 / 0.12));
--hero-max-width: 1820px;
```

The page content width is `min(100% - 96px, var(--hero-max-width))` (gutters tighten to 48px / 32px at the breakpoints). Body is white with near-black text; sections alternate between white (`#ffffff` / `#f7f8f8`) and dark (stats `#111414→#171a1a`, footer `#000`).

## Section order (locked — 6 page sections + hero custom element + footer)

1. `<engine-hero>` — scroll hero (injected by the custom element).
2. `.mission#company` — mission statement + button + support copy + 16:9 media slot.
3. `.showcase#technology` — pinned tabbed showcase (600vh) with film-grow.
4. `.capabilities#solutions` — bento capabilities grid.
5. `.stats#our-edge` — dark animated stats chart with 4 category tabs.
6. `.video-stories#our-team` — horizontal scroll-snap video rail.
7. `.site-footer` — starfield dots + big wordmark.

## 1. Hero (`<engine-hero>`, `.hero` 180vh, min 1238px)

- Sticky `.hero__background` (100vh) whose three gradient stops (`--hero-top/mid/bottom`) are **lerped from blue→warm-white** as you scroll (start `[113,145,208]/[170,184,213]/[236,233,230]`, end `[240,232,220]/[238,229,216]/[236,226,210]`). A twinkling `.hero__stars` layer animates `hero-stars-twinkle 4.8s alternate`.
- Fixed `.hero__nav` (max-width grid `minmax(220px,1fr) auto minmax(180px,1fr)`): brand mark (a white circle with a `clip-path` "engine fins" wedge), centered nav links built from `navItems`, and a CTA pill "Get In Touch". Nav has three scroll states: at-top (transparent white), `nav--scroll-down` (frosted white pill, dark text, `border-radius:40px`, blur 12px), `nav--scroll-up` (slides off `translateY(-100px)`).
- Title is split into a fixed `.hero__title` ("Powering") and a fixed `.hero__title-row` ("the" + "Ship", the third line nudged `translateX(112px)`), font-size `clamp(144px,18vw,285px)`, weight 200. Both parallax via `--scroll-y` (`scrollProgress * -120`).
- `.engine-visual` is a fixed, centered engine still that parallaxes up faster (`scrollProgress * -250`) — the Cloudinary PNG `https://plugin-assets.open-design.ai/plugins/aerocore/hero-engine_isebcf-b0bfea.webp`. This is a large stable-CDN still; keep it remote.
- `.hero__caption` bottom-left with a 1px rule. Title/row/caption/visual all fade out between 0.9vh and 1.35vh of scroll; `.hero.is-past` hard-hides them once the hero passes.

## 2. Mission (`.mission#company`, white, `margin-top:-12vh` to overlap the hero)

Grid: `minmax(240px,0.95fr) minmax(0,2fr)` × `auto minmax(360px,1fr)`. Eyebrow (top-left, bold), big light statement `h2` (weight 260) top-right with a bordered `.mission__button` (square Phosphor icon tile `#d8e8ff` that nudges on hover), a large muted `.mission__support` paragraph bottom-left, and an empty 16:9 `.mission__media` bottom-right. **The `.mission__media` slot is the anchor the showcase film grows out of — leave it empty in markup; the JS film starts at its rect.**

## 3. Showcase (`.showcase#technology`, 600vh, sticky 100vh)

- `ShowcaseSection` (vanilla class) appends a fixed `.showcase-film` to `<body>` containing a looping `<video>` (`https://plugin-assets.open-design.ai/plugins/aerocore/6853-720-41905c.mp4`, poster = the Cloudinary engine PNG) + a black overlay.
- Phase A: while the mission media is on screen and not yet scrolled past, the film is pinned to the `.mission__media` rect. Once its center crosses mid-viewport it locks and, over one viewport of scroll, **grows (`easeOutCubic`) to fill the full screen** (top/left→0, width/height→viewport), overlay fades to 0.22.
- Phase B: with the film full-screen, `.showcase__ui` fades in: a `.showcase__panels` stack (num / light `clamp(38px,4.4vw,80px)` title with `<br>` / desc) on the left and a right-aligned `.showcase__tabs-nav`. Scroll progress past `TAB_START=0.08` selects the active tab/panel among the 4 `TABS` (`is-active` toggles opacity/translate). The film hard-hides when `.showcase` bottom passes.
- `TABS` = 4 entries (`01 Precision Manufacturing` … `04 Mission Certified`) with `title` (contains `<br>`) and `desc`. Keep all four.

## 4. Capabilities (`.capabilities#solutions`, `#f7f8f8`)

Header: light `h2`, muted `p`, and a pill `.capabilities__button` "Start a Program". Bento `.capabilities__grid` = 3 columns:

- **Col 1** `.cap-card--tall.cap-card--media`: full-bleed looping video (`https://plugin-assets.open-design.ai/plugins/aerocore/45229-720-74e6d9.mp4`), bottom shade, "Program Background" label, and a 3-row `.cap-card__timeline` (2026 / 2025 / 2024 program rows: year · dot · bold title · muted detail).
- **Col 2 stack**: a `.cap-card--quote` (gradient card, "Mission Voice", blockquote, attributed to *Dr. Lena Morris*) over a `.cap-card--metric.cap-card--video-panel` (looping video `https://plugin-assets.open-design.ai/plugins/aerocore/23211-720-e83442.mp4`, centered giant `2K` metric, caption "Highly Qualified Engineers").
- **Col 3 stack** (`--systems`): a tall `.cap-card--tools-media` video card (`https://plugin-assets.open-design.ai/plugins/aerocore/23843-720-35899f.mp4`) with "Core Systems" label and a **two-row tool marquee** (`marquee-left 24s` / `marquee-right 28s`, each row duplicated for a seamless `-50%` loop), over a `.cap-card--contact#contact` row (email link + phone + circular `ph-arrow-up-right` button).

Responsive: ≤1080px → 2 cols (last stack spans full width as 2 cols); ≤760px → single column.

## 5. Stats (`.stats#our-edge`, dark gradient)

- Header: light `h2` left, `.stats__summary` right (fades in via `.is-visible`).
- 4 `.stats__tab` buttons (`cities` / `materials` / `fuels` / `hydrogen`) with an animated gradient underline (`scaleX`). Default active = `cities`.
- `StatsSection` (vanilla) re-renders `.stats__chart` on tab change: a head row, then 4 `.stats__bar-row`s per dataset. Each row: label + note, a `.stats__track` containing a faint `.stats__range` (operating envelope, `--range-start`/`--range-width`), a gradient `.stats__bar` (`--bar-value`, fills via `stats-fill`), a `.stats__value`, and a `.stats__trace` of glowing spark points. Animations fire when `.stats__chart.is-ready` is added (staggered by `--bar-delay = index*90ms`). An 11-tick axis (`0…100`) sits under the bars.
- `DATASETS` holds all 4 categories × 4 bars (value/target/rangeStart/rangeEnd/unit/note/trace). Keep the full dataset shape; only swap labels/numbers for a rebrand.

## 6. Video stories (`.video-stories#our-team`, `#f7f8f8`)

Header (`h2` + `p`), then a horizontal `.video-stories__rail` (scroll-snap, hidden scrollbar, `grid-auto-columns: minmax(520px,34vw)`) of 5 `.story-card`s — each a looping 16:9 `<video>` (Cloudfront `d8j0ntlcm91z4.cloudfront.net/...mp4`, large stable CDN, keep remote) + kicker / `h3` / meta. Inactive cards are dimmed `opacity:0.54` and brighten on hover/focus. A `.video-stories__footer` progress bar reads `05 / 05`.

## 7. Footer (`.site-footer`, black)

A `.footer-dots` band with a `footerDotsMove 18s` drifting starfield, then `.site-footer__top` (big light `h2` + three nav columns), a giant `.site-footer__brand` wordmark (`font-size: clamp(58px,11.1vw,214px)`, with the same fin clip-path mark), and a tiny legal row.

## Animations / scroll — locked

- Hero gradient color-lerp, parallax (`--scroll-y`), and fade are all computed in the `<engine-hero>` rAF loop. Keep the constants: title/row `-120`, caption `-60`, engine `-250`; fade window `0.9vh → 1.35vh`.
- Showcase film growth uses `easeOutCubic` over one viewport; UI/tab progress uses `easeInOutCubic`; `TAB_START = 0.08`.
- Stats keyframes: `stats-row-in`, `stats-fill`, `stats-range-in`, `stats-point-in`; marquees `marquee-left/right`; stars `hero-stars-twinkle`; footer `footerDotsMove`.

## Assets — sources

- Hero engine still: Cloudinary PNG (remote, stable CDN).
- Capability + showcase loop videos: `assets.mixkit.co/videos/*-720.mp4` (remote).
- Story-rail videos: `d8j0ntlcm91z4.cloudfront.net/...mp4` (remote).
- No avatars or generated placeholder images are used. If a rebrand needs an avatar, emit an inline `data:image/svg+xml;base64,…` URI — never `i.pravatar.cc`, `api.dicebear.com`, or any remote avatar host (they 403 in the preview sandbox).

## Color rules — hard

Cool aerospace palette only: hero blues `#7191d0` / `#aab8d5`, warm cloud `#ece9e6`, near-black `#0a0a0a`/`#111414`, off-whites `#f7f8f8`/`#ffffff`, mission accent tile `#d8e8ff`, stat gradient `#8fb0ef`/`#d6e3ff`. Do **not** introduce purple/indigo/neon or change the hero blue→warm-white scroll lerp. Keep heading weights ultra-light (200–300).

## Responsive breakpoints — locked

`1180px`, `1080px`, `980px`, `860px`, `760px`, `620px`, `560px` — each already tuned in the seed (grid collapses, nav simplifies, hero/title clamps shrink, stats tabs become a horizontal scroller, rail columns narrow). Do not drop breakpoints when editing.
