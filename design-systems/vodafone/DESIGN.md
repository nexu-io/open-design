# Design System Inspired by Vodafone

> Category: Media & Consumer
> Global telecom brand. Monumental uppercase display, Vodafone Red chapter bands.

## 1. Visual Theme & Atmosphere

Vodafone's corporate web system carries the confident, broadcast-scale presence of a global telecom brand — built around a single, fiercely-owned brand red and a restrained, editorial layout that lets imagery and type carry the emotional weight. Every page opens the same way: a cinematic dark hero image behind a towering, tight-tracked uppercase display headline ("EVERYONE. CONNECTED.", "INVESTORS", "OUR BUSINESS") followed by a deep red full-width band that acts as a chapter break, then a crisp white editorial grid or a near-black section reserved for institutional content (share ticker, global map, ESG data). The voice is institutional but human: warm documentary photography — cable-laying crews, coral reefs, pine forests, urban twilight — photographed with color-graded realism and set against clean neutral surfaces that never compete with the content.

The typography system is the signature. A custom Vodafone display face runs all the way up to 144px in heavy 800-weight uppercase with negative tracking, and it holds that voice consistently across every page template. Body copy sits in a calm 16-18px mid-weight rhythm. This dual scale — monumental at the top, almost quiet at the bottom — creates the "corporate newsroom" feeling: every page reads like the front of a national paper whose masthead happens to be red.

Surface treatment is disciplined and predictable: a three-surface pass of white (editorial canvas) → Vodafone red (band dividers, CTA buttons, the famous speech-mark logo) → near-black charcoal (footer, share-ticker panel, global-impact map). There is almost no decorative shadow, almost no gradient, and almost no rounded-corner softness. Edges are small and clinical (2px and 6px), buttons operate as a two-tier system — tight 2px rectangles for utility/form actions, and fully-rounded 60px pills for primary content CTAs. This is a design system that trusts the brand color to do the heavy lifting and gets out of its way everywhere else.

**Key Characteristics:**
- Vodafone Red (`#e60000`) is the single dominant accent — used for CTAs, dividers, band sections, the speech-mark logo, and the rotated "IMPACT" brand-mark type on the sustainability map
- Monumental uppercase display type (up to 144px, weight 800, negative letter-spacing) paired with calm 16-18px body copy
- A universal page rhythm: dark atmospheric hero → monumental uppercase headline → full-width red band → white editorial canvas → dark charcoal institutional panel → charcoal footer
- Two-tier button system: tight 2px-radius rectangles for utility actions, fully-pill 60px buttons for primary content CTAs (both equally primary, selected by context)
- Documentary photography (people, infrastructure, cities, nature) dominates over illustration; no stock-icon noise
- Near-absence of shadows and gradients — hierarchy comes from type weight, color blocks, and spacing rather than elevation
- Deep charcoal surface (`#25282b`) is reused as the footer AND the institutional data panel (share ticker, world map) — a single material for anything formal and numeric

## 2. Color Palette & Roles

### Primary

- **Vodafone Red** (`#e60000`): The brand's single, non-negotiable signature — used for primary CTA backgrounds, the speech-mark logo, full-bleed band dividers between editorial sections, tag-pill outlines, and the rotated brand-mark type that labels the global-impact map. This red must never be substituted or tinted; it is the identity.

### Secondary & Accent

- **Pure White** (`#ffffff`): The dominant editorial canvas — page background, card backgrounds, reversed text on dark or red surfaces, and circular icon-button fills.
- **Signal Blue** (`#3860be`): Reserved for inline text links in their resting state (underlined), providing a calm accessible blue that reads clearly against both white and dark surfaces.
- **Deep Brand Red Shade** (`#ac1811`): A darker red appears on quiet label chips (notably on the sustainability page) — used sparingly for low-prominence tag elements that need red identity without drawing primary attention.

### Surface & Background

- **Canvas White** (`#ffffff`): The primary page and card surface. Every editorial module sits on this canvas.
- **Light Neutral** (`#f2f2f2`): Used for filled neutral pill-badge backgrounds and quiet UI chrome where full white would disappear against the canvas.
- **Charcoal Institutional Panel** (`#25282b`): The same color used for text is reused as a full-width dark surface for the footer, the share-ticker panel, and the global-impact map section. It transforms the page into a "data mode" environment.
- **Translucent White Overlay** (`rgba(255,255,255,0.1)`): A soft glass tint used for pill buttons that sit on dark hero imagery — lets the photo breathe through the button.

