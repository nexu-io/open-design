# Design System Inspired by Meta (Store)

> Category: E-Commerce & Retail
> Tech retail store. Photography-first, binary light/dark surfaces, Meta Blue CTAs.

## 1. Visual Theme & Atmosphere

The Meta Store is a product-forward retail experience built to sell hardware — Quest VR headsets, Ray-Ban Meta smart glasses, and accessories. The design walks a tightrope between consumer electronics showroom and lifestyle editorial, deploying cinematic product photography against expansive white canvas to create a gallery-like sense of aspiration. Every design decision serves the merchandise: generous negative space frames hero product shots like museum pieces, while alternating light and dark surface sections create a visual rhythm that mimics the experience of walking through a physical retail space.

The "Dolly" design system (Meta's internal name for the store layer) sits atop the broader FDS (Facebook Design System) foundation, inheriting its gray scale and semantic tokens while overlaying its own product-focused palette. The result is a system that feels distinctly Meta — the custom Optimistic typeface brings warmth and approachability to what could otherwise be cold tech retail — yet flexible enough to showcase wildly different product lines (from VR headsets to fashion eyewear) without feeling disjointed. The surface strategy is binary: pure white for browsing and information, rich dark for immersive product moments.

The store's visual hierarchy is ruthlessly simple. Photography does the heavy lifting, supported by short, punchy headlines in Optimistic Medium and body text that stays brief and scannable. Calls to action are pill-shaped, unmistakable, and always Meta Blue. There is no visual noise, no decoration for decoration's sake — every element either sells or navigates.

**Key Characteristics:**
- Photography-first retail design where products are the visual heroes, not UI
- Binary surface strategy: pure white for information, deep dark for immersive product moments
- Pill-shaped CTAs in saturated blue create unmistakable action points
- Optimistic VF typeface with OpenType ss01/ss02 features brings geometric warmth
- Generous whitespace frames products like gallery exhibits
- 8px spacing grid with disciplined vertical rhythm
- Alternating light/dark sections create a "walkthrough" retail cadence

## 2. Color Palette & Roles

### Primary

- **Meta Blue** (`#0064E0`): Primary CTA background, interactive links, action-driving elements throughout the store
- **Meta Blue Hover** (`#0143B5`): Darkened blue for hover states on primary buttons
- **Meta Blue Pressed** (`#004BB9`): Deepest blue for active/pressed button states
- **Meta Blue Light** (`#47A5FA`): Lighter blue variant used on dark backgrounds for CTAs
- **Facebook Blue** (`#1877F2`): Legacy accent inherited from FDS, used for deemphasized button text and badges

### Secondary & Accent

- **Ray-Ban Red** (`#D6311F`): Product-specific accent for Ray-Ban Meta smart glasses sections
- **Oculus Purple** (`#A121CE`): Quest/Oculus product accent for VR content
- **Work Purple** (`#6441D2`): Accent for Meta for Work/enterprise content
- **Portal Blue** (`#1B365D`): Deep navy accent for Portal product line
- **Portal Hero Blue** (`#C8E4E8`): Soft teal-blue for Portal hero backgrounds
- **Portal Light Blue** (`#ADD4E0`): Secondary Portal surface tint

### Surface & Background

- **White** (`#FFFFFF`): Primary page canvas, nav bar background, card surfaces
- **Soft Gray** (`#F1F4F7`): Secondary background for content sections (--dolly-bg-grey)
- **Warm Gray** (`#F7F8FA`): Flat card background, subtle surface differentiation
- **Web Wash** (`#F0F2F5`): Deemphasized background areas, attachment footers
- **Linen** (`#F2F0E6`): Warm off-white for lifestyle-adjacent sections
- **Baby Blue** (`#E8F3FF`): Highlight background, subtle blue tint for informational areas
- **Near Black** (`#1C1E21`): Dark section backgrounds, immersive product showcase areas
- **Oculus Light** (`#181A1B`): Slightly warm dark surface for Quest product sections
- **Oculus Dark** (`#000000`): Pure black for maximum contrast product displays
- **Overlay** (`rgba(0, 0, 0, 0.6)`): Modal/lightbox backdrop

### Neutrals & Text

- **Primary Text** (`#050505`): Main body and heading text on light surfaces
- **Dark Charcoal** (`#1C2B33`): Dolly system primary text, slightly warmer than pure black (--dolly-text-primary)
- **Icon Secondary** (`#465A69`): Secondary icon fills, subdued UI elements
- **Secondary Text** (`#65676B`): Supporting copy, labels, timestamps (--secondary-text)
- **Slate Gray** (`#5D6C7B`): Meta Store secondary text, product descriptions (--dolly-text-secondary)
- **Section Header** (`#4B4C4F`): Mid-gray for section titles
- **Button Text Gray** (`#444950`): FDS button text default (--fds-button-text)
- **Disabled Text** (`#BCC0C4`): Inactive button labels, placeholder text
- **CTA Disabled Text** (`#8595A4`): Muted blue-gray for disabled interactive labels
- **Divider** (`#CED0D4`): Content separators, input borders
- **Divider Gray** (`#DEE3E9`): Lighter divider for Dolly sections
- **CTA Gray Border** (`#CBD2D9`): Outline button borders
- **Dark Gray Border** (`#909396`): Stronger outline for emphasis

### Semantic & Accent

- **Success Green** (`#31A24C`): Badge success background, positive indicators
- **Store Success** (`#007D1E`): Darker success green for Dolly store confirmations
- **Error Red** (`#E41E3F`): Critical badge background, notification badges
- **Store Error** (`#C80A28`): Darker error red for Dolly store error states
- **Warning Amber** (`#F7B928`): Attention badges, caution indicators
- **Positive BG** (`rgba(36, 228, 0, 0.15)`): Subtle success background tint
- **Error BG** (`rgba(255, 123, 145, 0.15)`): Subtle error background tint
- **Warning BG** (`rgba(255, 226, 0, 0.15)`): Subtle warning background tint
- **Info BG** (`rgba(0, 145, 255, 0.15)`): Subtle informational blue tint

### Base Color Spectrum (FDS)

- **Cherry** (`#F3425F`): Expressive accent
- **Grape** (`#9360F7`): Purple accent
- **Lime** (`#45BD62`): Green accent
- **Seafoam** (`#54C7EC`): Cyan accent
- **Teal** (`#2ABBA7`): Teal accent
- **Tomato** (`#FB724B`): Orange accent
- **Pink** (`#FF66BF`): Pink accent

### Gradient System

- **Dark Overlay Gradient**: `linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0.6))` — applied over dark product photography for text legibility
- **Blue Infinity Gradient**: The Meta symbol uses a blue-to-teal gradient on brand materials, though the store uses flat blue
- **Shadow Alpha Scale**: 0.05, 0.10, 0.15, 0.20, 0.30, 0.40, 0.50, 0.60, 0.80 — both black and white alpha ramps for layered transparency

## 3. Typography Rules

### Font Family

**Primary:** Optimistic VF (variable font by Dalton Maag, commissioned by Meta)
- Fallbacks: Montserrat, Helvetica, Arial, Noto Sans
- OpenType features: `"ss01", "ss02"` — stylistic sets that activate Meta-specific alternate glyphs
- Variable font with continuous weight axis (observed: 300, 400, 500, 700)

**Secondary:** Helvetica
- Fallbacks: Arial
- Used for small utility text (12px footer links, legal copy)

### Hierarchy

| Role | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|--------|-------------|----------------|-------|
| Display 1 | 64px | 500 (Medium) | 1.16 | — | Hero headlines on desktop, ss01+ss02 |
| Display 2 | 48px | 500 (Medium) | 1.17 | — | Section heroes, product titles |
| Heading 1 | 36px | 500 (Medium) | 1.28 | — | Major section headings |
| Heading 2 | 28px | 300 (Light) | 1.21 | — | Subheadings, lighter feel |
| Heading 3 | 18px | 700 (Bold) | 1.44 | — | Card titles, bold callouts, ss01+ss02 |
| Body | 18px | 400 (Regular) | 1.44 | — | Product descriptions, body copy |
| Body Compact | 16px | 500 (Medium) | 1.50 | -0.16px | Navigation links, UI labels |
| Caption Bold | 14px | 700 (Bold) | 1.43 | — | Emphasized labels, price text |
| Caption | 14px | 400 (Regular) | 1.43 | -0.14px | Secondary labels, metadata |
| Small | 12px | 400 (Regular) | 1.33 | — | Footer links, legal text, timestamps |
| Button | 14px | 400 (Regular) | 1.43 | -0.14px | Button label text |

### Principles

Optimistic VF is the cornerstone of Meta's typographic identity — a humanist sans-serif with geometric underpinnings that strikes a balance between Silicon Valley precision and consumer warmth. The "ss01" and "ss02" stylistic sets introduce alternate glyphs that give headlines a distinctive Meta character. Weight 500 (Medium) dominates headlines, creating a presence that commands without shouting, while the unexpected use of weight 300 (Light) at 28px adds an airy, editorial quality to subheadings. Negative letter-spacing at smaller sizes (-0.14px to -0.16px) tightens the optical rhythm for UI elements, keeping the reading experience crisp and efficient.

## 4. Component Stylings

### Buttons

**Primary (Pill)**
- Background: Meta Blue (`#0064E0`)
- Text: White (`#FFFFFF`)
- Border: none
- Border radius: fully rounded pill (100px)
- Padding: 10px 22px
- Font: Optimistic VF, 14px, regular, -0.14px tracking
- Hover: darkens to `#0143B5`, scale(1.1) transform
- Pressed: `#004BB9`, scale(0.9), opacity 0.5
- Focus: 3px ring in accent color, outline auto 2px
- Transition: background 200ms ease, transform 150ms ease

**Secondary (Outlined Pill)**
- Background: transparent
- Text: Dark Charcoal (`#1C2B33`) at 50% opacity
- Border: 2px solid `rgba(10, 19, 23, 0.12)`
- Border radius: fully rounded pill (100px)
- Padding: 10px 22px
- Hover: background shifts to `rgba(70, 90, 105, 0.7)`, text to white

**Ghost/Link Button**
- Background: transparent / `rgba(255, 255, 255, 0)`
- Text: Link Blue (`#385898`)
- Border radius: 24px
- Padding: 4px 12px

**Disabled**
- Background: `#DEE3E9` (--dolly-cta-disabled)
- Text: `#8595A4` (--dolly-cta-disabled-text)
- Cursor: not-allowed, no hover effects

### Cards & Containers

- Background: White (`#FFFFFF`) or Flat Gray (`#F7F8FA`)
- Corner radius: 20px (--card-corner-radius) for standard cards, 24px for product feature cards
- Padding: 10px horizontal, 20px vertical (--card-padding)
- Shadow: `0 12px 28px 0 rgba(0,0,0,0.2), 0 2px 4px 0 rgba(0,0,0,0.1)` (elevated cards)
- Hover: subtle lift via translateY(-2px) and shadow intensification
- Transition: transform 300ms ease, box-shadow 300ms ease
- Product cards use full-bleed imagery with text overlay on dark gradient

### Inputs & Forms

- Background: White (`#FFFFFF`)
- Border: 1px solid `#CED0D4` (--input-border-color)
- Border radius: 8px
- Font: Optimistic VF, 16px
- Focus: border color shifts to accent blue `hsl(214, 89%, 52%)`, 3px outer ring
- Error: border and label color `hsl(350, 87%, 55%)`
- Placeholder: `#65676B` (--secondary-text)
- Transition: border-color 200ms ease, box-shadow 200ms ease

### Navigation

- Background: White (`#FFFFFF`), sticky at top
- Frosted glass effect: `rgba(241, 244, 247, 0.8)` with backdrop-filter blur
- Logo: Meta wordmark SVG, left-aligned
- Links: Optimistic VF, 16px/500, Dark Charcoal (`#1C2B33`)
- Hover: underline decoration
- CTA: Blue pill button, right-aligned
- Mobile: hamburger collapse, full-screen overlay nav
- Height: approximately 56px desktop, 48px mobile
- Border-bottom: subtle `rgba(0,0,0,0.1)` separator

### Image Treatment

- Product hero: full-width, cinematic aspect ratio (~21:9 on desktop, ~4:3 on mobile)
- Product cards: 1:1 or 4:3, edge-to-edge within card radius
- Feature images: rounded corners matching card radius (20-24px)
- Dark text-over-image: gradient overlay `linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0.6))`
- Lazy loading: native loading="lazy" on below-fold images
- WebP format with JPEG fallback

### Product-Specific Sections

- **Quest sections**: Dark backgrounds (`#181A1B` or `#000000`), white/light text, purple accents (`#A121CE`)
- **Ray-Ban sections**: Warm lifestyle photography, red accents (`#D6311F`), linen tones (`#F2F0E6`)
- **Portal sections**: Teal-blue palette (`#C8E4E8`, `#ADD4E0`), navy accents (`#1B365D`)

## 5. Layout Principles

### Spacing System

Base unit: 8px

| Token | Value | Use |
|-------|-------|-----|
| space-1 | 1px | Hairline borders |
| space-2 | 4px | Tight internal padding |
| space-3 | 8px | Base unit, icon gaps |
| space-4 | 10px | Card horizontal padding |
| space-5 | 12px | Button icon spacing, tight margins |
| space-6 | 14px | Caption line height spacing |
| space-7 | 16px | Standard paragraph spacing, nav padding |
| space-8 | 18px | Body text vertical rhythm |
| space-9 | 24px | Card section spacing, grid gaps |
| space-10 | 32px | Section content padding |
| space-11 | 40px | Major content block spacing |
| space-12 | 48px | Section vertical padding (compact) |
| space-13 | 64px | Section vertical padding (standard) |
| space-14 | 80px | Hero section padding, large section gaps |

### Grid & Container

- Max container width: ~1440px, centered with auto margins
- Product grid: 3-column on desktop, 2-column on tablet, 1-column on mobile
- Feature grid: 2-column split (image + content), stacks on mobile
- Grid gap: 24px between cards, 16px on mobile
- Page horizontal padding: 24-40px depending on breakpoint

### Whitespace Philosophy

Whitespace is the store's primary luxury signifier. Sections breathe with 64-80px vertical padding, creating a sense of unhurried browsing. Product images float in generous negative space rather than being crammed edge-to-edge. This restrained spacing communicates premium positioning — the visual equivalent of wide aisles in a high-end retail store.

### Border Radius Scale

| Value | Context |
|-------|---------|
| 8px | Inputs, small UI elements, glimmer placeholders |
| 20px | Cards (--card-corner-radius) |
| 24px | Feature cards, product highlight areas, ghost buttons |
| 100px | Pill buttons, tags, badges (fully rounded) |

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Flat | No shadow, background differentiation only | Default cards, sections |
| Level 1 | `0 2px 4px 0 rgba(0,0,0,0.1)` | Subtle lift for interactive cards |
| Level 2 | `0 12px 28px 0 rgba(0,0,0,0.2), 0 2px 4px 0 rgba(0,0,0,0.1)` | Elevated cards, dropdowns |
| Overlay | `rgba(0,0,0,0.6)` full-screen | Modal/lightbox backdrop |
| Inset | `rgba(255,255,255,0.5)` inset | Inner glow on glass-effect surfaces |

The Meta Store favors a primarily flat elevation model. Most surface differentiation comes from background color shifts (white → soft gray → dark) rather than shadows. When shadows appear, they are soft, diffused, and use the dual-shadow pattern (a large blurred shadow for ambient light + a small sharp shadow for direct light). This creates a physically plausible depth feel without heavy visual weight.

### Decorative Depth

- **Frosted glass nav**: `rgba(241, 244, 247, 0.8)` background with backdrop-filter blur, creating a translucent navigation bar
- **Dark section gradient**: `linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0.6))` overlay on product photography for text legibility
- **Glimmer loading states**: Pulsating opacity animation (0.25 → 1.0) on `#979A9F` base color with 8px radius, 1000ms steps timing — used for skeleton screens during product image loading

## 7. Do's and Don'ts

### Do

- Use pill-shaped (100px radius) buttons for all primary and secondary CTAs
- Let product photography dominate — make images the visual hero of every section
- Alternate between light and dark surface sections to create visual rhythm
- Use Optimistic VF with ss01 and ss02 features for all display text
- Keep body copy brief and scannable — this is retail, not editorial
- Use the dual-shadow pattern (ambient + direct) when elevation is needed
- Apply Meta Blue (`#0064E0`) exclusively for actionable elements
- Use generous whitespace (64-80px section padding) to convey premium feel
- Apply gradient overlays on dark photography when placing text over images
- Use the semantic color tokens (success, error, warning) consistently for status communication

### Don't

- Don't use sharp corners (< 8px radius) — the Meta Store is all smooth curves
- Don't mix product-specific accents (Ray-Ban Red with Quest Purple in the same section)
- Don't add decorative borders or ornamental dividers — dividers are functional only
- Don't place important text directly on photography without a gradient scrim
- Don't use weight 300 for anything smaller than 28px — it becomes too thin
- Don't use Facebook Blue (`#1877F2`) as a primary CTA color — use Meta Blue (`#0064E0`) instead
- Don't crowd product images — maintain generous padding around all photography
- Don't use more than 2 levels of text hierarchy in a single card
- Don't add drop shadows to cards in dark sections — rely on border and color separation
- Don't use long paragraphs — limit to 2-3 lines of body copy per block

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile | <768px | Single column, hamburger nav, hero text shrinks to 36px, full-width product cards, 48px section padding |
| Tablet | 768-1024px | 2-column product grid, compact nav, hero text at 48px |
| Desktop | 1024-1440px | 3-column product grid, full horizontal nav, hero text at 64px, 80px section padding |
| Large Desktop | >1440px | Max-width container (1440px) centered, increased horizontal margins |

### Touch Targets

- Minimum touch target: 44x44px (WCAG AAA compliant)
- Mobile button height: minimum 44px with 10px vertical padding
- Nav hamburger icon: 48x48px touch area
- Product card tappable area: full card surface

### Collapsing Strategy

- **Navigation**: Horizontal links collapse to hamburger menu below 768px; CTA button remains visible
- **Product grids**: 3-col → 2-col at 1024px → 1-col at 768px
- **Hero sections**: Display text scales from 64px → 48px → 36px; CTA buttons stack vertically on mobile
- **Feature sections**: 2-column (image + text) → full-width stacked below 768px, image on top
- **Section padding**: 80px → 64px → 48px → 32px as viewport narrows
- **Card radius**: Remains consistent at 20-24px across all breakpoints

### Image Behavior

- Responsive images via srcset with multiple resolutions
- WebP format with progressive JPEG fallback
- Hero images: full-bleed on mobile, contained on desktop
- Product grid images: maintain aspect ratio, scale proportionally
- Art direction: hero crop changes between desktop (wide cinematic) and mobile (tighter product focus)
- Lazy loading with glimmer skeleton (pulsating gray placeholder) during load

## 9. Agent Prompt Guide

### Quick Color Reference

- Primary CTA: Meta Blue (`#0064E0`)
- Background: White (`#FFFFFF`)
- Heading text: Dark Charcoal (`#1C2B33`)
- Body text: Slate Gray (`#5D6C7B`)
- Border/divider: Divider Gray (`#DEE3E9`)
- Secondary surface: Soft Gray (`#F1F4F7`)
- Dark sections: Near Black (`#1C1E21`)

### Example Component Prompts

- "Create a product hero section with a full-width cinematic image, `linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0.6))` text overlay, Optimistic-style 64px/500 white headline, and a Meta Blue (`#0064E0`) pill button (100px radius, 10px 22px padding)"
- "Design a 3-column product card grid with 20px rounded corners, white backgrounds, edge-to-edge product images at top, 18px/400 body text in Slate Gray (`#5D6C7B`), and 24px grid gap"
- "Build a sticky navigation bar with white background, `rgba(241, 244, 247, 0.8)` frosted glass effect, 16px/500 dark text links, and a right-aligned Meta Blue pill CTA"
- "Create a dark product showcase section with `#1C1E21` background, white 48px/500 headline, `#5D6C7B` body text, and a secondary outlined pill button with `rgba(10, 19, 23, 0.12)` border"
- "Design a feature comparison grid with Soft Gray (`#F1F4F7`) background, 24px rounded cards, Meta Blue checkmark icons, and 14px/700 bold labels"

### Iteration Guide

When refining existing screens generated with this design system:
1. Focus on ONE component at a time
2. Reference specific color names and hex codes from this document
3. Use natural language descriptions, not CSS values — "pill-shaped Meta Blue button" not "border-radius: 100px; background: #0064E0"
4. Describe the desired "feel" alongside specific measurements — "generous whitespace like a gallery" means 64-80px section padding
5. For dark sections, specify which product context (Quest dark `#181A1B`, pure black `#000000`, or standard dark `#1C1E21`)
6. Always specify the Optimistic VF weight explicitly (300, 400, 500, or 700) — each creates a dramatically different feel
