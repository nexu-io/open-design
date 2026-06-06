---
name: dashboard-ui-glass
description: "Use this plugin when the user wants a premium liquid-glassmorphism conference / meeting dashboard: dual fullscreen background videos swapped by theme, a 4x2 glass/solid card grid, animated voice-wave participant indicators, and a floating control bar. Invoke for 'glass dashboard', 'conference dashboard', 'meeting room UI', or when the user references the Dashboard UI liquid-glass template."
version: 0.3.0
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

# Dashboard UI — Liquid Glass Conference Dashboard

Produce a premium **Conference Dashboard** with a **liquid glassmorphism** aesthetic. A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then adjust copy and data; do not rewrite the CSS or invent a new visual language. The seed already encodes the exact tokens, glass treatment, card grid, voice-wave animation, and responsive behavior described below.

This is the authoritative build brief. Follow it exactly — the named colors, radii, video URLs, avatar sources, and animations are locked.

**Avatars (critical):** `example.html` already ships every avatar as an **inlined `data:image/svg+xml;base64,…` URI** — keep those exactly as they are. Do **not** replace them with `i.pravatar.cc`, `api.dicebear.com`, or any other remote avatar URL: external avatar hosts rate-limit or 403 inside the sandbox and render as broken images. When you copy the seed, the avatars come with it; only swap an avatar if the user supplies a real image, and prefer a data URI over a remote URL. Screen-share thumbnails may keep `https://picsum.photos/seed/screen1..4/300/200`.

## Stack

- Default output: a single self-contained HTML file (the `example.html` seed). It already includes everything inline.
- If the user explicitly asks for a React + TypeScript + Vite + Tailwind project, port the seed faithfully: same tokens, same markup structure, `lucide-react` for icons, Inter (weights 300–700) from Google Fonts. Do not change the design while porting.

## Background

Two looping fullscreen background videos (`autoplay muted loop playsInline`, `object-fit: cover`, `position: fixed; inset: 0; z-index: -1`) — swap based on dark/light theme. **No overlays.**

- Light mode video: `https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260514_103318_2aa26b55-df1a-43a6-903d-941e718c9366.mp4`
- Dark mode video: `https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260514_102933_4e8f73b5-775a-4179-b2fb-472f59063dcd.mp4`

## CSS Variables (`:root`) — locked

```
--glass-bg: rgba(255, 255, 255, 0.55);
--glass-border: rgba(255, 255, 255, 0.6);
--glass-blur: 8px;
--text-main: #1a1a1a;
--text-muted: #6b7280;
--accent: #000000;
--card-radius: 40px;
--transition: all 0.4s cubic-bezier(0.22, 1, 0.36, 1);
```

In `.dark-mode`: `--glass-bg: rgba(0,0,0,0.45)`; `--glass-border: rgba(255,255,255,0.08)`; `--text-main:#fff`; `--text-muted:#b0b0b0`; `--accent:#fff`.

Body: Inter font, `height:100vh`, `padding:32px 40px`, `display:flex; flex-direction:column; overflow:hidden`, black fallback bg.

## Top Navigation (grid: `auto auto 1fr auto auto`, gap 16px, mb 40px)

1. **Profile button** — 48×48 circular avatar (reuse the inlined `seed=current_user` `data:` avatar from `example.html`; never fetch a remote avatar URL).
2. **Toggle container** — pill containing:
   - **Mode switch** (88×48, white pill, inner blue track 76×40 `#3b82f6`, white 32×32 handle on right; in dark mode handle slides left via `transform: translateX(-36px)`; small icon `☾`/`☀` slides via `translateX(42px)`).
   - **Settings nav-btn** — pill, 10px 24px, `rgba(0,0,0,0.04)` bg with blur, white text.
