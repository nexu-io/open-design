# PickFlick Design System

Dark-cinema design system for a film club app. Built on the web-prototype seed, adapted for dark backgrounds, gold accents, and film-strip UI patterns.

---

## Color Tokens

### Core (dark theme)

| Token | Value | Role |
|---|---|---|
| `--bg` | `#0c0c0c` | Page background |
| `--surface` | `#161616` | Cards, panels, sheets |
| `--surface-lit` | `#1e1e1e` | Elevated surface (hover, popovers) |
| `--fg` | `#eee9e5` | Primary text |
| `--muted` | `#7d7a76` | Secondary text, captions, metadata |
| `--border` | `#2d2a27` | Default borders |
| `--border-lit` | `#403c38` | Elevated borders |

### Monochrome accent

The monochrome accent system — neutral greys, no colour. Used for text, borders, subtle hover states, and structural UI elements. Always safe, never competes with the warm layer.

| Token | Value | Role |
|---|---|---|
| `--accent` | `#eee9e5` | Monochrome accent — same as `--fg`; use for structural emphasis |
| `--accent-dim` | `#706a64` | Muted mono accent — hover targets, subtle interactions |
| `--accent-glow` | `rgba(238,233,229,.08)` | Mono glow backgrounds |
| `--accent-soft` | `rgba(238,233,229,.06)` | Soft mono hover backgrounds |

### Warm accent (cinematic layer)

The warm accent system — gold and ivory, cinematic warmth. Used for ratings, achievements, interactions, watchlist, ticket bubble, and decorative glow. Lives on top of the monochrome layer; never replaces it.

| Token | Value | Role |
|---|---|---|
| `--warm-accent` | `var(--gold)` | Warm accent — maps to `--gold` |
| `--warm-accent-soft` | `var(--gold-soft)` | Soft warm background (progress badges, subtle warmth) |
| `--warm-accent-line` | `var(--gold-border)` | Warm borders (hover, active, selected) |

### Semantic colors

| Token | Value | Role |
|---|---|---|
| `--gold` | `#C89B55` | Cinematic gold — borders, active states, hover borders, ticket bubble |
| `--gold-light` | `#E0B87A` | Ticket bubble hover fill (lighter gold) |
| `--gold-dark` | `#8A6330` | Ticket bubble hover fill (deeper gold, aged brass) |
| `--gold-soft` | `rgba(200,155,85,.14)` | Soft gold background (progress badges, subtle warmth) |
| `--gold-glow` | `rgba(200,155,85,.18)` | Gold glow (outside rings, achievement halos) |
| `--gold-border` | `rgba(200,155,85,.34)` | Gold borders (hover, active, selected) |
| `--ivory` | `#E8D8B8` | Warm light text — NOMINATION labels, achievement unlocked, soft labels, selected items |
| `--ivory-soft` | `rgba(232,216,184,.10)` | Soft ivory background |
| `--ivory-muted` | `rgba(232,216,184,.68)` | Muted ivory text |
| `--danger` | `#A94E4A` | Danger zone, kick, cancel, leave buttons |
| `--danger-hover` | `#B65A55` | Danger button hover fill |
| `--danger-border` | `rgba(169,78,74,.38)` | Danger zone card/button borders |
| `--danger-soft` | `rgba(169,78,74,.12)` | Danger zone backgrounds |
| `--danger-text` | `#D9A09B` | Danger zone heading text |
| `--success` | `#6F8A63` | Olive green — import/export success, completed states, "Copied!" |
| `--success-soft` | `rgba(111,138,99,.13)` | Soft success background |
| `--success-border` | `rgba(111,138,99,.34)` | Success borders |
| `--warn` | `#B9823A` | Aged amber — warning states, close to gold but distinct |
| `--warn-soft` | `rgba(185,130,58,.14)` | Soft warning background |
| `--warn-border` | `rgba(185,130,58,.34)` | Warning borders |

### Focus

For dark-UI accessibility — softer than a white browser outline, keeps the cinematic atmosphere.

| Token | Value | Role |
|---|---|---|
| `--focus` | `rgba(232,216,184,.72)` | Focus ring colour (ivory-toned) |
| `--focus-ring` | `0 0 0 3px rgba(232,216,184,.18)` | Focus ring shadow |

