# Design System Inspired by PlayStation

> Category: Media & Consumer
> Gaming console retail. Three-surface channel layout, quiet-authority display type, cyan hover-scale.

## 1. Visual Theme & Atmosphere

PlayStation.com carries itself like the marketing wing of a premium consumer-electronics brand that happens to sell entertainment. The page is organized as a **vertical channel of alternating surfaces**: a near-black masthead and hero, a sequence of paper-white editorial panels in the middle, and a deep cobalt-blue footer that anchors the entire experience. Between those surface modes the site leans hard on photography and 3D product renders — the PS5 console, game cover art, DualSense controllers — letting the hardware do the emotional work while the chrome stays restrained.

The signature typographic move is **SST Light (weight 300) at large sizes**. Sony's custom SST family is used from 22px up to 54px in weight 300, giving display headlines a whispered, elegant quality that feels closer to a luxury watch ad than a game store. That "quiet authority" is the exact opposite of The Verge's Manuka shout or Wired's newsstand density — PlayStation wants the type to recede and the product to lead. Body and UI lean on weights 500–700, but the *display* voice is consistently thin and calm.

The one place restraint breaks is **interaction**. Every primary button has the same hover move: fill swaps to an electric cyan `#1eaedb`, a 2px white border appears, a 2px PlayStation-blue outer ring blooms behind it, and the entire button **scales up 1.2×**. That combination of color pop, border, ring, and lift-scale is a signature move unique to Sony among major brands — a miniature "power-on" animation that the site repeats hundreds of times across a single page.

**Key Characteristics:**
- Three-surface channel layout: near-black hero, paper-white content, cobalt-blue footer — alternating, never blending
- SST weight 300 at 22–54px for display — "quiet authority" headlines that let product photography lead
- PlayStation Blue `#0070cc` as the brand anchor; cyan `#1eaedb` reserved exclusively for hover/focus states
- Every interactive element scales 1.2× on hover — a signature "power-on" lift unique to PlayStation
- Pill buttons at full 999px radius; card art in rounded 12–24px rectangles
- Commerce-orange `#d53b00` used exclusively for PlayStation Store / buy-state CTAs
- Wide breakpoint coverage up to 2120px — the site scales all the way to 4K-TV browsing contexts

## 2. Color Palette & Roles

### Primary (Brand Anchor)
- **PlayStation Blue** (`#0070cc`): The brand's anchor color. Used on the primary footer, inline links, primary button fills on dark surfaces, and every "official" marker. Treat this as immovable — it is the color the brand is most associated with in consumer memory.
- **Console Black** (`#000000`): Pure black for the masthead, hero backdrops, and product presentation zones. PlayStation uses black to frame hardware the way a museum uses black to frame a sculpture.

### Secondary & Accent
- **PlayStation Cyan** (`#1eaedb`): The interaction color. Applied ONLY to hover, focus, and active states of buttons and links. Never appears as a default background or a text color at rest. Pair with a 2px `#ffffff` border and a 2px `#0070cc` outer ring on hover for the full signature treatment.
- **Link Hover Blue** (`#1883fd`): The brighter variant used on inline text-link hovers. Distinct from Cyan — this is the link color, Cyan is the button color.
- **Dark Link Blue** (`#0068bd`): The link color at rest on light surfaces — a slightly more saturated cousin of the brand blue.

### Surface & Background
- **Paper White** (`#ffffff`): Primary content canvas for editorial panels between the masthead and footer.
- **Ice Mist** (`#f5f7fa`): The atmospheric end-stop of the light section-gradient. Used subtly behind certain panels to lift them off pure white.
- **Divider Tint** (`#f3f3f3`): The quiet horizontal-rule color between content rows.
- **Masthead Black** (`#000000`): Top nav and hero canvas — reserved for product-forward zones.
- **Shadow Black** (`#121314`): The starting anchor of the dark section-gradient when a panel needs atmospheric depth.
- **Filter Mist** (`rgba(245, 247, 250, 0.3)`): Translucent background used behind sticky filter bars — the only "glassmorphism" moment on the site.

