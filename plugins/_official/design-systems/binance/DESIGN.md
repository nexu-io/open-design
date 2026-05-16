# Design System Inspired by Binance.US

> Category: Fintech & Crypto
> Crypto exchange. Bold yellow accent on monochrome, trading-floor urgency.

## 1. Visual Theme & Atmosphere

Binance.US radiates the polished urgency of a digital trading floor — a space where money moves and decisions happen in seconds. The design is a two-tone composition that alternates between stark white trading surfaces and deep near-black panels (`#222126`), creating a visual rhythm that mirrors the bull-and-bear duality of crypto markets. Binance Yellow (`#F0B90B`) cuts through this monochrome foundation like a gold ingot on a steel desk — unmistakable, confident, and engineered to guide every eye toward the next action.

The interface speaks the language of fintech trust. Custom BinancePlex typography gives every headline and data point a proprietary gravitas, while generous whitespace and restrained decoration keep the focus on numbers, charts, and call-to-action buttons. The design avoids visual complexity in favor of operational clarity — every element exists to either inform or convert. Product screenshots of the mobile trading app dominate the middle sections, presented on floating device mockups against golden gradients, reinforcing that this is a platform you carry with you.

What makes Binance.US distinctive is the tension between warmth and precision. The golden yellow brand color — warm, optimistic, almost celebratory — lives inside a system of cold, clinical grey text and razor-sharp borders. This isn't a playful fintech like Robinhood or a corporate fortress like Fidelity — it's a crypto-native platform that wraps cutting-edge trading technology in the visual language of established finance.

**Key Characteristics:**
- Two-tone light/dark section alternation — white surfaces for trust, dark panels for depth
- Binance Yellow (`#F0B90B`) as the singular accent color driving all primary actions
- BinancePlex custom typeface providing proprietary brand identity at every text level
- Pill-shaped CTA buttons (50px radius) that demand attention
- Floating device mockups on golden gradients for product showcasing
- Crypto price tickers with real-time data prominently displayed
- Shadow-light elevation with subtle 5% opacity card shadows

## 2. Color Palette & Roles

### Primary

- **Binance Yellow** (`#F0B90B`): The signature — primary CTA backgrounds, brand accent, active states, link color. The single most important color in the system
- **Binance Gold** (`#FFD000`): Lighter gold variant used for pill button borders, secondary CTA fills, and golden gradient highlights
- **Light Gold** (`#F8D12F`): Soft gold for gradient endpoints and hover-adjacent states

### Secondary & Accent

- **Active Yellow** (`#D0980B`): Darkened yellow for active/pressed button states — the "clicked" gold
- **Focus Blue** (`#1EAEDB`): Accessibility focus state — appears on hover and focus for all interactive elements

### Surface & Background

- **Pure White** (`#FFFFFF`): Primary page canvas, card surfaces, light section backgrounds
- **Snow** (`#F5F5F5`): Subtle surface differentiation, input backgrounds, alternating row fills
- **Binance Dark** (`#222126`): Dark section backgrounds, footer canvas, "Trusted by millions" panel — a near-black with a faint purple undertone
- **Dark Card** (`#2B2F36`): Card surfaces within dark sections, elevated dark containers
- **Ink** (`#1E2026`): Button text on yellow backgrounds, deepest text color on light surfaces

### Neutrals & Text

- **Primary Text** (`#1E2026`): Main body text, headings on light backgrounds — near-black with slight warmth
- **Secondary Text** (`#32313A`): Navigation links, descriptive copy on light surfaces
- **Slate** (`#848E9C`): Tertiary text, metadata, timestamps, footer links — the workhorse grey
- **Steel** (`#686A6C`): Disabled-adjacent text, subtle labels
- **Muted** (`#777E90`): Secondary navigation links, less prominent footer text
- **Hover Dark** (`#1A1A1A`): Universal link hover color — text darkens on hover

### Semantic & Accent

- **Crypto Green** (`#0ECB81`): Positive price movement, success states, "up" indicators
- **Crypto Red** (`#F6465D`): Negative price movement, error states, "down" indicators
- **Border Light** (`#E6E8EA`): Standard card and section borders on light backgrounds
- **Border Gold** (`#FFD000`): Active/selected state borders, pill button outlines

### Gradient System

- **Golden Glow**: Radial gradient from `#F0B90B` center to `#F8D12F` edge — used behind product mockup screenshots
- **Dark Fade**: Linear gradient from `#222126` to transparent — used for dark section transitions
- **Hero Shimmer**: Subtle animated gold gradient on hero section accents

## 3. Typography Rules

### Font Family

**Primary:** BinancePlex (custom proprietary typeface designed by Binance)
- Fallbacks: Arial, sans-serif
- Replaced DIN Next to solve multi-language spacing issues
- Available in weights: 400 (Regular), 500 (Medium), 600 (SemiBold), 700 (Bold)

