# Design System — Hub

> Category: Technology & Innovation
> A multi-tenant technology studio. Websites, platforms, apps, SaaS, automations, chatbots. Everything connects at the Hub.

## 1. Visual Theme & Atmosphere

Hub's visual identity is built around the concept of **"Radial Connectivity"** — a central point from which technology radiates outward. The aesthetic balances technical precision with human warmth, sitting at the intersection of futuristic minimalism and approachable sophistication.

The default canvas is a deep indigo-night (`#0B0D1A`) — not pure black, but a rich near-darkness that feels expansive rather than empty. Content emerges through layered surfaces of increasing luminance, from `#12142A` (panel) to `#1C1F3A` (elevated cards) to `#282B48` (hover states). Each surface transition is deliberate — like stepping through a network hub.

The accent system is where Hub's personality lives: an **electric indigo** (`#6366F1`) as the brand anchor, a **warm coral** (`#F472B6`) for human-centered moments, and a **digital cyan** (`#22D3EE`) that represents flow and connection. These three colors form the "Hub Triad" — technology (indigo), humanity (coral), connection (cyan). They work independently, but their magic happens in gradient transitions between them, suggesting a network in motion.

Typography uses **Plus Jakarta Sans** for headings — a geometric sans-serif with subtle humanist touches, giving it both precision and warmth. Body text runs in **Inter**, optimized for readability at every size. Code and technical content use **JetBrains Mono**, with its distinctive ligatures and increased x-height.

The system supports both dark and light modes, with the dark mode as the default "tech" expression and the light mode as the "studio" expression. Every component defined in this system has both mode variants.

**Key Characteristics:**
- Dark-native: `#0B0D1A` background, `#12142A` panels, `#1C1F3A` elevated surfaces
- "Hub Triad" accent colors: indigo (`#6366F1`), coral (`#F472B6`), cyan (`#22D3EE`)
- Gradient storytelling: accent colors used in flowing gradients to suggest connectivity
- Plus Jakarta Sans for headings (geometric + humanist), Inter for body, JetBrains Mono for code
- Subtle glow effects on accent elements, suggesting illuminated connection points
- Glass-morphism on elevated surfaces: subtle backdrop blur + semi-transparent backgrounds
- Network-inspired decorative elements: subtle node-and-edge patterns, radial gradients
- Warm light mode: `#FAF8F5` background, warm paper-like surfaces

## 2. Color Palette & Roles

### Background Surfaces (Dark Mode)

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#0B0D1A` | Page background — deep indigo-night |
| `--surface` | `#12142A` | Panel, sidebar, secondary surfaces |
| `--surface-elevated` | `#1C1F3A` | Cards, dropdowns, modals |
| `--surface-hover` | `#282B48` | Hover states, active surfaces |
| `--surface-glass` | `rgba(18, 20, 42, 0.8)` | Glass-morphism surfaces (with backdrop-blur) |

### Background Surfaces (Light Mode)

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-light` | `#FAF8F5` | Page background — warm paper |
| `--surface-light` | `#FFFFFF` | Card, panel backgrounds |
| `--surface-light-hover` | `#F0EDE8` | Hover states in light mode |
| `--surface-light-glass` | `rgba(255, 255, 255, 0.7)` | Glass surfaces in light mode |

### Text & Content

| Token | Value | Usage |
|-------|-------|-------|
| `--fg` | `#F1F0F7` | Primary text — soft white with indigo cast |
| `--fg-2` | `#B8B8D0` | Secondary text — muted lavender |
| `--muted` | `#7A7A9E` | Tertiary text — subtle, metadata |
| `--meta` | `#55557A` | Disabled, timestamps, placeholder |
| `--fg-light` | `#1A1A2E` | Primary text in light mode |
| `--fg-2-light` | `#4A4A6A` | Secondary text in light mode |
| `--muted-light` | `#8A8AA0` | Tertiary text in light mode |

### Brand & Accent — The Hub Triad

