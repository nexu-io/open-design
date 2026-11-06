# Design System Inspired by GitHub

> Category: Developer Tools
> Code-forward platform. Functional density, blue-on-white precision, Primer foundations.

## 1. Visual Theme & Atmosphere

GitHub's surface is engineered, not decorated. Every pixel announces a stance: this is a tool for people who care about diffs, builds, and pull requests. The page background is a clean `#ffffff` (light) or `#0d1117` (dark), with content arranged on dense rectangular panes separated by hairline borders rather than negative space. Information density is the brand — list rows, code lines, repository headers, and notification cards are all packed close together so a power user can scan a hundred items without scrolling.

The signature accents are the **Primer blue** (`#0969da`) for links and primary actions, and **GitHub green** (`#1a7f37`) for merged states, success, and the merge button itself. Both feel slightly muted compared to consumer-product blues and greens — saturated enough to read against the dense gray text, restrained enough to disappear into the background when several appear in one viewport.

Typography uses the **system-ui** stack across the entire product so text renders crisply on every OS, paired with **SFMono / Menlo / Consolas** for code. There is no editorial display font; GitHub's voice is the voice of the system you're already on.

**Key Characteristics:**
- True white canvas (`#ffffff`) or deep navy-black (`#0d1117`) — no warmth, no tint
- Hairline gray borders (`#d0d7de`) define every pane and panel
- Primer blue (`#0969da`) for links/primary; GitHub green (`#1a7f37`) for success/merge
- system-ui for prose; SFMono for code — no custom typeface
- Dense list rows with minimal padding; whitespace is rare
- Octicon iconography at 16px / 24px — single-stroke, geometric, consistent
- Pill-shaped status badges with strong color semantics

## 2. Color Palette & Roles

### Primary
- **Canvas Default** (`#ffffff`): Primary page background, light theme.
- **Canvas Subtle** (`#f6f8fa`): Secondary surface, sidebar, input background, header strip.
- **Canvas Inset** (`#eaeef2`): Code block background, deep-inset surface.
- **Fg Default** (`#1f2328`): Primary text, headlines, ink.
- **Fg Muted** (`#656d76`): Secondary text, captions, file paths.

### Brand Accent
- **Primer Blue** (`#0969da`): Links, primary CTAs, focus ring base — the universal interactive color.
- **Primer Blue Hover** (`#0550ae`): Hover/pressed for primary blue.
- **Accent Subtle** (`#ddf4ff`): Soft blue surface for callouts, info banners.

### Semantic
- **Success / Merge Green** (`#1a7f37`): Merged PRs, success badges, merge button.
- **Success Subtle** (`#dafbe1`): Success surface tint.
- **Open Green** (`#1a7f37`): "Open" issue/PR state.
- **Closed / Danger Red** (`#cf222e`): Closed PRs, destructive action, validation error.
- **Danger Subtle** (`#ffebe9`): Error banner surface.
- **Attention / Warning Yellow** (`#9a6700`): Warning text on amber surface.
- **Attention Subtle** (`#fff8c5`): Warning banner surface.
- **Done Purple** (`#8250df`): Merged-and-archived, "done" state, premium badge.
- **Sponsor Pink** (`#bf3989`): Sponsors heart, GitHub sponsors brand.

### Border & Divider
- **Border Default** (`#d0d7de`): Standard hairline border, panel outline.
- **Border Muted** (`#d8dee4`): Inner dividers within a panel.
- **Border Subtle** (`#eaeef2`): Faint table row dividers.

### Dark Theme
- **Dark Canvas** (`#0d1117`): Dark page background.
- **Dark Surface** (`#161b22`): Sidebar, header, secondary surface.
- **Dark Border** (`#30363d`): Standard dark-mode border.
- **Dark Fg** (`#e6edf3`): Primary text on dark.

## 3. Typography Rules

