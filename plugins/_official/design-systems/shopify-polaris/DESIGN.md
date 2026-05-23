# Design System Inspired by Shopify Polaris

> Category: E-Commerce & Retail
> Shopify admin system. Light-first functional UI, Inter font, neutral grays, semantic color roles.

## 1. Visual Theme & Atmosphere

Polaris is the design system behind Shopify's merchant admin — a tool used daily by millions of commerce operators to manage products, orders, customers, and finances. Every decision in Polaris serves clarity and efficiency over decoration. The aesthetic is deliberately quiet: a light gray page canvas (`#F1F1F1`) with white card surfaces, neutral dark text (`#303030`), and color applied only when it carries semantic meaning (success, warning, critical, info).

The interface is built around a persistent shell: a collapsible left sidebar for navigation on a light gray surface (`#EBEBEB`), a top bar housing search and account controls, and a main content area where Pages compose Cards, Tables, and Forms. This shell-and-page architecture means every screen shares the same spatial DNA — merchants never feel lost.

Typography is Inter at weights 450 (regular), 550 (medium), and 650 (semibold), with 700 reserved for the largest display headings. Font sizes are compact — body text lives at 13px, headings rarely exceed 24px — because Polaris is a workspace, not a stage. The tight type scale keeps data-dense screens readable without scrolling.

Depth is functional, not decorative. Buttons get bevel shadows to signal clickability. Cards rest on a single subtle shadow (`0px 1px 0px 0px rgba(26,26,26,0.07)`). Modals and popovers step up to stronger shadows. Nothing floats for aesthetics — elevation always signals interactivity or layering hierarchy.

**Key Characteristics:**
- Light-first with gray page canvas (`#F1F1F1`) and white card surfaces
- Compact, data-dense typography (Inter, 13-14px body, tight line heights)
- Color used semantically only — 13 color roles, each with surface/fill/text/border/icon variants
- Subtle bevel shadows on buttons for tactile affordance
- Shell architecture: sidebar navigation + top bar + page content
- Rounded corners (8-12px on cards, full pill on badges)
- Neutral gray palette dominates; brand color is near-black (`#303030`)

## 2. Color Palette & Roles

### Background & Surface

- **Page Background** (`#F1F1F1`): The admin canvas — all content sits on this
- **Surface** (`#FFFFFF`): Cards, modals, popovers — the primary content container
- **Surface Hover** (`#F7F7F7`): Interactive surface on hover
- **Surface Active** (`#F3F3F3`): Interactive surface pressed/active
- **Surface Selected** (`#F1F1F1`): Selected row or item surface
- **Surface Secondary** (`#F7F7F7`): De-emphasized surface (secondary cards)
- **Surface Tertiary** (`#F3F3F3`): Third-level surface hierarchy
- **Surface Inverse** (`#303030`): Dark surface for contrast contexts (toast, top bar)
- **Backdrop** (`rgba(0, 0, 0, 0.71)`): Modal/sheet overlay scrim

### Brand & Fill

- **Brand Fill** (`#303030`): Primary button background — near-black, not pure black
- **Brand Fill Hover** (`#1A1A1A`): Primary button hover
- **Brand Fill Disabled** (`rgba(0, 0, 0, 0.17)`): Disabled primary button
- **Fill** (`#FFFFFF`): Secondary button / default fill
- **Fill Secondary** (`#F1F1F1`): De-emphasized fill
- **Fill Tertiary** (`#E3E3E3`): Third-level fill

### Semantic Fill

- **Success Fill** (`#047B5D`): Success buttons, badges — deep teal-green
- **Critical Fill** (`#C70A24`): Destructive buttons, error badges — clear red
- **Warning Fill** (`#FFB800`): Warning badges, banners — warm amber
- **Caution Fill** (`#FFE600`): Caution indicators — bright yellow
- **Info Fill** (`#91D0FF`): Info badges — soft blue
- **Emphasis Fill** (`#005BD3`): Emphasis/interactive fill — Shopify blue
- **Magic Fill** (`#8051FF`): AI/magic features — purple

### Semantic Surface (Banner/Card Backgrounds)