### Neutrals & Text

- **Charcoal Headline** (`#25282b`): All heading text on light surfaces and the charcoal surface color itself — a near-black with a faint cool tint, never pure black.
- **Secondary Body Grey** (`#7e7e7e`): Body copy, meta text, and secondary labels — a true mid-grey that reads as unemphatic but still legible.
- **Form Text Grey** (`#333333`): Borders on input-style ghost buttons and the text color inside them.
- **Disabled Grey** (`#bebebe`): Inactive chip text on subtle ghost-style controls.
- **Translucent White Divider** (`rgba(255,255,255,0.25)`): Hairline column dividers on dark institutional panels (footer columns, map legend rows).

### Semantic & Accent

- **Surface Red Band** (`#e60000`): The same brand red deployed as a full-width band between editorial sections — functions as a chapter divider and a visual amplifier for the brand. Appears on every page template.
- **Tag Pill Red Border** (`#e60000`): 1px outline on light tag pills, letting the brand color touch small UI without drowning card content.

### Gradient System

Vodafone's design is intentionally gradient-free. The only tonal variation is a subtle photographic vignette on hero imagery (dim coral reefs, pine forests, cable-laying crews, urban twilight), where the image itself — not a CSS gradient — provides the tonal ramp. No linear gradients are used on buttons, cards, or surfaces.

## 3. Typography Rules

### Font Family

- **Primary**: `Vodafone` (custom corporate sans-serif)
- **Fallback stack**: `Vodafone, "Helvetica Neue", Arial, sans-serif`
- **Icon font**: `icomoon` — carries pictograph glyphs at 18px/24px/48px fixed sizes
- **Rendering**: `font-smoothing: antialiased` across the board; OpenType features are not aggressively used — the design relies on weight and tracking, not stylistic alternates

### Hierarchy

| Role | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|--------|-------------|----------------|-------|
| Display / Hero XL | 144px | 800 | 0.79 | -1px | Uppercase; the signature "EVERYONE. CONNECTED." treatment |
| Display / Hero L | 126px | 800 | 0.90 | -1px | Uppercase; used when the hero headline is longer |
| Display / Hero M | 90px | 800 | 0.93 | — | Uppercase; secondary hero or full-bleed section heads |
| Display / Impact | 70px | 800 | 1.17 | -1px | Sustainability section numeric / callout scale |
| H1 — Light | 48px | 300 | 1.08 | — | Section headlines set in light weight for editorial calm |
| H1 — Bold | 48px | 800 | 1.00 | -1px | Institutional data headers (share price on charcoal panel) |
| H2 — Light | 40px | 300 | 1.10 | — | Sub-section headers |
| H2 — Bold | 40px | 700 | 1.10 | — | Denser sub-section headers |
| H3 — Bold | 32px | 700 | 1.25 | — | Card cluster titles and feature intros |
| H4 — Bold | 24px | 700 | 1.00 | — | Card titles (news, feature, article modules) |
| H4 — Light | 24px | 300 | 1.42 | — | Intro paragraphs on investor / sustainability pages |
| H5 — Bold | 20px | 700 | 1.30 | — | Compact module titles and side callouts |
| Lead Body | 20px | 400 | 1.40 | — | Introductory paragraphs under large headlines |
| Body Large | 18px | 400 | 1.56 | — | Long-form article body and prominent copy |
| Body Bold | 18px | 600 | 1.56 | — | Emphasized inline phrases |
| Body Base | 16px | 400 | 1.38 | — | Default paragraph size |
| Label Uppercase | 16px | 800 | 1.50 | — | Uppercase navigational labels |
| Eyebrow / Date | 14px | 400/700 | 1.43 | — | Article date stamps and meta (14 APR 2026) |
| Tag Pill | 14px | 700 | 1.50 | — | Badge text inside red-outlined pills |
| Caption Uppercase | 14px | 400 | 1.14 | — | Uppercase meta label |
| Caption | 12px | 500 | 2.00 | — | Footer meta, legal lines |
| Micro Label | 12px | 600 | 1.33 | — | Uppercase tiny labels on badges and counters |
| Button Primary | 14.4px | 700 | 1.00 | 0.144px | Primary filled button label |
| Button Compact | 12px | 700 | 1.00 | 0.12px | Compact button label |

