# Design System Inspired by Volkswagen × DDB

> Category: Automotive / Mid-Century Modern
> The Doyle Dane Bernbach Volkswagen campaign (1959–1970s). Radical honesty, radical whitespace.

Independent interpretive system inspired by historical Volkswagen × DDB advertising constraints; not affiliated with Volkswagen or Doyle Dane Bernbach.

## 1. Visual Theme & Atmosphere

The Volkswagen DDB design language is one of the most studied visual systems in advertising history — and it is defined almost entirely by what it removes. Where competitors filled pages with chrome, tailfins, and aspirational fantasy, DDB's campaigns for Volkswagen placed a small, imperfect car against an ocean of white and let the copy do the work. "Think Small." "Lemon." "It's ugly, but it gets you there." The aesthetic is so spare it feels modern today, 60 years later.

The typographic spine is Futura — Paul Renner's 1927 geometric sans-serif. It was an unlikely pairing: a German car, a German typeface, an American Jewish advertising agency. Yet the combination produced something indelible. Futura Light and Book carry the body copy in tight, dense columns that reward reading. Futura Bold or Demibold marks the headline — but never large, never shouting. The headline earns attention by being unexpectedly quiet.

Photography is high-contrast black-and-white, shot with clinical precision. The Beetle — or Microbus, or Type 3 — sits small, centred on an empty field, lit to show its honest, utilitarian shape. No glamour lighting. No environmental storytelling. The object is the subject. Backgrounds are white or near-white; the occasional printed-page cream appears in document contexts. Ink-black type and pure-white negative space account for 95% of every composition.

The system carries a single warm accent — a muted, mid-century yellow-ochre — used only for extreme emphasis or internal call-outs, never decoratively. Everything else is achromatic.

**Key Characteristics:**
- Futura Light / Book for body — dense, readable, honest
- Futura Bold / Demibold for headlines — present but never commanding
- Near-monochromatic: Ink Black, Off-White Paper, Mid Gray — no colour decoration
- Product image floats small and centred against vast whitespace
- Column-formatted body copy rewards reading — not skimming
- Zero decorative elements: no rules, no ornaments, no gradients
- Whitespace is load-bearing — it creates the gravity the image inhabits
- Wit and self-deprecation encoded into copy register, not visual style

## 2. Color Palette & Roles

### Primary Brand
- **Ink Black** (`#1a1a18`): Primary text, all body copy, headlines, logo
- **Off-White Paper** (`#f5f4ef`): Primary background surface — warm, not clinical
- **Pure White** (`#ffffff`): Secondary surface, image backgrounds, internal card whites

### Neutral Scale
- **Dark Gray** (`#3d3d3b`): Secondary text, subheadings, captions
- **Mid Gray** (`#8a8a87`): Tertiary text, metadata, footnotes, placeholder text
- **Light Gray** (`#c8c8c5`): Borders, dividers, disabled states
- **Pale Gray** (`#e8e8e4`): Alternate section background, table zebra rows

### Accent (use sparingly — one element per composition maximum)
- **Ochre Yellow** (`#d4a017`): Highlight callout, single-word emphasis, error-adjacent urgency
- **Ochre Dark** (`#a67c00`): Active/pressed state for ochre elements only

### Interactive States
- Links: Ink Black (`#1a1a18`), underline on hover — no colour change
- Focus: 2px solid Ink Black offset 2px — visible but unsurprising
- Disabled: Mid Gray (`#8a8a87`) text, no background change

### Shadows
- Avoided entirely. Depth is achieved through typography weight contrast and whitespace alone.

## 3. Typography Rules

### Font Families
- **Display / Body**: `Futura`, fallbacks: `Century Gothic, Trebuchet MS, Gill Sans, Arial, sans-serif`
- **Monospace** (code only): `IBM Plex Mono, Courier New, monospace`

### Hierarchy

