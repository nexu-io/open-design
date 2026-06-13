# Design System Inspired by Shopify

> Category: E-Commerce & Retail
> E-commerce platform. Dark-first cinematic, neon green accent, ultra-light type.

## 1. Visual Theme & Atmosphere

Shopify.com is a dark-first digital theatre — a website that stages its commerce platform like a cinematic premiere. The entire experience unfolds against an abyss of near-black surfaces that carry the faintest whisper of deep forest green (`#02090A`, `#061A1C`, `#102620`), creating a nocturnal atmosphere that feels less like a SaaS marketing page and more like an exclusive product reveal at a tech keynote. This darkness isn't cold or corporate — it's the warm, enveloping dark of a luxury experience, like sitting in the front row of a darkened auditorium.

The typography is the undeniable star. NeueHaasGrotesk — a refined Helvetica descendant — appears at monumental scale (96px) with impossibly light weight (330-400), creating headlines that feel etched in light rather than printed in ink. The `ss03` OpenType feature gives letterforms a distinctive character that separates Shopify's type from generic Helvetica usage. Below the display layer, Inter Variable handles body text with surgical precision, using equally unusual variable weights (420, 450, 550) that live in the spaces between traditional weight stops. This precision signals a company that sweats every detail.

Color is used with extreme restraint. The primary accent is Shopify Neon Green (`#36F4A4`) — an electric mint that appears exclusively on focus rings and accent highlights, pulsing like a bioluminescent signal against the dark canvas. Softer green tints (Aloe `#C1FBD4`, Pistachio `#D4F9E0`) provide atmospheric washes. White is the only text color that matters on dark surfaces, while a zinc-based neutral scale (`#A1A1AA` through `#3F3F46`) handles the hierarchy of quiet information. The result is a design that makes commerce technology feel like it belongs in a science-fiction future.

**Key Characteristics:**
- Dark-first design with deep forest-teal undertones (not pure black)
- Ultra-light display typography (weight 330) at monumental scale (96px) creating an ethereal presence
- Neon Green (`#36F4A4`) as the singular high-energy accent against darkness
- Full-pill buttons (9999px radius) as the primary interactive shape
- Layered, multi-stage box shadows creating photographic depth
- Product screenshots embedded in dark UI contexts, matching the surrounding darkness
- Zinc-based neutral scale for text hierarchy — balanced between warm and cool

## 2. Color Palette & Roles

### Primary

- **Shopify White** (`#FFFFFF`): Primary text on dark surfaces, button fills, high-contrast elements
- **Shopify Black** (`#000000`): Body background, button text on white, maximum contrast base (--color-shade-100)

### Secondary & Accent

- **Neon Green** (`#36F4A4`): The signature accent — focus rings, interactive highlights, active state indicators. Electric and bioluminescent
- **Aloe** (`#C1FBD4`): Soft green wash for decorative backgrounds, atmospheric cards (--color-aloe-10)
- **Pistachio** (`#D4F9E0`): Lightest green tint for subtle surface differentiation (--color-pistachio-10)

### Surface & Background

- **Void** (`#000000`): Root page background — true black for maximum depth
- **Deep Teal** (`#02090A`): Card surfaces, content containers — near-black with green undertone
- **Dark Forest** (`#061A1C`): Section backgrounds with visible green character
- **Forest** (`#102620`): Elevated dark surfaces, header backgrounds — the warmest dark shade
- **Dark Card Border** (`#1E2C31`): Card borders on dark surfaces, subtle boundary definition

### Neutrals & Text (Zinc Scale)

- **Shade-30** (`#D4D4D8`): Lightest neutral, barely-there borders on dark (--color-shade-30)
- **Muted Text** (`#A1A1AA`): Secondary text, metadata, descriptions — the quiet voice
- **Shade-50** (`#71717A`): Tertiary text, timestamps, least important info (--color-shade-50)
- **Shade-60** (`#52525B`): Disabled text, decorative neutrals (--color-shade-60)
- **Shade-70** (`#3F3F46`): Subtle dividers, barely-visible UI boundaries (--color-shade-70)
- **Light Border** (`#E4E4E7`): Borders on light surfaces (rare — only in light-mode modals)

