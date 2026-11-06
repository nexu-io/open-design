# Design System Inspired by Airbnb

> Category: E-Commerce & Retail
> Travel marketplace. Warm coral accent, photography-driven, rounded UI.

## 1. Visual Theme & Atmosphere

Airbnb's 2026 design feels like a travel magazine that happens to be an app — pristine white canvases give way to full-bleed photography, and the interface itself disappears so the listings can breathe. The signature Rausch coral-pink (`#ff385c`) is used sparingly but unmistakably: search CTA, active tab indicator, primary action button, the occasional price or wishlist heart. Everything else is a disciplined grayscale, with `#222222` carrying almost every line of text.

What makes the system unmistakably Airbnb is how much *faith* it places in content. Property photos are displayed at hero scale, 4:3 with edge-to-edge radius treatment. Category switching happens through a tri-tab picker (Homes / Experiences / Services) that uses 3D rendered illustrated icons (a pitched-roof house, a hot-air balloon, a service bell) — physical, tactile, almost toy-like — paired with crisp `Airbnb Cereal VF` labels. This is the rare consumer product where 3D renders and purely typographic UI coexist without tension.

The newest surface is the **Experiences** product line — same chrome, but richer card density, more photography, and a center-anchored booking panel with sticky right-rail pricing. Listing detail pages (both rooms and experiences) follow a tight template: full-bleed hero image grid → overlapping rounded booking card (sticky on scroll) → amenities → reviews (Guest Favorite awards use a big centered `4.81` rating with a laurel-wreath lockup) → map → host profile → disclosures. The rhythm is consistent whether you're booking a room or a yacht tour.

**Key Characteristics:**
- Rausch coral-pink (`#ff385c`) as a single-accent brand color, used only for primary CTAs and the search button
- Full-bleed photography at 4:3 / 16:9 with gentle corner rounding (14–20px) as the primary visual vocabulary
- 3D rendered category icons paired with typographic tabs — the one place the system allows illustration
- Circular `50%` icon buttons (back arrow, share, favorite, carousel arrows) scattered throughout
- `Airbnb Cereal VF` carries every label, from 8px legal footnote to 28px section heading — a single-family system
- Product-tier color coding: Airbnb Plus (magenta `#92174d`), Airbnb Luxe (deep purple `#460479`), Airbnb (Rausch coral)
- Guest Favorite award lockup — centered giant rating number between two laurel wreaths, one of the most recognizable moments in the system
- Sticky booking panel with a price → dates → guests stack, pinned to the right rail on desktop, transforming to a bottom-anchored "Reserve" bar on mobile
- Sticky bottom mobile navigation (Explore / Wishlists / Log in) with an active-state Rausch tint

## 2. Color Palette & Roles

### Primary
- **Rausch** (`#ff385c`): The brand's signature coral-pink. CSS variable `--palette-bg-primary-core`. Used for: primary "Reserve" button, search submit button, active tab underline, wishlist heart fill, pricing emphasis. The single highest-visibility color on every page.

### Secondary & Accent
- **Deep Rausch** (`#e00b41`): A more saturated variant. CSS variable `--palette-bg-tertiary-core`. Used for pressed/active button states and gradient terminal stops.
- **Plus Magenta** (`#92174d`): CSS variable `--palette-bg-primary-plus`. The brand color for the Airbnb Plus product tier — a higher-end curated-listing offering.
- **Luxe Purple** (`#460479`): CSS variable `--palette-bg-primary-luxe`. The brand color for the Airbnb Luxe product tier — villa/estate-level rentals.
- **Info Blue** (`#428bff`): CSS variable `--palette-text-legal`. Used for legal/informational links (terms, privacy, disclosures) — the only non-monochrome link color in the system.

### Surface & Background
- **Canvas White** (`#ffffff`): The default page background. Every card, every container, every detail page starts here.
- **Soft Cloud** (`#f7f7f7`): Subtle subsurface tint used on footer backgrounds, map-view wrappers, and "everything else" sections that want to step back from the primary white.
- **Hairline Gray** (`#dddddd`): Ubiquitous 1px border color — separates cards, amenity rows, review panels, footer columns. The workhorse of the layout system.

