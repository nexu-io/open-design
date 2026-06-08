---
name: prisma-creative-studio
description: "Use this plugin when the user wants a dark, moody, cinematic creative-studio / collective landing page with a warm cream palette, a full-bleed hero video with a giant word-pull-up wordmark, an italic-serif About statement with scroll-linked character reveal, and a 4-column Features grid (one video card + three checklist cards). Invoke for 'creative studio landing', 'film collective site', 'cinematic agency page', 'Prisma studio', or when the user references the Prisma Creative Studio template."
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

# Prisma Creative Studio — Cinematic Studio Landing

Produce a dark, moody, cinematic landing page for a creative studio / collective named **Prisma**, with a warm cream palette. A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then adjust copy and data only; do not rewrite the CSS or invent a new visual language. The seed already encodes the exact tokens, fonts, layout, noise textures, and the four signature animations described below.

This is the authoritative build brief. Follow it exactly — the named colors, fonts, video URLs, breakpoints, and animation parameters are locked.

## Stack

- Default output: a single self-contained HTML file (the `example.html` seed). It already includes everything inline — Google Fonts via `<link>`, inline SVG icons, inline base64 SVG noise textures, and one vanilla-JS `<script>`.
- If the user explicitly asks for a **React + TypeScript + Vite + Tailwind** project, port the seed faithfully: same tokens, same markup structure, `framer-motion` for animations, `lucide-react` (`ArrowRight`, `Check`) for icons, Almarai + Instrument Serif from Google Fonts. Do not change the design while porting. Map the vanilla helpers back to their framework originals (see Animations).

## Fonts

Load from Google Fonts:
- **Almarai** (weights 300, 400, 700, 800) — global default font.
- **Instrument Serif** (italic only) — italic accent text in the About heading segment and `fontFamily.serif`.

Global: `* { font-family: 'Almarai', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif; }`

## Color system — locked

- Background: black `#000000` globally; `#101010` for the About card; `#212121` for Features cards.
- Primary text color: `#E1E0CC` (applied inline; slightly different from the Tailwind token).
- Tailwind `colors.primary`: `#DEDBC8` (warm cream — `text-primary`, `text-primary/70`, `bg-primary`).
- Gray text: `text-gray-400` (`#9ca3af`), `text-gray-500` (`#6b7280`).
- Navbar link color: `rgba(225, 224, 204, 0.8)`, hover `#E1E0CC` (inline styles).
- No purple/indigo. The palette is black + warm cream + greys only.

## Custom CSS utilities (noise)

Two inline-SVG `feTurbulence` fractal-noise data URIs (already in the seed — keep them, do not re-fetch remote noise):
- `.noise-overlay` — `baseFrequency: 0.85, numOctaves: 3`. Overlaid on the hero video at `opacity: 0.7; mix-blend-mode: overlay; pointer-events: none`.
- `.bg-noise` — `baseFrequency: 0.9, numOctaves: 4`. Subtle background in Features at `opacity: 0.15`.

## Section 1 — Hero

- Full viewport height (`h-screen`). Section padding `p-4 md:p-6` creates an inset; inner container is `rounded-2xl md:rounded-[2rem]` + `overflow-hidden`.
- **Background video** (fills container, `object-cover`, `autoPlay loop muted playsInline`):
  `https://plugin-assets.open-design.ai/plugins/prisma-creative-studio/hf_20260405_170732_8a9ccda6-5cff-4628-b164-059c500a2b41-ee5471.mp4`
- Over the video: `.noise-overlay` at `opacity-[0.7] mix-blend-overlay`, then a gradient `bg-gradient-to-b from-black/30 via-transparent to-black/60`.
- **Navbar** — black pill hanging from the top edge, centered: `bg-black rounded-b-2xl md:rounded-b-3xl px-4 py-2 md:px-8`. Five items: "Our story", "Collective", "Workshops", "Programs", "Inquiries". Text `text-[10px] sm:text-xs md:text-sm`; gap `gap-3 sm:gap-6 md:gap-12 lg:gap-14`; link color `rgba(225,224,204,0.8)`, hover `#E1E0CC`.
- **Hero content** — bottom-aligned (`absolute bottom-0 left-0 right-0`), 12-column grid: left 8 cols = heading, right 4 cols = description + CTA.
  - Giant wordmark "Prisma" via `WordsPullUp`: `text-[26vw] sm:text-[24vw] md:text-[22vw] lg:text-[20vw] xl:text-[19vw] 2xl:text-[20vw]`, `font-medium leading-[0.85] tracking-[-0.07em]`, color `#E1E0CC`. Superscript `*` on the final "a": `absolute top-[0.65em] -right-[0.3em] text-[0.31em]`.
  - Description `text-primary/70 text-xs sm:text-sm md:text-base`, `line-height: 1.2`: "Prisma is a worldwide network of visual artists, filmmakers and storytellers bound not by place, status or labels but by passion and hunger to unlock potential through our unique perspectives." — fade up from `y:20`, delay 0.5s, ease `[0.16, 1, 0.3, 1]`.
  - CTA "Join the lab" — `bg-primary rounded-full`, black text, `font-medium text-sm sm:text-base`; right side a `bg-black rounded-full w-9 h-9 sm:w-10 sm:h-10` circle with a cream `ArrowRight`. Hover: `gap` grows (`hover:gap-3`), circle `group-hover:scale-110`. Fade up from `y:20`, delay 0.7s, same ease.

