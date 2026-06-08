---
name: modern-agency
description: "Use this plugin when the user wants a premium modern design-agency landing page (\"Axion Studio\"): a full-viewport shader hero with a pill navbar and live London clock, text-roll hover buttons, an about section with strategy copy and two studio images, and a two-card featured case-studies grid with autoplay video. Invoke for 'agency landing page', 'design studio site', 'creative agency', 'Modern Agency', or when the user references the Axion Studio template."
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

# Modern Agency — "Axion Studio" Landing Page

Produce a premium **design-agency landing page** for "Axion Studio". A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then adjust copy/data only; do not rewrite the CSS or invent a new visual language. The seed already encodes the exact tokens, layout, sections, hover animations, and responsive behavior described below.

This is the authoritative build brief. Follow it exactly — the named colors, clamps, aspect ratios, image/video URLs, and animations are locked.

## Stack

- **Default output:** the single self-contained `example.html` seed (vanilla HTML/CSS/JS). It already includes everything inline and opens with no build step.
- **If the user explicitly asks for a React + TypeScript + Vite + Tailwind project**, port the seed faithfully: same tokens, same markup structure, same breakpoints. Use the `shaders` package (npm `shaders`, components from `shaders/react`: `Swirl`, `ChromaFlow`, `FlutedGlass`, `FilmGrain`) for the real hero background, and `lucide-react` (`ArrowRight`, `Clock`, `Menu`, `X`, `Link`) for icons. **Font: system default — do NOT load a custom font.** Do not change the design while porting.
- In the vanilla seed the WebGL shader stack is approximated with layered CSS animated gradients + an SVG `feTurbulence` grain so it runs with no WebGL dependency. When porting to React, swap that approximation for the real `shaders/react` stack with the exact params below.

## Assets (keep remote — do NOT inline, do NOT swap hosts)

These are large, stable CDN media. Keep the exact URLs; do not re-host, do not inline as data URIs, do not replace with picsum/dicebear/pravatar.

- **About — small image** (`aspect 438/346`): `https://plugin-assets.open-design.ai/plugins/modern-agency/hf_20260516_090123_74be96d4-9c1b-40cf-932a-96f4f4babed3-b47601.webp&w=1280&q=85`
- **About — large image** (`aspect 900/600` mobile, `3/2` desktop): `https://plugin-assets.open-design.ai/plugins/modern-agency/hf_20260516_090133_c157d30b-a99a-4477-bec1-a446149ec3f2-156e2f.webp&w=1280&q=85`
- **Case 1 video (Narrativ):** `https://plugin-assets.open-design.ai/plugins/modern-agency/hf_20260516_122702_390f5305-8719-41d5-ae80-d23ab3796c28-4355cd.mp4`
- **Case 2 video (Luminar):** `https://plugin-assets.open-design.ai/plugins/modern-agency/hf_20260516_123323_f909c2b8-ff6c-4edf-882b-8ebcdbe389b5-2e3db9.mp4`

Each case video has a CSS gradient `.video-fallback` behind it so the card never shows a broken-media box if the CDN is unreachable in the sandbox.

## Tokens (locked)

```
--orange: #F26522;        --orange-hover: #e05a1a;   --chroma: #ff5f03;
--gray-900: #111827;      --gray-600: #4b5563;       --gray-500: #6b7280;
--gray-300: #d1d5db;      --gray-200: #e5e7eb;
--ease: cubic-bezier(0.25, 0.1, 0.25, 1);
--max content width: 1440px (centered, mx-auto)
```

- All animations use `duration 0.5s ease cubic-bezier(0.25,0.1,0.25,1)` unless noted (nav-link color is `0.3s ease`; hover-pill width is `0.3s ease-in-out`).
- Responsive breakpoints = default Tailwind: `sm 640`, `md 768`, `lg 1024`, `xl 1280`.

## SECTION 1 — Hero (`min-height: 100vh`)

Background `#EFEFEF` with the shader stack `absolute inset-0 z-10 pointer-events-none`.

**Shader params (use verbatim when porting to `shaders/react`):**
- `Swirl` — colorA `#ffffff`, colorB `#f0f0f0`, detail 1.7
- `ChromaFlow` — baseColor `#ffffff`; down/left/right/up color `#ff5f03`; momentum 13; radius 3.5
- `FlutedGlass` — aberration 0.61, angle 31, frequency 8, highlight 0.12, highlightSoftness 0, lightAngle -90, refraction 4, shape "rounded", softness 1, speed 0.15
- `FilmGrain` — strength 0.05

