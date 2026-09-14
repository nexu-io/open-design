# Riso Design

> Category: Creative & Artistic
> Playful two-color risograph aesthetic: warm paper canvas, fluorescent pink interaction accent, federal-blue structure. Two inks, one surface — every section prints on the same warm sheet.

## 1. Visual Theme & Atmosphere

Riso is a playful, joyful two-color risograph print aesthetic built on a single warm off-white paper surface (`#fdf6ec`) running through every section. A fluorescent brand pink (`#f237a1`) is reserved as the sole interaction driver — CTAs, links, focus, active states. A deep federal blue (`#2c40a7`) carries headings, metadata, and the signature offset print-shadow.

The mood is print-shop exuberance: high contrast, generous whitespace, visible grain. Space Grotesk everywhere; Overpass Mono for eyebrows, labels, and technical notes. Corners stay friendly (8–16px radii). Shadows are soft pink glows, never hard offsets.

**Key signals:**
- One warm paper canvas across all sections — never swap the background per band
- Exactly two inks: pink for action, blue for structure
- Offset print-shadow (4px solid blue) on featured cards, like misregistered ink
- Grain or halftone texture at low opacity for the printed feel
- Space Grotesk display + body, Overpass Mono labels

**Anti-patterns to avoid:**
- Third accent colors — the system is closed at two inks plus neutrals
- Neutral grey or beige SaaS chrome backgrounds
- Hard offset black shadows — elevation is pink glow, not brutalist slab
- Rounded-everything pill soup — radii stay 8/12/16, pills only for badges

## 2. Color Palette & Roles

### Primary

| Token | Hex | Role |
|---|---|---|
| `--accent` | `#f237a1` | Sole interaction driver — CTAs, links, active states, focus rings |
| `--meta` | `#2c40a7` | Structural blue — headings support, eyebrows, print-shadows, badges |

### Surfaces

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#fdf6ec` | Page background — warm paper, shared by every section |
| `--surface` | `#ffffff` | Card and panel surfaces |
| `--surface-warm` | `#fce7f3` | Alternate surface — pink-tinted panels, highlight bands |

### Text

| Token | Hex | Role |
|---|---|---|
| `--fg` | `#111827` | Primary text — headlines, body |
| `--fg-2` | `#374151` | Secondary text — descriptions, lead paragraphs |
| `--muted` | `#6b7280` | Muted text — captions, labels, metadata |

### Borders

| Token | Hex | Role |
|---|---|---|
| `--border` | `#e8d9c8` | Primary borders — card outlines, structural lines |
| `--border-soft` | `#f1e4d6` | Muted borders — subtle separators |

### Print Shadow (brand signature)

Featured cards carry a 4px solid blue offset:

```css
box-shadow: 4px 4px 0 #2c40a7;
```

Use on one hero panel per page — never on every card. The rest use the soft pink `--elev-raised` glow.

## 3. Typography Rules

### Font Families

- **Display + Body:** Space Grotesk — headlines, body, buttons, navigation
- **Mono:** Overpass Mono — eyebrows, labels, metadata, technical notes

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| Hero | `clamp(2.4rem, 5vw, 3.5rem)` | 700 | 1.05 | -0.02em | Page headline |
| Section | `clamp(20px, 2vw, 28px)` | 700 | 1.15 | -0.02em | Section titles |
| Card | 20px | 700 | 1.3 | -0.01em | Card titles |
| Body | 16px | 400 | 1.6 | 0 | Body text |
| Caption | 14px | 400 | 1.5 | 0 | Captions, fine print |
| Eyebrow | 12px | 700 | 1 | 0.14em | Uppercase mono labels |

### Principles

- Space Grotesk runs across display and body — weight contrast (700 vs 400) is the typographic signature
- Eyebrows are Overpass Mono uppercase with wide tracking, usually in structural blue
- Body stays at weight 400 — never bold body copy for emphasis, use color or size
- Headlines may use one pink accent word per section maximum

## 4. Component Stylings

### Buttons

- **Primary:** Pink fill (`--accent`), white text, 12px radius, pink glow on hover
- **Secondary:** Transparent, ink text, 1px warm border, pink border + text on hover
- **Block:** Full-width variant of any button

### Cards

- **Frame:** White surface, 1px warm border, 16px radius, soft pink shadow
- **Feature card:** White surface, blue 4px offset print-shadow — one per page
- **Highlight band:** Pink-tinted surface (`--surface-warm`) with blue eyebrow

### Navigation

- **Header:** Sticky, warm paper with blur, 1px warm bottom border
- **Nav links:** Space Grotesk, secondary text color, pink on hover
- **CTA button:** Pink fill, same as primary button

### Forms

- **Input:** White background, 1px warm border, 44px height, pink border + ring on focus
- **Textarea:** Same as input, resizable
- **Label:** Mono font, uppercase, muted color