### Principles

- **Dual-scale drama**: the system deliberately stretches from 144px down to 8.5px without mid-range showing off. The result is a clear corporate hierarchy — monumental for brand moments, calm for reading.
- **Uppercase display, mixed-case body**: all the largest display sizes are uppercase with negative tracking, while everything 48px and below is sentence case with normal tracking.
- **Weight spread**: only three real weights do the work — 800 (display), 700 (bold bodies, buttons, tags), and 400 (reading body). A lighter 300-weight is used for editorial-style 40px/48px headlines when a calmer voice is wanted.
- **No italics, no decorative letterspacing on body**: the body system is deliberately neutral so the display work can shout.
- **Rotated brand-mark type**: on the sustainability section, the word "IMPACT" is set in brand red at a large display size and rotated 90° to run vertically along the edge of a dark world-map panel — a distinctive typographic flourish that the template uses to label its institutional data surfaces.

### Note on Font Substitutes

The Vodafone corporate typeface is proprietary. When recreating the look in open systems, substitute with **Inter** at weights 400/600/800, or **Neue Haas Grotesk** if available. Inter needs its letter-spacing reduced by roughly 1-2% at display sizes (80px+) to approximate the Vodafone face's tight tracking; its line-height should be set to 0.85-0.95 for the uppercase display tier.

## 4. Component Stylings

### Buttons

Vodafone operates a genuine two-tier primary button system. Both tiers are used as primary calls to action — the difference is context (form/chrome vs editorial/content), not hierarchy.

**Primary Red Rectangle** (utility / form CTA — "Accept All Cookies", "Subscribe")
- Background: Vodafone Red (`#e60000`)
- Text: Pure White (`#ffffff`), 14.4px, weight 700, letter-spacing 0.144px
- Padding: 12px vertical, 10px horizontal
- Border: 1px solid Vodafone Red (`#e60000`)
- Border radius: 2px — deliberately sharp-cornered
- Default state: solid red fill with crisp 2px corners
- Active state: brief opacity drop to `0.9` on press

**Primary Red Pill** (editorial / content CTA — "Link to Our approach to ESG", "EXPLORE CONNECTING PEOPLE")
- Background: Vodafone Red (`#e60000`)
- Text: Pure White (`#ffffff`), 14.4px, weight 700, letter-spacing 0.144px
- Padding: 16px uniform
- Border radius: 60px — fully pill-shaped
- Default state: solid red fill with rounded ends
- Active state: brief opacity drop to `0.9` on press

**Ghost White Rectangle** (secondary form action)
- Background: Pure White (`#ffffff`)
- Text: Form Text Grey (`#333333`), 14.4px, weight 700
- Padding: 12px vertical, 10px horizontal
- Border: 1px solid Form Text Grey (`#333333`)
- Border radius: 2px
- Default state: white fill with charcoal outline
- Active state: opacity `0.9` on press

**Glass Pill** (sits on dark hero imagery — secondary content CTA)
- Background: Pure White at 10% opacity (`rgba(255,255,255,0.1)`)
- Text: Pure White (`#ffffff`), weight 700
- Padding: 8px vertical, 16px horizontal
- Border radius: 24px — fully pill-shaped
- Default state: soft translucent pill lets the photo breathe through

**Content Ghost Pill** (inline within editorial cards — low-emphasis content CTA)
- Background: Black at 5% opacity (`rgba(0,0,0,0.05)`)
- Text: Vodafone Red (`#e60000`), 14.4px, weight 700
- Padding: 15px uniform
- Border radius: 60px — fully pill-shaped
- Default state: nearly transparent pill with red text

**Icon Control Button** (video play/pause, carousel arrows, close)
- Background: Pure White (`#ffffff`)
- Icon color: Charcoal Headline (`#25282b`)
- Border radius: 50% — perfect circle
- Outline: 1px solid white, used for focus indication
- Size: typically 32-40px diameter