3. **Meeting alert** (justify-self center) — white pill, `padding 6px 6px 6px 16px`, gap 12, shadow `0 4px 20px rgba(0,0,0,0.08)`. Contains: 32px host avatar (reuse the inlined `seed=meeting_host` `data:` avatar from `example.html`; never fetch a remote avatar URL), label "Meeting is about to start", grey time-tag pill "-5:23" (`#f0f0f0`, 4px 10px), and a 32×32 close button with an SVG progress ring (gray track + black arc, `stroke-dasharray=88 stroke-dashoffset=25 rotate(-90)`) and a centered Lucide `X` (12px). Hidden on mobile.
4. **View switcher** — pill, `rgba(0,0,0,0.04)` bg, 4px padding, two buttons "Dashboard" and "Rooms"; active = white bg, black text, shadow `0 4px 12px rgba(0,0,0,0.1)`. Default active = "Rooms".
5. **Search button** — 48×48 circular, Lucide `Search`.

## Dashboard Grid (4 cols × 2 rows, 24px gap, max-width 1400px, fills available height)

Card base: `padding:28px 20px`, flex column, `border-radius:40px`, hover `translateY(-3px) scale(1.01)`.

### Card 1 — Empty / Create Room (glass)
- Translucent dark glass `rgba(0,0,0,0.18)` (light), `rgba(255,255,255,0.08)` (dark).
- Centered Lucide `Plus` (32px) + label "Create a room", white text.

### Card 2 — Subscription Growth Experiments (solid white)
- Title: "Subscription Growth Experiments" (1.35rem, weight 400, letter-spacing -0.03em).
- Subtitle: "Sprint Retrospective".
- Header icon: Lucide `Zap` (16px, opacity 0.5).
- Footer: 3 overlapping 32px avatars (`seed=1,2,3`, `margin-left:-12px`) + count badge "9" (38×38 circle, `rgba(0,0,0,0.08)`).

### Card 3 — Weekly Insights (solid white)
- Title only: "Weekly Insights".
- **Bar chart** (height 60px, `gap:2px`, `align-items:flex-end`):
  - First **24** bars are blue `#3b82f6` with heights: `35,45,30,55,40,65,50,75,60,85,70,80,65,55,45,70,60,75,55,65,50,75,60,55`.
  - Next **36** bars grey `#e5e7eb` with heights: `45,70,60,75,55,65,50,75,60,85,70,55,45,70,60,75,55,65,50,75,60,55,45,70,60,75,55,65,50,75,60,55,45,70,60,75`.
- **Chart markers row** (`justify-content:space-between; padding:0 20px; margin-bottom:24px`): single 18px avatar `u=m1`, then group of two `u=m2`(margin-right -8) + `u=m3`, then group `u=m4`(-8) + `u=m5`. All have 1.5px white border.
- Footer: two overlapping avatars `u=large1`, `u=large2`, plus 54×54 white play button (`rgba(245,245,245,0.85)`) with Lucide `Play` (20px, fill black).

### Card 4 — Product Strategy 2023 (glass, dark translucent)
- Title "Product Strategy 2023" + subtitle "No upcoming meetings".
- Header icon: Lucide `MoreHorizontal` (16px, opacity 0.5).
- Footer: single 32px avatar `u=6` + count badge "32".

### Card 5 — User Onboarding Team (solid white)
- Title "User Onboarding Team" + subtitle "Sprint Planning".
- Header icon: Lucide `BarChart2`.
- Footer: 3 overlap avatars `u=7,8,9` + badge "3".

### Card 6 — User & Market Research (glass)
- Title "User & Market Research" + subtitle "No upcoming meetings".
- Icon: `MoreHorizontal`. Footer: avatar `u=10` + badge "6".

### Card 7 — Core Product Team (solid white)
- Title and subtitle both "Core Product Team".
- Icon: Lucide `Video`. Footer: 2 overlap avatars `u=11,12` + badge "2".

### Card 8 — Screen Share (solid card-alt; gradient `linear-gradient(to bottom,#f4f4f4 0%, #ffffff 50%, #ffffff 100%)`)
- Header row of two pill chips (justify start, gap 8): "Screen Share" (blue text `#3b82f6`) and "0:30" (black text). Both white pills, `padding:6px 14px; font-size:0.75rem; box-shadow:0 2px 8px rgba(0,0,0,0.06)`.
- Horizontal scroll row (`overflow-x:auto; gap:12px; margin: 20px -20px 0; padding:0 20px 16px; hide scrollbar; cursor:grab; drag-to-scroll`):
  - 4 thumbnails 160×100, `border-radius:16px`, backgrounds `https://picsum.photos/seed/screen1..4/300/200`.
  - On thumbnail #2: bottom-right floating tag with 24px avatar `u=alice_av` + orange `#e05e36` pill labeled "Alice" (white text 0.65rem, 2px 8px, radius 100).