### Semantic & Accent

- **Link Muted** (`#9797A2`): Muted link text with underline decoration
- **Link Sage** (`#9DABAD`): Teal-tinted muted links
- **Link Lavender** (`#BDBDCA`): Lighter link variant
- **Link Mint** (`#99B3AD`): Green-tinted link variant for themed sections

### Gradient System

- **Dark Teal Wash**: Radial gradient from `#102620` center to `#02090A` edge — used behind product showcases
- **Green Atmospheric**: Subtle green-tinted ambient gradients behind hero sections, creating depth without solid colors
- **Spotlight**: Focused bright area fading to black — creates keynote-style presentation lighting

## 3. Typography Rules

### Font Family

**Display:** NeueHaasGrotesk (refined Helvetica descendant, variable font)
- Fallbacks: Helvetica, Arial, sans-serif
- OpenType features: `ss03` (stylistic set 3 — distinctive letterform alternates)
- Available weights: 330, 360, 400, 500, 750 (variable)
- Used for all headings, hero text, and large display elements

**Body:** Inter-Variable
- Fallbacks: Helvetica, Arial, sans-serif
- OpenType features: `ss03`
- Available weights: 400, 420, 450, 500, 550 (variable)
- Used for body text, links, buttons, UI elements

**Mono:** ui-monospace
- Fallbacks: SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New
- Used for code snippets, data labels, technical content

### Hierarchy

| Role | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|--------|-------------|----------------|-------|
| Display XL | 96px | 400 | 1.00 | — | NeueHaasGrotesk, hero headlines, "ss03" |
| Display XL Bold | 90.74px | 750 | 1.00 | 4.54px | NeueHaasGrotesk, emphasis display |
| Display XL Tracked | 96px | 400 | 1.00 | 2.4px | NeueHaasGrotesk, spaced display |
| Display Light | 96px | 330 | 0.96 | — | NeueHaasGrotesk, ethereal display |
| Heading 1 | 70px | 330 | 1.00 | — | NeueHaasGrotesk, section titles |
| Heading 2 | 55px | 330 | 1.16 | — | NeueHaasGrotesk, subsections |
| Heading 3 | 48px | 330 | 1.14 | — | NeueHaasGrotesk, feature titles |
| Heading 4 | 32px | 360 | 1.14 | 0.32px | NeueHaasGrotesk, card headings |
| Heading 5 | 28px | 500 | 1.28 | 0.42px | NeueHaasGrotesk, small headings |
| Heading 6 | 24px | 400 | 1.14 | 0.36px | NeueHaasGrotesk, minor headings |
| Body Large | 20px | 500 | 1.40 | 0.3px | NeueHaasGrotesk / Inter, lead paragraphs |
| Body | 18px | 400 | 1.56 | — | Inter-Variable, standard body |
| Body Medium | 18px | 550 | 1.56 | — | Inter-Variable, emphasized body |
| Body Small | 16px | 400 | 1.50 | — | Inter / NeueHaasGrotesk, compact body |
| Body Small Medium | 16px | 420 | 1.50 | — | Inter-Variable, slightly emphasized |
| Button | 16px | 400 | 1.50 | — | NeueHaasGrotesk, CTA text |
| Nav Link | 18px | 500 | 1.25 | 0.72px | NeueHaasGrotesk, navigation items |
| Caption | 14px | 500 | 1.49 | 0.28px | NeueHaasGrotesk / Inter, metadata |
| Caption Medium | 14px | 550 | 1.49 | 0.28px | Inter-Variable, emphasized caption |
| Overline | 15.36px | 400 | 1.50 | 1.54px | NeueHaasGrotesk, wide-tracked labels |
| Micro | 13px | 500 | 1.50 | -0.13px | Inter, tight-tracked small text |
| Label | 12px | 400 | 1.20 | 0.72px | Inter, uppercase labels |
| Code | 16px | 400 | 1.50 | — | ui-monospace, uppercase, code blocks |
| Code Small | 12px | 400 | 1.33 | — | ui-monospace, uppercase, inline code |

### Principles

