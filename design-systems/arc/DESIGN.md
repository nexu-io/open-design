# Design System Inspired by Arc Browser

> Category: Productivity & SaaS
> "The browser that browses for you." Translucent surfaces, gradient warmth, sidebar-first layout.

## 1. Visual Theme & Atmosphere

Arc Browser dissolves the boundary between the chrome and the page. Where Chrome and Safari treat the browser frame as a container, Arc treats it as scenery — the toolbar fades into the system wallpaper, the sidebar carries gradient warmth from the user's chosen "theme color", and translucency is everywhere. The visual signature is **frosted glass plus a single saturated gradient** — most often a peach-to-coral or violet-to-fuchsia bloom — that sets the emotional temperature of the entire window.

Typography uses **Inter** for chrome and a custom display serif (`Argent CF` or similar) for marketing — when Arc speaks publicly it speaks editorially, in a serif voice unusual for tech. The product itself is sans-only, with tight tracking and generous line-height.

Shapes are squircle-soft: 12–16px radii on cards, 8px on tabs, 9999px pills for tags. Borders are rare — Arc prefers tinted background washes (`rgba(255, 255, 255, 0.5)` over the gradient) to delineate panes.

**Key Characteristics:**
- Translucent frosted-glass surfaces over a saturated gradient background
- Theme-color gradients (peach-coral, violet-fuchsia, mint-cyan) as the primary mood
- Inter for product chrome, Argent CF (serif) for marketing display
- Squircle-soft 12–16px radii everywhere
- Sidebar-first layout: tabs, spaces, and bookmarks live on the left, not the top
- Color picker is a brand surface — themes are user-driven, not fixed
- Subtle shadows (`0 8px 32px rgba(0,0,0,0.08)`) over the gradient backdrop

## 2. Color Palette & Roles

### Primary Theme Gradients (User-selectable; default is "Sunset")
- **Sunset Start** (`#ff7e5f`): Peach gradient origin.
- **Sunset End** (`#feb47b`): Soft coral gradient terminus.
- **Twilight Start** (`#7f5af0`): Violet gradient origin.
- **Twilight End** (`#e84393`): Fuchsia gradient terminus.
- **Aurora Start** (`#16f2b3`): Mint gradient origin.
- **Aurora End** (`#0db4f7`): Cyan gradient terminus.

### Surface (Frosted)
- **Glass Light** (`rgba(255, 255, 255, 0.7)`): Standard frosted pane over gradient.
- **Glass Medium** (`rgba(255, 255, 255, 0.5)`): Hover state, tab pill background.
- **Glass Heavy** (`rgba(255, 255, 255, 0.85)`): Active pane, command bar.
- **Glass Dark** (`rgba(20, 20, 25, 0.6)`): Dark-mode frosted surface.

### Ink & Text
- **Ink Primary** (`#1a1a1f`): Primary text on light frosted surface.
- **Ink Secondary** (`#54545a`): Secondary text, tab title at rest.
- **Ink Muted** (`#8c8c93`): Tertiary, captions, URL bar.
- **Ink Inverse** (`#fafafa`): Text on dark frosted surface.

### Border & Divider
- **Border Glass** (`rgba(255, 255, 255, 0.4)`): Frosted-edge border.
- **Border Hairline** (`rgba(0, 0, 0, 0.06)`): Hairline divider on light surface.
- **Border Active** (`rgba(0, 0, 0, 0.18)`): Active tab outline.

### Brand Accent
- **Arc Coral** (`#ff5f5f`): Default brand color — used in marketing, `arc.net`.
- **Arc Lavender** (`#b794f4`): Secondary brand accent.

### Semantic
- **Success** (`#48bb78`): Toast confirmation.
- **Warning** (`#f6ad55`): Permission prompt.
- **Error** (`#f56565`): Form validation.

## 3. Typography Rules