- Footer: 2 avatars `u=13,14` + badge "8" (background `#F3F3F3`).

## Indicators (under grid)

Three 12×12 dots, white, gap 16, `margin: 24px 0 120px`. First dot active (opacity 1); others opacity 0.3.

## Bottom Bar (fixed, centered, glass pill)

`bottom:32px; left:50%; translateX(-50%); padding:10px 16px; border-radius:100px`.
Active-participants row:
- **Active speaker** 44×44 circle `u=speaker` with **voice indicator** badge (top-right -2/-2): white 18×18 circle with shadow containing **3 wave bars** (2px wide, grey `#4b5563`, animated via `@keyframes voice-wave` between 4px and 10px height, 1s ease-in-out infinite, delays 0/0.2s/0.4s).
- 40×40 participant `u=p1` (opacity 0.7).
- 40×40 participant `u=p2` with another voice indicator.
- 40×40 participant `u=p3`.
- "+17" 40×40 round chip `rgba(255,255,255,0.25)`, white bold.

## Components button (fixed bottom-left, 32px from edges)

44×44 rounded-rect (radius 14, `rgba(0,0,0,0.04)` blur), 2×2 grid of 4 small avatars `u=c1..c4`.

## Floating Controls (fixed bottom-right, 32px)

Pill `rgba(0,0,0,0.04)`, padding 10px 14px, gap 12. Two 44×44 round buttons:
- Video toggle: Lucide `Video` ↔ `VideoOff`. When off, bg `#ff4545`, white icon.
- Mic toggle: Lucide `Mic` ↔ `MicOff`. When muted, bg `#ff4545`.
Hover: `scale(1.08)`.

## Glass Utility

```
.glass {
  background: var(--glass-bg);
  backdrop-filter: blur(8px) saturate(1.8);
  border-radius: 40px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.5);
}
.glass::after { content:''; position:absolute; inset:0; border-radius:inherit; pointer-events:none; filter:url(#noise-filter); opacity:0.06; mix-blend-mode:overlay; }
```

Inline an SVG `<filter id="noise-filter">` using `feTurbulence baseFrequency=0.65 numOctaves=3 stitchTiles=stitch` + `feComposite operator=in in2=SourceGraphic` for the grain texture.

## Solid Card

`background:#fff; box-shadow:0 4px 20px rgba(0,0,0,0.03), 0 1px 3px rgba(0,0,0,0.01)`. In dark: `rgba(26,26,26,0.98)` with white text.

## Animations / Transitions

- All interactive elements: `transition: all 0.4s cubic-bezier(0.22, 1, 0.36, 1)`.
- Card hover: `translateY(-3px) scale(1.01)` + larger shadow.
- Theme-switch handle: `transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)`.
- Voice waves: `voice-wave` keyframes (height 4px → 10px → 4px), 3 staggered bars.
- Pulse-red keyframe available for emergencies (red ring expand-fade).

## State / Interactions

- `isDark` toggles `body.dark-mode` and swaps the background `<video>` (force reload on swap).
- View switcher toggles active button.
- Mic/video buttons toggle `muted`/`off` class, swapping icons.
- Screen-share strip supports mouse drag-to-scroll (mousedown/move/up/leave).

## Responsive

- ≤1200px: grid → 2 columns, rows 280px, body becomes scrollable.
- ≤768px: grid → 1 column, padding 16px, hide meeting alert, view-switcher full-width on second row, bottom bar near full width, floating controls + components button move up to bottom 80px.

## Color Rules — hard

Avoid purple/indigo entirely. Palette: blue accent `#3b82f6`, neutral whites/blacks/greys, alert red `#ff4545`, orange tag `#e05e36`. All text contrast-safe in both themes. **Do not substitute a different accent hue (no teal/green/indigo); the blue `#3b82f6` is locked.**
