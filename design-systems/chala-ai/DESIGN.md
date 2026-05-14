# Design System — Chala.AI

> Category: Health & Fitness
> AI personal trainer app for iOS. Matte luxury precision instrument aesthetic — pure black, opacity-layered monochrome, Geist typography.

## 1. Visual Theme & Atmosphere

Chala.AI is built on a single conviction: a fitness app should feel like a high-end instrument, not a social platform. The canvas is absolute black (`#050505`) — not dark gray, not navy, pure black — which makes every element feel deliberate and precisely placed, the way a dial or gauge would on a watch face.

Depth is created entirely through opacity. Cards, hairlines, and input backgrounds are all white at 4–16% opacity on the black surface. This gives the interface its layered matte quality — depth without gradients, richness without color. There is exactly one "color" in the system: white (`#FFFFFF`), used at varying opacity levels to create hierarchy.

Typography is the primary design material. Headings run large (28–42px), medium weight (500), with tight negative tracking (−0.02em). Labels are always uppercase GeistMono, tracked wide (+0.18em). Numerics use tabular mono with monospacedDigit for lockstep number updates. The contrast between these two type roles — expressive serif-like heading vs. instrument-panel label — creates the instrument feel without a single icon or illustration doing any lifting.

Custom SVG glyphs replace system icons. They're thin stroke (1.25px), square linecap, miter join, 24×24 viewBox. They read as technical drawings, not friendly icons. The tab bar uses a small dot indicator (not highlight) for the active tab.

**Key characteristics:**
- Absolute black canvas (`#050505`) — no warm or cool tint
- Opacity-only depth system — no shadows, no gradients
- Geist (sans) for headings + body; GeistMono for labels, numerics, all UI chrome
- Uppercase mono labels everywhere (letterSpacing +0.18em)
- Hairline borders only — 1px, white at 8–16% opacity
- 2px border radius on interactive elements (sharp, not rounded)
- Portrait-only, dark-scheme enforced globally

## 2. Color Palette

### Surface
- **Base background** `#050505` — absolute black, the primary canvas
- **Raised background** `#0B0B0B` — slightly elevated surfaces (cards on cards)

### Text hierarchy (all white at varying opacity)
- **Text** `#FFFFFF` (100%) — primary content, active state text
- **Text Dim** `rgba(255,255,255,0.55)` — body copy, secondary headings
- **Text Faint** `rgba(255,255,255,0.32)` — labels, metadata, timestamps
- **Text Muted** `rgba(255,255,255,0.18)` — placeholder text, truly de-emphasized

### Borders (hairlines)
- **Hairline** `rgba(255,255,255,0.08)` — default dividers and borders (1px only)
- **Hairline Strong** `rgba(255,255,255,0.16)` — elevated borders, interactive element rings

### Interactive
- **Primary Fill** `#E0E0E0` — filled button backgrounds (light gray on black = high contrast without white glare)
- **Primary Text** `#0B0B0B` — text on Primary Fill buttons
- **Card** `rgba(255,255,255,0.04)` — card/container background
- **Card Selected** `rgba(255,255,255,0.12)` — selected/pressed card
- **Input Background** `rgba(255,255,255,0.05)` — form field fill
- **Pill Background** `rgba(255,255,255,0.10)` — tag/badge fills

### Accent
- **Accent** `#FFFFFF` — the system is monochrome; accent is pure white (used for active states, emphasis)

### Legacy (iOS system, avoid in new screens)
- `#007AFF` iOS blue, `#FF3B30` destructive, `#34C759` success, `#FF9500` warning

## 3. Typography

### Typefaces
- **Geist** — primary UI font (Regular 400, Medium 500, SemiBold 600, Bold 700)
  - Used for: headings, body copy, button labels
  - Source: Geist.ttf bundled in app
- **GeistMono** — monospace for all chrome, labels, numerics (Regular 400, Medium 500)
  - Used for: uppercase labels, timestamps, stats, tab bar, ALL metadata
  - Source: GeistMono.ttf bundled in app

### Scale & roles
| Role | Size | Weight | Font | Tracking | Notes |
|---|---|---|---|---|---|
| **Display** | 42px | 500 | Geist | −0.02em | Calorie counts, hero numerics |
| **Title** | 36px | 500 | Geist | −0.02em | Screen headings ("Good morning, Alex.") |
| **Heading** | 28–32px | 500 | Geist | −0.02em | Section headings |
| **Subheading** | 22–26px | 500 | Geist | −0.02em | Card headings |
| **Body** | 14–15px | 400 | Geist | normal | Descriptions, chat messages |
| **Label** | 9–11px | 400 | GeistMono | +0.18em | UPPERCASE only, UI chrome |
| **Numeric** | variable | 500 | GeistMono | −0.02em | Stats, counts; tabular digits |
| **Button** | 13px | 500 | Geist | +0.12em | UPPERCASE |
| **Caption** | 8–9px | 400 | GeistMono | +0.06em | Sub-labels, units (KCAL, MIN) |

### Rules
- All `Label` and button text: `text-transform: uppercase`
- All `Numeric` contexts: `font-variant-numeric: tabular-nums`
- Headings: `letter-spacing: -0.02em`, `line-height: ~1.05`

## 4. Spacing & Layout