### Neutrals & Text
- **Display Ink** (`#000000`): Primary display headlines on white surfaces.
- **Deep Charcoal** (`#1f1f1f`): Body headlines and link color at rest — slightly softer than pure black to reduce visual ring on large blocks.
- **Body Gray** (`#6b6b6b`): Secondary body text and metadata.
- **Mute Gray** (`#cccccc`): Tertiary labels, disabled states.
- **Placeholder Ink** (`rgba(0, 0, 0, 0.6)`): Form placeholder text — 60% black, not a separate gray value.
- **Inverse White** (`#ffffff`): Primary text on dark and blue surfaces.
- **Dark-Link Blue** (`#53b1ff`): The link color at rest on dark/black surfaces — a lighter airborne variant of PlayStation Blue for legibility on black.

### Semantic & Commerce
- **Commerce Orange** (`#d53b00`): Reserved for PlayStation Store buy-state CTAs, price callouts, and "on sale" badges. The only warm color on the site — use sparingly and never outside a commerce context.
- **Commerce Orange Active** (`#aa2f00`): The pressed/active state of commerce buttons.
- **Warning Red** (`#c81b3a`): Form errors and destructive-action warnings.
- **Shadow Wash 80** (`rgba(0, 0, 0, 0.8)`): The dramatic scrim used behind hero text on product photography.
- **Shadow Wash 16** (`rgba(0, 0, 0, 0.16)`): Low-weight elevation ring on cards.
- **Shadow Wash 08** (`rgba(0, 0, 0, 0.08)`): Featherweight card elevation — barely visible but separates white panels from white background.
- **Shadow Wash 06** (`rgba(0, 0, 0, 0.06)`): The lightest shadow in the system.

### Gradient System
PlayStation uses **two section gradients** and nothing else:
- **Light Section Gradient**: from `#ffffff` → `#f5f7fa` — an almost-imperceptible wash that quietly lifts a panel off the canvas.
- **Dark Section Gradient**: from `#121314` → `#000000` — a short vertical wash that gives hero panels a subtle vignette without introducing any hue shift.

Both gradients are used **only as section backgrounds**, never inside components. There are no gradient buttons, no gradient text, no glowing halos. The brand is blue — not blue-to-purple, not blue-to-cyan.

## 3. Typography Rules

### Font Family
- **SST** / **Playstation SST** (Sony, proprietary) — fallback: `Arial`, `Helvetica`. Sony's custom global typeface, designed by Toshi Omagari and Akira Kobayashi. Covers weights 300 / 500 / 600 / 700 across the homepage. The weight **300 at 22–54px** is PlayStation's typographic signature.
- **SST (condensed / alternate)** — fallback: `helvetica`, `arial`. A compressed variant used in a handful of UI modules where width matters.
- **Arial** — utility fallback for the rare button variant that renders in system sans.

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|---|---|---|---|---|---|---|
| Hero Display (XL) | SST | 54px / 3.38rem | 300 | 1.25 | -0.1px | The biggest SST moment on the page — quiet-weight luxury headline |
| Hero Display (L) | SST | 44px / 2.75rem | 300 | 1.25 | 0.1px | Secondary hero headlines |
| Large Display | SST | 35px / 2.20rem | 300 | 1.25 | — | Feature panel headlines |
| Mid Display | SST | 28px / 1.75rem | 300 | 1.25 | 0.1px | Section headings |
| Compact Display | SST | 22px / 1.38rem | 300 | 1.25 | 0.1px | Module titles — still in light weight 300 |
| Playstation SST Sub | Playstation SST | 22.5px / 1.41rem | 400 | 1.30 | — | Promotional sub-heading |
| UI Heading Small | SST | 18px / 1.13rem | 600 | 1.00 | — | Tight UI headings |
| Button / CTA | SST | 18px / 1.13rem | 500 | 1.25 | 0.4px | Primary button label |
| Button / Emphasized | SST | 18px / 1.13rem | 700 | 1.25 | 0.45px | Higher-emphasis CTAs (buy, subscribe) |
| Button Serif | SST | 18px / 1.13rem | 600 | 1.50 | — | Secondary button label |
| Body Relaxed | SST | 18px / 1.13rem | 400 | 1.50 | 0.1px | Standard reading body |
| Link Body | SST | 18px / 1.13rem | 400 | 1.50 | — | Inline link text |
| Compact Button | SST | 14px / 0.88rem | 700 | 1.25 | 0.324px | Mini CTAs in cards |
| Utility Caption | SST | 14px / 0.88rem | 500 | 1.50 | — | Captions, tag labels |
| Caption Body | SST | 14px / 0.88rem | 400 | 1.50 | — | Standard metadata |
| Playstation Caption Bold | Playstation SST | 14px / 0.88rem | 700 | 1.40 | — | Emphasized caption |
| Playstation Caption Mid | Playstation SST | 14px / 0.88rem | 600 | 1.40 | — | Semi-bold caption |
| Playstation Button | Playstation SST | 14.4px / 0.90rem | 700 | 1.00 | 0.144px | UI button with tight leading |
| Playstation Tab | Playstation SST | 14px / 0.88rem | 400 | 1.10 | 0.14px | Tab/pill label |
| Playstation Compact Caption | Playstation SST | 12.8px / 0.80rem | 400 | 1.10 | — | Smallest UI caption |
| Micro Caption | SST | 12px / 0.75rem | 500 | 1.50 | — | Footer microcopy, legal text |
| Compact Caption Bold | SST | 12.06px / 0.75rem | 700 | 1.50 | — | Emphasized micro text |