**System:** system-ui stack for cookie banners and third-party UI
- Fallbacks: Segoe UI, Roboto, Helvetica, Arial

### Hierarchy

| Role | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|--------|-------------|----------------|-------|
| Display Hero | 60px | 700 | 1.08 | — | Hero headlines, maximum impact |
| Display Secondary | 34px | 700 | 1.00 | — | Section titles on dark backgrounds |
| Heading 1 | 28px | 500 | 1.00 | — | Major section headings |
| Heading 2 | 24px | 700 | 1.00 | — | Feature headings, card titles |
| Heading 3 | 24px | 600 | 1.00 | — | Subsection headings |
| Heading 4 | 20px | 600 | 1.25 | — | Card headings, feature labels |
| Body Large | 20px | 500 | 1.50 | — | Hero subtitle, lead paragraphs |
| Body | 16px | 500 | 1.50 | — | Standard body text |
| Body SemiBold | 16px | 600 | 1.30 | — | Emphasized body, nav links |
| Body Bold | 16px | 700 | 1.50 | — | Strong emphasis text |
| Button | 16px | 600 | 1.25 | 0.16px | Primary button text |
| Button Small | 14.4px | 600 | 1.60 | 0.72px | Secondary buttons, wider tracking |
| Caption | 14px | 500 | 1.43 | — | Metadata, labels, prices |
| Caption SemiBold | 14px | 600 | 1.50 | — | Emphasized captions |
| Small | 12px | 600 | 1.00 | — | Tags, badges, fine print |
| Tiny | 11px | 500 | 1.00 | — | Micro-labels, chart annotations |

### Principles

BinancePlex is engineered for data-dense interfaces where numbers and text must coexist at multiple scales. The typeface has tabular numerals by default — critical for price columns and portfolio values that need perfect vertical alignment. Weights lean toward the heavier end (500-700), giving the interface a sense of authority and confidence that's essential for a financial platform. The tight line-heights (1.00-1.25) on headings create a stacked, compressed feel that mirrors the density of trading dashboards, while body text opens up to 1.50 for comfortable reading of educational and marketing content.

## 4. Component Stylings

### Buttons

**Primary (Yellow Fill)**
- Background: Binance Yellow (`#F0B90B`)
- Text: Ink (`#1E2026`), 16px/600, BinancePlex
- Border: none
- Border radius: slightly rounded (6px)
- Padding: 6px 32px
- Hover: shifts to Focus Blue (`#1EAEDB`) with white text
- Active: darkens to Active Yellow (`#D0980B`)
- Focus: Focus Blue (`#1EAEDB`) bg, 1px black border, 2px black outline, opacity 0.9
- Transition: background 200ms ease

**Primary Pill (Gold)**
- Background: Binance Gold (`#FFD000`)
- Text: White (`#FFFFFF`)
- Border: 1px solid `#FFD000`
- Border radius: full pill (50px)
- Padding: 10px horizontal
- Shadow: `rgb(153,153,153) 0px 2px 10px -3px`
- Hover: shifts to Focus Blue (`#1EAEDB`) with white text

**Secondary (White Outlined)**
- Background: White (`#FFFFFF`)
- Text: Binance Yellow (`#F0B90B`)
- Border: 1px solid `#F0B90B`
- Border radius: full pill (50px)
- Padding: 10px horizontal
- Shadow: `rgb(153,153,153) 0px 2px 10px -3px`
- Hover: shifts to Focus Blue bg, white text

**Disabled**
- Background: `#E6E8EA`
- Text: `#848E9C`
- Cursor: not-allowed

### Cards & Containers

- Background: White (`#FFFFFF`) on light sections, Dark Card (`#2B2F36`) on dark sections
- Border: 1px solid `#E6E8EA` on light cards
- Border radius: medium rounded (12px) for content cards, tight (8px) for data cards
- Shadow: `rgba(32, 32, 37, 0.05) 0px 3px 5px 0px` — barely visible, trust-building
- Hover: shadow intensifies to `rgba(8, 8, 8, 0.05) 0px 3px 5px 5px`
- Transition: box-shadow 200ms ease

### Inputs & Forms

- Background: White (`#FFFFFF`) or Snow (`#F5F5F5`)
- Text: Ink (`#1E2026`)
- Border: 1px solid `#E6E8EA`
- Border radius: 8px
- Padding: 0px 12px (compact for trading context)
- Focus: border shifts to black (`#000000`), 1px outline
- Placeholder: Slate (`#848E9C`)
- Transition: border-color 200ms ease

### Navigation

