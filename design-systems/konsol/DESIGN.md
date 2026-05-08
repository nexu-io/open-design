# Design System Inspired by Konsol

## 1. Visual Theme & Atmosphere

Konsol's design system embodies a modern, professional platform aesthetic built for business efficiency and trust. The visual language combines bold, vibrant accent colors with a clean, minimalist neutral foundation, creating a sense of contemporary innovation paired with reliability. The design prioritizes clarity and action through strategic use of purple accents that communicate primary interactions, complemented by fresh lime-green highlights for secondary calls-to-action. Deep charcoal and pure black text on light backgrounds ensure accessibility and legibility, while generous whitespace and consistent spacing foster an uncluttered, approachable interface. The overall mood is progressive yet grounded—designed for self-employed professionals and enterprise clients who value simplicity, compliance, and rapid task completion.

**Key Characteristics**
- Bold purple primary accent (`#7B36FF`) dominates interactive elements
- Vibrant lime-green (`#BBEE54`) secondary actions create visual hierarchy
- Deep neutral foundation (`#181818`, `#343A40`) ensures professional credibility
- Generous whitespace and rhythmic spacing communicate sophistication
- High contrast text for accessibility and ease of scanning
- Rounded corners (`16px`, `40px`, `800px`) soften the technical nature of the platform
- Minimal shadow usage preserves a flat, modern aesthetic

## 2. Color Palette & Roles

### Primary
- **Primary Action** (`#7B36FF`): Dominant interactive elements, links, primary buttons, brand accents; the most frequently used color for CTAs and system identity
- **Primary Dark** (`#6223DB`): Hover and active states for primary elements; adds depth without introducing new colors

### Accent Colors
- **Success** (`#008945`): Confirmation states, checkmarks, completed tasks, positive feedback
- **Secondary Highlight** (`#BBEE54`): Secondary CTAs, highlight badges, supporting actions; draws attention without competing with primary
- **Error / Danger** (`#E52A05`): Error states, warnings, destructive actions, validation failures

### Interactive
- **Primary Light** (`#E7DBFF`): Disabled states, hover backgrounds, subtle interactive feedback
- **Secondary Light** (`#D5BBFD`): Supporting interactive layers, focus states for accessibility

### Neutral Scale
- **Text Primary** (`#181818`): Main body text, headings, high-priority content; near-black for maximum contrast
- **Text Secondary** (`#495057`): Secondary text, descriptions, reduced-emphasis labels
- **Text Tertiary** (`#727272`): Muted text, metadata, helper text, low-priority information
- **Pure Black** (`#000000`): Maximum contrast where needed, icon fills
- **Pure White** (`#FFFFFF`): Text on dark backgrounds, primary surface overlay

### Surface & Borders
- **Background Light** (`#F3F3F3`): Primary content backgrounds, card surfaces
- **Background Lighter** (`#F2F0F6`): Secondary background layers, alternate sections
- **Background Lightest** (`#F0E7FE`): Tertiary layers, subtle differentiation
- **Border** (`#DEE2E6`): Dividers, subtle borders, form field outlines

## 3. Typography Rules