### Cards & Containers

**News / Editorial Card** (homepage article tile)
- Background: Pure White (`#ffffff`)
- Border radius: 6px (applied to image corners and card container)
- Shadow: none — cards rely on spacing and the image aspect ratio for separation
- Internal layout: 16:9 image on top → 12px gap → eyebrow row (date + tag pill) → 8px gap → H4 Bold title → 16px card padding on sides and bottom
- The card image uses `object-fit: cover` and rounded top corners (6px top-left/top-right)

**Asymmetric Corner Card** (featured homepage cards)
- Background: Pure White (`#ffffff`)
- Border radius: `0px 6px 0px 0px` — a deliberate single-corner-rounded shape that echoes the Vodafone speech-mark logo's curved geometry
- No shadow, no border — the asymmetric radius itself is the visual signature

**Circular Portrait / Pictogram Container** (sustainability page)
- Background: Pure White (`#ffffff`)
- Border radius: 100% — perfect circle
- Used for ESG pictograms and executive portraits inside the institutional content area

### Inputs & Forms

Vodafone's corporate site does not expose many inline form controls on the homepage, but button-style inputs follow these rules:

- Background: Pure White (`#ffffff`)
- Text: Form Text Grey (`#333333`), 16px, weight 400
- Border: 1px solid Form Text Grey (`#333333`)
- Border radius: 2px
- Padding: 12px 10px
- Error state (when shown): the 1px border shifts to Vodafone Red (`#e60000`) and error message text inherits the same red at 12px weight 600

### Navigation

**Top bar**
- Background: transparent over hero imagery; solid white (`#ffffff`) on scroll or interior pages
- Height: approximately 64px desktop, 56px mobile
- Logo: Vodafone speech-mark, 40×40px red circle with a white "speech-mark" cut-out, left-aligned
- Nav links: 16px weight 400 Charcoal Headline (`#25282b`) on white; reversed to white when sitting on dark hero imagery
- Right-side utility: small icon links (search, locale, menu) rendered as 24px icomoon glyphs
- On interior pages (Investors, Sustainable Business), the top bar shows additional secondary-nav row: "Vodafone Business / Vodafone Foundation / Our site" labels, aligned right

**Mobile collapse**
- At approximately 768px the horizontal nav collapses into a hamburger
- Mobile menu opens as a full-width overlay with white surface, 18px weight 400 link rows, 16px vertical padding per row

### Image Treatment

- **Hero images**: full-bleed, dark atmospheric photography (coral reefs, pine forests, cable crews, urban twilight) with a natural vignette or cool-tone color grade — no CSS overlay is needed because the imagery itself is pre-graded
- **Card thumbnails**: 16:9 aspect ratio, 6px top corner radius matching the card
- **Square editorial images**: 1:1 ratio used in feature modules, always 6px corner radius
- **Round portraits**: 100% (perfect circle) for executive headshots and ESG pictograms
- **Loading**: lazy-loading triggers on scroll; images stabilize within ~200ms of entering the viewport
- **No decorative borders on images** — the card radius does all the framing work

### Tag Pills / Badges

Two distinct pill styles appear:

**Outlined Red Pill** (used inline on article card metadata, e.g., "EMPOWERING PEOPLE")
- Background: Pure White at 80% opacity (`rgba(255,255,255,0.8)`)
- Text: Near-black at 80% opacity (`rgba(0,0,0,0.8)`), 12px, weight 600, uppercase
- Border: 1px solid Vodafone Red (`#e60000`)
- Padding: 6px
- Border radius: small-rounded (roughly 2px)

**Filled Neutral Pill** (quieter tags)
- Background: Light Neutral (`#f2f2f2`)
- Text: Charcoal Headline (`#25282b`), 14px, weight 700
- Padding: 4px 12px
- Border radius: 32px — fully pill-shaped

### Red Divider Band

A signature reusable component that appears on every page template: a full-width band of Vodafone Red (`#e60000`) that runs horizontally across the page to separate the monumental hero from the editorial body beneath it. It carries no text and no controls — it simply is the brand's way of saying "new chapter." Typical height: 40-80px.