### Neutrals & Text
- **Ink Black** (`#222222`): CSS variable `--palette-text-primary`. The system's near-black. Every heading, every body paragraph, every nav label, every price. Used for ~90% of all text on a page.
- **Charcoal** (`#3f3f3f`): CSS variable `--palette-text-focused`. Used in focused-state input text and one-step-down emphasis copy.
- **Ash Gray** (`#6a6a6a`): CSS variable `--palette-bg-tertiary-hover`. Secondary labels, "Cottage rentals" subtitle-style copy under city names, muted footer links.
- **Mute Gray** (`#929292`): CSS variable `--palette-text-link-disabled`. Disabled buttons and low-priority metadata.
- **Stone Gray** (`#c1c1c1`): Tertiary dividers, icon strokes, placeholder avatars.

### Semantic & Accent
- **Error Red** (`#c13515`): CSS variable `--palette-text-primary-error`. Form validation errors, destructive-action warnings.
- **Deep Error** (`#b32505`): CSS variable `--palette-text-secondary-error-hover`. Pressed/active variants of error states.
- **Translucent Black** (`rgba(0, 0, 0, 0.24)`): CSS variable `--palette-text-material-disabled`. Disabled material-style labels.

### Gradient System
Airbnb's brand gradient appears sparingly, typically only on the wordmark and the search-button branded moment:

```
linear-gradient(90deg, #ff385c 0%, #e00b41 50%, #92174d 100%)
```

This coral → magenta sweep is the "branded moment" — never used as a full surface, only as a narrow pill fill or logo treatment.

## 3. Typography Rules

### Font Family
- **Airbnb Cereal VF** (primary and only): The proprietary variable-weight sans-serif that carries the entire system. Fallbacks (in order): `Circular, -apple-system, system-ui, Roboto, Helvetica Neue, sans-serif`.

Weights observed in the extracted tokens: 500, 600, 700. No 400-regular — the system's "body" weight is 500, which gives every block of text a subtle extra density that reads as confident and deliberate.

OpenType features: `salt` (stylistic alternates) is used on the compact 11px and 14px 600-weight labels — likely for tighter numerals and special-character shaping. No ligature or fractional-numeral features observed.

### Hierarchy

| Role | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|--------|-------------|----------------|-------|
| Section Heading | 28px / 1.75rem | 700 | 1.43 | 0 | "Inspiration for future getaways" — page-level headings |
| Subsection Heading | 22px / 1.38rem | 500 | 1.18 | -0.44px | "What this place offers", "Meet the hosts" — content dividers |
| Card Title | 21px / 1.31rem | 700 | 1.43 | 0 | Review panel headings, card lead titles |
| Listing Title | 20px / 1.25rem | 600 | 1.20 | -0.18px | "Small Group Yacht Tour, Unlimited Wine & Fruits" — listing headlines on detail pages |
| Subtitle Bold | 16px / 1.00rem | 600 | 1.25 | 0 | Host name, city name |
| Body Medium | 16px / 1.00rem | 500 | 1.25 | 0 | Primary body copy on detail pages |
| Button Large | 16px / 1.00rem | 500 | 1.25 | 0 | "Reserve", "Become a host" |
| Button Default | 14px / 0.88rem | 500 | 1.29 | 0 | Standard button labels |
| Link | 14px / 0.88rem | 500 | 1.43 | 0 | Nav links, footer links |
| Caption Medium | 14px / 0.88rem | 500 | 1.29 | 0 | Metadata, subtitle lines ("Cottage rentals", "Villa rentals") |
| Caption Bold | 14px / 0.88rem | 600 | 1.43 | 0 | `salt` feature enabled — numeric stats, small-text emphasis |
| Caption Small | 13px / 0.81rem | 400 | 1.23 | 0 | Review dates, micro-metadata |
| Micro Default | 12px / 0.75rem | 400 | 1.33 | 0 | Footer disclaimers, legal micro-copy |
| Micro Bold | 12px / 0.75rem | 700 | 1.33 | 0 | "NEW" pill labels |
| Badge Uppercase | 11px / 0.69rem | 600 | 1.18 | 0 | `salt` feature — compact category/status badges |
| Superscript | 8px / 0.50rem | 700 | 1.25 | 0.32px | Uppercase — price footnotes, decimal tails |