Shopify's typography is a masterclass in variable font precision. The display layer lives almost exclusively at weights 330-400 — featherweight text that appears to hover above the dark background like projected light. This is the opposite of the bold, heavy approach most SaaS sites take: where others shout, Shopify whispers at scale. The 96px headlines at weight 330 create a paradox of enormous size and delicate stroke that feels both monumental and fragile. The `ss03` OpenType feature activates a stylistic set that gives specific characters (likely 'a', 'g', and certain numerals) a more refined appearance, distinguishing Shopify's typography from standard Helvetica Neue usage. Inter Variable handles the body layer with surgical precision, using weights like 420 and 550 that exist between the traditional stops — every piece of text has exactly the visual weight it needs.

## 4. Component Stylings

### Buttons

**Primary (White Fill)**
- Background: White (`#FFFFFF`)
- Text: Black (`#000000`)
- Border: 2px solid transparent
- Border radius: full pill (9999px)
- Padding: 12px 26px 12px 16px (asymmetric — more right padding for visual balance)
- Hover: slight opacity reduction or background shift
- Focus: 2px `#36F4A4` (Neon Green) outline ring
- Transition: all 200ms ease

**Secondary (Ghost/Outlined)**
- Background: transparent
- Text: White (`#FFFFFF`)
- Border: 2px solid White (`#FFFFFF`)
- Border radius: full pill (9999px)
- Padding: 12px 26px 12px 16px
- Hover: fills to white bg with black text
- Focus: 2px `#36F4A4` outline

**Badge/Tag (Neutral Filled)**
- Background: `rgba(255, 255, 255, 0.2)` (frosted glass)
- Text: White (`#FFFFFF`)
- Border: none
- Border radius: subtly rounded (4px)
- Padding: 12px 16px
- Font: 16px regular

### Cards & Containers

- Background: Deep Teal (`#02090A`) on dark pages
- Border: 1px solid `#1E2C31` (Dark Card Border) — barely visible boundary
- Border radius: 8px for standard cards, 12px for featured cards, 20px 20px 0 0 for top-rounded cards
- Shadow: Multi-layered system:
  - Resting: `rgba(0,0,0,0.1) 0px 0px 0px 1px, rgba(0,0,0,0.1) 0px 2px 2px, rgba(0,0,0,0.1) 0px 4px 4px, rgba(0,0,0,0.1) 0px 8px 8px` + `rgba(255,255,255,0.03) 0px 1px 0px inset`
  - The inset white highlight creates a subtle top-edge glow
- Hover: shadow expands, card may slightly brighten
- Transition: box-shadow 300ms ease, transform 200ms ease

### Inputs & Forms

- Background: transparent or Dark Forest (`#061A1C`)
- Text: White (`#FFFFFF`)
- Border: 1px solid `#3F3F46` (Shade-70)
- Border radius: 8px
- Padding: 12px 16px
- Focus: 2px solid `#36F4A4` (Neon Green focus ring)
- Placeholder: Shade-50 (`#71717A`)
- Transition: border-color 200ms ease

### Navigation

- Background: transparent (overlaid on dark hero), becomes Forest (`#102620`) on scroll
- Height: ~64px
- Left: Shopify wordmark logo (SVG, white on dark)
- Center/Right: nav links in 18px/500 NeueHaasGrotesk, white, letter-spacing 0.72px
- CTA: White pill button "Start for free" (right)
- Secondary CTA: Ghost button with white border
- Hover: links shift to Muted Text (`#A1A1AA`) or gain underline
- Mobile: hamburger menu, full-screen dark overlay
- Transition: background 300ms ease on scroll

### Image Treatment

- Product screenshots: embedded in dark UI contexts, matching the surrounding darkness
- Admin interface previews: shown on dark backgrounds with subtle card borders
- Aspect ratios: varied — hero images are wide (16:9-ish), feature shots are flexible
- All images sit flush within dark containers — no bright borders or frames
- Lazy loading with dark placeholder surfaces

### Trust Indicators

- Statistics displayed prominently: "15+" (years), "150M+" (buyers)
- Numbers at display scale in NeueHaasGrotesk
- Partner/developer ecosystem callout sections
- Dark-themed testimonials integrated into the page flow

## 5. Layout Principles

### Spacing System