- **Surface Info** (`#EAF4FF`): Info banner background
- **Surface Success** (`#CDFED4`): Success banner background
- **Surface Caution** (`#FFF8DB`): Caution banner background
- **Surface Warning** (`#FFF1E3`): Warning banner background
- **Surface Critical** (`#FEE8EB`): Critical/error banner background
- **Surface Emphasis** (`#F0F2FF`): Emphasis surface
- **Surface Magic** (`#F8F7FF`): AI feature surface

### Text

- **Text Default** (`#303030`): Primary body text
- **Text Secondary** (`#616161`): De-emphasized text, descriptions, metadata
- **Text Disabled** (`#B5B5B5`): Disabled element text
- **Text Link** (`#005BD3`): Hyperlinks — Shopify blue
- **Text Link Hover** (`#004299`): Link hover state
- **Text Brand** (`#4A4A4A`): Brand-associated text
- **Text on Brand Fill** (`#FFFFFF`): White text on primary buttons
- **Text Inverse** (`#E3E3E3`): Text on dark surfaces (toast)

### Semantic Text

- **Text Info** (`#003A5A`): Info context text
- **Text Success** (`#014B40`): Success context text
- **Text Caution** (`#4F4700`): Caution context text
- **Text Warning** (`#5E4200`): Warning context text
- **Text Critical** (`#8E0B21`): Error/critical text
- **Text Emphasis** (`#005BD3`): Emphasized text (matches link)
- **Text Magic** (`#5700D1`): AI feature text

### Border

- **Border Default** (`#E3E3E3`): Standard borders — cards, dividers
- **Border Hover** (`#CCCCCC`): Border on hover
- **Border Disabled** (`#EBEBEB`): Disabled borders
- **Border Secondary** (`#EBEBEB`): Lighter secondary borders
- **Border Focus** (`#005BD3`): Focus ring border — Shopify blue
- **Border Inverse** (`#616161`): Border on dark surfaces

### Semantic Border

- **Border Info** (`#A8D8FF`): Info banner/card border
- **Border Success** (`#92FCAC`): Success border
- **Border Caution** (`#FFEB78`): Caution border
- **Border Warning** (`#FFC879`): Warning border
- **Border Critical** (`#FEC1C7`): Critical/error border
- **Border Emphasis** (`#005BD3`): Emphasis border
- **Border Magic** (`#E4DEFF`): Magic feature border

### Icon

- **Icon Default** (`#4A4A4A`): Standard icon fill
- **Icon Hover** (`#303030`): Icon on hover
- **Icon Secondary** (`#8A8A8A`): De-emphasized icons
- **Icon Disabled** (`#CCCCCC`): Disabled icons
- **Icon Info** (`#0094D5`): Info icons
- **Icon Success** (`#047B5D`): Success icons
- **Icon Caution** (`#998A00`): Caution icons
- **Icon Warning** (`#B28400`): Warning icons
- **Icon Critical** (`#E22C38`): Critical/error icons
- **Icon Emphasis** (`#005BD3`): Emphasis icons
- **Icon Magic** (`#8051FF`): Magic/AI icons
- **Icon Inverse** (`#E3E3E3`): Icons on dark surfaces

### Input

- **Input Surface** (`#FDFDFD`): Text field background
- **Input Border** (`#8A8A8A`): Text field border (resting)
- **Input Border Hover** (`#616161`): Text field border hover
- **Input Border Active** (`#1A1A1A`): Text field border when focused/active

### Navigation

- **Nav Background** (`#EBEBEB`): Sidebar background
- **Nav Surface Selected** (`#FAFAFA`): Active nav item surface
- **Nav Surface Hover** (`#F1F1F1`): Nav item hover

## 3. Typography Rules

### Font Family

**Primary:** Inter
- Fallbacks: -apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif
- Used for all text — headings, body, buttons, labels, everything

**Monospace:** ui-monospace
- Fallbacks: SFMono-Regular, 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace
- Used for code snippets, technical data

### Hierarchy