### Principles
- **Weight 300 at large sizes is the voice.** PlayStation is the only major console brand that uses a light-weight display for its hero headlines. Resist the urge to "upgrade" display type to 500 or 700 — the quietness is the personality.
- **Weight jumps at the UI layer.** Below 18px the system shifts to 500–700 for legibility. The weight gradient from 300 (display) → 400 (body) → 500 (captions) → 700 (buttons) is the hierarchy.
- **Letter-spacing is barely-there.** Most values are 0.1–0.45px, either positive or slightly negative. The `-0.1px` on the 54px hero tightens the display type just enough to read as "designed" without becoming a typographic statement.
- **Two SST casings.** "SST" and "Playstation SST" are functionally the same family with slightly different metric sets (Playstation SST is tighter at small sizes). Treat them as interchangeable for purposes outside Sony's internal licensing.
- **No all-caps.** Unlike The Verge or Wired, PlayStation rarely uses UPPERCASE labels. Kickers and tags stay in title case or sentence case — another "quiet authority" move.
- **No serif anywhere.** The entire system is sans. There is no print-voice counterpoint.

## 4. Component Stylings

### Buttons

**Primary — PlayStation Blue Pill**
- Background: `#0070cc` (PlayStation Blue)
- Text: `#ffffff`, SST 18px / 500 / 0.4px tracking
- Border: none at rest
- Border radius: `999px` — full pill
- Padding: ~`12px 24px` (variable based on size class)
- Outline: `rgb(255, 255, 255) none 0px` at rest
- **Hover (signature move)**:
  - Background fills to `#1eaedb` (PlayStation Cyan)
  - Text stays `#ffffff`
  - 2px `#ffffff` border appears
  - 2px `#0070cc` outer ring shadow blooms (`0 0 0 2px #0070cc`)
  - `transform: scale(1.2)` — the button actually grows 20%
- Active: `opacity: 0.6` — a quick dim to signal press
- Focus: Same as hover, but the ring turns into `rgb(0, 114, 206) 0px 0px 0px 2px` focus shadow
- Transition: ~180ms ease on background, transform, and shadow

**Secondary — White Outline on Dark**
- Background: `#ffffff`
- Text: `#0172ce` (PlayStation Blue variant)
- Border: `2px outset #000000` — a genuine `outset` border, which is extremely rare in modern CSS
- Radius: varies (often `999px` or `36px`)
- Padding: `16px 20px`
- Hover: same signature cyan fill + scale(1.2) + ring treatment
- Focus: same ring treatment

**Commerce Orange**
- Background: `#d53b00` (Commerce Orange)
- Text: `#ffffff`, SST 18px / 700 / 0.45px tracking
- Border radius: `999px` — pill
- Used only on PS Store / Buy / Subscribe Plus CTAs
- Active: background darkens to `#aa2f00`
- Hover: follows the cyan-invert rule like all other buttons (NOT an orange-specific hover)