Base unit: 8px

| Token | Value | Use |
|-------|-------|-----|
| space-1 | 4px | Tight inline gaps |
| space-2 | 8px | Base unit, icon gaps |
| space-3 | 12px | Card padding, tight margins |
| space-4 | 16px | Standard element padding |
| space-5 | 24px | Card gaps, section padding |
| space-6 | 28px | Medium section spacing |
| space-7 | 32px | Section breaks |
| space-8 | 36px | Large padding |
| space-9 | 40px | Major section padding |
| space-10 | 64px | Hero section padding, large gaps |

### Grid & Container

- Max container width: ~1280px (centered)
- Hero: full-width, edge-to-edge dark background with centered text
- Feature sections: 2-column layouts with text and product screenshots
- Stats sections: horizontal layout with large numbers
- Horizontal padding: 64px desktop, 32px tablet, 16px mobile
- Grid gap: 24-32px between major content blocks

### Whitespace Philosophy

Shopify's whitespace strategy is theatrical. Sections are separated by vast expanses of dark space — 80px to 120px of pure black breathing room — that create the pacing of a presentation, not a webpage. Each content block is its own "slide" in a keynote-style scroll. Within sections, spacing is tighter and more deliberate, creating focal density against the expansive void. The contrast between macro-level emptiness and micro-level precision is what gives the site its cinematic cadence.

### Border Radius Scale

| Value | Context |
|-------|---------|
| 4px | Tags, badges, micro-elements |
| 8px | Standard cards, inputs, video containers |
| 12px | Featured cards, image containers, buttons (non-pill) |
| 20px | Top-rounded cards (20px 20px 0 0), modal headers |
| 340px | Large rounded decorative elements |
| 9999px | Pill buttons, pill badges, nav elements |

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Base | No shadow, dark surface | Default page background |
| Subtle | `rgba(0,0,0,0.1) 0px 0px 0px 1px` + inset white glow | Resting cards |
| Medium | Multi-layer: 1px ring + 2px + 4px + 8px shadow stack | Elevated cards, featured sections |
| High | `rgba(0,0,0,0.25) 0px 25px 50px -12px` | Modals, dropdowns, overlays |
| Focus | `0px 0px 0px 2px #36F4A4` | Keyboard focus ring (Neon Green) |

Shopify's shadow system is unusually sophisticated. Rather than single-value shadows, cards use a stacked, multi-layer approach: a 1px ring for boundary definition, 2px/4px/8px progressive blurs for natural light falloff, and a delicate inset white glow (`rgba(255,255,255,0.03)`) that simulates a top-lit glass surface. On dark backgrounds, shadows darken from already-dark surfaces, so the shadows function more as "ambient occlusion" than traditional elevation — the card appears to sink slightly into the surface rather than float above it.

### Decorative Depth

- **Dark teal gradients**: Ambient radial washes behind hero sections and product showcases
- **Spotlight effects**: Bright centered areas fading to black, creating keynote-style theatrical lighting
- **Edge glow**: Subtle light colored edges on dark cards via inset box-shadow
- **Green atmospheric halos**: Faint green tints in background gradients, echoing the brand accent

## 7. Do's and Don'ts

### Do

- Use the dark teal-black surface hierarchy (Void → Deep Teal → Dark Forest → Forest) for depth
- Keep display typography at weight 330-400 — the ethereal lightness is the design's signature
- Use Neon Green (`#36F4A4`) exclusively for focus states and critical accent highlights
- Apply 9999px radius to all primary CTA buttons — the full pill is non-negotiable
- Use the multi-layered shadow system for card elevation — single shadows look flat
- Maintain the `ss03` OpenType feature across all text — it's part of the typographic identity
- Use Inter Variable for body text and NeueHaasGrotesk for headings — never mix their roles
- Create theatrical spacing between sections (80px+) for cinematic pacing

### Don't