### Principles
- **One family, many weights.** Airbnb Cereal VF handles everything from 8px legal to 28px page headings — the visual identity comes from the family itself, not from typeface mixing.
- **500 is the new 400.** The system's "regular" weight is 500, giving every paragraph a slightly more confident texture than the web default.
- **Negative tracking on display type only.** Headings 20px+ compress tracking by -0.18 to -0.44px to feel chiseled; body sizes stay at 0 tracking for readability.
- **Tight line-heights for headlines, generous for body.** Display type runs at 1.18–1.25 (tight); body and caption open up to 1.43 for long-form comfort.
- **No all-caps except at 8px.** The only uppercase transform in the system is the 8px superscript — everywhere else, sentence case with subtle weight shifts does the work.

### Note on Font Substitutes
Airbnb Cereal VF is proprietary. The closest open-source substitute is **Circular Std** (still commercial) or **Inter** (free, Google Fonts) with letter-spacing reduced by -0.01em at display sizes. For strict brand fidelity, the documented fallback chain (`Circular, -apple-system, system-ui`) renders acceptably on macOS/iOS where `system-ui` resolves to San Francisco, which has similar proportions.

## 4. Component Stylings

### Buttons

**Primary CTA** ("Reserve", "Search", "Add dates")
- Background: Rausch `#ff385c`
- Text: Canvas White `#ffffff`, Airbnb Cereal 500, 16px
- Padding: ~14px vertical, 24px horizontal
- Radius: 8px (rectangular) or 50% (circular icon variant)
- Border: none
- Active/pressed: `transform: scale(0.92)` plus a 2px `#222222` focus ring at `0 0 0 2px`

**Secondary Button** ("Become a host", outlined tertiary actions)
- Background: `#ffffff`
- Text: Ink Black `#222222`, Airbnb Cereal 500, 14–16px
- Padding: 10px 16px
- Radius: 20px (pill) or 8px (rectangular)
- Border: 1px solid Hairline Gray `#dddddd`

**Icon-Only Circular Button** (back arrow, share, favorite, carousel controls)
- Background: `#f2f2f2` (slightly off-white) or white with 1px translucent black border
- Icon: `#222222` outline stroke, 16–20px
- Size: 32–44px diameter
- Radius: 50%
- Active/pressed: `transform: scale(0.92)`; subtle 4px white ring `0 0 0 4px rgb(255,255,255)` to separate from colorful photography backgrounds

**Disabled Button**
- Background: `#f2f2f2`
- Text: Stone Gray `#c1c1c1`
- Opacity: 0.5

**Pill Tab Button** (category selector "Homes / Experiences / Services")
- Background: transparent
- Text: Ink Black `#222222`, Airbnb Cereal 500, 16px
- Padding: 8px 14px
- Active state: 2px Ink Black underline beneath the label
- Paired with a 36–48px 3D-rendered illustrated icon above the label

### Cards & Containers

**Listing Card** (homepage grid, search results)
- Background: `#ffffff`
- Radius: 14px on the image, text sits directly below on transparent background
- Image: 4:3 aspect ratio, full-bleed, rounded with the same 14px radius
- Padding: none on the outer container; 12px spacing between image and metadata rows
- Shadow: none — separation comes from whitespace and the intrinsic radius of the photograph
- Metadata pattern: City/region on line 1 (16px 600), distance/duration on line 2 (14px 500 Ash Gray), date range on line 3, price row with "per night" at the bottom

**Detail Page Booking Panel** (sticky right rail on room/experience pages)
- Background: `#ffffff`
- Radius: 14–20px
- Border: 1px solid Hairline Gray `#dddddd`
- Shadow: `rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0` — a stacked three-layer subtle elevation
- Padding: 24px
- Width: ~370px, pinned 120–140px below the viewport top
- Content: price headline → date picker → guest dropdown → primary CTA → "You won't be charged yet" footnote

**Amenity Grid Card** (on listing detail pages)
- Background: `#ffffff`
- Border: 1px solid Hairline Gray `#dddddd` at the row level (not per item)
- Padding: 16px vertical per amenity row
- Icon + label pattern: 24px outline icon on the left, 16px 500-weight label on the right