**Nav** (`z-20 relative`): white pill navbar (`bg-white rounded-full`, 5px padding) inside a `max-w-[1440px]` container with `p-2 sm:p-3`.
- LEFT: dark circle logo (`w-9 h-9 sm:w-10 sm:h-10 bg-gray-900 rounded-full`) with white "AX" (10/11px, bold, tracking-tight). Then (hidden mobile, `md+`): nav links "Projects / Studio / Journal / Connect" (14px, `text-gray-900 hover:text-gray-500 transition-colors duration-300`, gap-6).
- RIGHT (hidden mobile, `md+`): "Taking on projects for Q1 2026" (13px, `text-gray-600`, hidden below `lg`); Clock icon (lucide, 14) + live "{HH:MM} in London" (13px); CTA pill button `bg-gray-900 text-white` 13px medium, `rounded-full pl-5 pr-2 py-2`, text "Book a strategy call" with the **text-roll** hover (below) and an arrow in a white `w-6 h-6` circle rotating `-45deg` on hover.
- MOBILE: a Menu/Close toggle (`md:hidden`, `bg-gray-900 rounded-full`) with lucide `Menu`/`X`.

**Text-roll hover** (reused by every CTA): button text is duplicated inside `flex-col` in an `overflow-hidden h-[20px]` box; on group-hover translate `-50%` vertically (`duration-500 ease cubic-bezier(0.25,0.1,0.25,1)`). Paired arrow/icon circle rotates `-45deg` on hover with the same easing.

**Mobile menu overlay:** `fixed inset-0 z-50`, `black/60` backdrop, white bottom sheet (`rounded-2xl mx-3 mb-3`) sliding `translate-y-full → 0` (`duration-500 ease cubic-bezier(0.32,0.72,0,1)`). Contains: time badge, nav links (28/32px medium), "Start a project" button with arrow.

**Hero content** (`z-20`): pinned to viewport bottom via a `flex-1` spacer above. `max-w-[1440px]`, `px-5 sm:px-8 lg:px-12`, `pb-14 sm:pb-16 lg:pb-20`.
- Label "Axion Studio" (13/14px, tracking-wide, `mb-5 sm:mb-8`).
- H1 "We craft digital experiences / for brands ready to dominate / their category online." — `clamp(1.75rem,7vw,4.2rem)` mobile, `clamp(2.5rem,5vw,4.2rem)` `sm+`; `font-medium leading-[1.08] tracking-[-0.03em] text-gray-900`. Line breaks hidden on mobile (`<br className="hidden sm:block"/>` with space fallback).
- CTA row (`mt-8 sm:mt-12`, `flex-col sm:flex-row`, `gap-4 sm:gap-5`):
  - **Orange button** `bg-[#F26522] hover:bg-[#e05a1a] text-white`, 13/14px, `rounded-full pl-5 sm:pl-6 pr-2 py-2`, text "Start a project" (text-roll), white `w-7 h-7 sm:w-8 sm:h-8` circle with orange `ArrowRight` rotating `-45deg` on hover.
  - **Partner badge**: white pill, shadow `0 2px 8px rgba(0,0,0,0.08)` → hover `0 4px 16px rgba(0,0,0,0.12)`, `rounded-[4px]`. Inline starburst SVG (`w-5 h-5 sm:w-6 sm:h-6`, `fill-current text-[#E8704E]`), text "Certified Partner" (13/14px medium), dark "Featured" badge (10/11px, `bg-gray-900 text-white px-1.5 sm:px-2 py-0.5 rounded`). The exact starburst path is in `example.html` — reuse it verbatim.

## SECTION 2 — About (`bg-white`)

`pt-16 sm:pt-20 lg:pt-32`, `pb-12 sm:pb-16 lg:pb-24`, `overflow-hidden`, `max-w-[1440px]`.