## Section 2 — About

- `bg-black`, padded, centered. Inner card `bg-[#101010] max-w-6xl` centered text.
- Small label "Visual arts" in `text-primary text-[10px] sm:text-xs`.
- **Heading** via `WordsPullUpMultiStyle` with 3 segments:
  1. "I am Marcus Chen," — `font-normal` (Almarai).
  2. "a self-taught director." — `italic font-serif` (Instrument Serif italic).
  3. "I have skills in color grading, visual effects, and narrative design." — `font-normal`.
  Container: `text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl max-w-3xl mx-auto leading-[0.95] sm:leading-[0.9]`. Words pull up `y:20→0`, staggered 0.08s.
- **Body paragraph** with scroll-linked per-character opacity reveal:
  "Over the last seven years, I have worked with Parallax, a Berlin-based production house that crafts cinema, series, and Noir Studio in Paris. Together, we have created work that has earned international acclaim at several major festivals."
  `text-[#DEDBC8] text-xs sm:text-sm md:text-base`. Each character is an `AnimatedLetter`. `useScroll` with target offset `['start 0.8', 'end 0.2']`; each char's opacity goes `0.2 → 1` based on scroll. Char staggering: `charProgress = index / totalChars`, mapped over range `[charProgress - 0.1, charProgress + 0.05]`.

## Section 3 — Features

- `min-h-screen bg-black` with `.bg-noise` overlay at `opacity-[0.15]`.
- Header via `WordsPullUpMultiStyle`:
  - Line 1: "Studio-grade workflows for visionary creators." (cream).
  - Line 2: "Built for pure vision. Powered by art." (`text-gray-500`).
  Both `text-xl sm:text-2xl md:text-3xl lg:text-4xl font-normal`.
- **4-column card grid** (`lg:h-[480px] gap-3 sm:gap-2 md:gap-1`). Each card enters with scale `0.95→1` + fade, `useInView (once, margin "-100px")`, staggered 0.15s, ease `[0.22, 1, 0.36, 1]`.
  - **Card 1 — Video:** full-bleed video background `https://plugin-assets.open-design.ai/plugins/prisma-creative-studio/hf_20260406_133058_0504132a-0cf3-4450-a370-8ea3b05c95d4-4401cf.mp4` (`autoPlay loop muted playsInline object-cover`). Bottom text "Your creative canvas." in `#E1E0CC`.
  - **Card 2 — "Project Storyboard." (01):** `bg-[#212121]`, small `10x10 sm:12x12 rounded` icon at top from `https://images.higgs.ai/?default=1&output=webp&url=...hf_20260405_171918_4a5edc79-d78f-4637-ac8b-53c43c220606.png&w=1280&q=85`, title + number, 4 checklist items (green `Check` icons), "Learn more" link with arrow rotated `-45deg`.
  - **Card 3 — "Smart Critiques." (02):** same layout; icon `...hf_20260405_171741_ed9845ab-f5b2-4018-8ce7-07cc01823522.png...`; 3 checklist items (AI analysis, creative notes, tool integrations).
  - **Card 4 — "Immersion Capsule." (03):** same layout; icon `...hf_20260405_171809_f56666dc-c099-4778-ad82-9ad4f209567b.png...`; 3 checklist items (notification silencing, ambient soundscapes, schedule syncing).
  - All checklist items: `Check` icon in `text-primary` + `text-gray-400` description. "Learn more" uses `ArrowRight` rotated `-45deg`.

## Shared animation components

- **WordsPullUp:** split text by spaces; each word is a `motion.span` sliding `y:20→0`, staggered delay. `useInView (once: true)`. `showAsterisk` prop adds a superscript `*` after the final word's last "a".
- **WordsPullUpMultiStyle:** array of `{text, className}` segments → split into individual words preserving per-word className; same pull-up; words wrapped in `inline-flex flex-wrap justify-center`.

In the vanilla seed these map to: `whileInView` → `IntersectionObserver` adding an `.in` class that releases a CSS `transform/opacity` transition; the per-character `useScroll/useTransform` reveal → a passive `scroll` listener computing per-char progress and writing inline `opacity`. Keep these mechanics when staying vanilla; restore framer-motion when porting to React.

## Responsive breakpoints

Fully responsive. Features grid: 1-col (mobile) → 2-col (`md`) → 4-col (`lg`). Hero wordmark scales `26vw → 19vw`. Navbar gaps compress on mobile. All padding/font-sizes/spacing use Tailwind responsive prefixes (`sm/md/lg/xl/2xl`).

## Color rules — hard

Black + warm cream + grey only. No purple/indigo, no other accent hue. Cream `#E1E0CC` for primary text/headings, `#DEDBC8` for the Tailwind `primary` token, greys `#9ca3af`/`#6b7280` for secondary text. Keep the cinematic, moody, low-light feel — never brighten the backgrounds.