### Font Family
**Primary:** Graphik (weights: 400, 700)
Fallback: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`

**Monospace (UI):** Cofosansmono (weights: 400)
Fallback: `'Monaco', 'Courier New', monospace`

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Display / H1 | Graphik | 56px | 700 | 56px | 0px | Hero headlines, page titles |
| Heading H2 | Graphik | 48px | 700 | 48px | 0px | Section headings, major divisions |
| Heading H3 | Graphik | 32px | 700 | 32px | 0px | Subsection titles, card headlines |
| Body | Graphik | 20px | 400 | 28px | 0px | Descriptive text, narrative content |
| UI Text / Label | Graphik | 16px | 700 | 19.2px | 0px | Button text, strong labels |
| Link / Body Compact | Graphik | 16px | 400 | 22.4px | 0px | Navigation links, inline text |
| Button / Mono | Cofosansmono | 14px | 400 | 16.8px | 0px | Button internals, compact controls |

### Principles
- **Weight clarity:** Bold (700) for interactive and hierarchical elements; regular (400) for supporting content
- **Size strategy:** Large primary sizes (56px–32px) establish clear hierarchy; compact sizes (16px–14px) reduce noise
- **Line height:** Generous line heights (1.0x to 1.4x) improve readability and breathe into layouts
- **Monospace use:** Restricted to button internals and compact UI labels; never for body copy
- **Accessibility:** All text meets WCAG AA contrast standards with dark text on light backgrounds

## 4. Component Stylings

### Buttons

#### Primary Button
- **Background:** `#7B36FF`
- **Text Color:** `#FFFFFF`
- **Font:** Graphik, 16px, weight 700
- **Padding:** `12px 32px`
- **Height:** `48px`
- **Border Radius:** `40px` or `800px`
- **Border:** none
- **Box Shadow:** none
- **Line Height:** 19.2px
- **Hover State:** Background `#6223DB`, text `#FFFFFF`
- **Active State:** Background `#6223DB`, text `#FFFFFF`
- **Disabled State:** Background `#E7DBFF`, text `#D5BBFD`

#### Secondary Button
- **Background:** transparent
- **Text Color:** `#181818`
- **Font:** Graphik, 16px, weight 700
- **Padding:** `12px 32px`
- **Height:** `48px`
- **Border Radius:** `40px`
- **Border:** `1px solid #DEE2E6`
- **Box Shadow:** none
- **Line Height:** 19.2px
- **Hover State:** Background `#F2F0F6`, text `#181818`
- **Active State:** Background `#E7DBFF`, text `#6223DB`

#### Ghost Button
- **Background:** transparent
- **Text Color:** `#181818`
- **Font:** Graphik, 16px, weight 400
- **Padding:** `0px 12px`
- **Height:** auto
- **Border Radius:** `0px`
- **Border:** none
- **Box Shadow:** none
- **Line Height:** 19.2px
- **Hover State:** Text `#7B36FF`
- **Active State:** Text `#6223DB`

#### Accent Button (Lime-Green)
- **Background:** `#BBEE54`
- **Text Color:** `#181818`
- **Font:** Graphik, 16px, weight 700
- **Padding:** `12px 32px`
- **Height:** `48px`
- **Border Radius:** `40px`
- **Border:** none
- **Box Shadow:** none
- **Line Height:** 19.2px
- **Hover State:** Background `#A8D840`, text `#181818`

### Cards & Containers

#### Default Card
- **Background:** `#FFFFFF`
- **Border Radius:** `16px`
- **Border:** `1px solid #DEE2E6`
- **Padding:** `24px 32px`
- **Box Shadow:** none
- **Text Color:** `#181818`
- **Font:** Graphik, 16px, weight 400

#### Elevated Card
- **Background:** `#FFFFFF`
- **Border Radius:** `16px`
- **Border:** none
- **Padding:** `24px 32px`
- **Box Shadow:** `rgba(16, 24, 40, 0.04) 0px 4px 6px -2px, rgba(16, 24, 40, 0.08) 0px 12px 16px -4px`
- **Text Color:** `#181818`

#### Container with Light Background
- **Background:** `#F2F0F6`
- **Border Radius:** `16px`
- **Padding:** `32px 40px`
- **Border:** none
- **Text Color:** `#181818`

### Inputs & Forms

#### Text Input
- **Background:** `#FFFFFF`
- **Border:** `1px solid #DEE2E6`
- **Border Radius:** `8px`
- **Padding:** `12px 16px`
- **Text Color:** `#181818`
- **Font:** Graphik, 16px, weight 400
- **Height:** `44px`
- **Focus State:** Border `#7B36FF`, box-shadow `0 0 0 3px #E7DBFF`

#### Input Label
- **Text Color:** `#495057`
- **Font:** Graphik, 14px, weight 700
- **Margin Bottom:** `8px`

#### Validation Success
- **Border Color:** `#008945`
- **Icon Color:** `#008945`

#### Validation Error
- **Border Color:** `#E52A05`
- **Icon Color:** `#E52A05`
- **Helper Text Color:** `#E52A05`