| Role | Font | Size | Weight | Line Height | Notes |
|------|------|------|--------|-------------|-------|
| Campaign Headline | Futura | 28–36px | 500 (Demibold) | 1.20 | Never uppercase; sentence case |
| Section Heading | Futura | 22px | 500 | 1.25 | Left-aligned |
| Sub-heading | Futura | 16px | 600 (Bold) | 1.30 | Used sparingly |
| Body Copy | Futura | 14px | 300 (Light) | 1.65 | Dense columns, generous leading |
| Caption / Metadata | Futura | 12px | 400 (Book) | 1.50 | Below images only |
| Button | Futura | 14px | 500 | 1.00 | ALL CAPS, tracked +0.08em |
| Footnote | Futura | 11px | 300 | 1.55 | Ink Black at 50% opacity |

### Principles
- **Never shout**: The largest headline weight is Demibold (500). Heavy weights are never used in display contexts — authority comes from restraint.
- **Sentence case for editorial text**: Headlines, section headings, body labels, and descriptive copy use sentence case. Short button CTAs and compact navigation items may use ALL CAPS with tracking.
- **Dense body, generous leading**: Body copy at 14px / line-height 1.65 creates long, readable columns that respect the reader. This is copy-forward design.
- **Size contrast is subtle**: The ratio between headline (28px) and body (14px) is exactly 2:1 — enough hierarchy without visual aggression.
- **One typeface**: Futura handles every role. No display/body split. Unity through weight and size variation alone.

## 4. Component Stylings

### Buttons
- Text: 14px Futura, weight 500, ALL CAPS, letter-spacing +0.08em
- Padding: 12px 28px — generous horizontal, minimal vertical
- Primary: Ink Black background, Off-White Paper text
- Secondary: transparent background, 1px solid Ink Black border, Ink Black text
- No border-radius (0px) — the DDB aesthetic is uncompromisingly rectangular
- No shadows, no gradients
- Hover: primary inverts slightly (background `#333330`); secondary fills to Ink Black

### Cards & Containers
- No border-radius — all elements are sharp rectangles
- Thin 1px `#c8c8c5` border on cards, or no border with whitespace separation
- Background: Off-White Paper (`#f5f4ef`) or Pure White (`#ffffff`)
- No shadow treatment — elevation is communicated by border alone

### Navigation
- Futura 13px, weight 500, ALL CAPS, letter-spacing +0.10em
- Ink Black text, Off-White Paper or white background
- Active state: Ink Black underline 2px solid
- No hover backgrounds — underline only
- VW-style logo: left-aligned or centred, 40px height, Ink Black

### Forms & Inputs
- 1px solid `#c8c8c5` border, no border-radius
- Focus: border becomes 2px solid Ink Black
- Label: 12px Futura weight 500, sentence case, above input, 8px gap
- Placeholder: Mid Gray (`#8a8a87`)
- Error: 1px solid Ink Black + small inline Futura 12px error text below

### Image Treatment
- Product images: centred, isolated against Off-White Paper or Pure White
- Intentionally small — the whitespace margin around the image is part of the composition
- Black-and-white or desaturated photography strongly preferred
- No image frames, borders, or drop shadows — the image floats

## 5. Layout Principles

### Spacing System
- Base unit: 8px
- Scale: 4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px, 96px, 128px, 192px

### Grid & Container
- Max content width: 880px (classic editorial column — narrower than modern sites)
- Single-column layouts preferred for long-form / campaign pages
- Two-column split: 60/40 (image left, copy right) or 40/60 (copy left, image right)
- No more than 3 columns in any grid — complexity is the enemy
- Gutter: 48px

### Whitespace Philosophy
- **Whitespace is the message**: In a DDB layout, the empty space around the product image is not wasted — it creates the silence that makes the headline land. Use margin and padding aggressively.
- **Asymmetric margins are intentional**: DDB ads often placed the car off-centre with unequal whitespace — this creates tension and directs the eye.
- **Never fill**: Resist adding elements to fill perceived emptiness. If a layout feels "too empty," that is correct.

### Border Radius Scale
- **Zero throughout.** No border-radius on any element — buttons, cards, inputs, images, or containers. The geometric precision of Futura and the rectangular format are non-negotiable DDB signatures.

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Ground (Level 0) | Off-White Paper (`#f5f4ef`) | Page background |
| Surface (Level 1) | Pure White (`#ffffff`), 1px border | Cards, panels |
| Overlay (Level 2) | Pure White, no border, surrounding whitespace | Modals, drawers |