Usage:
```css
:focus-visible {
  outline: 1px solid var(--focus);
  box-shadow: var(--focus-ring);
}
```

### Background gradients

```
Page body: radial-gradient + linear-gradient(#0c0c0c, #090909)
Page body (Hub): radial-gradient(circle at 50% 0%, rgba(255,255,255,.06), transparent 36%) + linear-gradient(#0c0c0c, #090909)
Film grain: fixed overlay, opacity 0.025, micro-noise pattern
```

---

## Typography

### Font stacks

| Token | Value | Role |
|---|---|---|
| `--font-display` | `'Iowan Old Style', 'Charter', Georgia, 'Times New Roman', serif` | Emotional hierarchy: page titles, club names, movie titles, large stats, empty states |
| `--font-body` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif` | Product UI: buttons, forms, tabs, settings, navigation, cards, body text |
| `--font-mono` | `ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace` | Metadata: dates, counters, ratings, badges, phase labels, frame counters, technical captions |

### Typography rules

- **Display serif** is for emotional moments — not controls, dense cards, labels, navigation, or settings UI.
- **Body sans** is for product clarity — buttons, forms, tabs, menus, descriptions.
- **Mono** is for "film archive" metadata — sparingly. Never for body paragraphs, button labels, long menu items, or settings descriptions.
- **Avoid all-caps** except for short labels, pills, technical metadata, and phase states.
- **Long titles** should use serif but cap at 2–3 lines with balanced line-height.
- **Navigation and menu labels** stay sans-serif, title case, not uppercase.

### Type scale

#### Marketing / landing

| Token | Value | Use |
|---|---|---|
| `--fs-hero` | `clamp(44px, 6vw, 76px)` | Hero titles (landing, empty states) |
| `--fs-section` | `clamp(32px, 4vw, 48px)` | Section headings (landing) |

#### App UI

| Token | Value | Use |
|---|---|---|
| `--fs-app-title` | `clamp(32px, 9vw, 48px)` | Club/movie titles on mobile app screens |
| `--fs-app-section` | `24px` | Section headings inside app |
| `--fs-card-title` | `20px` | Cards, popovers, achievement names |
| `--fs-lead` | `19px` | Lead paragraphs |
| `--fs-body` | `16px` | Body text |
| `--fs-body-sm` | `14px` | Compact body |
| `--fs-meta` | `13px` | Captions, metadata |
| `--fs-caption` | `12px` | Compact labels |
| `--fs-micro` | `11px` | Footer labels, frame counters |
| `--fs-nav` | `12px` | Navigation labels |

### Line height

| Token | Value | Use |
|---|---|---|
| `--lh-tight` | `1.05` | Display titles, large stats |
| `--lh-title` | `1.12` | Card titles, section headings |
| `--lh-body` | `1.55` | Body copy, descriptions |
| `--lh-ui` | `1.3` | Buttons, pills, form elements |
| `--lh-caption` | `1.2` | Captions, metadata, nav labels |

### Letter spacing

| Token | Value | Use |
|---|---|---|
| `--tracking-tight` | `-0.025em` | Display titles |
| `--tracking-normal` | `0` | Body text |
| `--tracking-wide` | `0.06em` | Subtle spacing for UI labels |
| `--tracking-caps` | `0.12em` | ALL-CAPS labels (pills, badges, phase labels) |

### Numeric formatting

- **Large stats** (overview, library): `font-family: var(--font-display); font-variant-numeric: lining-nums;`
- **Compact UI numbers** (badges, counters, frame counts): `font-family: var(--font-mono); font-variant-numeric: tabular-nums;`
- **Rating values, timecodes, session counts**: `font-variant-numeric: tabular-nums;` for alignment

### Usage examples

```css
h1 {
  font-family: var(--font-display);
  font-size: var(--fs-app-title);
  line-height: var(--lh-tight);
  letter-spacing: var(--tracking-tight);
}

.card-title {
  font-size: var(--fs-card-title);
  line-height: var(--lh-title);
}

.body-copy {
  font-size: var(--fs-body);
  line-height: var(--lh-body);
}

.nav-label {
  font-size: var(--fs-micro);
  line-height: var(--lh-caption);
}

.eyebrow, .pill, .meta-caps {
  font-family: var(--font-mono);
  letter-spacing: var(--tracking-caps);
  text-transform: uppercase;
}