**Review Card** (individual review on detail pages)
- Background: `#ffffff`, no border
- Padding: 0 (relies on grid gaps)
- Content: 40px circular avatar + 16px 600-weight name + 14px 400 Ash Gray date on one row, then 14px 500 body paragraph below

### Inputs & Forms

**Search Bar** (primary home page)
- Background: `#ffffff`
- Border: 1px solid Hairline Gray `#dddddd` wrapping all three segments (Where / When / Who)
- Radius: 32px (full pill)
- Shadow: `rgba(0, 0, 0, 0.04) 0 2px 6px 0` — subtle floating feel
- Structure: three segments divided by thin vertical dividers, each segment has a 12px 500 label above a 14px 500 placeholder
- Submit: Rausch circular icon button at the right edge, 48px diameter

**Text Input** (generic forms)
- Background: `#ffffff`
- Border: 1px solid Hairline Gray `#dddddd`
- Radius: 8px
- Padding: 14px 16px
- Focus: border switches to Ink Black, adds `0 0 0 2px` black outer ring
- Error: border switches to `#c13515` (Error Red), helper text uses same color

**Date Picker**
- Calendar grid: 7-column layout, circular `50%` day cells 40–44px wide
- Selected range: Ink Black `#222222` background with white numerals
- Start/end anchors: larger filled circles; middle dates use Soft Cloud `#f7f7f7` tint

### Navigation

**Top Nav (Desktop)**
- Height: ~80px
- Background: `#ffffff`
- Left: Airbnb wordmark+logo lockup in Rausch (102×32px)
- Center: tri-tab category picker (Homes / Experiences / Services) with 36–48px 3D icons stacked above 16px 500 labels; active tab has a 2px Ink Black underline
- Right: "Become a host" text link, then 32px circular globe (language), then 36px hamburger avatar menu
- Border-bottom: 1px solid Hairline Gray `#dddddd`

**Top Nav (Mobile)**
- Single-row search pill occupies full width: "Start your search" placeholder with a small magnifier icon
- Below: tri-tab category picker persists (Homes / Experiences / Services) — illustrated icons shrink to ~28px
- Bottom-fixed tab bar: Explore (active state Rausch) / Wishlists / Log in — 24px icons above 12px labels

**Listing Detail Secondary Nav**
- Sticky horizontal scroll of anchor links (Photos · Amenities · Reviews · Location · Host) appears on scroll past the hero image
- Height: 56px
- Border-bottom: 1px solid Hairline Gray

### Image Treatment

- **Primary aspect ratios**: 4:3 for homepage listing grids, 16:9 for experience hero photography, 1:1 for avatars
- **Radius**: 14px on listing-grid images, 20px on detail-page hero photo frames, `50%` on avatars
- **Image grid on detail pages**: five-photo grid with a single large-left image (50% width) and four smaller photos in a 2×2 grid on the right, all sharing the 20px outer rounded container
- **Lazy loading**: heavy use of `loading="lazy"` with blurred placeholder previews
- **Carousel**: circular 32px arrow buttons overlay the image, centered vertically; dot indicators sit 12px above the bottom edge

### Signature Components

**Guest Favorite Award Lockup** (featured prominently on high-rated listing detail pages)
- Centered rating number rendered at 44–56px 700-weight
- Two hand-drawn laurel-wreath SVG illustrations flanking left and right at ~48px tall
- Below: "Guest Favorite" label at 12px 700 uppercase with `0.32px` tracking, and a short sub-label at 14px 500 Ash Gray
- Full-width block, no container border — sits directly on white canvas

**Tri-Tab Category Picker** (appears at the top of every browse surface)
- Three tabs: Homes / Experiences / Services
- Each tab: 3D-rendered illustrated icon (~48px tall) above 16px 500 label
- Experiences and Services currently carry a small navy-blue "NEW" pill (12px 700 white text on dark blue) floating top-right of the icon
- Active tab: 2px Ink Black underline beneath the label

**Inspiration City Grid** (homepage "Inspiration for future getaways")
- 6-column grid of destination links on desktop, 2-column on mobile
- Each cell: 16px 600 city name on line 1, 14px 500 Ash Gray rental-type subtitle on line 2 ("Cottage rentals", "Villa rentals")
- No images — text-only grid
- Tabbed above by category (Popular / Arts & culture / Beach / Mountains / Outdoors / Things to do / Travel tips & inspiration / Airbnb-friendly apartments) — active tab has 2px underline and weight shift