### Share Ticker Panel (Investor pages)

A distinctive institutional component that anchors the investor template:
- Background: Charcoal Institutional Panel (`#25282b`)
- Large numeric display: share price set in 48px weight 800 white type with negative letter-spacing (e.g., "116.05 GBX")
- Metadata row: delay notice (e.g., "15-min delayed") and timestamp in 14px weight 400 secondary grey text
- Layout: sits as a horizontal strip above the footer, spans the full content width
- Hairline dividers (`rgba(255,255,255,0.25)`) separate the ticker from the footer columns

### Global Impact Map Panel (Sustainability pages)

A signature reusable component that anchors the sustainability template:
- Background: Charcoal Institutional Panel (`#25282b`)
- A dark minimal world-map illustration in slightly lighter grey
- Red circular markers (`#e60000`) plotted on geographic locations where the brand operates
- Vertically-rotated brand word "IMPACT" set in Vodafone Red at large display size (weight 800, uppercase, 90° rotated) running along one edge of the panel — this is the template's signature typographic move
- Small legend with red markers and white uppercase labels at the top-left

### Footer

A universal component across all page templates:
- Background: Charcoal Institutional Panel (`#25282b`)
- Layout: 4-column link grid (Our company / Investors / Vodafone websites / Share price) followed by a "Connect with us" social row and legal/privacy line
- Logo: red speech-mark repeats bottom-right at 32-40px
- Column header type: 16px weight 800 uppercase white
- Column link type: 14px weight 400 white, stacked vertically with 12px row spacing
- Divider hairlines: `rgba(255,255,255,0.25)` between column group and legal row

## 5. Layout Principles

### Spacing System

Base unit: **8px**. The scale accommodates both tight UI (1px, 2px, 4px) and generous editorial rhythm (16px, 20px, 24px, 32px). Two values (`32px` and `38px`) appear across every page in the analysis, making them the template's universal rhythm constants.

| Token | Value | Typical Use |
|-------|-------|-------------|
| 2xs | 2px | Hairline separators |
| xs | 4px | Icon-to-text gap in tight controls |
| sm | 8px | Base rhythm unit |
| md | 12px | Card internal padding, eyebrow-to-title gap |
| base | 16px | Paragraph rhythm, card padding, pill button padding |
| lg | 20px | Section-internal spacing |
| xl | 24px | Card-to-card spacing, column gutters |
| 2xl | 32px | Section intro-to-content breaks — universal constant |
| 3xl | 38px | Band-to-next-section vertical push — universal constant |
| section | 64-96px | Vertical rhythm between major editorial modules |

### Grid & Container

- **Max content width**: approximately 1440px on very large screens; articles and hero modules typically sit at 1200px
- **Column pattern on cards**: 3-up or 4-up card grid at desktop (1200-1440px), 2-up at tablet (768-1024px), stacked 1-up at mobile (<768px)
- **Horizontal padding**: 32px at desktop edge, 20px at tablet, 16px at mobile
- **Gutters between cards**: 24px desktop, 16px mobile
- **Institutional panel (share ticker, world map, footer)**: always full-bleed edge-to-edge at every breakpoint

### Whitespace Philosophy

Vodafone's editorial canvas leans generous — whitespace is used as a visual palette cleanser between a monumental headline and the card grid or data panel that follows. Sections are separated by tall vertical rhythm (64-96px) plus the occasional red band that acts as both a separator and a brand signal. Within cards, spacing is tight and efficient (12-16px) so the photography can take the stage.

### Border Radius Scale

| Token | Value | Typical Use |
|-------|-------|-------------|
| hairline | 1px | Inline text wraps, small badges |
| button-tight | 2px | Primary and secondary rectangle button corners — the brand's utility-form look |
| card | 6px | News cards, images, input fields |
| asymmetric | `0px 6px 0px 0px` | Featured cards (top-right corner only) |
| glass-pill | 24px | Translucent white pills sitting on dark hero imagery |
| badge-pill | 32px | Filled neutral pill badges |
| cta-pill | 60px | Primary red content CTAs — the brand's editorial button look |
| circle | 50% | Icon buttons, carousel arrows, close controls |
| portrait | 100% | Circular portraits and ESG pictograms |