**Transparent Ghost**
- Background: transparent
- Text: `#1f1f1f` (Deep Charcoal)
- Border: `1px solid #dedede`
- Padding: `0 10px` (tight, nav-optimized)
- Hover: cyan fill, white text, 2px white border, scale(1.2)
- Active: text shifts to `#0072ce`, opacity 0.6

**Icon Circle**
- Background: `rgba(0, 0, 0, 0.2)` on photography; `#ffffff` on light surfaces
- Border radius: `100%` — perfect circle
- Used for carousel prev/next arrows and share buttons
- Hover: lightens to `var(--color-role-backgrounds-primary-link-hover)` (roughly `#e5e5e5` on light)

**Mini CTA (In-card)**
- SST 14px / 700 / 0.324px tracking
- Padding ~8px 16px
- Radius: `999px`
- Used inside game cards for "Buy Now" / "Add to Cart" mini CTAs

### Cards & Containers

**Hero Card (Game Feature)**
- Background: photography/render — usually black-anchored
- Border radius: `24px` or `19px` for feature cards
- Padding: 32–48px interior
- Shadow: `rgba(0, 0, 0, 0.8) 0px 5px 9px 0px` — a dramatic drop-shadow only used when a card overlaps the hero photography
- Hover: subtle scale transform, cyan outline appears on primary CTA

**Game Cover Tile**
- Background: game cover art, unpadded
- Border radius: `12px` or `13px` (images) / `19px` (card frame)
- Shadow: `rgba(0, 0, 0, 0.08) 0px 5px 9px 0px` — feather-weight elevation
- Hover: the card's primary CTA lights up cyan, the card itself may scale 1.02×
- Transition: 200ms ease on transform

**Content Panel (White)**
- Background: `#ffffff` or the light section gradient `#ffffff → #f5f7fa`
- Border: typically none; separated from neighbors by spacing and subtle shadows
- Radius: `12px`–`24px` depending on panel hierarchy
- Shadow: `rgba(0, 0, 0, 0.06) 0px 5px 9px 0px` — the lightest in the system

**Dark Card on Dark**
- Background: `rgba(0, 0, 0, 0.2)` over photography
- Border radius: `6px` (compact) or `24px` (feature)
- Used for "press kit" or "stat block" inlays over hero video

### Inputs & Forms
- **Default**: `#ffffff` background, `1px solid #cccccc` border, `3px` border radius (tighter than the rest of the system — inputs are the one place where PlayStation gets genuinely compact), SST 16px text in `#1f1f1f`, placeholder `rgba(0, 0, 0, 0.6)`.
- **Focus**: 2px `#0070cc` focus ring via `box-shadow: 0 0 0 2px #0070cc`. No border-color change — the ring does the work.
- **Error**: border and text shift to `#c81b3a` (Warning Red), inline error text below in the same red.
- **Transition**: ~180ms ease on border and shadow.

### Navigation

- **Top nav**: black (`#000000`) full-bleed strip with the PlayStation logo (white) left-aligned, category links centered in SST 14–16px / 500, and a small "Sign In" CTA right-aligned.
- **Hover on nav link**: color transitions from `#ffffff` to `#1883fd` (Link Hover Blue), no underline.
- **Active section**: marked by a subtle 2px underline in `#0070cc`.
- **Mobile**: nav collapses to a hamburger drawer. Inside the drawer, links stack vertically with 16px gaps and 20px horizontal padding.
- **Sticky behavior**: the nav stays pinned at the top on scroll; when it enters a light-surface zone it **does not invert** — it stays black-backed throughout.

### Image Treatment

- **Aspect ratios**: 16:9 hero video/photography, 1:1 console renders, 3:4 game cover art, 4:3 lifestyle imagery.
- **Corners**: rounded to `12px`, `13px`, or `24px` depending on card context. Game covers get `6–12px`, hero images get `24px`.
- **Full-bleed**: only in the masthead hero and footer promotional banners. Everything else sits inside a padded content column.
- **Shadow**: dramatic `rgba(0, 0, 0, 0.8) 0 5px 9px 0` drop on heroes, feather `rgba(0, 0, 0, 0.06) 0 5px 9px 0` on grid tiles.
- **Hover**: image stays static, the card frame and primary CTA respond.
- **Lazy loading**: `loading="lazy"` on everything below the fold, `eager` on the masthead hero.