### Font Family
- **Display / Marketing**: `Argent CF`, with fallback: `'Source Serif Pro', Georgia, serif`
- **Body / UI**: `Inter`, with fallback: `system-ui, -apple-system, BlinkMacSystemFont, sans-serif`
- **Code / Mono**: `Berkeley Mono`, with fallback: `ui-monospace, Menlo, Consolas, monospace`

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Marketing Hero | Argent CF | 72px (4.5rem) | 400 | 1.05 | -0.03em | Editorial display, marketing only |
| Section Heading | Argent CF | 40px (2.5rem) | 400 | 1.15 | -0.02em | Marketing section titles |
| Page H1 | Inter | 32px (2rem) | 700 | 1.2 | -0.02em | Settings, command bar header |
| Page H2 | Inter | 22px (1.375rem) | 600 | 1.25 | -0.01em | Sub-section |
| Tab Title | Inter | 13px (0.8125rem) | 500 | 1.3 | -0.005em | Sidebar tab label |
| Body | Inter | 15px (0.9375rem) | 400 | 1.55 | normal | Settings prose, tooltips |
| Caption | Inter | 12px (0.75rem) | 500 | 1.4 | 0.01em | URL bar protocol, metadata |
| Code | Berkeley Mono | 13px (0.8125rem) | 400 | 1.5 | normal | URL bar, devtools |

### Principles
- **Serif moments are rare**: Argent CF appears only in marketing. The product is sans-only.
- **Title size is small**: tabs render at 13px so a long sidebar of 30+ tabs stays scannable.
- **Tracking tightens with size**: -0.03em at 72px, returning to normal by 15px.

## 4. Component Stylings

### Buttons

**Primary (Filled)**
- Background: linear-gradient on theme color (e.g., `linear-gradient(135deg, #ff7e5f, #feb47b)`)
- Text: `#ffffff`
- Padding: 10px 20px
- Radius: 12px
- Shadow: `0 4px 16px rgba(255, 127, 95, 0.3)`
- Hover: shadow grows to `0 8px 24px rgba(255, 127, 95, 0.4)`

**Glass (Secondary)**
- Background: `rgba(255, 255, 255, 0.7)`
- Backdrop: `blur(20px)`
- Text: `#1a1a1f`
- Border: 1px solid `rgba(255, 255, 255, 0.4)`
- Padding: 10px 20px
- Radius: 12px

**Subtle**
- Background: transparent
- Text: theme color
- Hover: background `rgba(255, 127, 95, 0.1)`

### Tabs (Sidebar)
- Background at rest: transparent
- Background on hover: `rgba(255, 255, 255, 0.5)`
- Background active: `rgba(255, 255, 255, 0.85)` + soft shadow
- Padding: 8px 12px
- Radius: 8px
- Favicon: 16px square at left, 8px gap to title.

### Cards / Panes
- Background: `rgba(255, 255, 255, 0.7)`
- Backdrop: `blur(24px)` saturate 180%
- Border: 1px solid `rgba(255, 255, 255, 0.4)`
- Radius: 16px
- Shadow: `0 8px 32px rgba(0, 0, 0, 0.08)`
- Padding: 24px

### Inputs (Command Bar)
- Background: `rgba(255, 255, 255, 0.85)`
- Backdrop: `blur(40px)`
- Text: `#1a1a1f`
- Border: 1px solid `rgba(255, 255, 255, 0.4)`
- Radius: 14px
- Padding: 14px 18px
- Focus: shadow `0 0 0 4px rgba(255, 127, 95, 0.2)`

### Pills (Spaces / Bookmarks Folder)
- Background: theme color at 16% alpha
- Text: theme color (full)
- Padding: 4px 10px
- Radius: 9999px
- Font: 12px / 600

## 5. Spacing & Layout

- **Base unit**: 4px. Scale: 4, 8, 12, 16, 24, 32, 48, 64.
- **Sidebar**: 240px wide; collapsible to 56px.
- **Window radius**: 12px on the OS window itself (macOS-only flourish).
- **Padding inside panes**: 24px.

## 6. Motion

- **Duration**: 200ms for hover; 320ms for tab create/close; 480ms for "Little Arc" window expand.
- **Easing**: `cubic-bezier(0.32, 0.72, 0, 1)` for window expand (Apple's spring-style).
- **Tab swap**: 1px translate + opacity blend, no scale change.