| Role | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|--------|-------------|----------------|-------|
| Heading 3XL | 36px | 700 | 48px | -0.54px | Page titles on wide layouts |
| Heading 2XL | 30px | 700 | 40px | -0.3px | Major section headers |
| Heading XL | 24px | 700 | 32px | -0.2px | Section headers |
| Heading LG | 20px | 650 | 24px | -0.2px | Card titles, subsections |
| Heading MD | 14px | 650 | 20px | 0px | Card headings (most common) |
| Heading SM | 13px | 650 | 20px | 0px | Minor headings, list headers |
| Heading XS | 12px | 650 | 16px | 0px | Smallest heading, captions |
| Body LG | 14px | 450 | 20px | 0px | Lead body, descriptions |
| Body MD | 13px | 450 | 20px | 0px | Standard body text (default) |
| Body SM | 12px | 450 | 16px | 0px | Secondary info, help text |
| Body XS | 11px | 450 | 12px | 0px | Micro labels, timestamps |

### Principles

- **Compact by design:** Body text at 13px with 20px line height creates a dense but readable texture — merchants scan data tables, order lists, and product details all day, so every pixel of vertical space matters.
- **Precise variable weights:** 450 (regular) is slightly heavier than the typical 400, giving body text just enough presence on the light gray canvas. 550 (medium) differentiates secondary emphasis without shouting, 650 (semibold) marks headings, and 700 (bold) is reserved for the largest display sizes.
- **Tight tracking at scale only:** Letter spacing tightens only on large headings (-0.54px at 36px) to maintain optical density. At body sizes, letter spacing stays at 0 — Inter's default metrics already optimize for screen reading at small sizes.
- **Single font family:** Inter handles every role from 11px micro labels to 36px page titles, creating cohesion through weight and size variation rather than font switching.

## 4. Component Stylings

### Buttons

**Primary (Brand Fill)**
- Background: `#303030` (near-black)
- Text: `#FFFFFF` (white), weight 650
- Border radius: 8px
- Padding: 6px 12px (medium), 4px 8px (slim), 2px 6px (micro), 8px 16px (large)
- Shadow: `0px -1px 0px 1px rgba(0,0,0,0.8) inset, 0px 0px 0px 1px rgba(48,48,48,1) inset, 0px 0.5px 0px 1.5px rgba(255,255,255,0.25) inset`
- Hover: bg `#1A1A1A`, edge highlights appear, bottom darkens
- Active: inset shadow `0px 3px 0px 0px rgb(0,0,0) inset`
- Focus: 2px `#005BD3` outline ring offset

**Secondary (Default)**
- Background: `#FFFFFF` (white)
- Text: `#303030` (default text)
- Border radius: 8px
- Shadow: `0px -1px 0px 0px #B5B5B5 inset, 0px 0px 0px 1px rgba(0,0,0,0.1) inset, 0px 0.5px 0px 1.5px #FFF inset` — bevel effect
- Hover: shadow shifts to flat edges, subtle gray tint
- Active: `0px 2px 1px 0px rgba(26,26,26,0.2) inset` — pressed feel

**Tertiary**
- Background: transparent
- Text: `#303030`
- No shadow, no border
- Hover: background `#F7F7F7`
- Active: background `#F3F3F3`

**Plain (Text Button)**
- Background: transparent
- Text: `#005BD3` (link blue) or `#303030` (monochrome)
- No shadow, no border, no padding
- Hover: underline, darker text

**Destructive (Critical)**
- Background: `#C70A24` (critical fill)
- Text: `#FFFFFF`
- Shadow: `0px -1px 0px 1px rgba(142,31,11,0.8) inset, 0px 0px 0px 1px rgba(181,38,11,0.8) inset, 0px 0.5px 0px 1.5px rgba(255,255,255,0.349) inset`
- Hover: darkened critical fill

**Success**
- Background: `#047B5D` (success fill)
- Text: `#FFFFFF`
- Shadow: `0px -1px 0px 1px rgba(12,81,50,0.8) inset, 0px 0px 0px 1px rgba(19,111,69,0.8) inset, 0px 0.5px 0px 1.5px rgba(255,255,255,0.251) inset`

### Cards & Containers

- Background: `#FFFFFF` (surface)
- Padding: 16px
- Internal gap: 16px between card sections
- Border radius: 12px
- Shadow: `0px 1px 0px 0px rgba(26,26,26, 0.07)` — barely visible bottom edge
- No visible border in default state
- Sections within cards separated by 1px `#E3E3E3` dividers

### Banners

- Border radius: 12px
- Padding: 12px 16px
- Left icon matching semantic role
- Dismiss button (X) top-right