## 5. Layout Principles

### Container

- Max width: 1160px
- Centered with `margin: 0 auto`
- Gutters: 32px desktop, 24px tablet, 16px phone

### Section

- Vertical padding: 96px desktop, 72px tablet, 48px phone
- All sections share the warm paper canvas — rhythm comes from alternating white cards and pink-tinted bands, never from swapping the page background

### Grid System

- **Hero:** 2-column split with 40px gap, stacks below 980px
- **Feature grid:** 2-column with optional full-width cards
- **3-col:** 3-column icon cards, 3 → 2 → 1 col responsive
- **Footer:** 3-column (2fr / 1fr / 1fr)

## 6. Depth & Elevation

| Level | Treatment | Use |
|---|---|---|
| 0 — Flat | No shadow, no border | Body text, section backgrounds |
| 1 — Border | 1px `--border` border | Cards, panels, inputs |
| 2 — Pink glow | `0 16px 40px rgba(242,55,161,0.12)` | Default card state |
| 3 — Print offset | `4px 4px 0 #2c40a7` | One featured card per page |
| Focus | Pink ring `0 0 0 3px` at 30% alpha | Keyboard focus on all controls |

## 7. Do's and Don'ts

### Do

- Keep the warm paper canvas on every section
- Reserve pink for CTAs, links, and interactive highlights
- Set headlines in Space Grotesk 700 with tight leading
- Use the blue offset shadow on exactly one featured card
- Set button labels in Space Grotesk 700
- Use Overpass Mono uppercase eyebrows above section titles

### Don't

- Don't introduce a third accent color — the system is closed at two inks
- Don't swap section backgrounds to grey, white, or dark bands
- Don't bold body type — body stays at weight 400
- Don't use the print-shadow on every card — one feature per page
- Don't use purple-blue gradients by default
- Don't use multiple pink accent words in one heading — one per section maximum

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 560px | Single column, compact padding, smaller type |
| Tablet | 560–980px | 2-column grids, stacked hero |
| Desktop | > 980px | Full layout, 1160px max-width |

### Touch Targets

- Minimum 44×44px for all interactive elements
- Buttons: 44px height + 20px horizontal padding
- Nav links: extend tap area to full row height

### Collapsing Strategy

- **Hero:** Stacks to single column below 980px
- **Feature grids:** 2-col → 1-col below 980px
- **3-col grids:** 3-col → 2-col → 1-col
- **Footer:** 3-col → 2-col → 1-col

## 9. Agent Prompt Guide

### Quick Color Reference

```
Background:  #fdf6ec (warm paper — every section)
Surface:     #ffffff (pure white)
Tint:        #fce7f3 (pink-tinted bands)
Text:        #111827 (near-black)
Secondary:   #374151
Muted:       #6b7280
Accent:      #f237a1 (fluorescent pink — actions only)
Structure:   #2c40a7 (federal blue — headings, shadows)
Border:      #e8d9c8
Border-muted: #f1e4d6
```

### Ready-to-Use Prompt

```
Create a landing page in Riso style:

- Background: #fdf6ec warm paper on every section
- Typography: Space Grotesk for display + body, Overpass Mono for labels
- Colors: #111827 text, #f237a1 pink accent, #2c40a7 blue structure
- Corners: 8/12/16px radii, pills for badges only
- Shadows: soft pink glow default, one blue 4px offset feature card
- Layout: split hero, 2-col feature grid, pink-tinted highlight band
- Buttons: pink fill primary, outlined secondary
- Cards: white surface, 1px warm border
- One pink accent word per headline using <span class="title-highlight">
- Eyebrows: uppercase mono blue labels above section titles
```

### Component Classes

```css
/* Layout */
.container          /* max-width 1160px, centered */
.section            /* 96px vertical padding */
.band-tint          /* pink-tinted highlight band */

/* Typography */
.eyebrow            /* uppercase mono blue label */
.title-highlight    /* pink accent word */
.section-head       /* section header */

/* Buttons */
.button             /* base button */
.button-primary     /* pink filled */
.button-secondary   /* transparent outlined */
.button-block       /* full-width */

/* Hero */
.hero-grid          /* 2-col layout */
.hero-lead          /* lead paragraph */
.hero-actions       /* button group */

/* Features */
.feature-grid       /* 2-col with wide cards */
.feature-3col       /* 3-col with icons */
.feature-card       /* blue offset print-shadow card */

/* Interactive */
.faq-item           /* accordion item */
```

## Source

Derived from [bergside/awesome-design-skills `skills/riso`](https://github.com/bergside/awesome-design-skills/tree/main/skills/riso) (MIT, © 2026 Bergside). Style foundations (palette `#F237A1` / `#2C40A7`, Space Grotesk + Overpass Mono, 12/14/16/20/24/32 scale) preserved; package prose, tokens, and fixtures authored for OpenDesign.
