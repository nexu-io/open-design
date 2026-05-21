# Design System — Suivi

> Category: Productivity & Project Management
> SaaS platform for activity tracking, piloting, and collaboration. Colorful, structured, professional aesthetic with a lavender-teal identity.

## 1. Visual Theme & Atmosphere

Suivi's interface communicates "structured creativity" through a clean white canvas with deep black text (#000000) and a distinctive lavender-to-teal color identity. The Inter font family provides a neutral, highly legible Swiss-style typography system. The primary brand colors — Lavender (#BB8FF0) and Caribbean Current (#006677) — create a unique contrast between warmth and professionalism.

Key Characteristics:
- White canvas with black primary text (#000000)
- Caribbean Current (#006677) as primary navigation/header surface
- Lavender (#BB8FF0) as primary interactive accent and CTA color
- Inter font family with tight letter spacing
- Pill-shaped buttons with full rounding
- Teal header bar anchoring the interface
- Lavender → Teal gradient as brand identity motif
- Friendly yet professional B2B aesthetic
- Tag system with paired background/accent colors
- Colour matching rules enforced via "Colours Matching Do's" grid

## 2. Color Palette & Roles

### Primary Colors

| Name | Hex | RGB | Role |
|------|-----|-----|------|
| Lavender | `#BB8FF0` | 187, 143, 240 | Primary brand, CTA buttons, interactive accent |
| Shamrock Green | `#0E9E6E` | 14, 158, 110 | Success states, progress indicators |
| Brilliant Lavender | `#F1B1F0` | 241, 177, 240 | Secondary brand accent |
| Caribbean Current | `#006677` | 0, 102, 119 | Header/navigation surface, brand anchor |
| Maize | `#F8EA75` | 248, 234, 117 | Highlights, attention markers |
| Neon Blue | `#4A69FF` | 74, 105, 255 | Links, tertiary accent |

### Secondary Colors

| Name | Hex | RGB | Role |
|------|-----|-----|------|
| Mauve | `#D0AEFE` | 208, 174, 254 | Hover states, soft accent |
| Pale Purple | `#F5E8FF` | 245, 232, 255 | Light background, surfaces |
| Thistle | `#F8D7FC` | 248, 215, 252 | Decorative, cards |
| Magnolia | `#FCE0FE` | 252, 224, 254 | Subtle highlights |
| Tiffany Blue | `#70DEC3` | 112, 222, 195 | Progress bars, active indicators |
| Mint Green | `#A9F8ED` | 169, 248, 237 | Success backgrounds |
| Uranian Blue | `#A3E0FF` | 163, 224, 255 | Informational surfaces |
| Alice Blue | `#DAF0FF` | 218, 240, 255 | Light info backgrounds |
| Beaver | `#A8A978` | 168, 169, 120 | Muted/neutral accent |
| Silver | `#CAC8AC` | 202, 200, 172 | Disabled elements, subtle borders |

### Typography Colors

| Name | Hex | RGB | Role |
|------|-----|-----|------|
| Black | `#000000` | 0, 0, 0 | Primary text |
| Ship Cove | `#6E6E8E` | 110, 110, 142 | Secondary/muted text |
| Mauve | `#D0AEFE` | 208, 174, 254 | Accent text, links |
| White | `#FFFFFF` | 255, 255, 255 | Text on dark surfaces |

### Tag Color Themes

Each tag uses a light background paired with an accent color for text/badge:

| Theme | Background | Accent | Use case |
|-------|-----------|--------|----------|
| Lavender Mist | `#F1E1FF` | `#7B4DB0` | Default/generic tags |
| Lavender | `#E0D0FF` | `#6725FA` | Category emphasis |
| Mint Green | `#D7FCE2` | `#0B7E58` | Success/complete tags |
| Pink Lace | `#FBEAFD` | `#CC2A58` | Urgent/priority tags |
| Alice Blue | `#DAF0FF` | `#425DE3` | Info/reference tags |
| Lemon Chiffon | `#F6F7C6` | `#6B6B00` | Warning/attention tags |
| Timberwolf | `#E0E0D6` | `#5C5E2E` | Neutral/archive tags |
| Anti-flash White | `#F2EEED` | `#5F5F78` | Disabled/inactive tags |

### Brand Gradient

- Direction: Top to bottom (or as background fill)
- Start: Pale Purple / Brilliant Lavender (`#F1B1F0` area)
- End: Caribbean Current / Teal (`#006677` area)
- Usage: Hero backgrounds, brand illustrations, decorative elements

## 3. Typography Rules

### Font Family
- Primary (and only): **Inter**
- Fallbacks: -apple-system, system-ui, Segoe UI, Roboto, sans-serif

### Hierarchy

| Role | Weight | Size | Line Height | Letter Spacing |
|------|--------|------|-------------|----------------|
| H1 | Medium (500) | 32px | 100% | 0 |
| H2 | Medium (500) | 22px | 100% | -1px |
| H3 | Medium (500) | 18px | 100% | 0 |
| H4 | Medium (500) | 16px | 100% | -0.22px |
| H5 | Regular (400) | 14px | 100% | 0 |
| H6 | Medium (500) | 10px | 100% | 0 |
| P1 (Body) | Regular (400) | 16px | 100% | 0 |
| P2 (Body Small) | Medium (500) | 14px | 110% | 0 |
| P3 (Caption) | Regular (400) | 12px | 100% | 0 |
| Button Links Secondary | Medium (500) | 14px | 100% | 0 |
| Button Links Tertiary | Regular (400) | 12px | 100% | 0 |

### Typography Notes
- H2 uses negative letter-spacing (-1px) for tighter display headings
- H4 uses slight negative letter-spacing (-0.22px)
- P2 is the only style with expanded line height (110%)
- All other styles maintain 100% line height for compact UI density
- Font weights limited to Regular (400) and Medium (500) — no Bold usage

## 4. Component Stylings

### Header
- Background: Caribbean Current (`#006677`)
- Logo: "Suivi." in white, left-aligned
- Workspace breadcrumb: White text with dropdown chevron
- Search bar: Lighter teal/green surface, centered, with magnifier icon
- Action icons: White, right-aligned (notifications, settings, grid toggle)
- User avatar: Far right, circular
- Hover state: Slight background shift, green indicator dot on breadcrumb

### Buttons
- **Primary**: Pill-shaped (full border-radius), Lavender (`#BB8FF0`) background, white text
  - Hover: Slightly darker lavender
  - Press: Deeper purple
  - Disabled: Grayed out, reduced opacity
  - Delete variant: Red background
  - Width variants: 40%, 70%, full-width
  - Can include leading "+" icon
- **Secondary**: Pill-shaped outline, Lavender text, transparent background
  - Hover: Light lavender fill
  - Press: Darker lavender outline
  - Disabled: Grayed outline and text
- **Tertiary**: Text-only, Lavender/purple colored
  - Hover: Underline or slight color shift
  - Disabled variant: "Tertiary disabled" state with muted text

### Cards
- **Template Cards**: White background, thumbnail image area, title, category tag, avatar group, border-radius ~8-12px
- **Board Cards**: Compact, icon + title + description, optional tag pills
- **Home Page Cards (v1)**: Image banner + title + category + avatars, shadow on hover
- **Home Page Cards (v2)**: Icon-based, title + category + avatars, border highlight on hover with hex color indicator
- Hover states show: Expanded description, "See More Details" button, "Use This Template" CTA

### Progress Bars
- **Version 1**: Segmented colored blocks (teal gradient from light to dark Shamrock Green), percentage labels
- **Version 2**: Linear bar with contrasting segments (blue/teal + pink/magenta indicator), percentage labels

### Text Fields
- **Regular**: Light gray background, "Indicator Text" placeholder, label above
- **Focused**: White background, purple/lavender bottom border highlight
- **Filled**: White background, dark text content
- **Disabled**: Light gray background, muted text, non-interactive
- **Prefilled + Disabled**: Lavender/purple background tint, non-editable
- **Dropdown**: Chevron icon right-aligned, selectable
- **Search**: Magnifier icon, filter dropdown pairing
- **Text Box**: Multi-line variant, same state system
- **No Label variant**: Placeholder text only

### Avatars
- Sizes: Small (single icon), Medium, Large
- Group display: Overlapping circles with count indicator
- Default avatar: Silhouette on dark background
- With status: Green dot indicator

### Popup / Modal
- **Welcome popup**: Large, dark teal background, white text, video embed, close "×" button
- **Onboarding stepper**: Smaller, step indicator ("1 of 2"), green accent, "Next" button

### Color Picker
- **Thumbnail Color**: Displays current hex code, small color swatch
- **"Or choose"**: Grid of predefined color circles (brand palette subset)
- **Palette modes**: Image / Solid / Bookmarks tabs
- **Hex input**: Manual hex code entry field

### Dropdowns
- **Navigation dropdown**: Section headers ("Views", "Section Name"), icons per item, collapsible
- **Context menu**: Actions list (Open, Copy link, Duplicate, Delete link to view, Rename & icon)
- **Section dropdown**: Items with icons (Dashboard, Prioritisation, Card List, etc.)
- **Settings panel**: Toggle switches, checkboxes, descriptive labels
- **Cover dropdown**: Image/Solid/Bookmarks tabs with thumbnail grid
- Background color selector with hex input + shortcut icon

### Icons
Icon categories with consistent 24px grid:
- **Header**: Grid, Search, Notifications, Settings, Apps
- **View**: Grid, List, Kanban, Table, Calendar variants
- **Card 1**: Document, List, Arrows, People
- **Card 2**: Media, Edit, Chart icons
- **Colors**: Palette, fill, eyedropper
- **Preview**: Play, Expand
- **Dropdown**: Chevrons, arrows, navigation
- **Data View**: Full set of data manipulation icons (filter, sort, group, etc.)
- **General**: Arrows, close, check, clock, emoji, color dots, shapes, navigation, media, settings
- **Portal Editor**: Layout, composition, text, media, download tools
- **Add Board View**: Variants of board/view creation icons
- **Send Message**: Message/compose icon

### Switch & Checkbox
- **Switch Active**: Teal/Caribbean Current filled toggle
- **Switch Regular**: Gray outline toggle
- **Switch Disabled**: Light gray, non-interactive
- **Checkbox Active**: Blue/teal filled square with checkmark
- **Checkbox Regular**: Empty square outline
- **Checkbox Disabled**: Light gray square
- Usage example: "Importance pour ses parties" toggle + "Preview as" toggle

### Tabs
- **Regular**: Gray text, no underline
- **Active**: Bold black text, underline indicator
- **Hover state**: Intermediate styling
- **Tab States**:
  - Hover: Context menu appears (Rename, Delete options)
  - Rename: Inline editable text field with purple border
  - Move: Context menu (Rename, Move Right, Delete)
  - Add: "Add Tab" text link at end of tab bar

## 5. Layout

### Spacing
- Base unit: 8px
- Common values: 4px, 8px, 12px, 16px, 24px, 32px, 48px
- Card padding: 16px–24px
- Section gaps: 24px–48px

### Border Radius
- Small (inputs, tags): 4px–6px
- Medium (cards, dropdowns): 8px–12px
- Large (modals, sections): 16px–24px
- Full (buttons, pills, avatars): 50% / 999px

### Grid
- Header: Full-width, fixed height (~48px)
- Content area: Responsive with sidebar navigation
- Card grids: Multi-column with consistent gaps

## 6. Depth

### Shadows
- Cards (default): Subtle, near-transparent shadow for lift
- Cards (hover): Elevated shadow with slight blue/teal tint
- Modals/Popups: Deeper shadow for overlay separation
- Dropdowns: Medium shadow for floating panels

### Layering
- Z-0: Content (cards, text)
- Z-1: Sticky header
- Z-2: Dropdowns, popovers
- Z-3: Modals, dialogs
- Z-4: Toasts, notifications

## 7. Do's and Don'ts

### Do
- Use Lavender (`#BB8FF0`) for all primary CTAs and interactive elements
- Use Caribbean Current (`#006677`) for navigation surfaces
- Keep buttons pill-shaped with full border-radius
- Respect the "Colours Matching Do's" grid for color combinations
- Use Inter at Regular (400) and Medium (500) weights only
- Maintain 100% line height for compact UI density
- Pair tag backgrounds with their designated accent colors
- Use the lavender-to-teal gradient for brand illustrations

### Don't
- Use bold (700+) font weights — the system uses Regular and Medium only
- Mix primary colors arbitrarily — follow the matching grid
- Use heavy drop shadows — keep depth subtle
- Break the pill shape on primary/secondary buttons
- Use colors outside the defined palette for UI elements
- Create new tag themes without following the background/accent pair pattern
- Use Caribbean Current for non-navigation surfaces

## 8. Responsive Behavior

- Header collapses: Search bar may shrink or become icon-only
- Card grids reduce columns: 4 → 3 → 2 → 1
- Sidebar navigation: Collapsible on smaller screens
- Buttons: May go full-width on mobile
- Typography: No size scaling — Inter remains legible at all defined sizes
- Touch targets: Minimum 44px for interactive elements on mobile

## 9. Agent Prompt Guide

When generating UI for Suivi:
- Text color: Black (`#000000`)
- Secondary text: Ship Cove (`#6E6E8E`)
- CTA / Interactive: Lavender (`#BB8FF0`)
- Navigation surface: Caribbean Current (`#006677`)
- Background: Off-white (`#F8F6FC`)
- Surface / cards: White (`#FFFFFF`)
- Success: Shamrock Green (`#0E9E6E`)
- Link accent: Neon Blue (`#4A69FF`)
- Button shape: Pill (full border-radius)
- Font: Inter, weights 400 and 500 only
- Button text: White on primary, Lavender on secondary, Lavender on tertiary
- Card radius: 8–12px
- Hover: Slightly elevated shadow + color shift
- Brand gradient: Lavender/pink → Teal (for decorative/brand use only)
