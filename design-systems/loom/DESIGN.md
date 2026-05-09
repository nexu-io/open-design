# Design System Inspired by Loom

> Category: Media & Consumer
> Async video messaging. Purple-forward, video-centric. Warm grays, generous rounding, soft depth.

## 1. Visual Theme & Atmosphere

A **warm white canvas** (`#ffffff`) with **signature violet** (`#625DF5`) as the brand anchor. Clean and friendly without being childish — purple conveys creativity and approachability, white space keeps it professional.

| Element | Hex | Role |
|---------|-----|------|
| Primary | `#625DF5` | Brand moments, primary CTAs |
| Accent | `#D64770` | Recording states, destructive actions |
| Background | `#ffffff` | Page canvas |
| Surface | `#F7F8FA` | Cards, sidebars |
| Text | `#1F1F23` | High-contrast primary text |
| Border | `#E8E9EC` | Minimal dividers |

*"Make async video feel as natural as being in the same room."*

### Prior Art

Loom, Dropbox Capture, and similar async video tools share a visual language of purple-forward branding, generous rounding, and motion-forward interactions. Violet signals approachability — softer than the cold/technical blue of enterprise tools and warmer than alert-driven red.

## 2. Color

### Brand Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Violet | `#625DF5` | Primary CTA, active states |
| Violet Light | `#EEF1FF` | Selected, hover backgrounds |
| Violet Hover | `#4F4DDD` | Hover on violet elements |
| Raspberry | `#D64770` | Recording indicator, live states |
| Raspberry Light | `#FFECEE` | Recording background tint |

### Surface Palette

| Token | Hex | Usage |
|-------|-----|-------|
| White | `#ffffff` | Page background |
| Surface | `#F7F8FA` | Cards, code blocks, sidebars |
| Surface Hover | `#EDEEF2` | Interactive surface hover |
| Border | `#E8E9EC` | Dividers, input borders |
| Overlay | `#1F1F2380` | Modals, dropdowns |

### Text Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Primary | `#1F1F23` | Headings, primary content |
| Secondary | `#6B6D76` | Labels, secondary content |
| Tertiary | `#9B9CA3` | Timestamps, metadata |
| Inverse | `#ffffff` | Text on violet backgrounds |

### Semantic Palette (WCAG AA compliant)

All text/background pairs below pass 4.5:1 minimum.

| Token | Hex | Background | Usage |
|-------|-----|------------|-------|
| Success | `#0F7A55` | `#E6F7F1` | Upload complete |
| Warning | `#8A5A00` | `#FFF3CD` | Processing, pending |
| Error | `#C41E3A` | `#FDECEE` | Upload failed |
| Info | `#4F4DDD` | `#EEF1FF` | Information highlights |

### Token Definitions

```css
:root {
  --color-primary: #625DF5;
  --color-primary-hover: #4F4DDD;
  --color-accent: #D64770;
  --color-bg: #ffffff;
  --color-surface: #F7F8FA;
  --color-surface-hover: #EDEEF2;
  --color-border: #E8E9EC;
  --color-text: #1F1F23;
  --color-text-secondary: #6B6D76;
  --color-text-inverse: #ffffff;
  --color-success: #0F7A55;
  --color-warning: #8A5A00;
  --color-error: #C41E3A;
  --color-info: #4F4DDD;
  --color-overlay: #1F1F2380;

  --shadow-card: 0 1px 3px rgba(31, 31, 35, 0.08), 0 4px 12px rgba(31, 31, 35, 0.04);
  --shadow-card-hover: 0 4px 12px rgba(31, 31, 35, 0.12), 0 8px 24px rgba(31, 31, 35, 0.08);
  --shadow-overlay: 0 8px 32px rgba(31, 31, 35, 0.16), 0 2px 8px rgba(31, 31, 35, 0.08);
  --shadow-tooltip: 0 4px 12px rgba(31, 31, 35, 0.12);
}
```

### Dark Mode