**Reserve Sticky Card** (listing detail pages)
- Stays fixed 120px below viewport top on desktop as the user scrolls past the hero
- Collapses to a full-width bottom bar on mobile with a "From $X / night" label and a Rausch "Reserve" pill
- Always shows: price headline → date display → guest selector → Rausch CTA → "You won't be charged yet" disclaimer

**Experience Host Card** (experience detail pages)
- Full-width rounded container with a 3:2 cover photograph at top
- Host avatar (circular, 56px) overlapping the bottom edge of the cover by 50%
- Below overlap: host name at 16px 700, host tenure at 14px 500 Ash Gray, small Rausch "Message host" pill button
- Used as the transition between reviews and the amenities/location block

**"Things to know" Strip** (listing detail pages)
- 3-column grid of rule/policy blocks (House rules, Safety & property, Cancellation policy)
- Each column: icon at the top, 16px 600 heading, 14px 500 Ash Gray body, "Show more" link in Ink Black underline
- Separator: 1px Hairline Gray top and bottom borders on the overall strip

## 5. Layout Principles

### Spacing System
- **Base unit**: 8px
- **Extracted scale**: 2, 3, 4, 5.5, 6, 8, 10, 11, 12, 15, 16, 18.5, 22, 24, 32px — fine-grained with a handful of off-grid values used for pixel-perfect icon alignment
- **Section padding**: ~48–64px top/bottom on desktop, 24–32px on mobile
- **Card internal padding**: 24px on booking panels and large cards, 16px on amenity rows, 12px on listing-card metadata
- **Gutter between listing cards**: 24px desktop, 16px mobile
- **Between stacked text rows**: 4–8px (very tight — reinforces the "dense information" feel of travel listings)

### Grid & Container
- **Max content width**: 1760–1920px on ultra-wide (Airbnb lets the grid breathe farther than most sites); 1280px on most detail pages
- **Homepage listing grid**: 6 columns at ≥1760px, 5 at ≥1440px, 4 at ≥1128px, 3 at ≥800px, 2 at ≥550px, 1 below
- **Detail page**: 2-column asymmetric — main content ~58%, sticky booking panel ~36% on the right, ~6% gutter
- **Footer**: 3-column Support / Hosting / Airbnb

### Whitespace Philosophy
Airbnb is densely informative but never cramped. Whitespace is used to *group* — listing cards have 24px of gutter so each photograph reads as a distinct object, but the metadata under each card uses 4–8px gaps so the price/city/date feels like a single unit. The detail-page booking panel has 24px internal padding, but rows within (date picker, guest selector, CTA) are stacked at 12px — the boundary between the card and the page does more separation work than the content within.

### Border Radius Scale
| Radius | Use |
|--------|-----|
| 4px | Inline anchor tags, tag chips |
| 8px | Text buttons, dropdowns, small utility buttons |
| 14px | Listing card photography, generic content containers, badges |
| 20px | Primary rounded buttons (pill shape), large images, booking panel |
| 32px | Search bar pill, extra-large containers |
| 50% | All circular icon buttons, all avatars, wishlist hearts — the system's signature round geometry |

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| 0 | No shadow | Listing cards, body content, text-only sections |
| 1 | `rgba(0, 0, 0, 0.08) 0 4px 12px` | Active/pressed icon buttons (e.g., back, share, favorite) — subtle lift to indicate interaction |
| 2 | `rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0` | Booking panel sticky card, modals, dropdown menus — the system's signature three-layer elevation |
| Focus Ring | `0 0 0 2px #222222` | Active-state buttons, focused search input |
| White Separator Ring | `rgb(255, 255, 255) 0 0 0 4px` | Circular buttons overlaid on photographs — a 4px white ring cleanly separates the button from colorful image backgrounds |

Shadow philosophy: Airbnb uses **stacked layered shadows** rather than a single drop. The three-layer booking-panel shadow reads as one cohesive lift but is actually three separate shadows at different opacity/blur values — creating subtle anti-aliasing at the shadow's perimeter that feels premium without being heavy.