.stat-value-large {
  font-family: var(--font-display);
  font-variant-numeric: lining-nums;
}

.badge-count, .frame-counter {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.film-frame b {
  font-size: 12px;
  font-weight: 600;
}
```

---

## Spacing

| Token | Value | Equivalent |
|---|---|---|
| `--gap-xs` | `8px` | Micro gap |
| `--gap-sm` | `12px` | Small gap |
| `--gap-md` | `20px` | Default gap |
| `--gap-lg` | `32px` | Section gap |
| `--gap-xl` | `56px` | Large section gap |
| `--gap-2xl` | `96px` | Hero spacing |

---

## Layout

| Token | Value | Notes |
|---|---|---|
| `--container` | `1120px` | Max content width |
| `--gutter` | `24px` | Horizontal padding |
| `--radius` | `12px` | Default border radius |
| `--radius-lg` | `18px` | Large radius (cards, modals) |
| `--hit` | `44px` | Minimum touch target |

### Grid helpers
- `.grid-2` — 2 equal columns, collapses to 1 at 920px
- `.grid-3` — 3 equal columns, collapses to 1 at 920px
- `.row` — flex row, center-aligned
- `.row-between` — flex row, space-between

---

## Components

### Buttons
**Primary** (`.btn-primary`): Used for CTAs, submit actions. White bg, dark text, hover → darker bg.
**Secondary** (`.btn-secondary`): Transparent bg, border, hover → border lights up. Used for: Manage Moderators, Invite, Change photo, Your Rating, Watchlist, "See how it works".
**Secondary Small** (`.btn-secondary.btn-sm`): Same style, compact.
**Ghost** (`.btn-ghost`): No border, subtle hover. Used for: Back to main.
**Icon** (`.btn-icon`): Square button, icon-only. Used for: gear, close.
**Secondary Danger** (`.btn-secondary-danger`): Transparent bg, danger-soft fill, danger-text label, danger-border. Hover → danger border intensifies, danger-soft bg deepens. Used for: Kick, Cancel Session, Leave, Delete Club, Delete Account, Cancel Subscription. Never uses solid-danger fill — keeps the action legible but not final.

### Cards
- `.card` — surface background, border, radius-lg
- Stats cards: display font, centered, muted label below
- Achievement cards: icon circle, status pill, title, description, progress bar + counter

### Rating Stars
- 10 stars, hover fills all stars up to hovered one
- Click locks selection, label shows "N/10"
- On mobile: horizontal scroll
- Pop animation (`@keyframes pipPop`) on click

### Pills & Chips
- `.pill` — rounded tag (phase: Nomination, Selection, Rating)
- `.rating-pill` — rating display (globe + score + label)
- `.ach-status` — achievement status (Unlocked, In progress, Not started)

### Ticket Bubble
- Fixed bottom-right, SVG concave ticket shape
- Default: dark monochrome fill; hover: warm-accent fill (`--gold-light` → `--gold` → `--gold-dark`)
- `--warm-accent-line` for the ticket border on hover
- Stub slides partially out of viewport, reveals on hover
- Popover opens on click with invite list

### Film-Strip Menus
- Used in: mobile footer nav groups, avatar popover, gear popover
- `.film-strip` — perforations on sides, film-frame items with icons
- `.film-tail` — tab at bottom
- Scale-up animation on open: `scaleY(0.18)` → `scaleY(1)`

### Sprocket Separator
- `.sprocket-sm` — 3 dots + dashed lines, used between sections
- `.sprocket` — larger version for Session Details

### Modals
- Full-screen dark overlay
- Centered card with title, content, action buttons
- Gear popover → Next Phase / Change details / Kick / Cancel session

### Checkboxes
- Custom 20×20px, rounded, dark border
- Checked: white border, white checkmark, transparent bg
- Used in: Manage Club Settings, Kick participant modal

### Header
- Sticky topbar, backdrop blur
- Desktop: logo left, nav center, search + bell + avatar right
- Mobile: logo centered, search icon right-aligned with 16px gutter
- Avatar popover: film-strip with Settings → Privacy → Pricing → Contact Us → Sign out

### Footer (Mobile)
- Fixed bottom, 4 buttons: Hub (clapperboard), My Library (film reel), Alerts (bell), Settings (gear)
- 63px height, backdrop blur
- Each opens film-strip menu
- "My Library" sub-menu: My Ratings, Watchlist, Achievements

### Global Search
- Search icon in header (desktop: next to bell, mobile: right edge)
- Panel slides down, covers header
- Centered input, search by film title
- 20-film database, real-time results

---

## Page-Specific Rules

### Hub (app.html)
- Club carousel, "Next Up" card, tabs: Overview → Sessions → Ratings → Members → Achievements → Manage Club
- Ticket bubble bottom-right
- Avatar chips in active sessions
- Tab content fade-in animation

### Session Detail pages
- Hero section: poster (grayscale, hover → color + zoom), trailer, credits, synopsis
- Sprocket separator before Session Details
- Mascot panda overlapping sprocket
- "Back to main" button first in header actions

### Movie Details
- Poster + trailer + credits + synopsis
- Your Rating (stars, popover) + Global rating + Watchlist (bookmark icon, ivory `#E8D8B8`)
- "See also" links row + "You may also like" scroll carousel

### My Library
- Stats row: Films rated, Rated this year, Avg rating, Total watch time, Favorite genre, Top director, Top actor, On watchlist
- Tabs: My Ratings, Watchlist, Achievements
- Mascot panda behind stats
- Film grain overlay

### Landing
- Scene sections with reveal-on-scroll animation
- Sprocket separators
- 4-button footer

### Settings
- Left sidebar with link icons
- Smooth tab transitions
- Accordion in Privacy section
- Import & Export tab with CSV handling

---

## Motion & Animation

| Element | Animation |
|---|---|
| Tab content | `fadeIn` — opacity 0→1, 0.25s |
| Film-strip menus | `scaleY` 0.18→1, 0.34s cubic-bezier |
| Ticket bubble | Stub slide 78px, 0.3s ease |
| Score pips / stars / toggles | `pipPop` — scale 0.85→1.05→1, 0.3s ease |
| Landing reveal | `revealSection` — translateY + opacity, 0.6s ease |
| Poster hover | Grayscale removal + scale(1.02), 0.3s ease |
| Next Up hover | Grayscale removal + gold border + gold glow, 0.3s ease |
| Notifications badge | `pulse` — opacity pulse, 2s infinite |

---

## CSS Variables (`:root`)

```css
:root {
  /* ---- Fonts ---- */
  --font-display: 'Iowan Old Style', 'Charter', Georgia, 'Times New Roman', serif;
  --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --font-mono: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace;

  /* ---- Type scale — marketing / landing ---- */
  --fs-hero: clamp(44px, 6vw, 76px);
  --fs-section: clamp(32px, 4vw, 48px);

  /* ---- Type scale — app UI ---- */
  --fs-app-title: clamp(32px, 9vw, 48px);
  --fs-app-section: 24px;
  --fs-card-title: 20px;
  --fs-lead: 19px;
  --fs-body: 16px;
  --fs-body-sm: 14px;
  --fs-meta: 13px;
  --fs-caption: 12px;
  --fs-micro: 11px;
  --fs-nav: 12px;

  /* ---- Line height ---- */
  --lh-tight: 1.05;
  --lh-title: 1.12;
  --lh-body: 1.55;
  --lh-ui: 1.3;
  --lh-caption: 1.2;

  /* ---- Letter spacing ---- */
  --tracking-tight: -0.025em;
  --tracking-normal: 0;
  --tracking-wide: 0.06em;
  --tracking-caps: 0.12em;
}
```

---

## Image Assets

| File | Use |
|---|---|
| `mquutuz0q-panda-logo.webp` | Logo panda (header, favicon) |
| `mr4st1pk-image.png` | Dune: Part Two poster |
| `mrardt9z-panda-zoom.webp` | Library stats panda |
| `mr7eoope-panda-session.webp` | Create session mascot |
| `mr2147pl-panda-rating.webp` | Rating panda |
| `mr213zta-panda-collection.webp` | Nomination panda |
| `mr213zt9-panda-rating-2.webp` | Selection panda |
| `mr0ojanw-image.png` | Panda 404 |
| `mr0nkifu-image.png` | Panda critic (contact) |

## Provenance

Formalized by Open Design from candidate b558d313-5499-4051-8176-9e4106ba4078.