### Game Store Pill (Distinctive)
- Background: `#ffffff`
- Text: `#000000`, SST 14px / 500
- Padding: `14px 18px`
- Radius: `9999px` — full pill
- A neutral pill tag that sits next to game covers to label platform ("PS5", "PS4", "PSVR2"). White-on-dark contrast.

## 5. Layout Principles

### Spacing System
- **Base unit**: 8px.
- **Scale**: 1, 2, 3, 4.5, 5, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21px.
- **Section padding**: 48–96px vertical between major panels. Hero-to-content transitions use the larger end.
- **Card padding**: 20–32px interior. Feature hero cards can expand to 48px.
- **Inline spacing**: 8–12px between headline and deck, 12–16px between deck and CTA.
- **Micro-scale**: The 1/2/3/4.5/5/9/10/12 values are used for pill padding, caption spacing, and border offsets — not for editorial rhythm.

### Grid & Container
- **Max width**: ~1920px (dembrandt detected breakpoints up to 2120px). Container caps typically around `1280–1920px` depending on panel.
- **Column patterns**: 12-column responsive grid that resolves into 3/4/6-column game tile rows depending on hierarchy. Hero zones often span 12 columns; featured tiles sit in 6+3+3 or 4+4+4 configurations.
- **Outer padding**: 16px mobile → 48px tablet → 64–96px desktop.
- **Gutters**: 16–24px between columns, tighter (8–12px) inside tile clusters.

### Whitespace Philosophy
PlayStation treats whitespace like a luxury brand treats store lighting — as a premium signal. There is noticeably more vertical breathing room between modules than on any other major retail site, and the white editorial panels often hold only one headline + one image + one CTA at hero-scale padding. The effect is a "gallery pace" where each product gets its own room rather than competing in a grid of thumbnails.

### Border Radius Scale
- **2px** — cookie banner buttons and small admin UI
- **3px** — form inputs, tab panels (tighter than everything else — a deliberate "functional UI" cue)
- **6px** — compact buttons and inline images
- **12px** — standard game cover images and content images
- **13px** — certain figure wrappers (a 1px offset from 12px for nesting)
- **19px** — feature cards
- **20px** — inline tag spans
- **24px** — hero cards, primary feature frames
- **36px** — full-pill nav and secondary button variants
- **48px** — large feature buttons
- **999px / 100%** — full pill primary buttons and circular icon buttons

Eleven discrete radius values — one of the richest radius systems of any site in this catalog. The range exists because PlayStation deliberately uses different radii for different *hierarchies*: 3px for utility, 12px for media, 24px for features, 999px for CTAs.

## 6. Depth & Elevation

| Level | Treatment | Use |
|---|---|---|
| 0 | No shadow | Default content on `#ffffff` |
| 1 | `rgba(0, 0, 0, 0.06) 0 5px 9px 0` | Feather-light editorial panel lift |
| 2 | `rgba(0, 0, 0, 0.08) 0 5px 9px 0` | Standard grid tile elevation |
| 3 | `rgba(0, 0, 0, 0.16) 0 5px 9px 0` | Emphasized card (hover or active) |
| 4 | `rgba(0, 0, 0, 0.8) 0 5px 9px 0` | Hero overlay shadow — dramatic drop used over photography |
| 5 | `0 0 0 2px #0070cc` (focus ring) | Primary button focus state |
| 6 | `0 0 0 2px #000000` (hover ring) | Secondary button hover ring |
| 7 | Section gradient `#121314 → #000000` | Atmospheric depth on dark hero panels |

PlayStation's depth philosophy is **layered but restrained**. The shadow scale runs from 0.06 to 0.16 for normal states, then jumps to 0.8 for hero drops — there is no 0.2, 0.3, 0.4 middle ground. The effect is that most of the page sits almost flat, but when a hero card needs to float over photography, it genuinely *floats*. Elevation is either whispered or shouted, never muttered.

### Decorative Depth
- **Section gradients** (dark and light, both described above) — used only as section backgrounds
- **Focus/hover rings** at 2px, always blue or cyan depending on state
- **No glows, blurs, or atmospheric effects** beyond the two section gradients
- **No gradient buttons or text** — the visual system is solid color blocks everywhere except section transitions

## 7. Do's and Don'ts