| Tone | Background | Border | Icon Color | Text Color |
|------|-----------|--------|------------|------------|
| Info | `#EAF4FF` | `#A8D8FF` | `#0094D5` | `#003A5A` |
| Success | `#CDFED4` | `#92FCAC` | `#047B5D` | `#014B40` |
| Warning | `#FFF1E3` | `#FFC879` | `#B28400` | `#5E4200` |
| Critical | `#FEE8EB` | `#FEC1C7` | `#E22C38` | `#8E0B21` |

### Badges

- Border radius: 9999px (full pill)
- Padding: 2px 8px
- Font size: 12px, weight 450

| Tone | Background | Text |
|------|-----------|------|
| Default | `#E3E3E3` | `#303030` |
| Info | `#91D0FF` | `#003A5A` |
| Success | `#047B5D` | `#FFFFFF` |
| Attention | `#FFE600` | `#4F4700` |
| Warning | `#FFB800` | `#5E4200` |
| Critical | `#C70A24` | `#FFFFFF` |

### Inputs & Forms

- Background: `#FDFDFD`
- Border: 1px solid `#8A8A8A`
- Border radius: 8px
- Padding: 8px 12px
- Text: `#303030`, 13px, weight 450
- Placeholder: `#8A8A8A`
- Hover border: `#616161`
- Focus: border `#1A1A1A` + outer focus ring 2px `#005BD3`
- Error state: border `#8E0B21`, error text below in `#8E0B21`
- Label above: 13px, weight 450, `#303030`
- Help text below: 12px, weight 450, `#616161`

### Select / Dropdown

- Same styling as text fields
- Right-side chevron icon in `#4A4A4A`
- Dropdown popover: white surface, shadow-400, 8px radius
- Options: 13px, 8px 12px padding, hover `#F7F7F7`

### IndexTable (Data Tables)

- Header: 12px, weight 650, `#616161` — semibold, no uppercase
- Cell padding: 6px
- Row border-bottom: 1px `#F1F1F1`
- Row hover: `#F7F7F7`
- Selected row: `#F1F1F1` with left blue indicator
- Sortable column header: clickable with direction arrow
- Sticky first column option
- Condensed mode: tighter padding
- Bulk actions bar appears on selection: dark inverse bar (`#303030`) at bottom

### Navigation (Sidebar)

- Background: `#EBEBEB`
- Width: 240px (desktop), collapsible on mobile
- Section labels: 12px, weight 650, `#616161`
- Nav items: 13px, weight 450, `#303030`
- Item padding: 6px 8px, border radius 8px
- Selected item: background `#FAFAFA`, weight 650
- Hover: background `#F1F1F1`
- Icons: 20px, `#4A4A4A`, left of label
- Badge counts: right-aligned, pill shape
- Nested sub-items: indented, no icon

### Top Bar

- Background: `#303030` (dark, inverse of page)
- Height: 56px
- Search: center, input with icon, rounded, darker surface
- Logo: left, white on dark
- User avatar: right, circular
- Secondary actions: right (notifications bell, etc.)

### Page

- Max width: ~1000px centered (default), or full width
- Title: Heading XL (24px, 700) or Heading 2XL on wide screens
- Subtitle: Body MD (13px, 450, `#616161`)
- Primary action button: top-right, primary button style
- Breadcrumbs: above title, plain button style
- Content below in Layout component

### Modal

- Overlay: `rgba(0, 0, 0, 0.71)` backdrop
- Surface: white, 12px border radius, shadow-600
- Max width: 620px (default), 500px (small), full width on mobile
- Header: 16px title, weight 650, close button right
- Footer: right-aligned action buttons
- Scrollable body if content overflows

### Toast

- Background: `#303030` (inverse surface)
- Text: `#E3E3E3` (inverse text)
- Border radius: 8px
- Position: bottom-center of viewport
- Duration: 5s default, persistent for errors
- Optional action link in white

## 5. Layout Principles

### Spacing System

Base unit: 4px