### Scale
- `4px` — XS (tight internal gaps)
- `8px` — SM (between related items)
- `16px` — MD (standard internal padding)
- `20px` — screen content padding (cards)
- `24px` — LG (between sections inside a card)
- `28px` — screen horizontal padding
- `32px` — XL (between major sections)
- `48px` — XXL (hero breathing room)

### Border radius
- `2px` — default for all interactive elements (buttons, cards, inputs, tags) — the "sharp" look
- `8px` — secondary card variant
- `15px` — input fields only
- `9999px` — pill (fully rounded tags)

### Hairline weight
- All borders are exactly `1px`. Never `2px` or more.

### Progress bar height
- `4px` — the only bar/track height used anywhere

## 5. Component Patterns

### ButtonV2
Three variants, all uppercase 13px Geist Medium (+0.12em tracking):
- **primary** — `#E0E0E0` fill, `#0B0B0B` text, 2px radius, no border
- **secondary** — transparent fill, `rgba(255,255,255,0.16)` border, white text
- **ghost** — no fill, no border, white text, minimal

### ChalaScreenV2
Full-screen container: `#050505` background, safe area handled, portrait only.

### HeadingV2
Default 28px, Medium 500, −0.02em tracking.

### LabelV2
Default 10px GeistMono, +0.18em tracking, always uppercased.

### NumericV2
GeistMono with `font-variant-numeric: tabular-nums`. Size varies by context.

### RuleV2
1px hairline divider: `rgba(255,255,255,0.08)` — width 100%.

### TabBarV2
5 cells: Home, Chat, Calendar, Sports, Profile. Active cell shows icon + 4px white dot below. No labels. No background fill — pure black with hairline top border.

### GlyphV2 (icon system)
24×24 viewBox, 1.25px stroke, square linecap, miter join. Available: home, chat, calendar, profile, apple, sports, check, settings, bell, arrow-right, arrow-up, chevron-left, chevron-right, dumbbell, pulse, spark, book, play, more.

### Form fields
Hairline bottom border only (no box/card). Label at 9px mono faint above. Value at 15px Geist. Password: mono letterSpacing 0.2em.

### Cards
`rgba(255,255,255,0.04)` background, `1px solid rgba(255,255,255,0.16)` border, `2px` radius. Internal padding 16–20px. Hairline dividers between sections inside a card.

### Stat cells
Used in Profile, Home: `flex` row divided by hairlines. Each cell: large Numeric + tiny Label below in faint mono.

### Macro rings (Nutrition)
SVG circle stroke-dasharray. Track: `1.5px` hairlineStrong. Arc: `1.5px` white. Inside: Numeric value + caption unit.

## 6. Screen Inventory

| Screen | Label | Key elements |
|---|---|---|
| **Landing** | 00 | Full-screen black, logo centered, primary + secondary CTA |
| **Sign In** | 01 | Wordmark, heading "Welcome back.", form fields, Google OAuth button |
| **Sign Up** | — | Same shell, different heading + fields |
| **Home** | 02 | Logo + bell row, greeting heading, 7-day week strip (4px bars), today workout card (border card), coach insight, quick-actions 2-cell grid |
| **Chat (empty)** | 03 | Logo centered, 4 suggested prompt rows, input bar at bottom |
| **Chat (active)** | 03b | Message bubbles, coach badge, streaming indicator |
| **Calendar** | 04 | Month header, 7-column day grid, session list below |
| **Profile** | 06 | Name heading, avatar initials box, 3-stat row (Sessions/Check-ins/Streak), ETA Gym Pass mini-QR, preferences list |
| **Nutrition** | 05 | "Fuel" heading, calorie banner (big Numeric + progress bar), 3 macro rings (SVG), meal list, wearable 4-up stats, body metric rows |
| **Sports** | 07 | Activity summary, bar chart week strip, run cards with distance/pace |
| **Run Detail** | — | Route map trace (SVG polyline), split table, HR graph |
| **AI Routes** | — | 3 curated route cards with difficulty tags and distance |
| **Workout Summary** | — | Exercise list with sets/reps/vol, total summary stats |
| **Settings** | — | Grouped list rows: notifications, units, integrations, account |
| **Gym Pass** | — | Full-screen QR code, membership label |
| **Active Workout** | — | Exercise name, set rows with weight/reps, rest timer overlay |
| **Exercise Library** | — | Searchable grid of exercise cards with muscle group tags |

## 7. Interaction & Motion Principles

- **No gratuitous animation.** State changes are immediate or use short (150–200ms) fade/opacity tweens only.
- **Haptic on primary actions.** Every workout set logged, every workout started/ended.
- **Rest timer overlay** — full-screen dimmed cover with large countdown Numeric, auto-dismissed.
- **Pull to refresh** — native iOS rubber band only, no custom loaders.
- **Tab bar active state** — instant dot appear, no slide animation.

## 8. Anti-references

Do NOT make this look like:
- **MyFitnessPal / Strava** — colorful, social, gamified with badges and trophy icons
- **Apple Fitness+** — gradient-heavy, large photography, playful curves
- **Nike Run Club** — bold color accents, Nike yellow/orange, thick strokes
- **Whoop** — all black but warm/red accent and rounded forms
- Generic iOS apps using system blue, rounded rectangles, and SF Symbols

The distinguishing move: no color accents, no rounded corners, no photography, no gradients. If it looks like a stopwatch or aircraft instrument panel, it's correct.
