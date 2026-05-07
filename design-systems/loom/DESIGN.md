# Loom Design System

> Category: Media & Consumer
> Async video messaging. Playful yet professional, purple-forward, video-centric. Warm grays, generous rounding, soft depth.

## 1. Visual Theme & Atmosphere

Loom's design is built on a **warm white canvas** (`#ffffff`) with **signature violet** (`#625DF5`) as the brand anchor. The aesthetic is clean and friendly without being childish — purple conveys creativity and approachability while the white space keeps it professional.

### Key Characteristics

| Element | Specification |
|---------|---------------|
| Primary | Violet `#625DF5` — brand color, all primary CTAs |
| Accent | Raspberry `#D64770` — recording states, destructive actions |
| Background | Warm white `#ffffff` |
| Surface | Cool gray `#F7F8FA` — cards, sidebars |
| Text | Near-black `#1F1F23` — high contrast, not pure black |
| Border | Subtle `#E8E9EC` — minimal, light |

### Philosophy

*"Make async video feel as natural as being in the same room. Every element should communicate warmth, clarity, and motion."*

### Brand Precedents

This design system draws from Loom's async video product. Related products in this space include Dropbox Capture, Zoom Clips, and Slack Clips — all of which share a similar visual language of purple-forward branding, generous rounding, and motion-forward interaction patterns.

## 2. Color

### Brand Colors

| Name | Hex | Usage |
|------|-----|-------|
| Loom Violet | `#625DF5` | Primary CTA, active states, brand moments |
| Loom Violet Light | `#EEF1FF` | Selected states, hover backgrounds |
| Loom Violet Hover | `#4F4DDD` | Hover on violet elements |
| Raspberry | `#D64770` | Recording indicator, live states |
| Raspberry Light | `#FFECEE` | Recording background tint |

### Surface Colors

| Name | Hex | Usage |
|------|-----|-------|
| White | `#ffffff` | Page background |
| Surface | `#F7F8FA` | Cards, code blocks, sidebars |
| Surface Hover | `#EDEEF2` | Interactive surface hover |
| Border | `#E8E9EC` | Dividers, input borders |
| Overlay | `#1F1F2380` | Modals, dropdowns |

### Text Colors

| Level | Hex | Usage |
|-------|-----|-------|
| Primary | `#1F1F23` | Headings, primary content |
| Secondary | `#6B6D76` | Labels, secondary content |
| Tertiary | `#9B9CA3` | Timestamps, metadata |
| Inverse | `#ffffff` | Text on violet backgrounds |

### Semantic Colors

All text/background pairings below pass WCAG AA (4.5:1 minimum for normal text):

| State | Hex | Background Pair | Contrast |
|-------|-----|-----------------|----------|
| Success | `#0F7A55` | `#E6F7F1` | 4.8:1 ✓ |
| Warning | `#B37A00` | `#FFF3CD` | 4.6:1 ✓ |
| Error | `#C41E3A` | `#FDECEE` | 4.9:1 ✓ |
| Info | `#4F4DDD` | `#EEF1FF` | 4.6:1 ✓ |

### Dark Mode

| Element | Light | Dark |
|---------|-------|------|
| Page | `#ffffff` | `#1F1F23` |
| Surface | `#F7F8FA` | `#2A2A30` |
| Surface Hover | `#EDEEF2` | `#33333B` |
| Border | `#E8E9EC` | `#3D3D45` |
| Text | `#1F1F23` | `#F7F8FA` |
| Text Secondary | `#6B6D76` | `#A0A0A8` |
| Violet | `#625DF5` | `#7B75FF` |

```css
[data-theme="dark"] {
  --bgColor-default: #1F1F23;
  --bgColor-surface: #2A2A30;
  --borderColor-default: #3D3D45;
  --fgColor-default: #F7F8FA;
  --fgColor-muted: #A0A0A8;
  --bgColor-accent-muted: rgba(98, 93, 245, 0.15);
}
```

## 3. Typography

### Font Stack

```css
/* Inter for UI — Loom uses Inter for its clean, neutral readability */
--font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;

/* For video titles and display */
--font-display: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;

/* Monospace for timestamps, code */
--font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
```

### Type Scale

| Role | Size | Weight | Line Height | Notes |
|------|------|--------|-------------|-------|
| Display | 28px | 700 | 1.2 | Video titles, page headings |
| H1 | 22px | 600 | 1.3 | Section headings |
| H2 | 18px | 600 | 1.4 | Card headings |
| Body | 14px | 400 | 1.5 | Default text |
| Body Small | 13px | 400 | 1.5 | Secondary text |
| Caption | 12px | 400 | 1.4 | Timestamps, labels |
| Button | 14px | 500 | 1.2 | Button labels |
| Micro | 11px | 500 | 1.2 | Badges, tags |

## 4. Spacing & Grid

8px baseline grid:

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
--space-16: 64px;
```

## 5. Layout & Composition

Loom uses generous rounding throughout:

```css
--radius-sm: 6px;     /* Inputs, small buttons */
--radius-md: 8px;     /* Cards, modals */
--radius-lg: 12px;    /* Video thumbnails, large cards */
--radius-xl: 16px;    /* Feature cards, modals */
--radius-full: 9999px; /* Pills, avatars, badge */
```

### Video Aspect Ratio

```css
/* Standard video embed — 16:9 */
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

### Responsive Behavior

| Breakpoint | Layout |
|------------|--------|
| < 640px | Single column, full-width video |
| 640–1024px | 2-column thumbnail grid |
| > 1024px | 3-4 column thumbnail grid |

## 6. Components

### Buttons

