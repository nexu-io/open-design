# GitHub Design System

> Category: Developer Tools
> Code hosts, collaboration tools, CI/CD dashboards. GitHub's clean utilitarian aesthetic — functional, dense, precise.

## 1. Visual Theme & Atmosphere

GitHub's design is built on a **clean white canvas** (`#ffffff`) with **neutral dark-gray text** (`#1f2328`) — a precise, functional aesthetic that stays out of the content's way. No decoration for decoration's sake. Every element earns its place.

### Key Characteristics

| Element | Specification |
|---------|---------------|
| Background | Pure white `#ffffff` — maximum clarity |
| Primary Text | Near-black `#1f2328` — neutral, not warm or cool |
| Accent | GitHub blue `#0969da` — links, focus states, primary CTAs |
| Danger | Crimson `#d1242f` — destructive actions, closed PRs |
| Success | Forest green `#1a7f37` — open PRs, successful builds |
| Density | Compact — GitHub optimizes for information density |

### Philosophy

*"Reduce cognitive load. Every design decision should make code easier to read and collaboration easier to navigate."*

## 2. Color Palette

### Brand Colors

| Name | Hex | Usage |
|------|-----|-------|
| **GitHub Blue** | `#0969da` | Links, focus rings, primary CTAs |
| **GitHub Black** | `#1f2328` | Primary text, dark surfaces |
| **GitHub White** | `#ffffff` | Page background, cards |
| **GitHub Gray** | `#59636e` | Secondary text, muted labels |

### Semantic Colors

| Name | Hex | Semantic Usage |
|------|-----|----------------|
| **Open** | `#1a7f37` | Open PRs, success states |
| **Open Muted** | `#dafbe1` | Open PR background |
| **Closed** | `#d1242f` | Closed PRs, danger states |
| **Closed Muted** | `#ffebe9` | Closed PR background |
| **Draft** | `#59636e` | Draft PRs, muted states |
| **Draft Muted** | `#818b981f` | Draft PR background |
| **Attention** | `#9a6700` | Warnings, pending states |
| **Attention Muted** | `#fff8c5` | Warning backgrounds |
| **Done** | `#8250df` | Merged, completed states |
| **Done Muted** | `#fbefff` | Completed background |
| **Sponsors** | `#bf3989` | Sponsor-specific elements |

### Surface Scale

| Level | Hex | Usage |
|-------|-----|-------|
| Page | `#ffffff` | Main page background |
| Surface | `#f6f8fa` | Muted backgrounds, code blocks |
| Inset | `#f6f8fa` | Nested containers |
| Disabled | `#eff2f5` | Disabled element background |
| Black | `#1f2328` | Dark surfaces, inverse text |

### Border Colors

| Level | Hex | Usage |
|-------|-----|-------|
| Default | `#d1d9e0` | Standard borders |
| Muted | `#d1d9e0b3` | Subtle dividers |
| Emphasis | `#818b98` | Active/focused borders |
| Disabled | `#818b981a` | Disabled state borders |
| Translucent | `#1f232826` | Overlay borders |

## 3. Typography

### Font Stack

```css
/* System UI — GitHub uses system fonts for maximum performance */
--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
--font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
```

### Type Hierarchy

| Role | Size | Weight | Line Height | Letter Spacing |
|------|------|--------|-------------|----------------|
| H1 | 32px | 600 | 1.2 | -0.5px |
| H2 | 24px | 600 | 1.3 | -0.3px |
| H3 | 20px | 600 | 1.4 | -0.2px |
| Body | 14px | 400 | 1.5 | 0 |
| Body Small | 12px | 400 | 1.5 | 0 |
| Code | 13px | 400 | 1.45 | 0 |
| Button | 14px | 500 | 1.0 | 0 |

## 4. Spacing System

GitHub uses a 4px base grid:

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
```

## 5. Component Patterns

### Buttons

```css
/* Primary */
background: #0969da;
color: #ffffff;
border-radius: 6px;
/* No box-shadow — flat, functional */

/* Secondary */
background: #f6f8fa;
color: #1f2328;
border: 1px solid #d1d9e0;
border-radius: 6px;

/* Danger */
background: #d1242f;
color: #ffffff;
border-radius: 6px;
```

### Labels / Badges

```css
/* Issue labels — solid rounded pills */
border-radius: 999px;
font-size: 12px;
font-weight: 500;
padding: 0 7px;
/* No border, just background color */
```

### Cards / Code Blocks

```css
/* File explorer rows */
background: transparent;
border-bottom: 1px solid #d1d9e0;
padding: 8px 16px;

/* Code blocks */
background: #f6f8fa;
border: 1px solid #d1d9e0;
border-radius: 6px;
```

## 6. Motion & Transitions

GitHub keeps motion minimal — only where it communicates state change:

| Interaction | Duration | Easing |
|-------------|----------|--------|
| Focus ring | 150ms | ease-out |
| Dropdown open | 150ms | ease-out |
| Toast dismiss | 100ms | ease-in |
| Page transitions | none | — |

```css
--transition-duration-fast: 150ms;
--transition-easing: ease-out;
```

## 7. Shadows & Elevation

GitHub uses borders over shadows for separation. When shadows are needed:

```css
/* Dropdown / popover */
box-shadow: 0 8px 24px rgba(31, 35, 40, 0.15);

/* Overlay */
box-shadow: 0 16px 48px rgba(31, 35, 40, 0.2);
```

## 8. Dark Mode

### GitHub Dark

| Element | Light | Dark |
|---------|-------|------|
| Page background | `#ffffff` | `#0d1117` |
| Surface | `#f6f8fa` | `#161b22` |
| Border | `#d1d9e0` | `#30363d` |
| Text | `#1f2328` | `#e6edf3` |
| Text muted | `#59636e` | `#8b949e` |

```css
[data-theme="dark"] {
  --bgColor-default: #0d1117;
  --bgColor-muted: #161b22;
  --borderColor-default: #30363d;
  --fgColor-default: #e6edf3;
  --fgColor-muted: #8b949e;
}
```

## 9. Accessibility

- All text meets WCAG AA contrast (4.5:1 minimum)
- Focus states use `#0969da` outline (2px, offset 2px)
- `aria-label` on icon-only buttons
- Reduced motion: respect `prefers-reduced-motion`