| Token | Value | Usage |
|-------|-------|-------|
| `--accent` | `#6366F1` | Electric indigo — primary brand, CTAs, key interactive |
| `--accent-on` | `#FFFFFF` | Text on accent backgrounds |
| `--accent-hover` | `#818CF8` | Indigo hover state |
| `--accent-active` | `#4F46E5` | Indigo active/pressed state |
| `--accent-2` | `#F472B6` | Warm coral — human touch, highlights, secondary CTAs |
| `--accent-2-on` | `#1A1A2E` | Text on coral backgrounds |
| `--accent-2-hover` | `#F9A8D4` | Coral hover state |
| `--accent-3` | `#22D3EE` | Digital cyan — connection, flow, tech accents |
| `--accent-3-on` | `#0B0D1A` | Text on cyan backgrounds |
| `--accent-3-hover` | `#67E8F9` | Cyan hover state |

### Gradient System

| Token | Definition | Usage |
|-------|------------|-------|
| `--gradient-primary` | `linear-gradient(135deg, #6366F1, #22D3EE)` | Indigo → cyan — tech flow |
| `--gradient-warm` | `linear-gradient(135deg, #6366F1, #F472B6)` | Indigo → coral — tech meets human |
| `--gradient-full` | `linear-gradient(135deg, #6366F1, #F472B6, #22D3EE)` | Full Hub Triad spectrum |
| `--gradient-radial` | `radial-gradient(circle at 30% 40%, #6366F1 0%, #22D3EE 50%, transparent 80%)` | Radial glow for hero sections |

### Status Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--success` | `#10B981` | Success, active, online |
| `--warn` | `#F59E0B` | Warning, pending |
| `--danger` | `#EF4444` | Error, critical |

### Border & Divider

| Token | Value | Usage |
|-------|-------|-------|
| `--border` | `rgba(255, 255, 255, 0.08)` | Subtle borders — dark mode default |
| `--border-soft` | `rgba(255, 255, 255, 0.04)` | Ultra-subtle dividers |
| `--border-light` | `rgba(0, 0, 0, 0.08)` | Borders in light mode |
| `--border-accent` | `rgba(99, 102, 241, 0.3)` | Accent-tinted border for focused states |

### Overlay

| Token | Value | Usage |
|-------|-------|-------|
| `--overlay` | `rgba(0, 0, 0, 0.7)` | Modal/dialog backdrop |
| `--overlay-light` | `rgba(0, 0, 0, 0.3)` | Light backdrop |

## 3. Typography Rules

### Font Family

| Role | Font Stack |
|------|------------|
| Display / Heading | `"Plus Jakarta Sans", "Inter", system-ui, sans-serif` |
| Body | `"Inter", system-ui, -apple-system, sans-serif` |
| Monospace | `"JetBrains Mono", "Fira Code", ui-monospace, monospace` |

### Type Scale

| Role | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|--------|-------------|----------------|-------|
| Display XL | 80px (5rem) | 700 | 1.00 | -0.03em | Hero headlines — maximum impact |
| Display L | 56px (3.5rem) | 700 | 1.05 | -0.025em | Section hero, feature intros |
| Display M | 40px (2.5rem) | 700 | 1.10 | -0.02em | Major section headings |
| Heading 1 | 32px (2rem) | 600 | 1.15 | -0.015em | Page titles |
| Heading 2 | 24px (1.5rem) | 600 | 1.25 | -0.01em | Section titles |
| Heading 3 | 20px (1.25rem) | 600 | 1.30 | -0.005em | Card headers, sub-sections |
| Heading 4 | 18px (1.125rem) | 600 | 1.35 | normal | Minor headings |
| Body Large | 18px (1.125rem) | 400 | 1.60 | normal | Lead text, introductions |
| Body | 16px (1rem) | 400 | 1.55 | normal | Standard reading text |
| Body Medium | 16px (1rem) | 500 | 1.55 | normal | Emphasized body |
| Small | 14px (0.875rem) | 400 | 1.50 | normal | Secondary text, descriptions |
| Small Medium | 14px (0.875rem) | 500 | 1.50 | normal | Emphasized small text |
| Caption | 13px (0.8125rem) | 500 | 1.40 | normal | Labels, metadata |
| Micro | 11px (0.6875rem) | 600 | 1.30 | 0.05em | Overline, uppercase labels |
| Mono Body | 14px (0.875rem) | 400 | 1.50 | normal | Inline code, code blocks |
| Mono Caption | 12px (0.75rem) | 400 | 1.40 | normal | Code annotations |

