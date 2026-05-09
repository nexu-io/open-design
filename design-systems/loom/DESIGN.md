# Loom Design System

> Category: Themed & Unique

## 1. Concept & Vision

A friendly, fast video-first async communication tool. Loom's design feels like a well-made productivity app — approachable, clean, and professional without being corporate. Purple accent (#625DF5) signals creativity and video without being loud. Information density is moderate, with generous whitespace that lets content breathe.

## 2. Design Language

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Background | `#FFFFFF` | Primary canvas (light mode) |
| Surface | `#F7F7F8` | Cards, sidebars, elevated panels |
| Border | `#E4E4E7` | Dividers, input borders |
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

### Typography

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
Body: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace
Body Small: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace
Caption: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif
Button: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif
Micro: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif
Mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace
```

### Spacing

8px baseline grid. The 8px unit balances density for information-heavy layouts (video metadata, comment panels) against the generous whitespace Loom's brand conveys.

```css
:root {
  --space-1: 4px;   --space-2: 8px;   --space-3: 12px;  --space-4: 16px;
  --space-5: 20px;  --space-6: 24px;  --space-8: 32px;   --space-10: 40px;
  --space-12: 48px; --space-16: 64px;
}
```

## 3. Layout & Composition

Video-first layout. The video thumbnail dominates; metadata and actions cluster below. Clean horizontal rhythm with consistent 16px gaps between elements. Cards use 8px radius for a friendly but professional feel.

## 4. Components

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

## 5. Motion

| Animation | Duration | Easing | Effect |
|-----------|----------|--------|--------|
| Card hover lift | 200ms | ease-out | translateY(-2px) + shadow increase |
| Button press | 100ms | ease-out | scale(0.97) |
| Overlay open | 200ms | ease-out | fade + scale(0.95→1) |
| Skeleton shimmer | 1.5s | ease-in-out | background-position sweep |

## 6. Shadows

All `--shadow-*` tokens are defined in the Color section's `:root` block. Reference them with `var(--shadow-card)`, etc.

## 7. Voice & Brand

### Iconography

Phosphor Icons (regular weight, 20px default) — single-stroke geometric style. 20px for inline, 24px for standalone. Violet `#625DF5` for active icons; gray `#6B6D76` for inactive.

## 8. Accessibility

- Primary text on white: 13.8:1 (WCAG AAA)
- Secondary text (#6B6D76) on white: 4.8:1 (WCAG AA)
- Tertiary text (#9B9CA3) on white: 3.2:1 — use for timestamps/metadata only, not body
- Error (#D64770) on white: 5.2:1 (WCAG AA)
- All interactive elements have a visible focus-visible state
- Touch targets minimum 44×44px

## 9. Anti-patterns

- Do not use white text on Raspberry `#D64770` — use `#FDECEE` background with dark red text for WCAG AA compliance
- Do not use Tertiary `#9B9CA3` for body text — timestamps and metadata only
- Do not use semantic colors directly as text — always pair with a sufficiently contrasting background
- Do not mix button variants in a single CSS block — use separate selectors
- Do not use `line-height: 1.0` on buttons — diacritics, emoji, and CJK glyphs clip; use `1.2` minimum