| Token | Value | Use |
|-------|-------|-----|
| space-025 | 1px | Hairline borders, sub-pixel adjustments |
| space-050 | 2px | Badge padding, tight inline gaps |
| space-100 | 4px | Base unit, icon gaps, micro spacing |
| space-150 | 6px | Table cell padding, tight component gaps |
| space-200 | 8px | Button padding, button group gap, form gaps |
| space-300 | 12px | Card internal padding (compact), input padding |
| space-400 | 16px | Card padding & gap (standard), section spacing |
| space-500 | 20px | Medium section spacing |
| space-600 | 24px | Section gaps within pages |
| space-800 | 32px | Major section breaks |
| space-1000 | 40px | Page-level section padding |
| space-1200 | 48px | Large layout spacing |
| space-1600 | 64px | Hero/major section spacing |

### Grid & Container

- Page max-width: ~1000px (default), full-width mode available, narrow (~800px) for settings
- Layout component provides 2-column (2/3 + 1/3) and equal-column (halves, thirds) arrangements
- Annotated layout: left column for section description, right for form content (settings pattern)
- Stack component for vertical and horizontal flex layouts with gap control
- Inline component for horizontal arrangements that wrap

### Whitespace Philosophy

Polaris treats whitespace as information architecture. The gray page canvas (`#F1F1F1`) isn't empty space — it's the visual grouping mechanism. Cards on gray separate concerns. Space within cards is tight (16px padding, 16px gaps) to keep related information dense. Space between cards is moderate (16-24px) to show they're siblings. Space between page sections is larger (32-40px) to signal topic changes. The overall feel is efficient and scannable — a workspace, not a gallery.

### Border Radius Scale

| Value | Context |
|-------|---------|
| 0px | No rounding — dividers, table borders |
| 2px | Micro elements, color swatches |
| 4px | Small tags, code blocks |
| 6px | Small buttons (micro/slim) |
| 8px | Standard inputs, buttons, popovers |
| 12px | Cards, banners, modals |
| 16px | Large containers |
| 20px | Featured containers |
| 9999px | Badges (full pill), avatar, toggles |

## 6. Depth & Elevation

| Level | Shadow | Use |
|-------|--------|-----|
| 0 (Flat) | none | Inline elements, nav items |
| 100 (Resting) | `0px 1px 0px 0px rgba(26,26,26, 0.07)` | Cards at rest |
| 200 (Raised) | `0px 3px 1px -1px rgba(26,26,26, 0.07)` | Hovered cards, popovers |
| 300 (Overlay) | `0px 4px 6px -2px rgba(26,26,26, 0.20)` | Dropdowns, select menus |
| 400 (Modal) | `0px 8px 16px -4px rgba(26,26,26, 0.22)` | Modals, sheets |
| 500 (Toast) | `0px 12px 20px -8px rgba(26,26,26, 0.24)` | Toast notifications |
| 600 (Top) | `0px 20px 20px -8px rgba(26,26,26, 0.28)` | Critical overlays |

Polaris buttons use a multi-layer inset shadow system that simulates physical depth — a subtle 3D bevel that makes buttons feel like pressable surfaces. Secondary buttons get a top inset highlight (white), bottom inset shadow (gray), and a ring border creating a raised, lit-from-above effect. Primary buttons use an inner glow with a dark ring and bottom inset. The button "presses in" on active state with a strong inset shadow. This bevel system is unique to Polaris and should be preserved — flat shadows lose the tactile quality.

### Focus Ring

- All interactive elements: `0px 0px 0px 2px #005BD3` (blue outline)
- Offset: 2px from element edge
- Appears on keyboard focus (`:focus-visible`), not on click

## 7. Do's and Don'ts

### Do

- Use the light gray page canvas (`#F1F1F1`) as the base — white is for card surfaces only
- Keep body text at 13px / weight 450 — this is the Polaris reading size
- Use semantic color roles (info, success, warning, critical) — never assign color arbitrarily
- Apply the bevel shadow system to buttons — flat shadows lose Polaris's tactile quality
- Use 12px border radius on cards and 8px on buttons and inputs
- Keep page layouts constrained to ~1000px max-width unless data tables need more room
- Use the Annotated Layout pattern for settings pages (description left, form right)
- Place primary actions top-right of the Page header, secondary actions inline
- Use `#303030` for primary buttons — it's near-black, not pure black, and that matters
- Maintain compact spacing: 16px card padding, 6px table cell padding, 8px button padding

### Don't