### Typography Principles

- **Geometric with soul**: Plus Jakarta Sans provides the geometric precision expected of a tech brand, but its humanist terminals and open apertures keep it approachable — not cold.
- **Weight contrast as hierarchy**: Display sizes use 700 (bold) for presence. Body uses 400 for readability. Interactive elements use 500 (medium) for emphasis. Only use 600 for H2/H3 to create clear section distinction.
- **Compression at scale**: Display sizes tighten letter-spacing progressively: -0.03em at 80px, -0.025em at 56px, -0.02em at 40px, relaxing toward normal below 24px.
- **Generous leading for readability**: Body text at 1.55 line height ensures comfortable reading across devices. Display text tightens to near-1.0 for dramatic impact.
- **Gradient text on hero**: Display headings on hero sections use the Hub Triad gradients (`--gradient-primary` or `--gradient-warm`) for maximum brand impact. Use sparingly — one per page.
- **JetBrains Mono with ligatures**: Enable `calt`, `liga`, `dlig` for technical content — the ligatures (like `!=` `=>` `<=`) add character to code displays.

## 4. Component Stylings

### Buttons

**Primary Button (Indigo)**
- Background: `#6366F1`
- Text: `#FFFFFF`
- Padding: 10px 20px
- Radius: 8px
- Font: 15px weight 600
- Hover: `#818CF8` with transform: translateY(-1px)
- Active: `#4F46E5`
- Shadow: `0 4px 14px rgba(99, 102, 241, 0.35)`
- Transition: 200ms ease
- Use: Primary actions, main CTAs

**Secondary Button (Ghost)**
- Background: transparent
- Text: `#F1F0F7`
- Border: `1px solid var(--border)`
- Padding: 10px 20px
- Radius: 8px
- Font: 15px weight 500
- Hover: `rgba(255,255,255,0.05)` background
- Use: Secondary actions, cancel

**Tertiary Button (Coral)**
- Background: `#F472B6`
- Text: `#1A1A2E`
- Padding: 10px 20px
- Radius: 8px
- Font: 15px weight 600
- Hover: `#F9A8D4`
- Use: Human-centered CTAs, "Talk to us", secondary brand actions

**Gradient Button**
- Background: `linear-gradient(135deg, #6366F1, #22D3EE)`
- Text: `#FFFFFF`
- Padding: 12px 24px
- Radius: 8px
- Font: 15px weight 600
- Hover: shift gradient angle, add shadow
- Shadow: `0 4px 20px rgba(99, 102, 241, 0.4)`
- Use: Hero CTAs, premium actions

**Icon Button**
- Size: 40px × 40px
- Background: transparent
- Border: `1px solid var(--border)`
- Radius: 8px
- Hover: `var(--surface-hover)`
- Use: Toolbar, inline actions

### Cards

- Background: `var(--surface-elevated)` / `var(--surface-light)` (mode-aware)
- Border: `1px solid var(--border)`
- Radius: 12px
- Padding: 24px
- Shadow: `0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)`
- Hover: shadow deepens, optional border accent
- **Feature Card**: top accent border in Hub Triad gradient, 2px height

### Navigation

- Fixed/sticky header with glass effect: `var(--surface-glass)` + backdrop-blur(12px)
- Logo: Hub wordmark or "H" icon, left-aligned
- Links: 14px weight 500, `var(--fg-2)`, hover → `var(--fg)`
- Active link: bottom border accent or `var(--accent)` text
- CTA: Gradient Button or Primary Button
- Mobile: hamburger at <768px with full-height overlay nav

### Inputs

- Background: `rgba(255,255,255,0.03)`
- Border: `1px solid var(--border)`
- Text: `var(--fg)`
- Padding: 12px 16px
- Radius: 8px
- Focus: border → `var(--accent)`, ring `0 0 0 3px rgba(99, 102, 241, 0.15)`
- Placeholder: `var(--meta)`