### Do
- **Do** use PlayStation Blue (`#0070cc`) as the primary CTA fill and the footer anchor. It is the brand's anchor color.
- **Do** use SST weight 300 for every display headline 22px and above. The quiet-weight headline is the voice.
- **Do** apply the full hover signature to every primary button: cyan fill + 2px white border + 2px blue outer ring + `scale(1.2)`.
- **Do** use full-pill radius (`999px`) on primary and commerce buttons.
- **Do** reserve PlayStation Cyan (`#1eaedb`) exclusively for hover, focus, and active states — never as a resting background.
- **Do** use Commerce Orange (`#d53b00`) only on PlayStation Store / purchase CTAs and price callouts.
- **Do** alternate dark hero panels with white content panels and anchor with a deep blue footer — the three-surface channel layout is the page rhythm.
- **Do** use dramatic `rgba(0, 0, 0, 0.8)` hero drop shadows when a card overlaps product photography.
- **Do** keep the top nav black on every scroll position — it does not invert to white over light panels.

### Don't
- **Don't** bold display headlines. Weight 300 at 22–54px is the PlayStation voice. Weight 700 display type reads as "another game retailer".
- **Don't** use ALL-CAPS labels or kickers. PlayStation rarely uses uppercase — it is a quiet-authority brand, not a hazard-tape one.
- **Don't** use gradient buttons, text, or backgrounds outside the two declared section gradients.
- **Don't** introduce warm colors outside Commerce Orange. No red CTAs, no yellow highlights, no green success pills.
- **Don't** use square corners on buttons or media. The system has eleven radii — pick one, but never `0`.
- **Don't** skip the `scale(1.2)` hover move on primary buttons. The lift-scale is a brand interaction signature.
- **Don't** use serif type. The system is 100% SST sans.
- **Don't** let cyan `#1eaedb` appear as a text or background color at rest. It only exists in motion.
- **Don't** design panels that fight for attention. PlayStation's whitespace rhythm gives each module its own "gallery room".

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Small Mobile | <400px | Single column, nav collapses to hamburger, SST hero scales to ~28px |
| Mobile | 400–599px | Single column, tiles stack full-width, padding opens to 16px |
| Large Mobile | 600–767px | Still single column but 2-column tile option in select modules |
| Tablet Portrait | 768–1023px | 2-column game grid, nav still condensed |
| Tablet Landscape | 1024–1279px | 3–4 column grid, full nav restored |
| Desktop | 1280–1599px | Full editorial grid, max hero display scale (44–54px) |
| Large Desktop | 1600–1919px | Container caps at 1600px, margins expand |
| 4K / Big-Screen | ≥1920px | Container expands to 1920px max, hero content scales up to match TV viewing distance |
| Ultra-Wide | ≥2120px | Extreme breakpoint — page stays anchored, outer margins absorb extra width |

The dembrandt sweep detected 30 breakpoints between 320px and 2120px — an unusually wide responsive range. PlayStation tunes specifically for **big-screen contexts** (1920–2120px) because PS5 owners frequently browse the site on TVs via the console's browser or via cast-to-TV from a phone. Most retail sites stop tuning at 1440px; PlayStation keeps tuning through 4K.

### Touch Targets
- Primary pill buttons are ~48–56px tall (SST 18px text + ~12–16px vertical padding) — comfortably WCAG AAA.
- Nav links are smaller (~32–40px tall) at desktop; on mobile they pad out to 48px+ inside the drawer.
- Icon circle buttons are 40–48px — touch-friendly.

### Collapsing Strategy
- **Nav**: full nav → condensed → hamburger drawer as viewport narrows. Logo stays pinned left; CTA stays pinned right.
- **Grid**: 6-col → 4-col → 3-col → 2-col → 1-col. Game tile cards reflow without cropping cover art.
- **Spacing**: section padding tightens from 96px → 64px → 48px → 32px → 24px as viewport narrows.
- **Type**: SST hero scales from 54px → 44px → 35px → 28px → 22px. The light weight 300 is preserved at every size.
- **Hero photography**: art-direction swap — desktop uses wide 16:9 crops, mobile uses 4:3 or 1:1 crops with the product centered.