- Background: White (`#FFFFFF`), sticky
- Height: ~64px
- Left: Binance logo (SVG, yellow mark + dark wordmark)
- Center/Right: navigation links in 14px/600 BinancePlex, color `#32313A`
- CTA: Yellow pill button "Get Started" in nav right
- Hover: links darken to `#1A1A1A`
- Mobile: hamburger menu, full-height overlay
- Top: optional promotional banner bar

### Image Treatment

- Product mockups: device frames on golden gradient backgrounds, floating with subtle shadow
- Hero images: full-width contained within card-like areas with rounded corners (24px)
- Video sections: 24px radius with embedded player controls
- App screenshots: dark-themed trading UI shown within phone/tablet bezels
- Crypto icons: 48px circular with brand colors

### Trust Indicators

- Real-time crypto price ticker (BTC, BNB, SOL with green/red price change)
- "Trusted by millions" section with statistics on dark background
- Security badges and regulatory compliance mentions
- QR code for direct app download in footer

## 5. Layout Principles

### Spacing System

Base unit: 8px

| Token | Value | Use |
|-------|-------|-----|
| space-1 | 4px | Tight inline gaps, icon padding |
| space-2 | 8px | Base unit, button icon gaps, tight margins |
| space-3 | 12px | Card internal padding, input padding |
| space-4 | 16px | Standard padding, section margins |
| space-5 | 20px | Card gaps, medium padding |
| space-6 | 24px | Section internal padding |
| space-7 | 32px | Section breaks, large padding |
| space-8 | 48px | Major section padding |
| space-9 | 64px | Hero section padding |
| space-10 | 80px | Large section spacing |

### Grid & Container

- Max container width: 1200px (centered)
- Hero area: single column with side-by-side text + image above 1024px
- Feature grid: 3-column on desktop, single column on mobile
- Product showcase: 2-column (text + device mockup)
- Horizontal padding: 32px desktop, 16px mobile
- Grid gap: 24px between feature cards

### Whitespace Philosophy

Binance.US uses whitespace as a trust signal. Generous padding around the hero section and between content blocks creates a sense of spaciousness that counters the information density typically associated with crypto exchanges. The light sections breathe — wide margins around headlines and ample spacing between cards — while dark sections compress, packing features into tighter grids to convey capability and depth. The overall rhythm alternates between "inviting entry" (light, spacious) and "deep functionality" (dark, dense).

### Border Radius Scale

| Value | Context |
|-------|---------|
| 1px | Subtle edge softening, fine UI elements |
| 2px | Close buttons, micro-interactive elements |
| 6px | Primary buttons (non-pill), small cards |
| 8px | Form inputs, data cards, image containers |
| 10px | Navigation pills, tag containers |
| 12px | Content cards, feature containers |
| 24px | Video containers, hero imagery, large cards |
| 50px | Pill buttons (CTA), search inputs, full-round elements |

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Flat | No shadow, solid background | Default for inline elements |
| Subtle | `rgba(32, 32, 37, 0.05) 0px 3px 5px` | Content cards, resting state |
| Medium | `rgba(8, 8, 8, 0.05) 0px 3px 5px 5px` | Hovered cards, elevated containers |
| Pill Shadow | `rgb(153,153,153) 0px 2px 10px -3px` | Pill CTA buttons, floating actions |
| Heavy | `rgba(0,0,0) 0px 32px 37px` | Modal overlays, dropdown menus |

Binance.US uses a whisper-light shadow system. Card shadows are barely perceptible at 5% opacity — they exist not for dramatic depth but as subtle ground cues that keep cards from feeling pasted onto the surface. The pill button shadow is the exception: slightly more visible to give CTAs a "floating" quality that invites clicks. The philosophy is pragmatic — in a financial context, heavy shadows feel frivolous, while no shadows at all feel flat and untrustworthy. The 5% sweet spot communicates professionalism.

### Decorative Depth

- **Golden gradient backgrounds**: Behind device mockup sections, radial golden glow centered on the product
- **Dark-to-light section transitions**: Hard cut (no gradient blend) between white and `#222126` sections
- **Price ticker strip**: Flat, borderless, reads as a data bar rather than a decorative element

## 7. Do's and Don'ts

### Do

- Use Binance Yellow (`#F0B90B`) exclusively for primary CTAs and brand accents — it's the single point of color
- Keep light and dark sections strictly alternating for visual rhythm
- Use BinancePlex at weight 500+ for all interactive elements — this is a confidence-forward design
- Apply 50px radius to all primary CTA pill buttons — the signature interactive shape
- Maintain 12px radius on content cards for a polished but not overly rounded feel
- Show real-time data prominently (prices, percentages, stats) — numbers build trust
- Use Slate (`#848E9C`) for all secondary/metadata text — the universal quiet voice
- Keep shadows at 5% opacity or less — barely there but present

### Don't

