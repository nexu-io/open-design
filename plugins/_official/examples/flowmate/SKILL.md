---
name: flowmate
description: "Use this plugin when the user wants a modern AI-automation SaaS landing page: a fixed 240px sidebar, blurred sticky navbar, a PPMondwest serif hero, a liquid-glass typewriter card over a looping product video, a 6-card features grid, and an auto-rotating 5-card carousel. Invoke for 'FlowMate', 'workflow automation landing page', 'plain-English automation site', or when the user references the FlowMate template."
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

# FlowMate — AI Workflow Automation Landing Page

Produce a modern, production-ready landing page for **FlowMate**, an AI workflow automation platform. A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then adjust copy and data; do not rewrite the CSS or invent a new visual language. The seed already encodes the exact tokens, fonts, layout, sections, and animations described below.

This is the authoritative build brief. Follow it exactly — the named colors, the custom font URL, the asset URLs, and the animations are locked.

## Stack

- Default output: a single self-contained HTML file (the `example.html` seed). It already includes everything inline.
- If the user explicitly asks for a **React + TypeScript + Vite + Tailwind** project, port the seed faithfully: same tokens, same markup structure, same sections, `lucide-react` for icons, **Framer Motion** for the scroll/carousel animations, Inter (300–700) from Google Fonts plus the PPMondwest `@font-face`. Do not change the design while porting. Map: Framer `whileInView`/`TextFade` → `IntersectionObserver` toggling a CSS class; carousel `AnimatePresence` slide → a `transform: translateX` on the track with `cubic-bezier(0.32, 0.72, 0, 1)`; typewriter → a `setTimeout` loop at 50ms/char.

## Design System (locked)

CSS variables / colors:

```
--bg: #fefffc;            /* off-white background */
--text-primary: #2c2c2c;  /* dark gray */
--text-secondary: #444141;
--text-tertiary: #646464;
--text-muted: #b4b8b4;
--border-1: #dde3dd;      /* sidebar + login button border */
--border-2: #dee2de;      /* feature card border */
--border-3: #e8e8e8;      /* section separators */
--border-hover: #b8beb8;  /* feature card hover border */
--hover-bg: #eef1ed;      /* active nav + icon backgrounds */
```

Button black is `#000` with hover `--text-primary` (`#2c2c2c`).

Typography:
- Custom display font **PPMondwest** (serif), loaded via `@font-face` from `https://www.generalintelligencecompany.com/_next/static/media/17330fd087386262-s.p.woff2`. Used for: brand wordmark, hero `h1`, all section `h2`, carousel card titles.
- Body/system font: **Inter** (weights 300–700) from Google Fonts, plus system fallbacks.
- Global: `font-kerning: none`, `letter-spacing: -0.04em`, `scroll-behavior: smooth`.

## Layout Structure

- **Desktop (≥1024px):** fixed sidebar 240px on the left; content area `margin-left: 240px`; navbar fixed at the top of the content area (`left: 240px`).
- **Tablet/Mobile (<1024px):** no sidebar; full-width navbar (`left: 0`); stacked content.

## Sidebar (desktop only, ≥1024px)

- Fixed, 240px wide, full height, `border-right: 2px solid #dde3dd`, background `#fefffc`.
- Logo image at top: `https://plugin-assets.open-design.ai/plugins/flowmate/hf_20260405_072635_e0ca60b6-0b6c-49a3-825d-b2b6a53dd63d-871e7b.webp&w=1280&q=85` (keep this remote higgs.ai CDN URL — do NOT swap for a different logo host).
- Nav items (inline Lucide-style SVG icon + label): **Home, Video, Features, Cards**.
- Active state: `background: #eef1ed; color: #2c2c2c`. Inactive: `color: #b4b8b4` with hover → `#eef1ed`.
- Active item tracked by `IntersectionObserver` scroll spy over the four section anchors.

## Navbar

- Fixed at top, `background: rgba(254,255,252,0.9)` with `backdrop-filter: blur(8px)`, `border-bottom: 1px solid #e8e8e8`, height 72px.
- Desktop `left: 240px`; mobile/tablet `left: 0`.
- Brand "FlowMate" in PPMondwest — **28px mobile, 32px desktop**.
- Right side: "Pricing" and "Community" links (`display: none` below 1024px); "Log in" button (white bg, `2px solid #dde3dd`, `border-radius: 999px`); "Sign up" button (black bg, white text, `border-radius: 999px`).

## Hero (`#home`)

- Vertical padding responsive (~48px; scale up on desktop).
- Heading: "Transform your workflow using plain English" — PPMondwest, `line-height: 0.95`, **32px mobile → 50px (≥768px) → 70px (≥1024px)**, `max-width: 900px` (700px on lg).
- Subheading: "FlowMate connects to your current apps, builds smart workflows, and manages operations. Powering the platforms you already know and trust." — color `#444141`, `max-width: 620px` (520px on lg).
- CTA pill button "View our intro video" with a custom arrow SVG (black bg, white text, rounded-full).
- TextFade reveal on scroll: direction up, stagger ~0.08–0.15s.

## Video Section — Liquid Glass (`#video`)

- 16:9 rounded video frame, `border-radius: 28px`, looping autoplay/muted/playsinline video: `https://plugin-assets.open-design.ai/plugins/flowmate/hf_20260405_073438_071156e5-2a7a-45d8-a8d9-c628d2144e88-988708.mp4` (keep this remote cloudfront CDN URL).
- Centered glass-morphism card near the bottom of the video with a **typewriter** line (50ms/char, looping): "Daily check rival companies and ping me on messenger" + blinking caret.
- Glass card styling (locked):
  ```
  backdrop-filter: blur(16px);
  background-image: linear-gradient(in oklab, rgba(255,255,255,0.35) 0px, rgba(255,255,255,0.12) 100%);
  border: 6px solid rgba(255,255,255,0.2);
  box-shadow: 0 8px 32px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.5);
  ```