### Decorative Depth
- **Photography as depth**: the system relies heavily on full-bleed photography to create visual depth; shadows and gradients are used sparingly so the photographs do the heavy lifting
- **Laurel wreath lockup**: the Guest Favorite award uses two SVG laurel illustrations that give the otherwise-flat rating number a ceremonial, trophy-like presence
- **3D rendered category icons**: Homes/Experiences/Services icons have their own soft internal lighting and subtle cast shadows baked into the artwork — the only place the brand allows "dimensional" illustration

## 7. Do's and Don'ts

### Do
- Reserve Rausch `#ff385c` for primary actions and the active-tab indicator — never dilute it with decorative uses.
- Let photography breathe — 4:3 crops with 14–20px rounded corners, no overlaid text, no gradient scrims.
- Use Ink Black `#222222` for every text layer below Rausch — this is the system's near-black, never true `#000000`.
- Pair the tri-tab category picker's 3D illustrated icons with flat typography — don't mix illustration styles within a single surface.
- Stack three low-opacity shadows (~2%, 4%, 10%) to create the signature booking-panel elevation.
- Use Hairline Gray `#dddddd` 1px borders for every card-to-card and row-to-row divider.
- Treat the booking panel as sticky on desktop, collapsing to a bottom-anchored reserve bar on mobile.
- Use 4–8px spacing within metadata groups and 24px between cards — information density is intentional.

### Don't
- Don't introduce secondary accent colors outside the Rausch / Plus Magenta / Luxe Purple product-tier palette.
- Don't place text inside photographs — captions always sit below the image, never overlaid.
- Don't use all-caps labels except the single 8px superscript role.
- Don't round icon buttons to anything other than 50% — circular is the system's signature geometry.
- Don't add drop shadows to listing cards — they sit on white canvas with no elevation.
- Don't use gradient backgrounds — the only gradient in the system is a narrow Rausch → magenta sweep on the wordmark.
- Don't use the 400-regular font weight — Airbnb Cereal's body weight is 500.
- Don't override Airbnb Cereal VF with a different display face — the system is intentionally single-family.

## 8. Responsive Behavior

### Breakpoints

Airbnb declares ~60 breakpoints (design-time artifact from their component library), but the meaningful layout shifts happen at a much smaller set:

| Name | Width | Key Changes |
|------|-------|-------------|
| Ultra-wide | ≥1760px | 6-column listing grid, 1760–1920px max content width |
| Desktop XL | 1440–1759px | 5-column grid, full nav visible, sticky right-rail booking panel |
| Desktop | 1128–1439px | 4-column grid, sticky booking panel persists |
| Laptop | 1024–1127px | 3–4 column grid, category nav remains horizontal |
| Tablet | 800–1023px | 3-column grid, global search may collapse to a single-row pill |
| Small tablet | 550–799px | 2-column grid, booking panel drops to full-width inline block |
| Mobile | 375–549px | 1-column stacked layout, bottom-fixed tab bar appears (Explore / Wishlists / Log in) |
| Small mobile | <375px | Edge padding tightens to 16px; category-picker icons shrink to ~28px |

### Touch Targets
All interactive elements meet or exceed 44×44px. The circular icon button family is specifically sized 32–44px with 8–12px extended hit-area padding. The Rausch primary Reserve button is ~48px tall. The tri-tab category picker's hit area is the full label-plus-icon rectangle (typically ~64×80px per tab).

### Collapsing Strategy
- **Nav**: Top nav keeps Airbnb wordmark + tri-tab picker on tablet and above; on mobile the picker slides just below the search pill, and the globe/avatar controls move to a bottom-anchored tab bar.
- **Search bar**: Three-segment pill (Where / When / Who) with a Rausch circular submit button on desktop; collapses to a single-row "Start your search" pill on mobile, tapping which opens a full-screen search sheet.
- **Booking panel**: Sticky right-rail on ≥1128px; inline within the main content column between 800–1127px; bottom-fixed "Reserve" pill on <800px.
- **Listing grid**: Reflows 6 → 5 → 4 → 3 → 2 → 1 columns across breakpoints.
- **Detail-page image grid**: Five-image layout (1 large + 4 small) on desktop; becomes a swipeable full-bleed carousel on mobile with page-dot indicators.
- **Footer**: 3-column layout collapses to stacked single-column at <800px.