### Badges & Tags

**Default Tag**
- Background: `var(--surface-elevated)`
- Text: `var(--fg-2)`
- Border: `1px solid var(--border)`
- Radius: 9999px
- Padding: 4px 12px
- Font: 12px weight 500

**Accent Tag (Indigo)**
- Background: `rgba(99, 102, 241, 0.15)`
- Text: `#818CF8`
- Radius: 6px
- Padding: 2px 10px
- Font: 12px weight 600

**Status Tag**
- Green: `#10B981` bg, white text — "Active", "Live"
- Amber: `#F59E0B` bg, dark text — "In Progress"
- Red: `#EF4444` bg, white text — "Offline"

### Sections

**Hero Section**
- Background: `var(--bg)` with radial gradient overlay (`--gradient-radial`)
- Max-width container: 1200px, centered
- Headline: Display XL (80px) or L (56px), weight 700
- Gradient text on headline
- Subtitle: Body Large, `var(--fg-2)`, max-width 640px
- CTA: Gradient Button + Secondary Button pair
- Decorative: subtle floating geometric shapes, network node patterns

**Feature Section**
- Alternating layout: text left / visual right, then flipped
- Section padding: 100px 0 desktop, 60px 0 mobile
- Heading: Display M (40px) or H1 (32px)
- Feature grid: 3 columns (desktop) → 2 (tablet) → 1 (mobile)
- Feature cards with top accent border

**Stats Section**
- Large numbers: Display L (56px) weight 700, gradient text
- Labels: Small, `var(--fg-2)`
- Grid: 4 columns → 2 → 1

**CTA Section**
- Full-width, gradient background (`--gradient-primary` or `--gradient-warm`)
- Padding: 80px 0
- Heading: Display M (40px), white text
- Button: White with dark text, or outline white

## 5. Layout Principles

### Spacing System
- Base unit: 8px
- Scale: 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 120
- Section vertical: 100px desktop, 60px tablet, 40px mobile

### Grid
- Max content width: 1200px
- Standard page grid: 12 columns
- Feature grids: 3-column cards, 2-column content+visual
- Stats: 4-column numeric grid
- Gallery: Masonry or variable-width

### Border Radius Scale
- Micro (4px): Inline elements, small badges
- Standard (8px): Buttons, inputs, cards
- Large (12px): Modals, panels, featured cards
- XL (16px): Hero sections, large containers
- Pill (9999px): Tags, badges, avatars

## 6. Depth & Elevation

| Level | Dark Mode | Light Mode | Use |
|-------|-----------|------------|-----|
| Flat | No shadow, `#0B0D1A` | No shadow, `#FAF8F5` | Page background |
| Surface | `0 1px 2px rgba(0,0,0,0.2)` | `0 1px 2px rgba(0,0,0,0.04)` | Card base |
| Raised | `0 4px 6px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.2)` | `0 4px 6px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.03)` | Hover cards, dropdowns |
| Elevated | `0 10px 25px rgba(0,0,0,0.4), 0 4px 10px rgba(0,0,0,0.2)` | `0 10px 25px rgba(0,0,0,0.08), 0 4px 10px rgba(0,0,0,0.04)` | Modals, popovers |
| Dialog | `0 20px 50px rgba(0,0,0,0.5), 0 8px 20px rgba(0,0,0,0.3)` | `0 20px 50px rgba(0,0,0,0.12), 0 8px 20px rgba(0,0,0,0.06)` | Full-screen modals |

## 7. Do's and Don'ts

### Do
- Use dark mode as default for tech-forward projects — it's Hub's native expression
- Apply gradient accents strategically — one gradient hero, one gradient CTA per page
- Use the Hub Triad consciously: indigo for tech/trust, coral for human moments, cyan for connection
- Keep glass-morphism subtle: max 80% background opacity + 12px blur
- Use Plus Jakarta Sans at 700 for all display sizes
- Always pair gradient buttons with matching shadow
- Use radial gradients in hero sections to create depth
- Maintain 8px grid for all spacing decisions