- Card icons: a Lucide **Paperclip** (left) and a circular white **send button** with a Lucide **ArrowUp**.
- Card enters with a spring/`fade` reveal on scroll (`opacity 0→1`, `y 18→0`).

## Features Grid (`#features`)

- Title: "Discover what FlowMate can accomplish for your team" (PPMondwest h2).
- Grid: **3 columns desktop (≥1024px), 2 columns tablet (≥768px), 1 column mobile**, ~18px gap.
- Six cards, in order:
  1. **Research this company** — "Execute investor-grade business analysis: generate detailed spreadsheets, gather web intel, compare rivals, and build team dossiers." — generic tool icon.
  2. **Check the dev team's progress** — "View a quick overview of your developer squad's activity, goals, and blockers." — Linear + Slack logos.
  3. **Build my CV from available information** — "Generate a shareable PDF curriculum using stored facts and web sources, excluding any private contact info." — generic tool icon.
  4. **Turn this into retro pixels** — "Transform any photo into vintage pixelated graphics with custom resolution." — no icons.
  5. **Track Industry Sites and Send Weekly Digest Each Monday** — "Watch leading tech and development sources for fresh content then deliver Monday briefings with main insights and URLs." — generic tool icon.
  6. **Morning schedule digest** — "Every AM, outline your agenda with important background and recommended preparation." — Gmail + Google Calendar logos.
- Card styling: `border: 2px solid #dee2de`, `border-radius` 2xl (~20px); hover → border `#b8beb8`. Icons sit at the bottom in circular gray (`#eef1ed`) backgrounds.
- **Brand logos (Linear/Slack/Gmail/Google Calendar) are emitted as small inline `data:image/svg+xml;base64,…` colored-tile glyphs** (built with `btoa` at runtime). Do NOT fetch remote logo CDNs or avatar hosts — they 403 / rate-limit inside the preview sandbox.

## Cards Carousel (`#cards`)

- Auto-rotating every **4 seconds**; also manual Previous/Next buttons (`ChevronLeft`/`ChevronRight` in circular bordered buttons).
- Shows **3 cards at a time** desktop, 2 on tablet, **1 on mobile**.
- Five cards (`tag` / `text` / `image`):
  1. **For Everyone** — "Unleash your creative vision" — `…hf_20260405_081328_19f48c5b-ea4d-4f23-8f80-7374f31015d4.png`
  2. **For Teams** — "Smart helper supporting each teammate daily" — `…hf_20260405_081342_ad378347-1ebd-4b17-a716-ee895bf739c0.png`
  3. **For Enterprises** — "Elevate your whole organization using business AI" — `…hf_20260405_081415_a6e8a76c-224e-417b-bf99-6b86d6494644.png`
  4. **Platform** — "Enhanced with FlowMate" — `…hf_20260405_081513_cf1cd2c1-2122-4de6-90ed-acae8bfbdb00.png`
  5. **Security** — "Creating trusted and helpful AI" — `…hf_20260405_081541_9d2d28bf-d6a3-4b31-b0bb-cfc5202d4fcd.png`
  All five images use the `https://images.higgs.ai/?default=1&output=webp&url=…&w=1280&q=85` wrapper (keep remote — these are large stable CDN stills).
- Cards: **500px** height, dark-to-transparent bottom gradient overlay, hover `scale` effect, PPMondwest title.
- Track transition: `transform 0.7s cubic-bezier(0.32, 0.72, 0, 1)`; entry/exit slide with scale ~0.95.

## Animations / Transitions

- **TextFade**: spring/ease reveal on scroll into view (`y: 18 → 0`, opacity fade), staggered children. Implemented as `IntersectionObserver` adding a `.in` class with per-element `transition-delay`.
- **Video card**: `{opacity:0, y:18} → {opacity:1, y:0}` on scroll.
- **Carousel**: slide from right/left with scale 0.95, custom easing `cubic-bezier(0.32, 0.72, 0, 1)`.
- **Typewriter**: 50ms/char with a blinking caret, loops.

## Section Separation

Every section is separated by a top border `1px solid #e8e8e8` (`.section`), except the first. Section anchors: `#home`, `#video`, `#features`, `#cards`. Whole page uses smooth scrolling.

## Responsive Breakpoints

- Mobile: default (1-col features, 1-card carousel, no sidebar, full-width navbar).
- Tablet `md` (≥768px): 2-col features, 2-card carousel, larger hero/section type.
- Desktop `lg` (≥1024px): sidebar visible, navbar + content shifted right 240px, 3-col features, 3-card carousel, 70px hero, Pricing/Community links visible.

## Asset Rules — hard

- Keep the **higgs.ai logo + 5 carousel stills** and the **cloudfront `.mp4`** as their remote URLs (large stable CDN media). Do not inline them.
- Emit brand glyph logos (Linear, Slack, Gmail, Google Calendar) as inline `data:image/svg+xml;base64,…` tiles. **Never** use `i.pravatar.cc`, `api.dicebear.com`, or any remote avatar/logo host — they 403 / rate-limit in the sandbox.

## Color Rules — hard

Stay on the off-white / neutral-gray palette: `#fefffc` bg, `#2c2c2c`/`#444141`/`#646464`/`#b4b8b4` text, `#dde3dd`/`#dee2de`/`#e8e8e8` borders, `#eef1ed` hover, black buttons. Do not introduce new accent hues; the design is intentionally monochrome-neutral with the colored brand tiles as the only saturated spots.
