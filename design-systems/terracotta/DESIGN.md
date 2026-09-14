# Terracotta Design

> Category: Editorial · Studio
> Sun-baked clay-toned editorial system: warm cream surfaces, ink-brown headlines in a display serif, single terracotta accent. Earthy, human, content-first — tuned for long-form reading.

## 1. Visual Theme & Atmosphere

Terracotta is a sun-baked, clay-toned editorial interface built on warm cream surfaces (`#faf5eb`), ink-brown headlines (`#2a1e17`) set in DM Serif Display, and a single terracotta accent (`#c56a3c`). Earthy, human, and content-first — tuned for long-form reading, blogs, storytelling, and editorial layouts where readability and visual rhythm matter.

The mood is artisan print: generous leading (1.7 body), warm hairline rules instead of boxes, small radii (4–12px) that stay quiet. DM Serif Display carries headlines and pull-quotes; body reads in the same serif at comfortable measure; JetBrains Mono handles eyebrows, captions, and data.

**Key signals:**
- Warm cream canvas with ink-brown ink — never pure black on pure white
- One terracotta accent for CTAs, links, drop-caps, and pull-quote rules
- Generous whitespace and a narrow measure (60–68ch) for reading surfaces
- Warm hairline dividers between sections instead of card chrome
- DM Serif Display headlines, JetBrains Mono technical labels

**Anti-patterns to avoid:**
- Cold grey SaaS chrome or dark-mode bands breaking the warm canvas
- Sans-serif headline stacks — headlines are always the display serif
- Heavy card grids with shadows — editorial rhythm uses rules and space, not boxes
- Second accent colors competing with terracotta

## 2. Color Palette & Roles

### Primary

| Token | Hex | Role |
|---|---|---|
| `--accent` | `#c56a3c` | Sole accent — CTAs, links, drop-caps, pull-quote rules, active states |

### Surfaces

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#faf5eb` | Page background — warm cream, shared by every section |
| `--surface` | `#ffffff` | Card and panel surfaces (used sparingly) |
| `--surface-warm` | `#f3e9d8` | Alternate surface — warm sand bands, quote panels |

### Text

| Token | Hex | Role |
|---|---|---|
| `--fg` | `#2a1e17` | Primary text — ink-brown headlines, body |
| `--fg-2` | `#5c4a3c` | Secondary text — descriptions, ledes |
| `--muted` | `#857060` | Muted text — captions, labels, metadata |

### Borders

| Token | Hex | Role |
|---|---|---|
| `--border` | `#e0d2bd` | Primary borders — rules, card outlines |
| `--border-soft` | `#ece0cd` | Muted borders — subtle separators |

### Reading Measure

Body copy sets at 16px/1.7 in the display serif with a 60–68ch measure. Ledes run one step up in secondary ink. Pull-quotes break the measure at larger size with a 3px terracotta left rule.

## 3. Typography Rules

### Font Families

- **Display + Body:** DM Serif Display — headlines, body, pull-quotes
- **Mono:** JetBrains Mono — eyebrows, captions, metadata, data

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| Hero | `clamp(2.4rem, 5vw, 3.5rem)` | 400 | 1.1 | -0.01em | Page headline (serif needs no bold) |
| Section | `clamp(20px, 2vw, 28px)` | 400 | 1.2 | -0.01em | Section titles |
| Card | 18px | 400 | 1.4 | 0 | Card titles |
| Body | 16px | 400 | 1.7 | 0 | Body text |
| Caption | 14px | 400 | 1.5 | 0 | Captions, fine print |
| Eyebrow | 12px | 700 | 1 | 0.14em | Uppercase mono labels |

### Principles

- Serif headlines stay at weight 400 — the face carries the emphasis, not bolding
- Body measure capped at 68ch; center or constrain reading columns
- Eyebrows are JetBrains Mono uppercase with wide tracking in muted clay
- Drop-caps and pull-quote rules use the terracotta accent sparingly
- Numbers, tables, and metadata switch to the mono face with tabular figures

## 4. Component Stylings

### Buttons

- **Primary:** Terracotta fill (`--accent`), white text, 8px radius, darkened hover
- **Secondary:** Transparent, ink text, 1px warm border, terracotta border + text on hover
- **Block:** Full-width variant of any button

### Cards

- **Frame:** White surface, 1px warm border, 12px radius, soft warm shadow
- **Quote panel:** Warm sand surface (`--surface-warm`), 3px terracotta left rule
- **Feature card:** White surface with warm border; no glow, elevation stays quiet

### Navigation

- **Header:** Sticky, warm cream with blur, 1px warm bottom border
- **Nav links:** Serif, secondary ink, terracotta on hover
- **CTA button:** Terracotta fill, same as primary button

### Forms

- **Input:** White background, 1px warm border, 44px height, terracotta border + ring on focus
- **Textarea:** Same as input, resizable
- **Label:** Mono font, uppercase, muted color

### Editorial