### Navigation

#### Main Navigation
- **Background:** `#FFFFFF`
- **Text Color:** `#181818`
- **Font:** Graphik, 16px, weight 400
- **Padding:** `16px 24px`
- **Height:** `60px`
- **Hover State:** Text `#7B36FF`
- **Active State:** Text `#7B36FF`, Border-bottom `2px solid #7B36FF`

#### Breadcrumb
- **Font:** Graphik, 14px, weight 400
- **Text Color:** `#727272`
- **Separator:** `/` in `#DEE2E6`
- **Active Item Color:** `#181818`

#### Dropdown Menu
- **Background:** `#FFFFFF`
- **Border:** `1px solid #DEE2E6`
- **Border Radius:** `12px`
- **Padding:** `8px 0px`
- **Box Shadow:** `rgba(16, 24, 40, 0.04) 0px 4px 6px -2px, rgba(16, 24, 40, 0.08) 0px 12px 16px -4px`
- **Menu Item Padding:** `12px 16px`
- **Hover State:** Background `#F2F0F6`

### Badges & Tags

#### Primary Badge
- **Background:** `#E7DBFF`
- **Text Color:** `#6223DB`
- **Font:** Graphik, 14px, weight 700
- **Padding:** `6px 12px`
- **Border Radius:** `16px`

#### Success Badge
- **Background:** `#E8F5E9`
- **Text Color:** `#008945`
- **Font:** Graphik, 14px, weight 700
- **Padding:** `6px 12px`
- **Border Radius:** `16px`

#### Highlight Badge (Lime)
- **Background:** `#BBEE54`
- **Text Color:** `#181818`
- **Font:** Graphik, 14px, weight 700
- **Padding:** `6px 12px`
- **Border Radius:** `16px`

## 5. Layout Principles

### Spacing System

**Base Unit:** `4px`

**Spacing Scale:**
- `4px`: Micro gaps, icon spacing
- `8px`: Tight spacing, component padding
- `12px`: Compact padding, form fields
- `16px`: Standard padding, button internals, list items
- `20px`: Breathing room, section dividers
- `24px`: Card padding, moderate margins
- `32px`: Large padding, section spacing
- `40px`: Container padding, major sections
- `48px`: Large margin, section breaks
- `60px`: Extra-large margin, distinct sections
- `64px`: Premium spacing, hero sections
- `80px`: Maximum spacing, major layout divisions

**Context:**
- Form fields: `12px` (vertical), `16px` (horizontal)
- Cards: `24px` padding, `16px` gap between
- Sections: `48px–60px` margin-top/bottom
- Button groups: `8px` gap
- Navigation items: `16px` horizontal padding

### Grid & Container

**Max Width:** `1440px` (desktop), with `24px` padding on sides

**Column Strategy:** 
- Desktop: 12-column grid at `1440px`
- Tablet: 8-column grid at `1024px`
- Mobile: 4-column grid at `375px`

**Section Patterns:**
- Hero sections span full width with centered content container
- Two-column layouts: 50% / 50% on desktop, stacked on tablet/mobile
- Three-column card grids: `calc(33.3333% - 16px)` with `24px` gaps
- Sidebar layouts: `280px` sidebar, remaining for main content

### Whitespace Philosophy

Konsol embraces strategic negative space to communicate hierarchy and reduce cognitive load. Generous margins between sections (48px–60px) create natural breathing room and guide user focus. Within components, padding follows the spacing scale to maintain visual consistency. Whitespace is used actively to group related elements and separate concerns—a large gap signals a new context. This approach balances information density with scannability, essential for a compliance-heavy platform.

### Border Radius Scale

- `0px`: Sharp edges for structured tables, borders
- `8px`: Subtle rounding for inputs, compact components
- `12px`: Modal and dropdown components
- `16px`: Cards, containers, elevated surfaces
- `40px`: Button default radius, moderate pill shapes
- `800px`: Fully rounded pill buttons, badge-like elements

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Flat (0) | No shadow, border `1px solid #DEE2E6` | Cards, dividers, static content |
| Raised (1) | `rgba(16, 24, 40, 0.04) 0px 4px 6px -2px, rgba(16, 24, 40, 0.08) 0px 12px 16px -4px` | Modals, dropdowns, floating panels |
| Floating (2) | `rgba(16, 24, 40, 0.08) 0px 20px 25px -5px, rgba(16, 24, 40, 0.1) 0px 25px 50px -12px` | Tooltips, popovers, top-level overlays |

