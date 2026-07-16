# Tom Modern Design

> Category: Starter
> Editorial-technical design system. Neutral canvas, single vermillion accent, sharp corners, Geist typography, hard shadows, structured composition.

## 1. Visual Theme & Atmosphere

Tom Modern Design is an editorial-technical design family: structured, sharp, restrained, premium, intentional, anti-generic. It reads like a deliberate design — not a mass-generated startup template.

The system sits on a near-white neutral canvas (`#fafafa`) with deep ink text (`#27272a`). One primary accent — vermillion (`#ff5a00`) — carries all interactive emphasis. Typography is Geist Sans for body and Geist Mono for labels, metadata, and technical notes. Every corner is sharp (0px radius). Shadows are hard-offset, never soft.

Atmosphere comes from a subtle 30px grid overlay on the page background, structural lines, and the contrast between quiet white zones and dense information bands. The design avoids decorative noise — no blobs, no gradients, no glow effects.

**Key signals:**
- Neutral near-white canvas with strong ink contrast
- Single vermillion accent reserved for CTAs, links, and highlights
- Sharp 0px corners throughout — rectangular silhouette is the brand
- Hard offset shadows (`8px 8px 0`) for elevation
- Geist Sans/Mono typography with strong hierarchy
- Editorial split layouts with asymmetric composition
- Uppercase compact labels for eyebrows and metadata

**Anti-patterns to avoid:**
- Generic centered startup heroes
- Purple gradients by default
- Rounded cards and buttons
- Beige or cream backgrounds
- Blob-based decorative elements
- Repetitive identical card grids

## 2. Color Palette & Roles

### Primary

| Token | Hex | Role |
|---|---|---|
| `--accent` | `#ff5a00` | Primary accent — CTAs, links, interactive highlights, accent words |

### Surfaces

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#fafafa` | Page background — neutral near-white, never warm |
| `--surface` | `#ffffff` | Card and panel surfaces |
| `--surface-warm` | `var(--surface)` | Alternate surface for section rhythm (aliases to surface) |

### Text

| Token | Hex | Role |
|---|---|---|
| `--fg` | `#27272a` | Primary text — headlines, body, buttons |
| `--fg-2` | `#52525b` | Secondary text — descriptions, lead paragraphs |
| `--muted` | `#71717a` | Muted text — captions, labels, metadata |

### Borders

| Token | Hex | Role |
|---|---|---|
| `--border` | `#969696` | Primary borders — card outlines, structural lines |
| `--border-soft` | `#d4d4d8` | Muted borders — subtle separators |

### Shadows (brand-specific)

| Token | Value | Role |
|---|---|---|
| `--tm-shadow-hard` | `8px 8px 0 rgba(150,150,150,0.12)` | Hard offset shadow — hover states, emphasis |
| `--tm-shadow-soft` | `4px 4px 0 rgba(150,150,150,0.1)` | Soft offset shadow — default card state |

### Code Window (brand-specific)

| Token | Hex | Role |
|---|---|---|
| `--tm-code-bg` | `#111517` | Code window background |
| `--tm-code-panel` | `#151a1d` | Code window header |
| `--tm-code-text` | `#d8dee9` | Code text |

### Background Pattern

The page background uses a 30px grid:
```css
background-image:
    linear-gradient(rgba(150, 150, 150, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(150, 150, 150, 0.04) 1px, transparent 1px);
background-size: 30px 30px;
```

## 3. Typography Rules

### Font Families

- **Primary:** Geist Sans — body, headlines, buttons, navigation
- **Mono:** Geist Mono — labels, metadata, code, technical notes

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| Display | `clamp(2.3rem, 5vw, 4.8rem)` | 700 | 0.96 | -0.04em | Hero headlines |
| Section | `clamp(21px, 2vw, 25px)` | 700 | 1.15 | -0.03em | Section titles |
| Card | 18px | 700 | 1.38 | -0.03em | Card titles |
| Body | 14px | 400 | 1.6 | 0 | Body text |
| Caption | 12px | 400 | 1.4 | 0 | Captions, fine print |
| Eyebrow | 12px | 700 | 1 | 0.14em | Uppercase labels |
| Button | 13px | 700 | 1 | 0.08em | Button labels |
| Mono | 12px | 700 | 1 | 0.14em | Technical labels |

### Principles