### Font Family
- **Body / UI**: `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`
- **Code / Mono**: `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`
- **Emoji**: `"Apple Color Emoji", "Segoe UI Emoji"`

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Display | system-ui | 32px (2rem) | 600 | 1.25 | -0.01em | Repo header, marketing hero |
| H1 | system-ui | 24px (1.5rem) | 600 | 1.25 | normal | Page heading |
| H2 | system-ui | 20px (1.25rem) | 600 | 1.25 | normal | Section heading |
| H3 | system-ui | 16px (1rem) | 600 | 1.25 | normal | Sub-section, panel header |
| Body | system-ui | 14px (0.875rem) | 400 | 1.5 | normal | Default text size — not 16px |
| Body Small | system-ui | 12px (0.75rem) | 400 | 1.4 | normal | Captions, file metadata |
| Code | SFMono | 12px (0.75rem) | 400 | 1.45 | normal | Code blocks, diff |
| Code Inline | SFMono | 0.85em | 400 | inherit | normal | Inline `code` spans |

### Principles
- **14px body, not 16px**: GitHub's prose density is its identity. The product reads at 14px to fit more rows in a viewport.
- **Weight binary**: 400 for everything by default; 600 for headlines and emphasis. No 500, no 700.
- **System fonts always**: never load a webfont for chrome — text must render instantly on slow connections.

## 4. Component Stylings

### Buttons

**Primary (Green)**
- Background: `#1f883d`
- Text: `#ffffff`
- Border: 1px solid `rgba(31, 35, 40, 0.15)`
- Padding: 5px 16px
- Radius: 6px
- Shadow: `0 1px 0 rgba(31,35,40,0.1)`
- Hover: background `#1a7f37`
- Use: "Create repository", "Merge pull request"

**Default**
- Background: `#f6f8fa`
- Text: `#1f2328`
- Border: 1px solid `#d0d7de`
- Padding: 5px 16px
- Radius: 6px
- Hover: background `#f3f4f6`, border `#d0d7de`

**Outline (Blue Link Style)**
- Background: `#ffffff`
- Text: `#0969da`
- Border: 1px solid `#d0d7de`
- Hover: background `#0969da`, text `#ffffff`

**Danger**
- Background: `#ffffff`
- Text: `#cf222e`
- Border: 1px solid `#d0d7de`
- Hover: background `#a40e26`, text `#ffffff`, border `#a40e26`

### Cards / Boxes
- Background: `#ffffff`
- Border: 1px solid `#d0d7de`
- Radius: 6px
- Padding: 16px (header) + 16px (body)
- Header has a `#f6f8fa` strip with bottom border.

### Inputs
- Background: `#ffffff`
- Border: 1px solid `#d0d7de`
- Radius: 6px
- Padding: 5px 12px
- Focus: border `#0969da`, ring `0 0 0 3px rgba(9,105,218,0.3)`

### Status Pills (Issue / PR)
- **Open**: background `#1a7f37`, text white, padding 4px 10px, radius 9999px.
- **Closed**: background `#cf222e`, text white.
- **Merged**: background `#8250df`, text white.
- **Draft**: background `#6e7781`, text white.

### Labels (Tags on Issues/PRs)
- Padding: 0 7px
- Radius: 9999px
- Font: 12px / 500
- Background and text are programmatic (label color → text computed for contrast).

## 5. Spacing & Layout

- **Base unit**: 4px. Spacing scale: 4, 8, 12, 16, 24, 32, 40, 48.
- **Page max-width**: 1280px (`Container-xl`).
- **Sidebar**: 296px on desktop, collapses below 1012px.
- **Row padding**: 16px horizontal, 12px vertical (lists are dense by design).

## 6. Motion

- **Duration**: 80ms for hover; 200ms for menu/popover open.
- **Easing**: `ease-out` for opens, `ease-in` for closes.
- **Avoided**: page-load animation, parallax, persistent micro-interactions. Things appear; they do not perform.
