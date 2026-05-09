# Loom Design System

> Category: Themed & Unique
> Loom async video. Purple primary, friendly surfaces, video-first layout. Clean and professional without being corporate.

## 1. Visual Theme & Atmosphere

A friendly, fast video-first async communication tool. Loom's design feels like a well-made productivity app — approachable, clean, and professional without being corporate. Purple accent (#625DF5) signals creativity and video without being loud. Information density is moderate, with generous whitespace that lets content breathe.

- **Visual style:** clean, friendly, content-first
- **Color stance:** bright surfaces with purple accent
- **Design intent:** keep outputs recognizable to this style family while preserving usability and readability

## 2. Color Palette & Roles

### Surface Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Background | `#FFFFFF` | Primary canvas |
| Surface | `#F7F7F8` | Cards, sidebars, elevated panels |
| Border | `#E4E4E7` | Dividers, input borders |

### Data Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Primary | `#625DF5` | CTAs, active states, video progress |
| Primary Hover | `#5048E5` | Button hover state |
| Text | `#1F1F23` | All text |
| Text Secondary | `#6B6D76` | Timestamps, metadata, captions |
| Text Tertiary | `#9B9CA3` | Placeholders, disabled states |
| Error | `#D64770` | Error states |
| Recording | `#EF440C` | Active recording indicator |

### Light Mode

Default. A content-first tool used in bright office environments.

```css
:root {
  --color-bg: #FFFFFF;
  --color-surface: #F7F7F8;
  --color-border: #E4E4E7;
  --color-primary: #625DF5;
  --color-primary-hover: #5048E5;
  --color-text: #1F1F23;
  --color-text-secondary: #6B6D76;
  --color-text-tertiary: #9B9CA3;
  --color-error: #D64770;
  --color-recording: #EF440C;
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --shadow-card: 0 1px 3px rgba(31, 31, 35, 0.08), 0 4px 12px rgba(31, 31, 35, 0.04);
  --shadow-card-hover: 0 4px 12px rgba(31, 31, 35, 0.12), 0 8px 24px rgba(31, 31, 35, 0.08);
  --shadow-overlay: 0 8px 32px rgba(31, 31, 35, 0.16), 0 2px 8px rgba(31, 31, 35, 0.08);
  --shadow-tooltip: 0 4px 12px rgba(31, 31, 35, 0.12);
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --transition-base: 200ms ease-out;
  --transition-fast: 100ms ease-out;
}
```

## 3. Typography Rules

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Display | 28px | 700 | 1.2 |
| H1 | 22px | 600 | 1.3 |
| H2 | 18px | 600 | 1.4 |
| Body | 14px | 400 | 1.5 |
| Body Small | 13px | 400 | 1.5 |
| Caption | 12px | 400 | 1.4 |
| Button | 14px | 500 | 1.2 |
| Micro | 11px | 500 | 1.2 |

**Font labels for catalog extraction:**

```
Display: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif
H1: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif
H2: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif
Body: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif
Body Small: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif
Caption: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif
Button: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif
Micro: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif
Mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace
```

## 4. Component Stylings

### Video Thumbnail Card

```css
.thumbnail-card {
  background: var(--color-bg);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  overflow: hidden;
  transition: transform var(--transition-base), box-shadow var(--transition-base);
}

.thumbnail-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-card-hover);
}

.thumbnail-card:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

### Recording Indicator

```css
@keyframes recording-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.recording-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-recording);
  animation: recording-pulse 1.5s ease-in-out infinite;
}
```

### Input Field

```css
.input-field {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  font-size: 14px;
  line-height: 1.4;
  min-height: 44px;
  min-width: 44px;
  color: var(--color-text);
}

.input-field:focus-visible {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(98, 93, 245, 0.15);
}
```

### Button Primary

```css
.btn-primary {
  background: var(--color-primary);
  color: #FFFFFF;
  border-radius: var(--radius-md);
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  transition: background var(--transition-fast);
}
.btn-primary:hover {
  background: var(--color-primary-hover);
}
```

## 5. Layout Principles

Video-first layout. The video thumbnail dominates; metadata and actions cluster below. Clean horizontal rhythm with consistent 16px gaps between elements. Cards use 8px radius for a friendly but professional feel.

## 6. Depth & Elevation

Elevation is achieved through shadows only. `--shadow-card` for resting state, `--shadow-card-hover` for interactive lift, `--shadow-overlay` for modals and tooltips. No borders on cards — shadow conveys depth.

## 7. Do's and Don'ts

- Do not use Tertiary `#9B9CA3` for body text — timestamps and metadata only
- Do not use semantic colors directly as text — always pair with a sufficiently contrasting background
- Do not mix button variants in a single CSS block — use separate selectors
- Do not use `line-height: 1.0` on buttons — diacritics, emoji, and CJK glyphs clip; use `1.2` minimum
- Do not use `#D64770` (Error) for small text under 18px on white — it is 4.2:1, below the 4.5:1 AA threshold for normal text (14px). Use `#D64770` only for large text (18px+) or pair with a darker background surface
- Do not use white text on `#D64770` background for normal text — white on #D64770 is also 4.2:1 (fails AA). Use `#FDECEE` (light pink) background with dark red text instead

## 8. Responsive Behavior

Video-first responsive layout. At narrower breakpoints, the video thumbnail stacks above metadata and actions. At ≥768px, a side-by-side layout (video left, actions right) activates. Touch targets minimum 44×44px at all breakpoints.

## 9. Agent Prompt Guide

When generating a Loom-style interface, prompt the model to:
- Use Inter for all UI text; ui-monospace for code snippets
- Apply `--radius-lg` (8px) to cards, `--radius-md` (6px) to buttons, `--radius-sm` (4px) to inputs
- Use 200ms ease-out for card hover transitions, 100ms for button press
- Include a recording indicator dot with a 1.5s pulse animation
- Primary color `#625DF5` for all CTAs and active states
- Ensure secondary text (#6B6D76) passes 4.5:1 on white before use; tertiary text (#9B9CA3) is for timestamps/metadata only