| Token | Light | Dark |
|-------|-------|------|
| Background | `#ffffff` | `#1F1F23` |
| Surface | `#F7F8FA` | `#2A2A30` |
| Surface Hover | `#EDEEF2` | `#33333B` |
| Border | `#E8E9EC` | `#3D3D45` |
| Text | `#1F1F23` | `#F7F8FA` |
| Text Secondary | `#6B6D76` | `#A0A0A8` |
| Violet | `#625DF5` | `#7B75FF` |

```css
[data-theme="dark"] {
  --color-bg: #1F1F23;
  --color-surface: #2A2A30;
  --color-surface-hover: #33333B;
  --color-border: #3D3D45;
  --color-text: #F7F8FA;
  --color-text-secondary: #A0A0A8;
  --color-primary: #7B75FF;
  --color-primary-hover: #8F8AFF;
}
```

## 3. Typography

### Font Stack

```css
:root {
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  --font-display: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}
```

### Type Scale

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

## 4. Spacing

8px baseline grid. The 8px unit balances density for information-heavy layouts (video metadata, comment panels) against the generous whitespace Loom's brand conveys.

```css
:root {
  --space-1: 4px;   --space-2: 8px;   --space-3: 12px;  --space-4: 16px;
  --space-5: 20px;  --space-6: 24px;  --space-8: 32px;   --space-10: 40px;
  --space-12: 48px; --space-16: 64px;
}
```

## 5. Layout & Composition

### Border Radius

```css
:root {
  --radius-sm: 6px;     /* Inputs, small buttons */
  --radius-md: 8px;     /* Cards, modals */
  --radius-lg: 12px;    /* Video thumbnails */
  --radius-xl: 16px;    /* Feature cards */
  --radius-full: 9999px; /* Pills, avatars, badges */
}
```

### Video Layout

```css
/* 16:9 video embed */
.video-embed {
  aspect-ratio: 16 / 9;
  border-radius: var(--radius-lg);
  overflow: hidden;
}

/* Thumbnail grid */
.thumbnail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-6);
}
```

### Responsive Breakpoints

| Viewport | Layout |
|----------|--------|
| < 640px | Single column, full-width video |
| 640-1024px | 2-column thumbnail grid |
| > 1024px | 3-4 column thumbnail grid |

## 6. Components

### Buttons

```css
.button-primary {
  background: var(--color-primary);
  color: var(--color-text-inverse, #ffffff);
  border: none;
  border-radius: var(--radius-sm);
  font-weight: 500;
  font-size: 14px;
  line-height: 1.2;
  padding: 8px 16px;
  min-height: 44px;
  min-width: 44px;
  cursor: pointer;
}

.button-primary:hover { background: var(--color-primary-hover); }
.button-primary:active { transform: scale(0.98); }
.button-primary:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(98, 93, 245, 0.35);
}

.button-secondary {
  background: var(--color-bg);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-weight: 500;
  font-size: 14px;
  line-height: 1.2;
  padding: 8px 16px;
  min-height: 44px;
  min-width: 44px;
  cursor: pointer;
}

.button-secondary:hover { border-color: var(--color-primary); color: var(--color-primary); }
.button-secondary:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(98, 93, 245, 0.15);
}

.button-ghost {
  background: transparent;
  color: var(--color-primary);
  border: none;
  border-radius: var(--radius-sm);
  font-weight: 500;
  font-size: 14px;
  line-height: 1.2;
  padding: 8px 16px;
  min-height: 44px;
  min-width: 44px;
  cursor: pointer;
}

.button-ghost:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(98, 93, 245, 0.15);
}
```

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
  50% { opacity: 0.4; }
}

.recording-dot {
  width: 8px;
  height: 8px;
  background: var(--color-accent);
  border-radius: 50%;
  animation: recording-pulse 1.5s ease-in-out infinite;
}

.live-badge {
  background: var(--color-surface);
  color: var(--color-error);
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-error);
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