## 6. Depth & Elevation

Vodafone's system is deliberately flat. There is almost no conventional box-shadow in the UI. Hierarchy is carried by color (red bands, charcoal institutional panels), typography weight (800 vs 400), and spacing.

| Level | Treatment | Use |
|-------|-----------|-----|
| 0 — Surface | No shadow, no border | Default card, default section |
| 1 — Outline | 1px solid border at low-opacity | Ghost buttons, outlined pills |
| 2 — Inset Highlight | `inset 0 0 0 1px` on focus | Pressed / focused controls |
| 3 — Photographic depth | The photography itself carries the depth | Hero imagery |
| 4 — Surface shift | Charcoal institutional panel below a white editorial canvas | Share ticker / world map / footer |

Shadow philosophy: Vodafone treats drop shadows as a distraction from brand clarity. The few extracted shadow tokens are reserved for inset focus rings. The dominant "elevation" in the system is a **color surface shift** — switching from the white editorial canvas to the charcoal institutional panel — rather than a lift-off drop shadow.

### Decorative Depth

The only decorative depth cues are:
- Atmospheric dark hero photography that carries its own cinematic tonal depth (no CSS overlay needed)
- The rotated vertical "IMPACT" wordmark on the sustainability map, which creates the illusion of a fourth wall alongside the map panel

## 7. Do's and Don'ts

### Do

- Use Vodafone Red (`#e60000`) as the single loudest element on any screen — one primary CTA per fold, one red band per editorial break
- Set display headlines in uppercase 800-weight with tight negative tracking; let them run to 90-144px on desktop
- Pair monumental display type with calm 16-18px body copy — the scale jump is the system
- Switch the button radius based on context: 2px rectangles for form and utility actions, 60px pills for editorial content CTAs
- Let documentary photography breathe at 16:9 or 1:1 on a 6px radius — no decorative borders, no heavy overlays
- Use the red band as a full-width chapter divider between every hero and the content below it
- Anchor every page with a charcoal institutional surface (`#25282b`) — the footer always, and on investor/sustainability pages extend the same color up to include the share ticker or the global-impact map
- Respect the universal page rhythm: dark hero → red band → white editorial → charcoal institutional → charcoal footer

### Don't

- Don't introduce a second brand hue to rival Vodafone Red — no teals, no purples, no orange accents
- Don't soften rectangle button corners beyond 2px, and don't shrink pill button corners below 60px — the two shapes are both load-bearing
- Don't add drop shadows to cards or buttons — the system is intentionally flat and uses surface color to carry elevation
- Don't use gradients on backgrounds, buttons, or text
- Don't mix uppercase tracking on body text — uppercase is reserved for display, labels, and micro-labels
- Don't use italics for emphasis — use weight 600/700 instead
- Don't decorate headlines with colored underlines or highlights — the type does the work
- Don't use pure black (`#000000`) for text or surfaces — always use Charcoal Headline (`#25282b`)

## 8. Responsive Behavior

### Breakpoints

The practical tiers observed across all three templates:

| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile | ≤ 600px | Nav collapses to hamburger; hero display drops to ~56-72px; cards stack 1-up |
| Mobile Large | 601-767px | Hero display ~72-90px; cards still stack 1-up |
| Tablet | 768-1023px | Nav re-expands; cards grid 2-up; hero display ~90-120px |
| Laptop | 1024-1199px | Full nav; cards 3-up; hero display ~120-144px |
| Desktop | 1200-1439px | Standard editorial layout; cards 3-up or 4-up |
| Wide | ≥ 1440px | Content caps at 1440px; outer canvas padding grows |

### Touch Targets

All interactive controls meet a 44×44px minimum on mobile. Icon buttons use 40×40px circular hit areas which expand with 4px invisible padding on touch devices. Primary CTA buttons land at approximately 48×48px on mobile (16px top/bottom + text line for pills; 12px + text line for rectangles).

### Collapsing Strategy