**Shadow Philosophy**: DDB used no drop shadows — ever. The printing press is the design constraint that produced this rule. Honour it digitally. If something needs to feel elevated, give it more whitespace, not a shadow.

## 7. Do's and Don'ts

### Do
- Use Futura Light (300) for all body copy — it has the correct editorial weight
- Keep all corners sharp (0px radius) — rectangular geometry is the system signature
- Use the product image small, centred, surrounded by generous whitespace
- Write honest copy — the visual system is designed to frame truth, not spectacle
- Use sentence case for editorial headings and labels; reserve ALL CAPS for short button CTAs and compact navigation items
- Restrict Ochre Yellow to one element per composition maximum
- Prefer Off-White Paper (`#f5f4ef`) backgrounds over clinical pure white
- Use 1.65 line-height for body text — the copy demands to be read, not scanned

### Don't
- Don't use bold or heavy weights for display headings — Demibold (500) is the ceiling
- Don't add shadows, gradients, or blur effects — none belong in this system
- Don't round corners on anything
- Don't use colour for decoration — the palette is achromatic by design
- Don't fill whitespace — negative space is positive value
- Don't use Ochre Yellow for more than one element per layout
- Don't increase headline size for emphasis — use weight contrast instead
- Don't use more than 3 columns in any layout grid

## 8. Responsive Behavior

### Breakpoints
| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile | 320–480px | Single column, 16px body, full-width image |
| Mobile Large | 480–640px | Single column, tighter margins |
| Tablet | 640–768px | Column layout activates, 2-col possible |
| Tablet Large | 768–1024px | 60/40 splits available |
| Desktop | 1024–1280px | Max 880px container centred |
| Large Desktop | 1280px+ | Container stays 880px, margins grow |

### Collapsing Strategy
- Navigation: horizontal → stacked (no hamburger icon if possible — a text "Menu" link is more DDB)
- Images: maintain float/centre positioning at all sizes
- Two-column layouts: stack to single column below 768px (copy above image)
- Typography: body stays 14px desktop/tablet, scales to 16px mobile for thumb readability
- Headlines: 28–36px desktop → 22–26px mobile — proportional reduction, never dramatic

## 9. Agent Prompt Guide

### Quick Color Reference
- Background: Off-White Paper (`#f5f4ef`)
- Primary text: Ink Black (`#1a1a18`)
- Secondary text: Dark Gray (`#3d3d3b`)
- Muted text: Mid Gray (`#8a8a87`)
- Accent (use once): Ochre Yellow (`#d4a017`)
- Border: Light Gray (`#c8c8c5`)

### Example Component Prompts
- "Create a hero layout: Off-White Paper background (`#f5f4ef`). Small centred black-and-white product image (max 40% of viewport width). Below it, a 28px Futura Demibold (500) headline in sentence case, Ink Black. Then a short body paragraph at 14px Futura Light, line-height 1.65. No border-radius anywhere, no shadows."
- "Design a navigation bar: Off-White Paper background. Futura 13px weight 500 ALL CAPS letter-spacing +0.10em, Ink Black text. VW-style logo left, nav links right. Active link has 2px solid Ink Black underline. No hover backgrounds."
- "Build a primary button: Ink Black background, Off-White Paper text, 14px Futura weight 500 ALL CAPS letter-spacing +0.08em, 12px 28px padding, 0px border-radius, no shadow."
- "Create a two-column layout: 60% left column with dense body copy (14px Futura Light, line-height 1.65, Ink Black), 40% right column with a small product image centred vertically. 48px gutter, 880px max-width container."
- "Design a simple card: 1px solid `#c8c8c5` border, Pure White background, no border-radius, no shadow. 32px internal padding. Heading 16px Futura Bold, body 14px Futura Light."

### Iteration Guide
1. Zero border-radius — every element is a precise rectangle, no exceptions
2. Whitespace is structural — if a layout feels too empty, it is correct
3. Product image is small by design — the silence around it is the point
4. Futura weight ceiling is Demibold (500) for display — never heavier
5. Sentence case for editorial text; short button CTAs and compact navigation items may use ALL CAPS
6. One colour accent (Ochre Yellow) maximum per composition
7. No shadows, no gradients, no decorative rules or ornaments
8. Copy is the second visual element — give it room to breathe at 1.65 line-height