- **Pull-quote:** Large serif, terracotta left rule, generous vertical margins
- **Drop-cap:** Terracotta serif initial, three lines tall
- **Footnote:** Mono, muted, hairline rule above

## 5. Layout Principles

### Container

- Max width: 1140px, reading columns capped at 68ch
- Centered with `margin: 0 auto`
- Gutters: 32px desktop, 24px tablet, 16px phone

### Section

- Vertical padding: 104px desktop, 72px tablet, 48px phone
- Sections share the warm cream canvas — rhythm comes from hairline rules, sand bands, and whitespace, never from dark or grey bands

### Grid System

- **Hero:** Centered editorial masthead with eyebrow, headline, lede, actions
- **Article:** Single reading column with side notes collapsing below 980px
- **Feature grid:** 2-column with optional full-width cards
- **Footer:** 3-column (2fr / 1fr / 1fr)

## 6. Depth & Elevation

| Level | Treatment | Use |
|---|---|---|
| 0 — Flat | No shadow, no border | Body text, section backgrounds |
| 1 — Border | 1px `--border` border | Cards, panels, inputs |
| 2 — Warm lift | `0 18px 44px rgba(42,30,23,0.12)` | Default card state |
| Focus | Terracotta ring `0 0 0 3px` at 28% alpha | Keyboard focus on all controls |

Depth stays quiet — hierarchy comes from type scale, rules, and space, not from stacked shadows.

## 7. Do's and Don'ts

### Do

- Keep the warm cream canvas on every section
- Set headlines in DM Serif Display at weight 400
- Cap reading columns at 68ch with 1.7 leading
- Reserve terracotta for CTAs, links, and one editorial flourish per section
- Use hairline warm rules to separate sections
- Set eyebrows and metadata in JetBrains Mono uppercase

### Don't

- Don't bold serif headlines — the face is the emphasis
- Don't introduce a second accent color
- Don't build heavy shadowed card grids — use rules and space
- Don't swap in grey, white, or dark section bands
- Don't set body copy wider than 68ch
- Don't use purple-blue gradients by default

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 560px | Single column, compact padding, smaller type |
| Tablet | 560–980px | 2-column grids, stacked article + notes |
| Desktop | > 980px | Full layout, 1140px max-width |

### Touch Targets

- Minimum 44×44px for all interactive elements
- Buttons: 44px height + 20px horizontal padding
- Nav links: extend tap area to full row height

### Collapsing Strategy

- **Article:** Reading column + side notes stack below 980px
- **Feature grids:** 2-col → 1-col below 980px
- **Footer:** 3-col → 2-col → 1-col

## 9. Agent Prompt Guide

### Quick Color Reference

```
Background:  #faf5eb (warm cream — every section)
Surface:     #ffffff (sparingly)
Sand:        #f3e9d8 (quote panels, bands)
Text:        #2a1e17 (ink-brown)
Secondary:   #5c4a3c
Muted:       #857060
Accent:      #c56a3c (terracotta — actions only)
Border:      #e0d2bd
Border-muted: #ece0cd
```

### Ready-to-Use Prompt

```
Create a page in Terracotta style:

- Background: #faf5eb warm cream on every section
- Typography: DM Serif Display for headlines + body, JetBrains Mono for labels
- Colors: #2a1e17 ink text, #c56a3c terracotta accent
- Corners: 4/8/12px radii, quiet elevation
- Layout: centered masthead hero, 68ch reading column, hairline rules
- Buttons: terracotta fill primary, outlined secondary
- Cards: white surface, 1px warm border, soft warm shadow
- Pull-quotes with terracotta left rule
- Eyebrows: uppercase mono clay labels above section titles
```

### Component Classes

```css
/* Layout */
.container          /* max-width 1140px, centered */
.section            /* 104px vertical padding */
.reading-col        /* 68ch reading column */
.band-sand          /* warm sand band */

/* Typography */
.eyebrow            /* uppercase mono clay label */
.title-highlight    /* terracotta accent word */
.pull-quote         /* large serif with terracotta rule */
.drop-cap           /* terracotta serif initial */

/* Buttons */
.button             /* base button */
.button-primary     /* terracotta filled */
.button-secondary   /* transparent outlined */
.button-block       /* full-width */

/* Hero */
.masthead           /* centered editorial hero */
.hero-lead          /* lede paragraph */
.hero-actions       /* button group */

/* Features */
.feature-grid       /* 2-col with wide cards */

/* Interactive */
.faq-item           /* accordion item */
```

## Source

Derived from [bergside/awesome-design-skills `skills/terracotta`](https://github.com/bergside/awesome-design-skills/tree/main/skills/terracotta) (MIT, © 2026 Bergside). Style foundations (palette `#C56A3C` / `#F3E9D8`, DM Serif Display + JetBrains Mono, 14/16/18/24/32/40 scale) preserved; package prose, tokens, and fixtures authored for OpenDesign.