### Image Behavior
- `loading="lazy"` universal, with blurred `im_w=` URL-parameterized preview thumbs served first
- Responsive images use Airbnb's `muscache.com` CDN with `im_w` query parameter for width-based delivery (`im_w=240`, `im_w=720`, `im_w=1200`, `im_w=2400`)
- No art-direction crops — the same image is scaled up/down across breakpoints
- Carousels auto-advance photo height to maintain a consistent 4:3 ratio regardless of source aspect

## 9. Agent Prompt Guide

### Quick Color Reference
- Primary CTA: "Rausch (#ff385c)"
- Page background: "Canvas White (#ffffff)"
- Subsurface: "Soft Cloud (#f7f7f7)"
- Heading / body text: "Ink Black (#222222)"
- Secondary text: "Ash Gray (#6a6a6a)"
- Border / divider: "Hairline Gray (#dddddd)"
- Error: "Error Red (#c13515)"
- Info link: "Info Blue (#428bff)"
- Luxe tier accent: "Luxe Purple (#460479)"
- Plus tier accent: "Plus Magenta (#92174d)"

### Example Component Prompts
- "Create a primary Reserve button: Rausch (#ff385c) background, white Airbnb Cereal 500-weight label at 16px, 14px × 24px padding, 8px border-radius, no shadow. On active/pressed add `transform: scale(0.92)` with a 2px Ink Black focus ring (`0 0 0 2px #222222`)."
- "Build a listing card with a 4:3 full-bleed photograph at 14px border-radius, no container shadow; below the image stack three text rows with 4px gaps: city name at 16px 600 Ink Black, rental type at 14px 500 Ash Gray (#6a6a6a), and price range in 16px 500 Ink Black with a 14px `per night` suffix."
- "Design a sticky booking panel: white background, 14px border-radius, 1px Hairline Gray (#dddddd) border, 3-layer elevation shadow (`rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px 0, rgba(0,0,0,0.1) 0 4px 8px 0`), 24px padding, 370px width, pinned 120px below viewport top on desktop. Contents: price headline, date picker, guest dropdown, Rausch primary CTA, and a 12px Ash Gray `You won't be charged yet` disclaimer."
- "Create a tri-tab category picker: three equal-width tabs labeled Homes, Experiences, Services; each tab has a ~48px 3D-rendered illustrated icon (house, balloon, bell) above a 16px 500 Ink Black label; active tab gets a 2px Ink Black underline; add a small 12px 700 white `NEW` pill on a dark navy background to the top-right of the Experiences and Services icons."
- "Render the Guest Favorite award lockup: a centered rating number at 52px 700-weight Ink Black, flanked left and right by hand-drawn SVG laurel wreaths at ~48px tall; below, a 12px 700 uppercase `GUEST FAVORITE` label with 0.32px tracking; sub-label at 14px 500 Ash Gray; full-width block sitting directly on white canvas with no container border."

### Iteration Guide
When refining existing screens generated with this design system:
1. Focus on ONE component at a time.
2. Reference specific color names and hex codes from this document (e.g., "Ink Black #222222", not "dark gray").
3. Use natural language descriptions alongside measurements ("subtle three-layer elevation" rather than a long shadow string).
4. Describe the desired "feel" ("magazine-like, photography-first" vs "dense utility").
5. Always default to Airbnb Cereal VF 500-weight for body and 600–700 for emphasis — never 400.
6. Keep Rausch pink scarce — if more than one Rausch-colored element appears per viewport, consider whether one should be neutralized.

### Known Gaps
- **Homepage listing grid cards**: the main property-card grid (the primary visual surface of airbnb.com) was not fully captured in the extracted homepage screenshots — content loaded only partially. Listing Card specs above are inferred from the Inspiration grid structure and Airbnb's broader conventions; confirm exact aspect ratios and metadata hierarchy against the live site before production use.
- **Experiences category icons**: the 3D illustrated icons for Homes / Experiences / Services are served as raster assets; their exact source-file specifications (SVG vs PNG, rendered pixel dimensions) are not documented here.
- **Animation and transition timings**: not captured — static extraction scope.
- **Dark mode**: Airbnb does not ship a native dark mode in the extracted product surfaces; this document describes the single light-mode theme only.