- **Geist Sans** runs across every surface — display, body, UI, buttons
- **Geist Mono** is reserved for labels, metadata, code, and technical microcopy
- Display headlines use weight 700 with tight line-height (0.96–1.15)
- Body text uses weight 400 with generous line-height (1.6)
- Uppercase labels use 0.14em letter-spacing for the "machined" feel
- One accent word per headline: `<span class="title-highlight">word</span>`

### Font Substitutes

If Geist is unavailable:
- **Inter** at weights 400/500/600/700 — slightly narrower; bump font-size by ~3%
- **Manrope** at weights 400/500/600/700 — closer proportion, gentler curves
- **IBM Plex Sans** at weights 400/500/600/700 — wider, more mechanical feel

## 4. Component Stylings

### Buttons

- **Primary:** Dark fill (`--fg`), white text, 0px radius, hard shadow on hover
- **Secondary:** Transparent, dark text, 1px border, white fill on hover
- **Block:** Full-width variant of any button

### Cards

- **Frame:** White surface, 1px border, soft shadow
- **Panel:** White surface, 1px border, hard shadow, accent top-border (4px)
- **Feature card:** 2-column grid with optional full-width variant
- **Feature 3-card:** 3-column grid with icon headers

### Navigation

- **Header:** Sticky, blurred background (`rgba(250,250,250,0.88)`), 1px bottom border
- **Nav links:** Geist Sans, secondary text color
- **CTA button:** Dark fill, same as primary button

### Forms

- **Input:** White background, 1px border, 44px height, accent border on focus
- **Textarea:** Same as input, resizable
- **Label:** Mono font, uppercase, muted color

### Premium Components

- **Token Card:** Dark gradient (`#14192B` → `#1B2A3D` → `#11393A`), holographic sheen animation, mono typography, perforation line with circular cutouts
- **Code Window:** Dark background (`#111517`), macOS-style traffic light dots, atmospheric gradient overlay, 7 syntax highlighting tokens

### Tabs

- **Tab nav:** Horizontal, mono font, uppercase, accent bottom-border on active
- **Tab panel:** Hidden by default, shown with `.is-active` class

### FAQ

- **Item:** Frame with expandable answer
- **Question:** Full-width button, plus/minus icon
- **Answer:** Hidden by default, shown when `.is-open`

## 5. Layout Principles

### Container

- Max width: 1240px
- Padding: `min(100% - 40px, 1240px)`
- Centered with `margin: 0 auto`

### Section

- Vertical padding: 96px
- Alternate sections use `rgba(255,255,255,0.72)` background with 1px borders

### Grid System

- **Hero:** 2-column split (0.92fr / 1.08fr) with 42px gap
- **Feature grid:** 2-column with optional full-width cards
- **Feature 3-col:** 3-column with icon headers
- **Updates/Pain:** 3-column grid
- **Pricing/Contact:** 2-column split
- **Footer:** 3-column (2fr / 1fr / 1fr)

### Section Rhythm

Sections alternate between:
1. White background (`--bg`)
2. Alternate surface (`rgba(255,255,255,0.72)` with borders)

This creates visual rhythm without color changes.

## 6. Depth & Elevation

| Level | Treatment | Use |
|---|---|---|
| 0 — Flat | No shadow, no border | Body text, section backgrounds |
| 1 — Border | 1px `--border` border | Cards, panels, inputs |
| 2 — Soft shadow | `4px 4px 0 rgba(150,150,150,0.1)` | Default card state |
| 3 — Hard shadow | `8px 8px 0 rgba(150,150,150,0.12)` | Hover states, emphasis |
| 4 — Code shadow | `0 28px 90px rgba(22,22,22,0.14)` | Code window only |

The system uses **color contrast** (surface vs. background) rather than shadow depth for hierarchy. Shadows are reserved for interactive feedback and premium components.

## 7. Do's and Don'ts

### Do

- Use `{colors.primary}` for CTAs, links, and interactive highlights — keep it reserved
- Set display headlines in Geist Sans at weight 700 with tight line-height
- Keep body copy at weight 400 — the contrast between heavy display and light body is the typographic signature
- Use `{rounded.none}` (0px) by default — the sharp rectangular silhouette IS the brand
- Align spacing to `{spacing.section}` (96px) between major bands
- Frame product photography inside `{rounded.xl}` containers
- Set button labels in uppercase with 0.08em letter-spacing
- Use hard shadows for hover effects, soft shadows for default state
- Use `{typography.button}` for all button labels

### Don't

