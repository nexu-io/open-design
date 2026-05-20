# Design System Inspired by Bumble

> Category: Dating & Social
> Photo-first swipe stack, signature amber yellow, playful but never childish.

## 1. Visual Theme & Atmosphere

Bumble's design language is a study in dual personality: chrome that is rigorously minimal (white canvas, monochrome ink, hairline divider) co-existing with a single brilliant accent — Bumble Yellow `#FFC629` — that does ALL the emotional work. The yellow shows up only on critical interactive moments: the brand mark in the header, circular action buttons (skip / superlike), the "Keep on swiping" tooltip bubble. Everything else is restrained so the yellow has room to land.

Photography is the hero. Profile cards take 75-85% of the viewport, photos render edge-to-edge with rounded 20px corners and a subtle tilted-stack illusion in the background (two cards visible peeking from behind the active one). Name + age + verification badge sit overlaid on the photo at the bottom-left, white text with a soft shadow so it reads on any background — no scrim, no gradient. Job title or short bio in 15px regular below the name, also overlaid.

The yellow circle action buttons live in the bottom-right corner of the active card, never in a fixed bottom-bar. Their job is to look pressable from any photo background — solid yellow, ~52px diameter, dark icon, soft drop shadow. Bumble specifically *rejects* the Tinder pattern of red/green opposing buttons; both critical actions wear the same yellow, distinguished only by icon (heart for compliment, star for super-swipe).

**Key characteristics:**
- Amber yellow `#FFC629` reserved for: brand mark, circular action buttons, instructional tooltip bubbles
- White canvas, near-black ink (`#1A1A1A`), no gray tints
- Photo cards 20px corner radius, edge-to-edge, no inner padding
- Overlay text (name, age, job) directly on photo, white with soft shadow, no scrim
- 5-tab bottom navigation: Profile / For You / People / Liked You / Chats
- Instructional tooltip bubbles in yellow with dark text — used for onboarding the swipe gesture
- Verification badge: small blue shield next to the name (Bumble Blue `#3498DB`)

## 2. Color Palette

- **Bumble Yellow** (`#FFC629`): Brand, action buttons, tooltip bubbles, onboarding callouts.
- **Yellow Soft** (`#FFF4C2`): Tutorial overlay glow, swipe-direction tinted backgrounds.
- **Ink** (`#1A1A1A`): All text, icons on yellow.
- **Muted** (`#9CA0A8`): Inactive nav labels, photo metadata fallback.
- **Page** (`#FFFFFF`): Canvas, modal backgrounds.
- **Verified Blue** (`#3498DB`): Verification shield only — never used elsewhere.
- **Skip Gray** (`#F0F0F0`): Card background under photos, divider hairlines.

## 3. Typography

- **Hero name** 32/700 ink — "Bumble" wordmark in header, lowercase, custom-spaced
- **Profile name + age** 24/700 white on photo — "Niel, 28"
- **Job/bio** 15/400 white on photo — "Teacher"
- **Tooltip** 18/600 dark on yellow — "Keep on swiping, we're learning what you like!"
- **Tab label** 11/500 muted, 600 ink when active
- **Onboarding helper** 17/700 ink — "Like what you see?" with 14/400 muted subtitle below

## 4. Components

### Profile Card
- 75-85% of viewport, 20px radius, edge-to-edge photo
- 2-card stacked illusion behind (8px offset, 4° tilt, 80% opacity)
- Overlay text: name+age bottom-left at 24/700 white, blue verified shield inline, job/bio below at 15/400 white
- Soft text shadow `0 1px 3px rgba(0,0,0,0.45)` to ensure readability on any background

### Yellow Circle Action Button
- 52px diameter, full yellow fill, 24px dark icon centered
- Soft shadow `0 4px 12px rgba(255,198,41,0.40)`
- Positioned bottom-left + bottom-right of the active card
- Press: `scale(0.94)` for 100ms, no color change

### Instructional Tooltip
- Pill shape, max 280px wide, 14px corner radius
- Yellow `#FFC629` fill, dark ink text 18/600, line-height 1.3
- Small triangular point at top-center, pointing to the gesture origin
- Used only for: first-swipe tutorial, special-feature unlock

### Tabbed Bottom Nav (5 tabs)
- White fill, 1px top border `#F0F0F0`, 80px including safe area
- Tabs: Profile, For You, People (active by default in main flow), Liked You, Chats
- Active label in 11/600 ink, icon filled ink. Inactive in 11/500 muted, outlined icon.
- Notification dot: 6px red dot top-right of icon for unread

### Yellow Glow Overlay (Swipe Direction Hint)
- Half-screen vertical yellow gradient `linear-gradient(to right, #FFF4C2 0%, #FFC629 100%)`
- Triggered during onboarding swipe tutorial only
- Shows hand-gesture icon + 17/700 instructional text at bottom

## 5. Motion

- Card swipe: 320ms spring (stiffness 220, damping 28), exit-rotate 8° in swipe direction
- Yellow button press: 100ms scale + 60ms haptic
- Tooltip enter: 240ms slide+fade from below with overshoot
- Tab switch: 180ms color fade only

## 6. Anti-Patterns

- No red/green dichotomy on action buttons — yellow is the only action color
- No scrim gradients on photo overlays — soft text shadow only
- No multi-tone gradients on the yellow (always solid `#FFC629`)
- No more than one tooltip on screen
- No 3-tab navigation — Bumble is 5

## 7. When To Pick

Consumer apps with **image-first content discovery**: dating, social discovery, photo-based marketplaces, profile-driven directories. The single high-saturation accent + monochrome chrome is the signature — the brand color is precious, never spammed.