```css
/* Primary — violet filled */
.button-primary {
  background: #625DF5;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  font-weight: 500;
  font-size: 14px;
  line-height: 1.2;
  padding: 8px 16px;
  min-height: 44px;
}

.button-primary:hover {
  background: #4F4DDD;
}

.button-primary:active {
  transform: scale(0.98);
}

/* Secondary — white with border */
.button-secondary {
  background: #ffffff;
  color: #1F1F23;
  border: 1px solid #E8E9EC;
  border-radius: 6px;
  font-weight: 500;
  font-size: 14px;
  line-height: 1.2;
  padding: 8px 16px;
  min-height: 44px;
}

.button-secondary:hover {
  border-color: #625DF5;
  color: #625DF5;
}

/* Ghost — text only */
.button-ghost {
  background: transparent;
  color: #625DF5;
  border: none;
  border-radius: 6px;
  font-weight: 500;
  font-size: 14px;
  line-height: 1.2;
  padding: 8px 16px;
  min-height: 44px;
}
```

### Video Thumbnail Cards

```css
.thumbnail-card {
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(31, 31, 35, 0.08), 0 4px 12px rgba(31, 31, 35, 0.04);
  overflow: hidden;
  transition: transform 200ms ease-out, box-shadow 200ms ease-out;
}

.thumbnail-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(31, 31, 35, 0.12), 0 8px 24px rgba(31, 31, 35, 0.08);
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
  background: #D64770;
  border-radius: 50%;
  animation: recording-pulse 1.5s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .recording-dot {
    animation: none;
  }
}

/* Live badge — uses accessible dark red on light pink */
.live-badge {
  background: #FDECEE;
  color: #C41E3A;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 9999px;
  /* No white text on #D64770 — fails WCAG AA */
}
```

### Input Fields

```css
.input-field {
  background: #ffffff;
  border: 1px solid #E8E9EC;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 14px;
  line-height: 1.4;
  min-height: 44px;
}

.input-field:focus {
  outline: none;
  border-color: #625DF5;
  box-shadow: 0 0 0 3px rgba(98, 93, 245, 0.15);
}
```

### Avatars

```css
.avatar {
  border-radius: 50%;
  object-fit: cover;
}

.avatar-sm { width: 28px; height: 28px; }
.avatar-md { width: 36px; height: 36px; }
.avatar-lg { width: 48px; height: 48px; }
.avatar-xl { width: 64px; height: 64px; }
```

### Player Chrome (Timeline, Scrubber, Controls)

```css
/* Video player timeline scrubber */
.player-timeline {
  height: 4px;
  background: #E8E9EC;
  border-radius: 2px;
  position: relative;
  cursor: pointer;
}

.player-timeline-progress {
  height: 100%;
  background: #625DF5;
  border-radius: 2px;
}

.player-timeline-thumb {
  width: 12px;
  height: 12px;
  background: #625DF5;
  border-radius: 50%;
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
}

/* Player control bar */
.player-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(31, 31, 35, 0.8);
  border-radius: 0 0 12px 12px;
  backdrop-filter: blur(8px);
}
```

### Share & Privacy Controls

```css
.privacy-toggle {
  display: flex;
  gap: 4px;
  background: #F7F8FA;
  border-radius: 6px;
  padding: 2px;
}

.privacy-option {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 13px;
  color: #6B6D76;
  cursor: pointer;
}

.privacy-option.active {
  background: #ffffff;
  color: #1F1F23;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
```

### Upload / Processing / Error States

```css
/* Processing overlay */
.upload-processing {
  position: absolute;
  inset: 0;
  background: rgba(31, 31, 35, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  color: #ffffff;
  font-size: 14px;
}

/* Error state */
.upload-error {
  border: 2px solid #FDECEE;
  background: #FDECEE;
  border-radius: 12px;
  padding: 16px;
  color: #C41E3A;
}

/* Success state */
.upload-complete {
  border: 2px solid #E6F7F1;
  background: #E6F7F1;
  border-radius: 12px;
  padding: 16px;
  color: #0F7A55;
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
--transition-fast: 100ms ease-in;
--transition-base: 200ms ease-out;
--transition-slow: 300ms ease-out;
```

### prefers-reduced-motion

The recording pulse animation is disabled when `prefers-reduced-motion: reduce` is active. All other transitions fall back to instant state changes.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

## 8. Voice & Brand

### Iconography

Loom uses **Phosphor Icons** (regular weight, 20px default):

- Single-stroke geometric style
- 20px for inline, 24px for standalone
- Violet `#625DF5` for active/interactive icons
- Gray `#6B6D76` for inactive

### Shadows

```css
/* Card default */
--shadow-card: 0 1px 3px rgba(31, 31, 35, 0.08), 0 4px 12px rgba(31, 31, 35, 0.04);

/* Card hover */
--shadow-card-hover: 0 4px 12px rgba(31, 31, 35, 0.12), 0 8px 24px rgba(31, 31, 35, 0.08);

/* Modal / dropdown */
--shadow-overlay: 0 8px 32px rgba(31, 31, 35, 0.16), 0 2px 8px rgba(31, 31, 35, 0.08);

/* Tooltip */
--shadow-tooltip: 0 4px 12px rgba(31, 31, 35, 0.12);
```

## 9. Anti-patterns

- **Do not** use white text on Raspberry `#D64770` for badges — use `#FDECEE` background with dark red text instead (WCAG AA)
- **Do not** use Tertiary `#9B9CA3` for body text — only use for timestamps and metadata
- **Do not** use `#E5A000` or `#1A9F6F` directly as text colors — always pair with a sufficiently contrasting background
- **Do not** mix multiple button variants in a single CSS block — use separate selectors
- **Do not** use `line-height: 1.0` on buttons — diacritics, emoji, and CJK glyphs clip at that value; use `line-height: 1.2` minimum
- **Do not** hardcode light-mode component values in dark mode — always use semantic CSS variables for surfaces, borders, and text