- Badge row (`px-5 sm:px-8 lg:px-12`, flex gap-3, `mb-6 sm:mb-8`): numbered circle "1" (`w-6 h-6 sm:w-7 sm:h-7 bg-gray-900 text-white` 11/12px semibold) + pill label "Introducing Axion" (12/13px medium, `border-gray-200 rounded-full px-3 sm:px-4 py-1 sm:py-1.5`).
- H2 "Strategy-led creatives, delivering / results in digital and beyond." — `clamp(1.5rem,4vw,3.2rem) font-medium leading-[1.12] tracking-[-0.02em]`, `mb-12 sm:mb-16 lg:mb-28`.
- **Mobile/tablet** (`lg:hidden`): stacked — paragraph (15/17px, `leading-[1.6]`, medium) + orange "About our studio" button, then two images (`flex-col sm:flex-row gap-4 sm:gap-5`): first `sm:w-[45%] aspect-[438/346]`, second `sm:w-[55%] aspect-[900/600]`; both `rounded-xl sm:rounded-2xl object-cover`.
- **Desktop** (`hidden lg:grid`): `grid-cols-[26%_1fr_48%] items-end gap-6 xl:gap-8`. Left col (`self-end`): small image `aspect-[438/346] rounded-2xl`. Center col (`self-start`, flex justify-end): paragraph (16/18px `leading-[1.65]` whitespace-nowrap, `<br/>` between lines) + orange button. Right col (`self-end`): large image `aspect-[3/2] rounded-2xl`.

Paragraph copy: "Through research, creative thinking and iteration we help growing brands realize their digital full potential."

## SECTION 3 — Case Studies (`bg-[#F5F5F5]`)

`pt-16 sm:pt-20 lg:pt-28`, `pb-16 sm:pb-20 lg:pb-28`, `max-w-[1440px]`.

- Badge row (same pattern as §2): number "2", label "Featured client work", `border-gray-300`.
- H2 "Our projects" — same clamp as hero H1 (`clamp(1.75rem,7vw,4.2rem)` / `clamp(2.5rem,5vw,4.2rem)`), `font-medium leading-[1.08] tracking-[-0.03em]`, `mb-10 sm:mb-14 lg:mb-16`.
- Cards grid: `grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 lg:gap-7`, `px-5 sm:px-8 lg:px-12`.

**Card 1 — Narrativ:** video container `aspect-[329/246] rounded-2xl overflow-hidden bg-[#1a1d2e]`, group, cursor-pointer; video `autoPlay muted loop playsInline w-full h-full object-cover`. Hover button (`absolute bottom-4 left-4`): white circle `h-9 w-9` expanding to `w-[148px]` on group-hover (`transition-all duration-300 ease-in-out`); "Learn more" (13px medium, `opacity-0 → 100 delay-100`) + lucide `Link` icon (14, `-rotate-45 → rotate-0` on hover). Desc "Winner of Site of the Month 2025 — an interactive 3D showcase driving record engagement" (13/14px `text-gray-600 mt-4 leading-relaxed`). Title "Narrativ" (14/15px semibold `mt-1`).

**Card 2 — Luminar:** video container `aspect-square rounded-2xl overflow-hidden bg-[#6b6b6b]`, group; same video attrs. Hover button: **dark** circle `bg-gray-900 h-9 w-9` expanding to `w-[168px]`; "View case study" (13px medium white) + white `ArrowRight` (14, `-rotate-45 → rotate-0`). Desc "Transforming a dated platform into a conversion-focused brand experience". Title "Luminar".

## Global styles (index.css when porting)

Standard Tailwind directives plus two defined-but-unused utilities (keep for parity):
- `.liquid-glass`: `rgba(255,255,255,0.01)` bg, `backdrop-filter: blur(4px)`, inset box-shadow, pseudo-element gradient border via `mask-composite`.
- `.liquid-glass-strong`: same but `blur(50px)`, no pseudo-element.

## State / interactions

- **Live clock:** updates every second, `Europe/London` timezone, `HH:MM` format, rendered in both the nav and the mobile-menu time badge.
- **Mobile menu:** toggle opens/closes the overlay and swaps the lucide `Menu` ↔ `X` icon; backdrop click closes.
- **Hover:** text-roll on all CTAs; arrow/link circles rotate; case-study hover pills expand.
- Respect `prefers-reduced-motion`: pause the shader animations.

## Color rules — hard

Palette: orange `#F26522` (hover `#e05a1a`), chroma orange `#ff5f03`, partner-icon orange `#E8704E`, gray-900 `#111827` ink, neutral whites/grays. Card video placeholder bgs `#1a1d2e` / `#6b6b6b`. **Do not introduce a different accent hue** — the orange family is locked. No purple/indigo.
