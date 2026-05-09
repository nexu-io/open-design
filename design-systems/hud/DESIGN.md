# HUD Design System

> Category: Themed & Unique

## 1. Concept & Vision

A military/aerospace heads-up display with a dark glass cockpit aesthetic. Green phosphor readouts on near-black surfaces evoke fighter jet instrument panels — high contrast for split-second readability at 200 knots in Instrument Meteorological Conditions. Every element communicates operational state without decoration.

## 2. Design Language

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Background | `#0A0A0A` | Near-black, primary canvas |
| Surface | `#111316` | Elevated panels, card backgrounds |
| Border | `#1E2328` | Subtle panel separation |
| Primary | `#00FF41` | Active readouts, all data values |
| Secondary | `#7FFF00` | Standby/dimmed values, inactive fields |
| Tertiary | `#5A9A5A` | Grid lines, tick marks, reference arcs |
| Warning | `#FFB800` | Caution, system advisories |
| Alert | `#FF3B3B` | Critical warnings, fault indicators |

### Dark Mode

Fully dark only. A HUD does not have a light mode — it exists for low-light and high-glare conditions.

```css
:root {
  --color-bg: #0A0A0A;
  --color-surface: #111316;
  --color-border: #1E2328;
  --data-primary: #00FF41;
  --data-secondary: #7FFF00;
  --data-tertiary: #5A9A5A;
  --data-warning: #FFB800;
  --data-alert: #FF3B3B;
}
```

### Typography

| Role | Size | Weight | Line Height | Font |
|------|------|--------|-------------|------|
| Display | 32px | 700 | 1.0 | JetBrains Mono |
| Heading | 12px | 700 | 1.0 | Inter, uppercase |
| Body | 14px | 400 | 1.2 | JetBrains Mono |
| Label | 10px | 600 | 1.0 | Inter, uppercase |
| Micro | 8px | 700 | 1.0 | Inter, uppercase |

**Font labels for catalog extraction:**

```
Display: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace
Body: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace
Heading: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif
Label: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif
Micro: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif
Mono: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace
```

### Spacing

8px baseline grid.

```css
:root {
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-6: 24px; --space-8: 32px; --space-12: 48px;
}
```

### Motion

Functional only. No decorative animation.

- State transitions: 150ms ease-out
- Panel reveals: 200ms ease-out
- Data value changes: 100ms linear (immediate feedback)

## 3. Layout & Structure

HUDs are overlay systems — they display over a visual field. The layout is absolute-positioned overlays on a transparent or dark background. Information density is high; whitespace is used to separate data clusters, not for aesthetics.

Key structural patterns:
- Grid lines reference the center of the display (crosshair)
- Data readouts cluster by update frequency (altitude updates slower than airspeed)
- Warning states override all other information layers

## 4. Components

### Data Readout

Displays a single data value with label. Always uses `--data-primary` color.

```css
.data-readout {
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  font-weight: 700;
  color: var(--data-primary);
  letter-spacing: 0.05em;
}
.data-readout-label {
  font-family: 'Inter', sans-serif;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--data-tertiary);
  letter-spacing: 0.1em;
}
```

### Status Indicator

Dot or bar that reflects system state. Colors map to operational states.

```css
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--data-primary); /* active */
}
.status-dot.standby { background: var(--data-secondary); }
.status-dot.warning { background: var(--data-warning); }
.status-dot.alert   { background: var(--data-alert); }
```

### Grid Lines

Reference marks for spatial orientation. Thin lines in `--data-tertiary`.

## 5. Accessibility

- All data text meets WCAG AA 4.5:1 minimum contrast against background
- Primary data (#00FF41) on #0A0A0A: 16.1:1
- Secondary (#7FFF00) on #0A0A0A: 15.4:1
- Tertiary (#5A9A5A) on #0A0A0A: 4.7:1 (grid lines only, not text)
- Warning (#FFB800) on #0A0A0A: 9.6:1
- No information is conveyed by color alone — state is reinforced by position and label

## 6. Anti-patterns

- Do not use tertiary `#5A9A5A` for body or readout text — only grid lines and reference marks
- Do not animate elements that do not signal operational state
- Do not provide a light mode — a HUD only exists in low-light or high-glare conditions
- Do not use rounded corners greater than 50% (circle reticles only)
- Do not use gradients — flat color fills only