### Image Behavior
- Responsive raster (`srcset` + `<picture>` with art-direction), aspect ratios preserved per breakpoint.
- 4K-ready: the site serves high-density imagery at 1920px+ to avoid upscaling on TV browsing.
- `loading="lazy"` on everything below the fold; hero is `eager` with a preload hint.

## 9. Agent Prompt Guide

### Quick Color Reference
- **Primary CTA**: "PlayStation Blue (`#0070cc`)"
- **Hover / Focus Accent**: "PlayStation Cyan (`#1eaedb`)"
- **Background (White Surface)**: "Paper White (`#ffffff`)"
- **Background (Dark Surface)**: "Console Black (`#000000`)"
- **Heading Text on White**: "Display Ink (`#000000`)"
- **Body Text on White**: "Deep Charcoal (`#1f1f1f`)"
- **Body Text on Black**: "Inverse White (`#ffffff`)"
- **Commerce / Buy Accent**: "Commerce Orange (`#d53b00`)"
- **Footer Anchor**: "PlayStation Blue (`#0070cc`)"

### Example Component Prompts
1. *"Create a primary CTA button with a `#0070cc` PlayStation Blue fill, white text in SST 18px / 500 / 0.4px tracking, 999px border radius, 12px × 24px padding. On hover, the background transitions to `#1eaedb` PlayStation Cyan, a 2px `#ffffff` border appears, a 2px `#0070cc` outer ring blooms via box-shadow, and the entire button scales 1.2× — all in a 180ms ease transition."*
2. *"Design a hero panel on a `#000000` Console Black canvas with a 54px SST weight 300 headline in `#ffffff` with -0.1px letter-spacing and 1.25 line-height. Place a single primary CTA below with the standard PlayStation hover treatment. No ALL-CAPS labels anywhere."*
3. *"Build a game cover tile: 3:4 aspect ratio image with 12px border radius, feather-weight `rgba(0, 0, 0, 0.08) 0 5px 9px 0` drop shadow, a 14px SST 700 title below, a 12px SST 500 platform tag, and a mini 14px / 700 / 0.324px tracking primary CTA in PlayStation Blue."*
4. *"Create a commerce pill button for a PlayStation Store purchase: `#d53b00` Commerce Orange fill, `#ffffff` text in SST 18px / 700 / 0.45px tracking, 999px radius, 12px × 28px padding. Active state darkens to `#aa2f00`. Hover follows the standard cyan-invert with 1.2× scale."*
5. *"Design a white content panel between dark hero sections: `#ffffff` background with the subtle `#ffffff → #f5f7fa` light section gradient, 24px border radius, 48px interior padding, feather-weight `rgba(0, 0, 0, 0.06) 0 5px 9px 0` elevation, a 35px SST 300 headline, a 18px body paragraph, and a single primary CTA."*

### Iteration Guide
When refining existing screens generated with this design system:
1. **Audit display weight.** Every headline 22px and above should be SST weight 300. If you see weight 500 or 700 at hero scale, you've lost the PlayStation voice.
2. **Audit the hover treatment.** Every primary button must scale 1.2× on hover with the cyan-fill + white-border + blue-ring combination. Miss any of those four and the interaction signature breaks.
3. **Audit corners.** Every container and button should land on 2, 3, 6, 12, 13, 19, 20, 24, 36, 48, or 999px / 100%. Square corners break the voice.
4. **Audit color sprawl.** Only PlayStation Blue (`#0070cc`), Cyan (`#1eaedb`), Commerce Orange (`#d53b00`), and the declared grays/blacks/whites should appear in chrome. If you see any other hue, correct it.
5. **Audit surface alternation.** The page should alternate dark hero → white content → dark hero → white content → blue footer. If two same-surface panels are adjacent, insert a transition.
6. **Audit casing.** Sentence case and title case only. No ALL-CAPS labels, buttons, or kickers. If you see uppercase, convert it.
7. **Audit shadow weight.** Shadow opacity should land on 0.06 / 0.08 / 0.16 / 0.8 — nothing in between. If you see 0.1, 0.2, 0.3, 0.5 drop shadows, correct to the nearest declared tier.
8. **Audit whitespace.** If two modules feel "competitive" (fighting for attention), add 48–96px of vertical breathing room. PlayStation's gallery-pace rhythm is non-negotiable.