**Shadow Philosophy:**

Konsol uses restrained shadow application to maintain a modern, flat aesthetic. Shadows are subtle and reserved for elements that need to lift off the surface—primarily modals, dropdowns, and floating panels. The two-layer shadow approach (using multiple box-shadow declarations) creates depth without heaviness, mimicking natural light falloff. Most components use minimal or no shadow, relying instead on color contrast and borders to establish visual hierarchy. This restraint keeps the interface clean and focused on content.

## 7. Do's and Don'ts

### Do
- Use `#7B36FF` for all primary CTAs and key interactive elements
- Pair primary purple with white text for maximum contrast and clarity
- Apply `#BBEE54` to secondary actions or highlights that support—not compete with—primary elements
- Use `#008945` for success states, checkmarks, and confirmation feedback
- Maintain at least `48px` height for all clickable elements (WCAG touch target)
- Layer cards with subtle `1px #DEE2E6` borders rather than heavy shadows
- Stack sections with `48px–60px` vertical margins for clear separation
- Use Graphik for all text; reserve Cofosansmono only for compact UI labels and buttons
- Align all text to a baseline grid using the specified line heights
- Test color combinations for WCAG AA contrast (4.5:1 for body text, 3:1 for large text)

### Don't
- Introduce new accent colors; stick to the defined palette
- Use shadows heavier than level 1 (Raised) outside of top-level overlays
- Scale down button text below `14px` or button height below `44px`
- Apply more than `2px` border width; keep borders subtle and refined
- Mix font families within a single text element
- Override hover states with custom colors; use the defined state palette
- Create border radii smaller than `8px` or larger than `800px` without design approval
- Use `#E52A05` (error red) for disabled states; reserve it strictly for errors and warnings
- Nest more than two levels of cards/containers; flatten hierarchy when possible
- Vary spacing arbitrarily; always reference the defined spacing scale

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile | 375px–599px | 4-column grid, 16px padding, stack all sections, font -2px, hide secondary navigation |
| Tablet | 600px–1023px | 8-column grid, 24px padding, 2-column layouts where relevant, full nav visible |
| Desktop | 1024px–1440px | 12-column grid, 40px padding, 3-column grids enabled, hero layouts full |
| Large | 1440px+ | Max container width 1440px, centered content, premium spacing applied |

### Touch Targets

- **Minimum button height:** `44px` (44×44px minimum touch area per WCAG 2.1)
- **Minimum button width:** `44px`
- **Link minimum tap area:** `44px` height with adequate horizontal padding
- **Form input height:** `44px`
- **Icon buttons:** `40px×40px` with `8px` padding
- **Navigation items:** `44px` height, `16px` horizontal padding
- **Spacing between touch targets:** Minimum `8px` gap to prevent accidental activation

### Collapsing Strategy

- **Headings:** H1 remains `56px` on desktop, reduces to `36px` on tablet, `28px` on mobile
- **Body text:** `20px` on desktop, `18px` on tablet, `16px` on mobile
- **Card width:** `calc(33.3333% - 16px)` (3-col) on desktop, `calc(50% - 12px)` (2-col) on tablet, `100%` on mobile
- **Padding:** `40px` on desktop, `24px` on tablet, `16px` on mobile
- **Section margins:** `60px` on desktop, `40px` on tablet, `24px` on mobile
- **Navigation:** Horizontal on desktop/tablet, hamburger menu on mobile with slide-out drawer
- **Forms:** Single column on all devices; inputs stack vertically with `12px` gap
- **Modals:** Full-screen on mobile, `80%` max-width on tablet, `600px` max-width on desktop

## 9. Agent Prompt Guide

### Quick Color Reference

