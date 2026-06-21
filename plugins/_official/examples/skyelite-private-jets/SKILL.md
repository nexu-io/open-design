---
name: skyelite-private-jets
description: "Use this plugin when the user wants a premium private-jet landing page hero: a fullscreen autoplay CloudFront video background, a max-w-7xl nav with a Lucide hamburger mobile dropdown, and a centered overlapping two-line headline (Premium. / Accessible.) with Discover + Book Now pill CTAs. Invoke for 'private jet landing', 'aviation hero', 'luxury travel hero', or when the user references the SkyElite template."
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

# SkyElite Private Jets — Premium Hero Landing

Produce a premium **private jet landing-page hero** with a fullscreen video background, a clean centered overlapping headline, and two pill CTAs. A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then adjust copy and data; do not rewrite the CSS or invent a new visual language. The seed already encodes the exact tokens, video URL, layout, typography, and responsive behavior described below.

This is the authoritative build brief. Follow it exactly — the named colors, font weights, video URL, spacing, and breakpoints are locked.

## Stack

- Default output: a single self-contained HTML file (the `example.html` seed). It already includes everything inline.
- If the user explicitly asks for a **React + TypeScript + Vite + Tailwind** project, port the seed faithfully: same tokens, same markup structure, `lucide-react` for the `Menu`/`X` icons, `useState` for the mobile-menu toggle, Inter (weights 400/500/600/700) from Google Fonts applied to the whole body. Do not change the design while porting.

## Video Background (locked)

Use this exact CloudFront video URL (keep it remote — large stable CDN media):

`https://plugin-assets.open-design.ai/plugins/skyelite-private-jets/hf_20260328_091828_e240eb17-6edc-4129-ad9d-98678e3fd238-86655b.mp4`

- Attributes: `autoplay muted loop playsInline`.
- `object-fit: cover`, fills the entire hero viewport (`height: 100vh`), `position: absolute; inset: 0; z-index: 0`. **No overlay.**

## Typography

- **Inter** loaded from Google Fonts, weights **400, 500, 600, 700**, applied to the entire `body` via CSS.

## Layout Structure

- Outer page: `min-height: 100vh`, background `--gray-50` (`#f9fafb`).
- Hero section: `position: relative; height: 100vh; overflow: hidden`.
- Content wrapper: `position: relative; z-index: 1; height: 100%; display: flex; flex-direction: column` (sits above the video).
- Main content area: `flex: 1; display: flex; align-items: center; justify-content: center`.

## Navigation Bar

- Container: `max-width: 80rem` (7xl), centered, `padding: 24px 32px` (py-6 px-8), `display: flex; align-items: center; justify-content: space-between`.
- **Brand** on the left: "SkyElite" — `font-size: 1.5rem` (text-2xl), `font-weight: 600`, color `--gray-900` (`#111827`).
- **Desktop menu** (hidden on mobile, `md:flex`), gap 40px: `Start`, `Story`, `Rates`, `Benefits`, `FAQ`. Links are `--gray-900` with `hover` → `--gray-700` (`#374151`), `transition: color`.
- **Mobile hamburger** button (visible only ≤767px): Lucide `Menu` ↔ `X` icons swap on toggle. Use `useState` (React) / a vanilla click handler (HTML).
- **Mobile dropdown**: absolutely positioned below the nav, `background: rgba(255,255,255,0.95)`, `backdrop-filter: blur(12px)`, `border-radius: 16px`, soft shadow, padded; the same five links stacked, each link has a hover background. Hidden by default; toggles open/closed with the hamburger.

## Hero Content (centered, pulled up)

- Wrapper: centered text, `margin-top: -320px` (`-mt-80`) to pull the block up over the video.
- **Eyebrow label**: "PRIVATE JETS" — `text-sm`, `font-weight: 600`, color `--gray-600` (`#4b5563`), `letter-spacing: 0.1em` (tracking-wider), uppercase, `margin-bottom: 16px`.
- **Headline** — two lines with an overlapping effect, `font-weight: 400` (font-normal), `line-height: 1` (leading-none), `letter-spacing: -0.04em` (tracking-tighter):
  - Line 1: "Premium." — color `--gray-500` (`#6b7280`).
  - Line 2: "Accessible." — color `--ink` (`#202A36`), `margin-top: -12px` so it overlaps line 1.
  - Sizes: base `3.75rem` (text-6xl), `md` `4.5rem` (text-7xl), `lg` `6rem` (text-8xl).
- **Subtitle**: "Your dedication deserves recognition." — `text-lg` (md: `text-xl`), color `--gray-600`, vertical margin 24px, `max-width: 42rem` (max-w-2xl).
- **CTA row** (gap 16px, centered):
  - **Discover** button: `padding: 8px 16px`, `border-radius: 9999px` (rounded-full), background `--gray-300` (`#d1d5db`), text `--gray-800` (`#1f2937`), `font-weight: 500`, hover background `--gray-400` (`#9ca3af`).
  - **Book Now** button: same padding + rounded-full, white text, background `--ink` (`#202A36`), hover background `#1a2229`, smooth `transition-colors`.

## CSS Variables (`:root`) — locked

```
--ink: #202A36;        --ink-hover: #1a2229;
--gray-50: #f9fafb;    --gray-300: #d1d5db;   --gray-400: #9ca3af;
--gray-500: #6b7280;   --gray-600: #4b5563;   --gray-700: #374151;
--gray-800: #1f2937;   --gray-900: #111827;
```

## Animations / Transitions

- All interactive elements (nav links, both CTAs): `transition-colors` only (color / background-color), ~0.2s ease. No transforms, no scale — keep it clean and restrained.
- Mobile menu opens/closes by toggling a class; swap the `Menu`/`X` icon at the same time.

## State / Interactions

- `isMobileMenuOpen` (React `useState`) / a boolean in vanilla JS toggles the mobile dropdown and swaps the hamburger icon.
- Tapping any link in the mobile dropdown closes it.

## Responsive (mobile-first)

- Base (mobile): desktop menu hidden, hamburger shown; headline `text-6xl`; subtitle `text-lg`. Pull-up reduced so content stays on screen.
- `md` (≥768px): desktop menu visible, hamburger hidden; headline `text-7xl`; subtitle `text-xl`.
- `lg` (≥1024px): headline `text-8xl`.

## Color Rules — hard

Neutral premium palette only: grays `#f9fafb → #111827`, plus the locked dark ink `#202A36` (hover `#1a2229`). **No purple/indigo, no saturated accent.** The video carries all the color; the UI stays neutral. Keep all text contrast-safe over the light-toned video frames.