- Don't introduce accent colors outside the detected palette — the system is closed by design
- Don't bold body type — body stays at weight 400
- Don't add soft drop-shadows or atmospheric gradients — the brand uses hard borders and flat fills
- Don't round buttons above `{rounded.sm}` — a soft button reads as a different brand
- Don't use beige or cream backgrounds — the canvas must be neutral (`#fafafa`)
- Don't use decorative motion everywhere — animation must be purposeful
- Don't drop ink text opacity to create hierarchy — switch surface or shift to `{colors.muted}`
- Don't use multiple accent words in one heading — one per section maximum

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 560px | Single column, compact padding (24px), smaller type |
| Tablet | 560–980px | 2-column grids, stacked hero |
| Desktop | > 980px | Full layout, 1240px max-width |

### Touch Targets

- Minimum 44×44px for all interactive elements
- Buttons: 44px height + 24px horizontal padding
- Nav links: extend tap area to full row height

### Collapsing Strategy

- **Hero:** Stacks to single column below 980px
- **Feature grids:** 2-col → 1-col below 980px
- **3-col grids:** 3-col → 2-col → 1-col
- **Footer:** 3-col → 2-col → 1-col
- **Navigation:** Hamburger menu on mobile (not included in CSS — implement per project)

### Image Behavior

- Hero photography fills full width
- Product thumbnails maintain aspect ratio
- Lifestyle photography uses horizontal cropping on mobile

## 9. Agent Prompt Guide

### Quick Color Reference

```
Background:  #fafafa (neutral near-white)
Surface:     #ffffff (pure white)
Text:        #27272a (near-black)
Secondary:   #52525b
Muted:       #71717a
Accent:      #ff5a00 (vermillion)
Border:      #969696
Border-muted: #d4d4d8
```

### Ready-to-Use Prompt

```
Create a landing page in Tom Modern Design style:

- Background: #fafafa with 30px grid overlay
- Typography: Geist Sans for body, Geist Mono for labels
- Colors: #27272a text, #ff5a00 accent, #ffffff surfaces
- Corners: 0px (sharp, never rounded)
- Shadows: 8px 8px 0 rgba(150,150,150,0.12) on hover
- Layout: split hero, 2-col feature grid, structured sections
- Buttons: uppercase, 0.08em letter-spacing, dark fill primary
- Cards: white surface, 1px border, soft shadow
- Sections: alternate between white and rgba(255,255,255,0.72)
- One accent word per headline using <span class="title-highlight">
- Eyebrows: uppercase mono labels above section titles
```

### Required Font Loading

When generating HTML with Tom Modern, load Geist explicitly. `tokens.css`
declares the `Geist Sans` and `Geist Mono` family names, but generated
artifacts do not automatically inherit the `@font-face` block from
`components.html`.

Use this loader before any generated CSS that references `--font-display`,
`--font-body`, or `--font-mono`:

```css
@font-face {
    font-family: 'Geist Sans';
    src: url('https://cdn.jsdelivr.net/npm/geist@1.7.2/dist/fonts/geist-sans/Geist-Variable.woff2') format('woff2');
    font-weight: 100 900;
    font-display: swap;
}

@font-face {
    font-family: 'Geist Mono';
    src: url('https://cdn.jsdelivr.net/npm/geist@1.7.2/dist/fonts/geist-mono/GeistMono-Variable.woff2') format('woff2');
    font-weight: 100 900;
    font-display: swap;
}
```

If the host project can self-serve fonts, prefer bundling equivalent local
woff2 files under `fonts/` while keeping the same family names.

### Component Classes

```css
/* Layout */
.container          /* max-width 1240px, centered */
.section            /* 96px vertical padding */
.section-alt        /* alternate background */
.frame              /* card with border + shadow */

/* Typography */
.eyebrow            /* uppercase mono label */
.title-highlight    /* accent-colored text */
.section-head       /* section header */

/* Buttons */
.button             /* base button */
.button-primary     /* dark filled */
.button-secondary   /* transparent outlined */
.button-block       /* full-width */

/* Hero */
.hero-grid          /* 2-col layout */
.hero-lead          /* lead paragraph */
.hero-actions       /* button group */

/* Features */
.feature-grid       /* 2-col with wide cards */
.feature-3col       /* 3-col with icons */

/* Interactive */
.tab-shell          /* tab container */
.faq-item           /* accordion item */

/* Premium */
.key-card           /* dark gradient with sheen */
.tm-code-window     /* code editor display */
```