- Don't use color for decoration — every color in Polaris carries semantic meaning
- Don't make body text larger than 14px — Polaris is dense by design, large text wastes space
- Don't use pure black (`#000000`) for text — default text is `#303030` (softer, less harsh)
- Don't use single-layer flat shadows on buttons — the bevel system is core to Polaris's feel
- Don't skip the gray page canvas — putting cards directly on white eliminates the visual grouping
- Don't use rounded pill shapes on buttons — pills are for badges only; buttons use 8px radius
- Don't add decorative borders to cards — the subtle bottom shadow (shadow-100) defines them
- Don't use weights below 450 — Inter at 400 looks too thin for Polaris; 450 is the baseline
- Don't layer surfaces — Polaris surfaces sit side-by-side on the canvas, not stacked
- Don't use opacity for disabled states — Polaris has specific disabled tokens (`#B5B5B5` text, `rgba(0,0,0,0.05)` surface)

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|------|-------|-------------|
| XS | 0px | Mobile — single column, full-width cards, bottom sheet modals |
| SM | 490px | Large phone / small tablet — cards start getting padding |
| MD | 768px | Tablet — sidebar can appear, two-column layouts begin |
| LG | 1040px | Desktop — full sidebar, constrained page width, all columns |
| XL | 1440px | Large desktop — max-width container, wider data tables |

### Touch Targets

- Minimum touch target: 44x44px
- Buttons (medium): 36px height minimum
- Nav items: 36px height with full-width hit area
- Table rows: full-width tappable
- Checkbox/Radio: 20px visual, 44px touch area

### Collapsing Strategy

- **Navigation sidebar**: visible at LG+, collapses to hamburger overlay below LG
- **Page layout**: 2-column Layout → stacked single column below MD
- **Annotated layout**: side-by-side → stacked (description above content) below MD
- **IndexTable**: horizontal scroll on narrow screens, sticky first column
- **Modal**: centered overlay on desktop → full-screen bottom sheet on mobile
- **Top bar**: remains persistent at all sizes, search may collapse to icon
- **Cards**: full-width at all breakpoints, padding reduces on mobile
- **Button groups**: horizontal → stack vertically below SM

### Motion

- Duration scale: 50ms (micro) to 500ms (major transitions)
- Default ease: `cubic-bezier(0.25, 0.1, 0.25, 1)`
- Enter/appear: `cubic-bezier(0.19, 0.91, 0.38, 1)` — fast out (decelerate)
- Exit: `cubic-bezier(0.42, 0, 1, 1)` — fast in (accelerate)
- Hover/active transitions: 100-150ms
- Modal/sheet appear: 200-300ms with ease-out
- Toast: fade-in 200ms, auto-dismiss after 5000ms
- Loading bar: continuous pulse animation

## 9. Agent Prompt Guide

### Quick Color Reference

- Page background: `#F1F1F1`
- Card surface: `#FFFFFF`
- Primary button bg: `#303030`
- Primary button text: `#FFFFFF`
- Body text: `#303030`
- Secondary text: `#616161`
- Link text: `#005BD3`
- Border: `#E3E3E3`
- Input border: `#8A8A8A`
- Focus ring: `#005BD3`
- Success: fill `#047B5D`, surface `#CDFED4`, text `#014B40`
- Critical: fill `#C70A24`, surface `#FEE8EB`, text `#8E0B21`
- Warning: fill `#FFB800`, surface `#FFF1E3`, text `#5E4200`
- Info: fill `#91D0FF`, surface `#EAF4FF`, text `#003A5A`
- Nav sidebar bg: `#EBEBEB`
- Top bar bg: `#303030`

### Example Component Prompts

- "Create a Polaris admin page with `#F1F1F1` background, a Page header (24px/700 title, 13px/450 subtitle in `#616161`) with a primary action button (`#303030` bg, white text, 8px radius, bevel shadow), and two Cards (white, 12px radius, 16px padding, shadow-100) containing form fields"
- "Build an IndexTable on a white Card with sticky header row (12px/650 `#616161` column labels), data rows with 6px cell padding, 1px `#F1F1F1` row borders, hover `#F7F7F7`, and bulk action bar (`#303030` inverse surface) on selection"
- "Design a settings page using Annotated Layout: left column 1/3 width with 14px/650 section title and 13px/450 `#616161` description, right column 2/3 with a white Card containing stacked form fields (8px radius inputs, `#8A8A8A` borders, `#005BD3` focus ring)"
- "Create a Banner system: info banner on `#EAF4FF` with `#A8D8FF` border and `#0094D5` icon; critical banner on `#FEE8EB` with `#FEC1C7` border and `#E22C38` icon; 12px radius, 12px 16px padding"
- "Build a navigation sidebar on `#EBEBEB` with 240px width, section labels (12px/650 `#616161`), nav items (13px/450 `#303030`, 6px 8px padding, 8px radius), selected state (`#FAFAFA` bg, weight 650), hover (`#F1F1F1`), and 20px icons left-aligned"