### Don't
- Don't use all three triad colors equally in one component — pick one primary, one accent
- Don't apply gradient text to body copy — display sizes only
- Don't use pure black (`#000`) as background — Hub's `#0B0D1A` is distinctive
- Don't overuse glass-morphism — it's for overlays and navigation, not content cards
- Don't use solid bright borders on dark backgrounds — always semi-transparent
- Don't apply shadows to text — use gradient text instead for impact
- Don't mix dark and light mode elements on the same page
- Don't let the gradient overwhelm the content — it's enhancement, not decoration

## 8. Responsive Behavior

### Breakpoints
| Name | Width | Key Changes |
|------|-------|-------------|
| Phone | <640px | Single column, compact padding (40px sections) |
| Tablet | 640–1024px | 2-column grids, 60px sections |
| Desktop | 1024–1280px | Full layout, 100px sections |
| Wide | >1280px | Expanded container, generous margins |

### Responsive Typography
- Display XL: 80px → 48px → 36px (desktop → tablet → phone)
- Display L: 56px → 40px → 32px
- Display M: 40px → 32px → 28px
- Section padding: 100px → 60px → 40px

### Collapsing Strategy
- Navigation: horizontal → hamburger at 768px
- Feature grids: 3-col → 2-col → 1-col stacked
- Stats: 4-col → 2-col → 2-col
- Hero: center-aligned, stacks content vertically on mobile
- Footer: 4-col → 2-col → 1-col

## 9. Agent Prompt Guide

### Quick Color Reference
- Page bg (dark): `#0B0D1A`
- Surface cards (dark): `#1C1F3A`
- Primary text: `#F1F0F7`
- Secondary text: `#B8B8D0`
- Muted: `#7A7A9E`
- Brand indigo: `#6366F1`
- Brand coral: `#F472B6`
- Brand cyan: `#22D3EE`
- Primary gradient: `linear-gradient(135deg, #6366F1, #22D3EE)`
- Warm gradient: `linear-gradient(135deg, #6366F1, #F472B6)`
- Border: `rgba(255, 255, 255, 0.08)`
- Glass: `rgba(18, 20, 42, 0.8)` + backdrop-blur(12px)

### Example Prompts
- "Create a hero section on `#0B0D1A` with radial gradient overlay. Headline at 56px Plus Jakarta Sans weight 700, gradient text from `#6366F1` to `#22D3EE`. Subtitle at 18px Inter weight 400 color `#B8B8D0`. Gradient CTA button (`linear-gradient(135deg, #6366F1, #22D3EE)`, 8px radius, 12px 24px padding, shadow `0 4px 20px rgba(99,102,241,0.4)`) plus ghost button (transparent bg, `1px solid rgba(255,255,255,0.08)` border)."
- "Design a feature card: `#1C1F3A` background, `1px solid rgba(255,255,255,0.08)` border, 12px radius, 24px padding. Top accent border 2px `#6366F1`. Heading at 20px Plus Jakarta Sans weight 600 color `#F1F0F7`. Body at 14px Inter color `#B8B8D0`."
- "Build a navigation header: fixed, `rgba(18,20,42,0.8)` background with backdrop-blur(12px), `1px solid rgba(255,255,255,0.08)` bottom border. Logo left. Links at 14px Inter weight 500 color `#B8B8D0`. Gradient CTA button right."
- "Make a stats row: 4-column grid. Numbers at 56px Plus Jakarta Sans weight 700 with gradient text `#6366F1` to `#22D3EE`. Labels at 14px Inter color `#7A7A9E`."
- "Create a CTA banner: `linear-gradient(135deg, #6366F1, #22D3EE)` background, 80px padding. Headline at 40px Plus Jakarta Sans weight 700 color white. White outline button with dark text."

### Iteration Guide
1. Dark mode first — it's Hub's native expression
2. Plus Jakarta Sans for all headings, Inter for body, JetBrains Mono for code
3. The Hub Triad: one dominant accent + one supporting per component
4. Gradients tell the "connection" story — use them intentionally
5. Numbers and stats get gradient text treatment
6. Glass effect is for chrome (nav, overlays), not content
7. Every design should work in both modes — test both
