# Design System Inspired by Nike

> Category: E-Commerce & Retail
> Athletic retail. Monochrome UI, massive uppercase type, full-bleed photography.

## 1. Visual Theme & Atmosphere

Nike.com is a kinetic retail cathedral — a site that channels the explosive energy of sport into a digital shopping experience. The design operates on a principle of radical simplicity: strip everything back to black, white, and grey so that athletic photography and product color can dominate without competition. The result feels less like a website and more like a sports editorial laid out with the precision of a luxury magazine. Every pixel of real estate is either selling product or driving toward product.

The "Podium CDS" (Nike's internal Core Design System) establishes an aggressively monochromatic foundation. The UI disappears into black (`#111111`) text and white surfaces, allowing hero photography — sweating athletes, mid-air shoes, stadium energy — to carry the emotional weight. When color does appear in the UI, it's almost exclusively functional: red for errors, blue for links, green for success. The product itself is the color story. This restraint creates a visual paradox: the most colorful pages on the internet feel the most minimal, because all vibrancy comes from merchandise rather than interface.

The typography system is the other half of Nike's visual identity. Massive uppercase headlines in Nike Futura ND — a custom condensed Futura variant with impossibly tight line-height (0.90) — punch through hero imagery like a typographic shockwave. Below the headlines, the workhorse Helvetica Now family handles everything from navigation to product descriptions with Swiss-precision clarity. This split between expressive display type and functional body type mirrors Nike's brand duality: inspiration meets execution.

**Key Characteristics:**
- Monochromatic UI (black/white/grey) that lets product photography be the only color source
- Massive uppercase display typography (96px, line-height 0.90) that punches through hero images
- Full-bleed photography with no border radius — imagery fills every available edge
- Pill-shaped buttons (30px radius) as the primary interactive element
- 8px spacing grid with athletic discipline — every measurement snaps to the system
- Category-driven shopping architecture with large navigational image cards
- Shadow-free, border-minimal elevation model — surface differentiation through grey shifts only

## 2. Color Palette & Roles

### Primary

- **Nike Black** (`#111111`): The foundation — primary text, button backgrounds, nav text, hero overlays. Deliberately not pure black (#000000), creating a fractionally softer reading experience
- **Nike White** (`#FFFFFF`): Primary page canvas, button text on dark, card surfaces, nav bar background

### Surface & Background

- **Snow** (`#FAFAFA`): Lightest surface, near-white subtle differentiation (--podium-cds-color-grey-50)
- **Light Gray** (`#F5F5F5`): Secondary background, search input fill, image placeholder, loading skeleton (--podium-cds-color-grey-100)
- **Hover Gray** (`#E5E5E5`): Hover state background, disabled button fill (--podium-cds-color-grey-200)
- **Dark Surface** (`#28282A`): Primary background on dark/inverted sections (--podium-cds-color-grey-800)
- **Deep Charcoal** (`#1F1F21`): Inverse primary background, darkest non-black surface (--podium-cds-color-grey-900)
- **Dark Hover** (`#39393B`): Hover state on dark backgrounds (--podium-cds-color-grey-700)

### Neutrals & Text

- **Primary Text** (`#111111`): Main body text, headings, nav links (--podium-cds-color-text-primary)
- **Secondary Text** (`#707072`): Descriptive copy, metadata, timestamps, price labels (--podium-cds-color-text-secondary)
- **Disabled Text** (`#9E9EA0`): Inactive elements, unavailable options (--podium-cds-color-text-disabled)
- **Disabled Inverse** (`#4B4B4D`): Disabled text on dark backgrounds (--podium-cds-color-text-disabled-inverse)
- **Border Primary** (`#707072`): Standard border color, matching secondary text
- **Border Secondary** (`#CACACB`): Subtle borders, input borders, divider lines (--podium-cds-color-grey-300)
- **Border Disabled** (`#CACACB`): Inactive border state
- **Border Active** (`#111111`): Active/focused border, matching primary text

### Semantic & Accent

- **Nike Red** (`#D30005`): Critical errors, sale badges, urgent notifications (--podium-cds-color-red-600)
- **Bright Red** (`#EE0005`): Red-500, slightly lighter red for emphasis
- **Nike Orange Badge** (`#D33918`): Badge text, promotional callouts (--podium-cds-color-text-badge)
- **Orange Flash** (`#FF5000`): Expressive orange accent (--podium-cds-color-orange-400)
- **Success Green** (`#007D48`): Confirmation, availability, positive states (--podium-cds-color-green-600)
- **Success Inverse** (`#1EAA52`): Success on dark backgrounds (--podium-cds-color-green-500)
- **Link Blue** (`#1151FF`): Text links, informational highlights (--podium-cds-color-blue-500)
- **Info Inverse** (`#1190FF`): Links on dark backgrounds (--podium-cds-color-blue-400)
- **Warning Yellow** (`#FEDF35`): Warning backgrounds, attention banners (--podium-cds-color-yellow-200)
- **Focus Ring** (`rgba(39, 93, 197, 1)`): Keyboard focus indicator ring

### Extended Color Spectrum (Podium CDS)

Each color ramp runs 50–900 for expressive use in campaigns and product pages:

- **Red**: `#FFE5E5` → `#EE0005` → `#530300`
- **Orange**: `#FFE2D6` → `#FF5000` → `#3E1009`
- **Yellow**: `#FEF087` → `#FCA600` → `#99470A`
- **Green**: `#DFFFB9` → `#1EAA52` → `#003C2A`
- **Teal**: `#D4FFFB` → `#008E98` → `#043441`
- **Blue**: `#D6EEFF` → `#1151FF` → `#020664`
- **Purple**: `#E4E1FC` → `#6E0FF6` → `#1C0060`
- **Pink**: `#FFE1F3` → `#ED1AA0` → `#4C012D`

### Gradient System

Nike avoids UI gradients. When gradients appear, they are photographic — applied to product hero backgrounds (e.g., a red shoe on a red-to-deeper-red gradient). The design system itself is flat-color only.

## 3. Typography Rules

### Font Family

**Display:** Nike Futura ND (custom condensed Futura variant exclusive to Nike)
- Fallbacks: Helvetica Now Text Medium, Helvetica, Arial
- Used exclusively for large uppercase display headlines
- Characteristically tight line-height (0.90) and uppercase transform

**Heading:** Helvetica Now Display Medium
- Fallbacks: Helvetica, Arial
- Used for section headings and product titles at 24–32px

**Body Medium:** Helvetica Now Text Medium (weight 500)
- Fallbacks: Helvetica, Arial
- Used for links, buttons, captions, emphasized body text

**Body:** Helvetica Now Text (weight 400)
- Fallbacks: Helvetica, Arial
- Used for standard body copy, descriptions, metadata

**Arabic:** Neue Frutiger Arabic — locale-specific alternative

### Hierarchy

| Role | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|--------|-------------|----------------|-------|
| Display | 96px | 500 | 0.90 | — | Nike Futura ND, uppercase, hero headlines |
| Heading 1 | 32px | 500 | 1.20 | — | Helvetica Now Display Medium, section titles |
| Heading 2 | 24px | 500 | 1.20 | — | Helvetica Now Display Medium, subsections |
| Heading 3 | 16px | 500 | 1.50 | — | Helvetica Now Text Medium, card titles |
| Body | 16px | 400 | 1.75 | — | Helvetica Now Text, product descriptions |
| Body Medium | 16px | 500 | 1.75 | — | Helvetica Now Text Medium, emphasized text |
| Link | 16px | 500 | 1.75 | — | Helvetica Now Text Medium, navigation links |
| Link Small | 14px | 500 | 1.86 | — | Helvetica Now Text Medium, footer/utility links |
| Button | 16px | 500 | 1.50 | — | Helvetica Now Text Medium, CTA text |
| Button Small | 14px | 500 | 1.50 | — | Helvetica Now Text Medium, secondary buttons |
| Caption | 14px | 500 | 1.50 | — | Helvetica Now Text Medium, price labels |
| Small | 12px | 500 | 1.50 | — | Helvetica Now Text Medium, timestamps |
| Tiny | 12px | 400 | 1.50 | — | Helvetica Now Text, legal text |

### Principles

Nike's typography is a study in tension. The display layer — Nike Futura ND at 96px with a devastating 0.90 line-height — is engineered to feel like a stadium scoreboard: massive, condensed, uppercase, impossible to ignore. It transforms headlines into battle cries. Below the display layer, Helvetica Now provides a clinical counterpoint: Swiss-precision legibility with generous 1.75 line-height for comfortable product browsing. Weight 500 (Medium) dominates throughout the body text, giving Nike's prose a slight assertiveness without the heaviness of bold — every sentence reads like a confident recommendation, not a shout.

## 4. Component Stylings

### Buttons

**Primary**
- Background: Nike Black (`#111111`)
- Text: White (`#FFFFFF`), 16px/500, Helvetica Now Text Medium
- Border: none
- Border radius: fully rounded pill (30px)
- Padding: ~12px 24px
- Hover: background shifts to Grey-500 (`#707072`), text hover color
- Active: scale(0) ripple effect with opacity 0.5
- Focus: 2px box-shadow ring in `rgba(39, 93, 197, 1)`
- Transition: background 200ms ease

**Primary on Dark**
- Background: White (`#FFFFFF`)
- Text: Black (`#111111`)
- Hover: background shifts to Grey-300 (`#CACACB`)

**Secondary (Outlined)**
- Background: transparent
- Text: Nike Black (`#111111`)
- Border: 1.5px solid `#CACACB` (grey-300)
- Border radius: 30px
- Hover: border darkens to `#707072`, background to grey-200

**Disabled**
- Background: Grey-200 (`#E5E5E5`)
- Text: Grey-400 (`#9E9EA0`)
- Cursor: not-allowed

**Icon Button**
- Background: Grey-100 (`#F5F5F5`)
- Shape: 30px radius (or 50% for circular)
- Padding: 6px
- Hover: Grey-500 background

### Cards & Containers

- Background: White (`#FFFFFF`) — no visible card boundary in most cases
- Border radius: 0px for product image cards (edge-to-edge imagery), 20px for interactive containers
- Shadow: none — Nike uses no card shadows whatsoever
- Hover: no lift effect on product cards; underline on text links within cards
- Product cards: image on top (no radius), text metadata below with 12px gap
- Category cards: full-bleed photography with text overlay on dark gradient
- Transition: opacity 200ms ease for image swap on hover

### Inputs & Forms

- Background: Grey-100 (`#F5F5F5`)
- Border: 1px solid `#CACACB` when visible, or borderless on search
- Border radius: 24px (search inputs), 8px (form inputs)
- Font: Helvetica Now Text, 16px
- Focus: border shifts to `#111111` (border-active), 2px focus ring in `rgba(39, 93, 197, 1)`
- Error: border `#D30005` (critical)
- Placeholder: Grey-500 (`#707072`)
- Transition: border-color 200ms ease

### Navigation

- Background: White (`#FFFFFF`), sticky
- Height: ~60px desktop
- Left: Nike Swoosh logo (24x24px SVG)
- Center: Category links (New & Featured, Men, Women, Kids, Sale) in 16px/500 Helvetica Now Text Medium
- Right: Search (24px radius input), Favorites, Cart icons
- Hover: text color shifts to Grey-500 (`#707072`)
- Mobile: hamburger menu, full-screen overlay
- Top banner: promotional message bar with dark background (#111111) and white text

### Image Treatment

- Hero images: full-bleed, no border radius, edge-to-edge
- Product grid: square (1:1) or 4:3 aspect ratio, no border radius
- Category cards: 16:9 or 4:3, full-bleed with text overlay
- Image placeholder: Grey-100 (`#F5F5F5`) solid background
- Lazy loading: native loading="lazy", skeleton uses #F5F5F5 bg
- Product hover: secondary image swap (front → side view)

### Promotional Banners

- Full-width dark (`#111111`) background with white text
- Tight padding (8-12px vertical)
- Centered text, 12px/500 Helvetica Now Text Medium
- Used for shipping promotions, member benefits, sale announcements

## 5. Layout Principles

### Spacing System

Base unit: 4px (primary grid is 8px multiples)

| Token | Value | Use |
|-------|-------|-----|
| space-1 | 4px | Tight icon gaps, inline spacing |
| space-2 | 8px | Base unit, button icon gaps |
| space-3 | 12px | Card internal padding, tight margins |
| space-4 | 16px | Standard padding, nav spacing |
| space-5 | 20px | Product card gaps |
| space-6 | 24px | Section internal padding, grid gaps |
| space-7 | 32px | Section breaks |
| space-8 | 48px | Major section padding |
| space-9 | 64px | Hero section padding |
| space-10 | 80px | Large section spacing |

### Grid & Container

- Max container width: 1920px
- Standard content width: ~1440px with horizontal padding
- Product grid: 3-column on desktop, 2-column on tablet, 1-column on mobile
- Category grid: 3-column with full-bleed images
- Grid gap: 4-12px between product cards (intentionally tight)
- Horizontal padding: 48px desktop, 24px tablet, 16px mobile

### Whitespace Philosophy

Nike's whitespace strategy is deliberately aggressive — not in the luxurious, breathing way of a fashion brand, but in a compressed, high-density way that fills every pixel with either content or intentional absence. Product grids use minimal gaps (4-12px) to create a sense of abundance and choice. Section breaks are generous (48-80px) to separate shopping contexts. The overall effect is a store that feels packed with product while remaining navigable — like a well-organized athletic superstore.

### Border Radius Scale

| Value | Context |
|-------|---------|
| 0px | Product images, hero photography (sharp edges) |
| 8px | Form inputs (non-search) |
| 18px | Small interactive elements |
| 20px | Containers, cards with UI content |
| 24px | Search inputs, medium pills |
| 30px | Buttons, tags, filters (full pill) |
| 50% | Circular icon buttons, avatar placeholders |

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Flat | No shadow, no border | Default state for everything |
| Divider | `0px -1px 0px 0px #E5E5E5 inset` | Subtle inset line between sections |
| Focus | `0 0 0 2px rgba(39, 93, 197, 1)` | Keyboard focus ring |
| Overlay | Dark scrim over photography | Text-on-image legibility |

Nike's elevation philosophy is radically flat. There are no card shadows, no hover lifts, no floating elements. Depth is communicated exclusively through color — dark sections recede, light sections advance, grey shifts indicate state changes. This flatness reinforces the athletic, no-nonsense brand personality: no visual frills, just direct communication. The only "shadow" in the entire system is a 1px inset divider line and the accessibility-required focus ring.

### Decorative Depth

- **Hero photography overlays**: Dark gradient scrims over full-bleed photography for text readability
- **Product background gradients**: Colored backgrounds behind hero product shots (e.g., red shoe on red gradient)
- **Banner bars**: Solid dark (#111111) promotional strips at page top

## 7. Do's and Don'ts

### Do

- Use Nike Black (#111111) for all primary text — never pure #000000
- Keep buttons pill-shaped (30px radius) and limited to primary/secondary variants
- Use full-bleed, edge-to-edge photography for hero sections — no border radius on images
- Let product photography provide all color vibrancy; keep UI monochromatic
- Use uppercase Nike Futura ND ONLY for display headlines (96px+)
- Maintain tight product grid gaps (4-12px) for a dense, abundant feel
- Use Grey-100 (#F5F5F5) for all input and placeholder backgrounds
- Reserve color exclusively for semantic meaning (red=error, green=success, blue=link)
- Use weight 500 (Medium) for all interactive text elements

### Don't

- Don't add shadows to cards — Nike's elevation model is entirely flat
- Don't use border radius on product imagery — only UI elements get rounded corners
- Don't introduce brand colors beyond the grey scale for UI elements
- Don't use Nike Futura ND below 24px — it's exclusively a display face
- Don't add hover lift effects — Nike cards don't animate on hover
- Don't use regular weight (400) for buttons or links — always use 500
- Don't place colored backgrounds behind UI elements — color is reserved for product contexts
- Don't use more than two levels of text hierarchy per card (title + body)
- Don't add decorative dividers — the 1px inset is the only divider pattern
- Don't soften the contrast — Nike's design deliberately pushes black-on-white to maximum

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile | <640px | Single column, hamburger nav, display text scales down, tight 16px padding |
| Small Tablet | 640-768px | 2-column product grid begins, nav still collapsed |
| Tablet | 768-960px | 2-column grids, category cards scale, horizontal padding 24px |
| Small Desktop | 960-1024px | Nav expands to full horizontal, 3-column product grid |
| Desktop | 1024-1440px | Full layout, expanded nav, 3-column grids, 48px padding |
| Large Desktop | >1440px | Max-width container centered, increased margins, hero images full-bleed |

### Touch Targets

- Minimum touch target: 44x44px (WCAG AAA)
- Mobile nav icons: 48x48px touch area
- Product cards: full surface is tappable
- Filter pills: minimum 36px height with 12px padding

### Collapsing Strategy

- **Navigation**: Full category links → hamburger menu below 960px; search, favorites, cart icons remain visible
- **Product grids**: 3-col → 2-col at 960px → 1-col at 640px
- **Hero sections**: Display text scales from 96px → 64px → 48px; hero images remain full-bleed at all sizes
- **Category cards**: 3-col → 2-col → 1-col with maintained full-bleed imagery
- **Section padding**: 80px → 48px → 32px → 24px as viewport narrows
- **Promotional banner**: text wraps or truncates, maintains dark background

### Image Behavior

- Responsive images via Nike CDN (`c.static-nike.com`) with width parameters
- Product images: srcset with multiple resolutions (w_320, w_640, w_960, w_1920)
- Hero images: full-bleed at all breakpoints, aspect ratio shifts (16:9 desktop → 4:3 mobile)
- Lazy loading: native loading="lazy", grey-100 placeholder during load
- Art direction: hero crops change between desktop and mobile compositions

## 9. Agent Prompt Guide

### Quick Color Reference

- Primary CTA: Nike Black (`#111111`)
- Background: White (`#FFFFFF`)
- Secondary surface: Light Gray (`#F5F5F5`)
- Heading text: Nike Black (`#111111`)
- Body text / hover: Secondary Text (`#707072`)
- Border: Border Secondary (`#CACACB`)
- Error: Nike Red (`#D30005`)
- Link: Link Blue (`#1151FF`)

### Example Component Prompts

- "Create a product hero section with full-bleed edge-to-edge photography, no border radius, a dark gradient overlay for text, and a massive uppercase 96px/500 headline in Nike Futura style with 0.90 line-height and a Nike Black (#111111) pill button (30px radius)"
- "Design a 3-column product card grid with square images (no border radius), 4px gap between cards, product name in 16px/500 Nike Black (#111111), price in 14px/500, and secondary text in Grey-500 (#707072)"
- "Build a sticky white navigation bar with a left-aligned logo, centered category links in 16px/500 (#111111) with hover color #707072, and right-aligned search (24px radius, #F5F5F5 background), favorites, and cart icons"
- "Create a promotional banner strip with #111111 background, white 12px/500 centered text, and 8px vertical padding — full width, no border radius"
- "Design a secondary outlined button with transparent background, 1.5px #CACACB border, 30px pill radius, 16px/500 #111111 text, hover border darkening to #707072"

### Iteration Guide

When refining existing screens generated with this design system:
1. Focus on ONE component at a time
2. Reference specific color names and hex codes from this document
3. Remember: product photography is the color — UI stays monochromatic
4. Use the grey scale for state changes: #F5F5F5 → #E5E5E5 → #CACACB → #707072
5. If something feels too colorful in the UI, it probably is — Nike keeps UI greyscale
6. Display type (Nike Futura) should ALWAYS be uppercase and never below 24px
7. Body type (Helvetica Now) should almost always be weight 500 for interactive elements