- **Nav**: horizontal links collapse into a hamburger at 768px; the logo stays left-aligned at all widths
- **Card grid**: 4-up → 3-up at 1200px → 2-up at 768px → 1-up at 600px, with gutters shrinking from 24px to 16px
- **Hero display type**: step-reduces through 144 → 126 → 90 → 72 → 56px as viewports shrink
- **Section padding**: 96px vertical at desktop, 64px at tablet, 48px at mobile
- **Red divider bands**: remain full-width at every breakpoint; their vertical height compresses from ~80px at desktop to ~40px at mobile
- **Institutional panels (share ticker / world map)**: on mobile, multi-column content restacks into a single vertical stream but the charcoal surface stays edge-to-edge
- **Vertically-rotated "IMPACT" wordmark**: becomes a horizontal label or is dropped entirely on mobile where vertical space is limited

### Image Behavior

- Hero imagery: art-directed variant at mobile (tighter crop) versus desktop (wide atmospheric frame)
- Card thumbnails: always 16:9 regardless of viewport; `loading="lazy"` is standard
- Circular portraits: fixed at 80-120px diameter on desktop, shrinking to 64-80px on mobile
- Logo: fixed at 40×40px across breakpoints (consistent brand mark size)

## 9. Agent Prompt Guide

### Quick Color Reference

- Primary CTA: "Vodafone Red (`#e60000`)"
- Background: "Canvas White (`#ffffff`)"
- Heading text: "Charcoal Headline (`#25282b`)"
- Body text: "Secondary Body Grey (`#7e7e7e`)"
- Institutional surface: "Charcoal Institutional Panel (`#25282b`)"
- Inline link: "Signal Blue (`#3860be`)"
- Quiet pill background: "Light Neutral (`#f2f2f2`)"

### Example Component Prompts

- "Create a primary red rectangle button: Vodafone Red (`#e60000`) background, pure white 14.4px weight 700 text, 2px border radius (sharp corners), 12px vertical × 10px horizontal padding. Use for form and utility actions. No shadow, no gradient."
- "Create a primary red pill CTA: Vodafone Red (`#e60000`) background, pure white 14.4px weight 700 text, 60px border radius (fully pill-shaped), 16px uniform padding. Use for editorial content calls-to-action."
- "Design an editorial news card: white background, 6px border radius, 16:9 image at the top, 12px eyebrow row containing a date and a red-outlined uppercase tag pill, then a 24px weight 700 Charcoal title. No shadow — spacing alone separates cards."
- "Build a hero section: dark atmospheric photo as the full-bleed background, monumental uppercase headline at 144px weight 800 with -1px letter-spacing, single Vodafone Red pill CTA beneath it, no overlay gradient."
- "Create a red divider band: full-width strip of Vodafone Red (`#e60000`), 64px tall on desktop and 40px on mobile, no text, no controls — it acts purely as a visual chapter break between editorial sections."
- "Design an institutional data panel: full-bleed Charcoal Institutional Panel (`#25282b`) background, large numeric display at 48px weight 800 white with negative letter-spacing, 14px weight 400 grey meta row beneath. Use for share ticker or stats callout."
- "Design a global impact map: Charcoal Institutional Panel (`#25282b`) background, minimal grey world-map illustration, red Vodafone-red circular markers on operational locations, the brand word 'IMPACT' set at large display size in brand red and rotated 90° to run vertically along one edge."

### Iteration Guide

When refining existing screens generated with this design system:

1. Focus on ONE component at a time — the system has few moving parts, so small refinements compound
2. Reference specific color names and hex codes from this document when describing changes
3. Use natural language ("sharper corners," "more generous vertical rhythm") alongside specific measurements
4. When in doubt about radius, remember: 2px for form/utility buttons, 60px for editorial pills, 6px for cards, 50%/100% for icon and portrait circles
5. Keep the brand rule absolute: only one Vodafone Red element should dominate any given fold

### Known Gaps

- Form input styles (text fields, dropdowns, toggles) are not exposed on these page templates; their specs are inferred from the ghost-button pattern and may need refinement when real forms are designed
- The Vodafone corporate typeface is proprietary and cannot be reproduced exactly in open systems; Inter with tightened tracking at display sizes is the closest open substitute
- Animation and transition timings are intentionally not documented — the site uses them sparingly and the values are not extractable from static analysis
- The share ticker's exact number styling (separators, currency glyph) is documented from the investor-page screenshot; other regional variants may display differently