### Polaris Admin Page Template

A standard Polaris admin page follows this structure:
1. **Frame** — full viewport shell
2. **Top bar** — `#303030` bar, 56px, logo + search + avatar
3. **Navigation** — `#EBEBEB` sidebar, 240px, nav items with icons
4. **Page** — `#F1F1F1` canvas, constrained width, title + subtitle + primary action
5. **Layout** — 2-column or single-column arrangement
6. **Cards** — white surfaces with 12px radius, shadow-100, 16px padding
7. **Content** — forms, tables, lists, banners inside cards

### Web Components (`<s-*>`)

Polaris ships as native web components with the `s-` prefix, loaded via CDN:

```html
<script src="https://cdn.shopify.com/shopifycloud/polaris.js"></script>
```

TypeScript types: `@shopify/polaris-types`

#### Component Reference

| Tag | Category | Purpose |
|-----|----------|---------|
| `<s-page>` | Layout | Page shell — `heading`, `inlineSize` (small/base/large) |
| `<s-section>` | Layout | Content section — `heading`, `padding` (base/none) |
| `<s-box>` | Layout | Generic container — `background`, `padding`, `border`, `borderRadius`, sizing |
| `<s-stack>` | Layout | Flex layout — `direction` (block/inline), `gap`, `justifyContent`, `alignItems` |
| `<s-grid>` | Layout | CSS grid — `gridTemplateColumns`, `gridTemplateRows`, `gap` |
| `<s-grid-item>` | Layout | Grid cell — `gridColumn` (span N), `gridRow` (span N) |
| `<s-divider>` | Layout | Separator — `direction` (inline/block), `color` (base/strong) |
| `<s-query-container>` | Layout | Container query wrapper for responsive values |
| `<s-button>` | Action | Button — `variant` (primary/secondary/tertiary), `tone` (critical/neutral), `icon` |
| `<s-link>` | Action | Hyperlink — `href`, `target`, `tone` |
| `<s-menu>` | Action | Menu trigger — action list container |
| `<s-button-group>` | Action | Button group wrapper |
| `<s-clickable>` | Action | Generic clickable surface |
| `<s-clickable-chip>` | Action | Clickable chip/tag |
| `<s-text>` | Typography | Inline text — `type` (strong/generic/address), `tone`, `color` (base/subdued) |
| `<s-heading>` | Typography | Section heading — `accessibilityRole`, `lineClamp` |
| `<s-paragraph>` | Typography | Block text — `tone`, `color`, `lineClamp`, `fontVariantNumeric` |
| `<s-chip>` | Typography | Status chip |
| `<s-tooltip>` | Typography | Tooltip overlay |
| `<s-text-field>` | Form | Text input — `label`, `value`, `icon`, `prefix`, `suffix`, `error` |
| `<s-select>` | Form | Dropdown — contains `<s-option>` and `<s-option-group>` |
| `<s-checkbox>` | Form | Checkbox — `label`, `checked`, `indeterminate`, `error` |
| `<s-switch>` | Form | Toggle switch |
| `<s-choice-list>` | Form | Radio/checkbox group |
| `<s-text-area>` | Form | Multi-line text input |
| `<s-number-field>` | Form | Numeric input |
| `<s-email-field>` | Form | Email input |
| `<s-url-field>` | Form | URL input |
| `<s-password-field>` | Form | Password input |
| `<s-search-field>` | Form | Search input |
| `<s-date-field>` | Form | Date input |
| `<s-date-picker>` | Form | Calendar date picker |
| `<s-money-field>` | Form | Currency input |
| `<s-color-field>` | Form | Color input |
| `<s-color-picker>` | Form | Color picker |
| `<s-drop-zone>` | Form | File upload area |
| `<s-badge>` | Feedback | Status badge — `tone`, `icon`, `size` (base/large) |
| `<s-banner>` | Feedback | Banner — `heading`, `tone`, `dismissible` |
| `<s-spinner>` | Feedback | Loading spinner |
| `<s-modal>` | Overlay | Modal dialog — `heading`, `size`, slots for actions |
| `<s-popover>` | Overlay | Popover — triggered via `commandFor` on buttons |
| `<s-table>` | Data | Data table — `variant` (auto/list/table), `paginate`, `loading` |
| `<s-table-header-row>` | Data | Table header container |
| `<s-table-header>` | Data | Column header — `listSlot`, `format` |
| `<s-table-body>` | Data | Table body container |
| `<s-table-row>` | Data | Data row — `clickDelegate` |
| `<s-table-cell>` | Data | Data cell |
| `<s-icon>` | Media | Icon — `type` (500+ names), `tone`, `color`, `size` |
| `<s-avatar>` | Media | User avatar |
| `<s-image>` | Media | Image element |
| `<s-thumbnail>` | Media | Thumbnail image |