- Don't introduce additional brand colors — Binance Yellow is the only accent; all other color is data-driven (green up, red down)
- Don't use rounded corners above 12px on content cards — only CTAs and video containers go higher
- Don't add heavy shadows or hover lift effects — this is a restrained financial platform
- Don't use BinancePlex below weight 500 for headings — lighter weights undermine authority
- Don't place yellow text on yellow backgrounds — always ensure high contrast pairing
- Don't mix pill (50px) and square (6px) button styles in the same row
- Don't soften the dark sections — `#222126` should feel authoritative, not grey
- Don't use decorative illustrations — imagery should be product screenshots or data visualizations
- Don't add animation beyond subtle transitions (200ms ease) — financial platforms need stability
- Don't use colored backgrounds for semantic states in cards — keep cards white or dark, use text color for semantic meaning

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile | <425px | Single column, stacked hero, hamburger nav, 16px padding |
| Small Mobile | 425-599px | Wider mobile layout, price ticker wraps |
| Tablet Small | 600-768px | 2-column feature grid begins |
| Tablet | 769-896px | Hero side-by-side layout begins |
| Desktop Small | 897-1024px | Full nav expands, 3-column features |
| Desktop | 1024-1280px | Full layout, max content width |
| Large Desktop | 1280-1440px | Increased margins, centered container |
| XL Desktop | >1440px | Max-width container (1200px) with expanded margins |

### Touch Targets

- Minimum touch target: 44x44px (WCAG AAA)
- Pill CTA buttons: 48px height minimum
- Nav links: 44px touch area
- Crypto ticker items: full-width tappable rows on mobile
- App download buttons: large tap zones (50px+)

### Collapsing Strategy

- **Navigation**: Full horizontal links → hamburger menu below 897px; logo and "Get Started" CTA remain visible
- **Hero section**: Side-by-side (text left, image right) → stacked (text top, image below) at 768px
- **Feature grid**: 3-col → 2-col at 768px → 1-col at 600px
- **Price ticker**: Horizontal row → wrapping or scrollable at 600px
- **Section padding**: 64px → 48px → 32px → 16px as viewport narrows
- **Device mockups**: Scale down proportionally, maintain centered positioning
- **Footer**: Multi-column → stacked accordion sections on mobile

### Image Behavior

- Device mockups: CSS-scaled with max-width constraints, maintain aspect ratio
- Hero imagery: contained within rounded containers (24px), scale proportionally
- App screenshots: responsive width with fixed aspect ratio
- QR code: fixed 120px square, hidden on mobile (replaced with direct app store links)

## 9. Agent Prompt Guide

### Quick Color Reference

- Primary CTA: Binance Yellow (`#F0B90B`)
- Secondary CTA: Binance Gold (`#FFD000`)
- Background Light: Pure White (`#FFFFFF`)
- Background Dark: Binance Dark (`#222126`)
- Heading text: Ink (`#1E2026`)
- Body text: Slate (`#848E9C`)
- Border: Border Light (`#E6E8EA`)
- Positive: Crypto Green (`#0ECB81`)
- Negative: Crypto Red (`#F6465D`)

### Example Component Prompts

- "Create a hero section with white background, a 60px/700 bold headline in Ink (#1E2026), a 20px/500 subtitle in Slate (#848E9C), and a Binance Yellow (#F0B90B) pill button (50px radius) with dark text (#1E2026)"
- "Design a crypto price ticker strip showing BTC, BNB, SOL prices in 14px/600 Ink (#1E2026) with green (#0ECB81) or red (#F6465D) percentage changes, on a white background with #E6E8EA bottom border"
- "Build a feature card grid (3-column, 24px gap) with 12px radius white cards, subtle shadow (rgba(32,32,37,0.05) 0px 3px 5px), each containing a yellow (#F0B90B) icon, 20px/600 heading, and 14px/500 #848E9C description"
- "Create a dark section (#222126) with a 34px/700 white headline centered, and a 3-column feature grid using dark cards (#2B2F36) with 12px radius and yellow (#F0B90B) accent icons"
- "Design a sticky navigation bar with white background, Binance logo left, 14px/600 #32313A nav links center, and a yellow (#F0B90B) pill button (50px radius, 6px padding 32px) labeled 'Get Started' right"

### Iteration Guide

When refining existing screens generated with this design system:
1. Focus on ONE component at a time
2. Reference specific color names and hex codes from this document
3. Remember: Binance Yellow (#F0B90B) is the ONLY accent color — everything else is grey/dark/white
4. Use the dark/light section alternation for visual pacing
5. Numbers and data should be prominent — this is a financial platform
6. Pill buttons (50px radius) for CTAs, regular buttons (6px radius) for form actions
7. Keep shadows almost invisible (5% opacity) — trust comes from clarity, not depth
8. BinancePlex at 600+ weight for any text that needs to feel authoritative