- **Primary CTA:** Vivid Purple (`#7B36FF`) — Use for primary buttons, links, brand accents
- **Secondary CTA:** Lime Green (`#BBEE54`) — Use for secondary actions, highlights, supporting CTAs
- **Success / Confirmation:** Forest Green (`#008945`) — Use for checkmarks, success states, completion
- **Error / Warning:** Red-Orange (`#E52A05`) — Use only for errors, warnings, destructive actions
- **Background:** Off-White (`#FFFFFF`) — Primary content surfaces
- **Background Alt:** Lavender (`#F2F0F6`) — Secondary background layers, sections
- **Text Primary:** Near-Black (`#181818`) — All main body text, headings
- **Text Secondary:** Gray (`#495057`) — Descriptions, reduced-emphasis labels
- **Border:** Light Gray (`#DEE2E6`) — Dividers, form field outlines, subtle edges

### Iteration Guide

1. **Color Application:** Always use `#7B36FF` for primary interactive elements (buttons, links, focused states). Use `#BBEE54` only for secondary actions that enhance rather than distract. Error states are exclusively `#E52A05`; never apply red to disabled or neutral states.

2. **Typography Foundation:** All text must use Graphik font family with weights 400 or 700 only. Body text is `20px / 28px` on desktop, reducing to `16px / 22px` on mobile. Buttons are always `16px / 19.2px` in weight 700. Never deviate from the specified size/weight pairs.

3. **Spacing Rigor:** Every margin and padding value must come from the defined scale (`4px`, `8px`, `12px`, `16px`, `20px`, `24px`, `32px`, `40px`, `48px`, `60px`, `64px`, `80px`). Sections are separated by `48px–60px` vertical margin. Cards and components have `24px` internal padding. No arbitrary spacing values.

4. **Border & Shadow Strategy:** Use `1px solid #DEE2E6` borders on flat cards. Apply subtle shadows only to modals and dropdowns using the exact shadow value: `rgba(16, 24, 40, 0.04) 0px 4px 6px -2px, rgba(16, 24, 40, 0.08) 0px 12px 16px -4px`. No borders on buttons unless explicitly designed; primary buttons have no border.

5. **Button Height & Padding:** All buttons are `48px` tall minimum with `12px 32px` padding on default. Border radius is `40px` for standard buttons or `800px` for pill-shaped variants. Ensure at least `44px` minimum clickable area per accessibility standards. Hover states darken purple from `#7B36FF` to `#6223DB`.

6. **Component Radius Scale:** Cards and containers use `16px` radius. Input fields use `8px` radius. Modals and dropdowns use `12px` radius. Buttons use `40px` or `800px`. Never use fractional or arbitrary radius values; only use defined scale increments.

7. **Responsive Grid:** Desktop uses 12-column grid with `1440px` max width. Tablet (600px–1023px) uses 8-column grid with `24px` padding. Mobile (375px–599px) uses 4-column grid with `16px` padding. Three-column card layouts become two-column on tablet and single-column on mobile automatically.

8. **Form & Input Styling:** Input fields are `44px` tall with `12px 16px` padding, `1px solid #DEE2E6` border, and `8px` border radius. Focus state applies a `3px` blue glow (`0 0 0 3px #E7DBFF`). Labels are `14px` weight 700 in `#495057`, positioned above inputs with `8px` bottom margin. Error states change border and text to `#E52A05`.

9. **Contrast & Accessibility:** All text combinations must meet WCAG AA standards (4.5:1 for body, 3:1 for large). Primary text is always `#181818` on white or light backgrounds. Interactive elements use `#7B36FF` with sufficient contrast. Links are `#7B36FF` weight 400 with underline on hover. Test every color pair against accessibility checkers before implementation.

10. **State Consistency:** Buttons have three states: Default, Hover (darken by 1 shade), and Disabled (use `#E7DBFF` background with `#D5BBFD` text). Links transition from `#7B36FF` to `#6223DB` on hover. Form inputs show focus ring in light purple. Success states are `#008945`, errors are `#E52A05`. Never invent new states or colors outside this palette.