#### Semantic Size Keywords

Components use keyword-based sizing instead of pixel values:

| Keyword | Approximate Value | Use |
|---------|-------------------|-----|
| `small-500` | ~1px | Hairline |
| `small-400` | ~2px | Tight |
| `small-300` | ~4px | Micro |
| `small-200` | ~6px | Compact |
| `small-100` | ~8px | Small |
| `small` | ~12px | Default small |
| `base` | ~16px | Standard |
| `large` | ~20px | Comfortable |
| `large-100` | ~24px | Spacious |
| `large-200` | ~32px | Wide |
| `large-300` | ~40px | Section |
| `large-400` | ~48px | Layout |
| `large-500` | ~64px | Page |

#### Responsive Container Queries

All spacing/layout attributes accept responsive values via container query syntax:

```html
<s-query-container>
  <s-stack direction="@container (inline-size > 500px) inline, block"
           gap="@container (inline-size > 500px) base, small-300">
    <s-box padding="base">Content</s-box>
  </s-stack>
</s-query-container>
```

#### Admin Page Skeleton

```html
<s-page heading="Products" inlineSize="base">
  <s-button slot="primary-action" variant="primary">Add product</s-button>
  <s-link slot="breadcrumb-actions" href="/admin">Settings</s-link>

  <s-section heading="Active products">
    <s-stack gap="base">
      <s-banner heading="3 products need attention" tone="warning" dismissible>
        Some products are missing weights.
        <s-button slot="secondary-actions" variant="secondary">Review</s-button>
      </s-banner>

      <s-box background="base" padding="base" borderRadius="large">
        <s-table>
          <s-table-header-row>
            <s-table-header>Product</s-table-header>
            <s-table-header format="numeric">Inventory</s-table-header>
            <s-table-header>Status</s-table-header>
          </s-table-header-row>
          <s-table-body>
            <s-table-row>
              <s-table-cell><s-text>Widget Pro</s-text></s-table-cell>
              <s-table-cell><s-text fontVariantNumeric="tabular-nums">142</s-text></s-table-cell>
              <s-table-cell><s-badge tone="success" icon="check">Active</s-badge></s-table-cell>
            </s-table-row>
          </s-table-body>
        </s-table>
      </s-box>
    </s-stack>
  </s-section>
</s-page>
```

### Iteration Guide

1. Focus on ONE component at a time
2. Reference specific hex codes and token values from this document
3. This is a LIGHT-FIRST design — dark surfaces are rare exceptions (top bar, toast)
4. Body text is 13px — if it looks large, it's wrong; Polaris is compact
5. Buttons MUST have the bevel shadow — flat buttons don't feel like Polaris
6. The gray canvas (`#F1F1F1`) vs white cards (`#FFFFFF`) contrast is the primary depth mechanism
7. Color is always semantic — if you're using green for decoration, stop
8. `#303030` is not black — it's Polaris's brand shade, softer and warmer than `#000000`
9. When generating HTML, prefer `<s-*>` web components over raw `<div>` markup — they enforce Polaris patterns automatically