.input-field:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(98, 93, 245, 0.15);
}
```

### Avatar

```css
.avatar { border-radius: var(--radius-full); object-fit: cover; }
.avatar-sm { width: 28px; height: 28px; }
.avatar-md { width: 36px; height: 36px; }
.avatar-lg { width: 48px; height: 48px; }
.avatar-xl { width: 64px; height: 64px; }
```

### Player Chrome

```css
/* Timeline scrubber */
.player-timeline {
  height: 4px;
  background: var(--color-border);
  border-radius: 2px;
  position: relative;
  cursor: pointer;
}

.player-timeline-progress {
  height: 100%;
  background: var(--color-primary);
  border-radius: 2px;
}

.player-timeline-thumb {
  width: 12px;
  height: 12px;
  background: var(--color-primary);
  border-radius: 50%;
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
}

.player-timeline:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* Control bar */
.player-controls {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: var(--color-overlay);
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  backdrop-filter: blur(8px);
}
```

### Share & Privacy Controls

```css
.privacy-toggle {
  display: flex;
  gap: 4px;
  background: var(--color-surface);
  border-radius: var(--radius-sm);
  padding: 2px;
}

.privacy-option {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 13px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.privacy-option:hover {
  background: var(--color-surface-hover);
  color: var(--color-text);
}

.privacy-option.active {
  background: var(--color-bg);
  color: var(--color-text);
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.privacy-option:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}
```

### Upload / Processing / Error States

```css
.upload-processing {
  position: absolute;
  inset: 0;
  background: rgba(31, 31, 35, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-lg);
  color: #ffffff;
  font-size: 14px;
}

.upload-error {
  background: var(--color-surface);
  border: 2px solid var(--color-error);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  color: var(--color-error);
}

.upload-success {
  background: var(--color-surface);
  border: 2px solid var(--color-success);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  color: var(--color-success);
}
```

## 7. Motion & Interaction

| Interaction | Duration | Easing | Effect |
|-------------|----------|--------|--------|
| Hover lift | 200ms | ease-out | translateY(-2px) + shadow increase |
| Button press | 100ms | ease-in | scale(0.98) |
| Modal open | 250ms | ease-out | opacity + translateY(-8px) |
| Toast slide | 300ms | ease-out | translateX from right |
| Page transition | 200ms | ease-out | opacity fade |

```css
:root {
  --transition-fast: 100ms ease-in;
  --transition-base: 200ms ease-out;
  --transition-slow: 300ms ease-out;
}
```

### prefers-reduced-motion

Recording pulse animation is disabled when `prefers-reduced-motion: reduce` is active. Transform-based hover effects on cards fall back to a border-color change instead.

```css
@media (prefers-reduced-motion: reduce) {
  .recording-dot { animation: none; }

  .thumbnail-card:hover {
    transform: none;
    box-shadow: var(--shadow-card-hover);
  }
}
```

## 8. Voice & Brand

### Iconography

Phosphor Icons (regular weight, 20px default) — single-stroke geometric style. 20px for inline, 24px for standalone. Violet `#625DF5` for active icons; gray `#6B6D76` for inactive.

### Shadows

```css
:root {
  --shadow-card: 0 1px 3px rgba(31, 31, 35, 0.08), 0 4px 12px rgba(31, 31, 35, 0.04);
  --shadow-card-hover: 0 4px 12px rgba(31, 31, 35, 0.12), 0 8px 24px rgba(31, 31, 35, 0.08);
  --shadow-overlay: 0 8px 32px rgba(31, 31, 35, 0.16), 0 2px 8px rgba(31, 31, 35, 0.08);
  --shadow-tooltip: 0 4px 12px rgba(31, 31, 35, 0.12);
}
```

## 9. Anti-patterns

- Do not use white text on Raspberry `#D64770` — use `#FDECEE` background with dark red text for WCAG AA compliance
- Do not use Tertiary `#9B9CA3` for body text — timestamps and metadata only
- Do not use semantic colors directly as text — always pair with a sufficiently contrasting background
- Do not mix button variants in a single CSS block — use separate selectors
- Do not use `line-height: 1.0` on buttons — diacritics, emoji, and CJK glyphs clip; use `1.2` minimum
- Do not hardcode light-mode component values — always use semantic CSS variables so dark mode works correctly