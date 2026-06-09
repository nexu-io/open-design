---
name: codenest-coding-platform
description: "Use this plugin when the user wants a high-end, dark cinematic hero section for a coding-education / bootcamp landing page (CodeNest): full-screen HLS background video, liquid-glass card, green-accent typography, and a working mobile hamburger menu. Invoke for 'coding bootcamp hero', 'dev course landing page', 'liquid glass hero', 'video background hero', or when the user references the CodeNest template."
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

# CodeNest — Coding Platform Hero

Produce a high-end, dark-themed **hero section** for a coding-education platform called **CodeNest**. A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then adjust copy and data; do not rewrite the CSS or invent a new visual language. The seed already encodes the exact tokens, liquid-glass treatment, glow, grid lines, video wiring, and responsive behavior described below.

This is the authoritative build brief. Follow it exactly — the named colors, fonts, video stream, and effects are locked.

## Stack

- Default output: a single self-contained HTML file (the `example.html` seed). It includes everything inline (CSS + vanilla JS) and loads `hls.js` from a CDN.
- If the user explicitly asks for a **React + Tailwind** project, port the seed faithfully: same tokens, same markup structure, `lucide-react` for icons (`ArrowRight`, `Menu`, `X`), Inter / Plus Jakarta Sans / Instrument Serif (italic) from Google Fonts, and `hls.js` for the video. Do not change the design while porting.

## Background video (keep remote — do NOT inline)

- Full-screen background video via the HLS stream `https://stream.mux.com/tLkHO1qZoaaQOUeVWo8hEBeGQfySP02EPS02BmnNFyXys.m3u8`.
- Use `hls.js` with `enableWorker: false` for sandbox stability. If the browser supports native HLS (`video.canPlayType('application/vnd.apple.mpegurl')`), assign `video.src` directly; otherwise attach via `new Hls({ enableWorker: false })`.
- `<video autoplay muted loop playsinline>`, `object-fit: cover`, fixed full-screen, **opacity 0.6**.
- This large CDN media stays a remote URL — never inline an HLS stream.

## Overlays & atmosphere

- **Left gradient:** `linear-gradient(to right, #070b0a 0%, rgba(7,11,10,0.55) 35%, transparent 70%)`.
- **Bottom-up gradient:** `linear-gradient(to top, #070b0a 0%, rgba(7,11,10,0.4) 30%, transparent 60%)` for readability.
- **Grid system:** three thin vertical lines, `rgba(255,255,255,0.10)`, 1px wide, positioned at **25% / 50% / 75%**. Visible on desktop only (`min-width: 900px`).
- **Central glow:** a large horizontal SVG ellipse glow in the center-top area, cyan/dark-green hue, with a **25px Gaussian blur** (`feGaussianBlur stdDeviation="25"`). Implemented as an inline `<svg>` with a `radialGradient` (`#5ed29c` → `#1f7a5a` → transparent) and `filter` (the blur), positioned `top: 4%; left: 50%; translateX(-50%)`.

## Liquid Glass Card

- 200×200px floating card positioned above the headline, shifted up via `transform: translateY(-50px)`.
- CSS:
  - `background: rgba(255, 255, 255, 0.01)` with `background-blend-mode: luminosity`.
  - `backdrop-filter: blur(4px)`.
  - `box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.1)`.
- **Border effect:** a `::before` pseudo-element with `inset: 0`, `padding: 1.4px`, a 180° white linear gradient, and `-webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)` + `-webkit-mask-composite: xor; mask-composite: exclude` to draw a sharp 1.4px border frame.
- **Content:** `[ 2025 ]` tag (14px) · headline `Taught by <em>Industry</em> Professionals` (18px, the word **Industry** in `Instrument Serif` italic) · small description (11px, muted).

## Hero content & typography

- **Eyebrow:** `Career-Ready Curriculum` — Plus Jakarta Sans, bold, 11px, uppercase, letter-spacing ~0.16em, color `#5ed29c`.
- **Main headline:** `LAUNCH YOUR CODING CAREER.` — Inter ExtraBold (800), uppercase, `letter-spacing: -0.03em`, line-height ~0.98. Scale `clamp(40px, 8vw, 72px)` (40px mobile → 72px desktop). The **final period must be green** `#5ed29c` (wrap it in a `.dot` span).
- **Description:** `Master in-demand coding skills...` — Inter, 14px, `rgba(255,255,255,0.7)`, `max-width: 512px`.
- **Primary CTA:** `Get Started` button with an `ArrowRight` icon. `border-radius: 999px`, background `#5ed29c`, text `#070b0a`, uppercase, bold.

## Global navigation

- **Header:** absolute/sticky at top, transparent over the video. White minimalist logo (inline `</>` chevron SVG + wordmark).
- **Desktop menu:** links `PROJECTS`, `BLOG`, `ABOUT`, `RESUME` in Inter 16px; hover color `#5ed29c`. Shown at `min-width: 900px`.
- **Mobile menu:** a functional hamburger (`Menu` icon) that toggles a full-screen dark overlay (`X` to close) listing the same links. JS toggles an `.open` class; closing also happens on link click.

## Required imports

- Fonts: **Inter** (400–800), **Plus Jakarta Sans** (600–800), **Instrument Serif** (italic) from Google Fonts.
- Icons: inline SVG in the seed (in a React port use `lucide-react`: `ArrowRight`, `Menu`, `X`).
- Library: `hls.js` (CDN in the seed) for the video stream.

## Animation / interaction (vanilla seed → framework map)

- CTA hover: `translateY(-2px)` + green glow shadow.
- Nav-link hover: color → `#5ed29c`.
- Mobile menu: class toggle drives an opacity/pointer-events transition (in React: `useState` boolean).
- Video autoplay is wired on `canplay` and immediately, with a guarded `play().catch()` so a blocked autoplay never throws.

## Responsive

- `< 900px`: hide desktop nav and grid lines, show hamburger; headline scales down toward 40px via the `clamp`.
- `≥ 900px`: desktop nav inline, vertical grid lines visible.

## Color rules — hard

- Locked palette: base `#070b0a`, single green accent `#5ed29c` (and its darker companion `#1f7a5a` only inside the glow gradient), neutral whites at reduced opacity. **Avoid purple/indigo entirely.** Do not substitute the green accent with teal/blue/lime — `#5ed29c` is locked.