- Don't use pure black (#000000) for text on dark backgrounds — use white (#FFFFFF) only
- Don't introduce warm colors (orange, red, yellow) — the palette is strictly cool (greens, teals, neutrals)
- Don't use font weights above 500 for NeueHaasGrotesk body text — heavy weights break the ethereal feel
- Don't apply green accents to large surfaces — Neon Green is for small, precise highlights only
- Don't use sharp corners (0px radius) on interactive elements — everything rounds
- Don't add bright backgrounds — the dark theme is fundamental, not optional
- Don't use single-layer box shadows — the stacked approach is the system
- Don't set line-height above 1.56 for body text — Shopify's text is relatively compact
- Don't mix NeueHaasGrotesk and Inter at the same size/role — their weight scales differ
- Don't use letter-spacing below 0 for headings — Shopify headings track neutral or positive

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile | <640px | Single column, hamburger nav, display text scales to 48px, 16px padding |
| Tablet | 640-1024px | 2-column grids begin, display text at 70px, 32px padding |
| Desktop | 1024-1440px | Full layout, expanded nav, 96px display, 64px padding |
| Large Desktop | >1440px | Max-width container centered, increased section spacing |

### Touch Targets

- Minimum touch target: 44x44px (WCAG AAA)
- Pill buttons: 48px height minimum with generous horizontal padding
- Nav links: 44px touch area
- Card surfaces: full card is tappable where linked

### Collapsing Strategy

- **Navigation**: Full horizontal links → hamburger menu below 1024px; logo and CTA button remain visible
- **Hero section**: 96px display → 70px at tablet → 48px on mobile; maintains single-column center alignment
- **Feature sections**: 2-column text+image → stacked single column below 768px
- **Stats**: Horizontal row → stacked vertical on mobile
- **Section padding**: 64px → 40px → 24px → 16px as viewport narrows
- **Cards**: Grid → stack, maintaining full-width on mobile

### Image Behavior

- Product screenshots: responsive within dark containers, maintain aspect ratio
- Hero images: full-width on all breakpoints, lazy loaded with dark placeholders
- Admin UI previews: scale proportionally, may crop on mobile
- All images use CDN (`cdn.shopify.com`) with responsive srcset

## 9. Agent Prompt Guide

### Quick Color Reference

- Primary CTA: Shopify White (`#FFFFFF`)
- Page background: Void Black (`#000000`)
- Card surface: Deep Teal (`#02090A`)
- Section bg: Dark Forest (`#061A1C`)
- Elevated bg: Forest (`#102620`)
- Accent: Neon Green (`#36F4A4`)
- Body text: White (`#FFFFFF`)
- Muted text: Muted (`#A1A1AA`)
- Border dark: Dark Card Border (`#1E2C31`)

### Example Component Prompts

- "Create a hero section on true black (#000000) background with a 96px/330 NeueHaasGrotesk headline in white, a 20px/500 subtitle in #A1A1AA, and two pill buttons: white filled (9999px radius) and ghost with 2px white border"
- "Design a feature card on Deep Teal (#02090A) with 1px #1E2C31 border, 12px radius, multi-layer shadow (1px ring + 2px/4px/8px blur at 10% black), containing a 32px/360 white heading and 18px/400 #A1A1AA body text"
- "Build a stats section on Dark Forest (#061A1C) with 96px/750 white numbers (NeueHaasGrotesk), 16px/400 #A1A1AA descriptive labels, and generous 64px spacing between stat blocks"
- "Create a sticky nav with transparent background (becomes #102620 on scroll), white Shopify logo left, 18px/500 white nav links with 0.72px letter-spacing, and a white pill 'Start for free' button right"
- "Design a tag/badge with rgba(255,255,255,0.2) frosted glass background, 4px radius, 12px 16px padding, white 16px text — floating over a dark card surface"

### Iteration Guide

When refining existing screens generated with this design system:
1. Focus on ONE component at a time
2. Reference specific color names and hex codes from this document
3. Remember: this is a DARK-FIRST design — light surfaces are the exception, not the rule
4. Display text should always feel feather-light (weight 330-400) — if it looks heavy, reduce the weight
5. Neon Green (#36F4A4) is precious — use sparingly for focus and accent only
6. The dark surface hierarchy (black → deep teal → dark forest → forest) creates subtle depth
7. Shadows are multi-layered — a single `box-shadow` value won't capture the Shopify card feel
8. `ss03` OpenType feature must be active on all text for typographic consistency
