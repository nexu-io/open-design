# Mission Control Design System

> Category: Developer Tools
> Space/aerospace mission monitoring. Dark command center, amber telemetry, monospace precision. Functional clarity above all else.

## 1. Visual Theme & Atmosphere

A **deep space command center** — dark, information-dense, unambiguous. Every pixel earns its place. The aesthetic draws from NASA mission control rooms, SpaceX launch consoles, and ISRO's mission operations complex. Amber data on navy is the core contrast pair; everything else is subdued.

| Element | Hex | Role |
|---------|-----|------|
| Background | `#0B1120` | Deep space navy, primary canvas |
| Surface | `#111827` | Elevated panels, cards |
| Surface Hover | `#1A2535` | Interactive surface hover |
| Border | `#1E3A5F` | Panel dividers, subtle structure |
| Primary Data | `#FFB800` | Telemetry values, key metrics |
| Accent | `#00D4FF` | Active/healthy indicators |
| Alert | `#FF4757` | Critical warnings, errors |
| Text Primary | `#E8F0FE` | High-contrast readable text |
| Text Secondary | `#8BA3C7` | Labels, secondary information |
| Text Tertiary | `#4A6080` | Timestamps, metadata |

*Every readout must be readable at 3 meters in low light by someone who hasn't slept in 18 hours.*

### Use Cases

Mission Control is purpose-built for:
- **Operations dashboards** — real-time system health, infrastructure monitoring, on-call status boards
- **Build and deploy status screens** — CI/CD pipelines, release coordination, incident response
- **Real-time monitoring UIs** — telemetry aggregation, sensor networks, financial data feeds
- **Any information-dense, low-light, high-stakes display**

### Prior Art

NASA Mission Control (Houston), ISRO ISTRAC, SpaceX Falcon/Dragon consoles, ESA ESOC — all share amber-on-navy telemetry, monospace data fields, and hierarchical alert systems. The shared constraints (low light, fatigue, split-second decisions) drive convergent design.

## 2. Color

### Surface Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Background | `#0B1120` | Page canvas, primary depth |
| Surface | `#111827` | Panels, cards, elevated areas |
| Surface Hover | `#1A2535` | Interactive surface state |
| Surface Active | `#1E3A5F` | Selected, active panel |
| Border | `#1E3A5F` | Panel dividers, grid lines |
| Border Subtle | `#162035` | Inner dividers, minor separation |

### Data Palette (telemetry values)

| Token | Hex | Usage |
|-------|-----|-------|
| Primary | `#FFB800` | Primary telemetry values, key metrics |
| Secondary | `#00D4FF` | Healthy/active indicators, links |
| Alert Critical | `#FF4757` | Errors, critical alerts, abort states |
| Alert Warning | `#FF9F43` | Warnings, degraded performance |
| Success | `#26DE81` | Nominal status, completed actions |

All data colors on `#111827` pass WCAG AA (minimum 4.5:1).

### Text Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Primary | `#E8F0FE` | Readable at distance, primary content |
| Secondary | `#8BA3C7` | Labels, descriptors |
| Tertiary | `#4A6080` | Timestamps, metadata, grid labels |

### Dark Mode

Dark mode is the native mode. No light mode variant by design — mission control environments are always low-light (ISRO ISTRAC, NASA FDO, SpaceX launch consoles all run dark). daytime operations centers with high ambient light are outside scope for v1; a light mode adaptation would require rethinking the full semantic color layer.

```css
:root {
  --bg-default: #0B1120;
  --bg-surface: #111827;
  --bg-surface-hover: #1A2535;
  --bg-surface-active: #1E3A5F;
  --border-default: #1E3A5F;
  --border-subtle: #162035;
  --data-primary: #FFB800;
  --data-secondary: #00D4FF;
  --data-alert-critical: #FF4757;
  --data-alert-warning: #FF9F43;
  --data-success: #26DE81;
  --fg-primary: #E8F0FE;
  --fg-secondary: #8BA3C7;
  --fg-tertiary: #4A6080;
}
```

## 3. Typography

### Font Stack

```css
/* Monospace for all data readouts — consistency at speed */
--font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;

/* Sans-serif for labels, navigation, prose */
--font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
```

### Type Scale

| Role | Size | Weight | Line Height | Font |
|------|------|--------|-------------|------|
| Display | 48px | 700 | 1.0 | JetBrains Mono |
| H1 | 18px | 600 | 1.2 | Inter |
| H2 | 13px | 600 | 1.2 | Inter, uppercase, tracked |
| Body | 14px | 400 | 1.5 | Inter |
| Caption | 12px | 400 | 1.4 | Inter |
| Micro | 10px | 600 | 1.0 | Inter, uppercase |

**Font labels for catalog extraction:**

```
Display: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace
Body: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif
Mono: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace
```

## 4. Spacing

4px baseline grid for dense telemetry layouts. 8px for outer padding, 16px+ for section gaps.

```css
--space-1: 4px;   --space-2: 8px;   --space-3: 12px;  --space-4: 16px;
--space-5: 20px;  --space-6: 24px;  --space-8: 32px;   --space-12: 48px;
--space-16: 64px; --space-20: 80px;
```

## 5. Layout & Composition

### Grid System

12-column grid, 4px gutters. Dense information layout — no wasted whitespace, but clear visual grouping.

```css
/* Standard panel: spans 3, 4, or 6 columns */
.panel {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  padding: var(--space-4);
}

/* Full-width telemetry strip */
.telemetry-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-2);
}
```

### Panel Structure

```css
/* .panel base styles are defined in the Grid System section above. */

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--border-subtle);
}

.panel-title {
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--fg-secondary);
}
```

## 6. Components

### Status Badge

```css
/* Nominal — green, all clear */
.badge-nominal {
  background: rgba(38, 222, 129, 0.15);
  color: #26DE81;
  border: 1px solid rgba(38, 222, 129, 0.3);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  border-radius: 2px;
}

/* Warning — amber, attention needed */
.badge-warning {
  background: rgba(255, 159, 67, 0.15);
  color: #FF9F43;
  border: 1px solid rgba(255, 159, 67, 0.3);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  border-radius: 2px;
}

/* Critical — red, immediate action */
.badge-critical {
  background: rgba(255, 71, 87, 0.15);
  color: #FF4757;
  border: 1px solid rgba(255, 71, 87, 0.3);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  border-radius: 2px;
}
```

### Data Tile

```css
/* Single metric display */
.data-tile {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  padding: var(--space-3);
}

.data-tile-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--fg-secondary);
  margin-bottom: var(--space-1);
}

.data-tile-value {
  font-family: var(--font-mono);
  font-size: 24px;
  font-weight: 700;
  color: var(--data-primary);
  line-height: 1.0;
}

.data-tile-unit {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 400;
  color: var(--fg-tertiary);
  margin-left: 4px;
}
```

### Countdown Timer

```css
/* T-minus / T-plus display */
.countdown {
  font-family: var(--font-mono);
  font-size: 48px;
  font-weight: 700;
  color: var(--data-primary);
  line-height: 1.0;
  letter-spacing: -0.02em;
}

.countdown-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--fg-tertiary);
}

/* Positive delta (T+) — time after event */
.countdown.positive { color: var(--data-success); }

/* At T-0 */
.countdown.zero { color: var(--data-secondary); animation: pulse-glow 2s ease-in-out infinite; }

@keyframes pulse-glow {
  0%, 100% { text-shadow: 0 0 8px currentColor; }
  50% { text-shadow: 0 0 20px currentColor, 0 0 40px currentColor; }
}
```

### Signal Strength Indicator

```css
/* Vertical bar signal meter */
.signal-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 20px;
}

.signal-bar {
  width: 4px;
  background: var(--border-default);
  border-radius: 1px;
}

.signal-bar.active.weak    { background: var(--data-alert-warning); }
.signal-bar.active.moderate { background: var(--data-primary); }
.signal-bar.active.strong  { background: var(--data-secondary); }

.signal-bar:nth-child(1) { height: 5px; }
.signal-bar:nth-child(2) { height: 8px; }
.signal-bar:nth-child(3) { height: 12px; }
.signal-bar:nth-child(4) { height: 16px; }
```

### Alert Banner

```css
/* Full-width critical alert */
.alert-banner {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  background: rgba(255, 71, 87, 0.1);
  border: 1px solid rgba(255, 71, 87, 0.4);
  border-left: 4px solid #FF4757;
  border-radius: 4px;
  padding: var(--space-3) var(--space-4);
}

.alert-banner-icon {
  color: #FF4757;
  flex-shrink: 0;
}

.alert-banner-text {
  font-size: 14px;
  font-weight: 500;
  color: #FF4757;
}

.alert-banner-time {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-tertiary);
  margin-left: auto;
  flex-shrink: 0;
}
```

### Coordinate Display

```css
/* Latitude / Longitude / Altitude readout */
.coordinate {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--data-secondary);
}

.coordinate-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--fg-tertiary);
  margin-bottom: 2px;
}
```

### Progress Bar

```css
/* Mission phase / upload / loading progress */
.progress-bar {
  height: 4px;
  background: var(--border-default);
  border-radius: 2px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: var(--data-secondary);
  border-radius: 2px;
  transition: width 300ms ease-out;
}

.progress-bar-fill.warning { background: var(--data-alert-warning); }
.progress-bar-fill.critical { background: var(--data-alert-critical); }
```

### Telemetry Chart Line

```css
/* Sparkline chart for data over time */
.telemetry-chart {
  height: 40px;
  display: flex;
  align-items: flex-end;
  gap: 1px;
}

.telemetry-chart-bar {
  flex: 1;
  background: var(--data-primary);
  border-radius: 1px 1px 0 0;
  min-width: 2px;
}

.telemetry-chart-bar.alert { background: var(--data-alert-critical); }
.telemetry-chart-bar.warning { background: var(--data-alert-warning); }
```

## 7. Motion & Interaction

| Interaction | Duration | Easing | Effect |
|-------------|----------|--------|--------|
| Alert pulse | 2s | ease-in-out | Glow intensity oscillation (loop) |
| Panel appear | 200ms | ease-out | Opacity 0→1 |
| Value change | 150ms | ease-out | Background flash on new data |
| Progress fill | 300ms | ease-out | Width transition |
| Hover state | 100ms | ease-in | Border color brightens |

```css
--transition-fast: 100ms ease-in;
--transition-base: 150ms ease-out;
--transition-slow: 300ms ease-out;
```

### prefers-reduced-motion

Static environments are common in mission control. Replace all animations with instant state changes.

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

Minimal, functional iconography — Lucide icons (stroke weight 1.5px, 16px default). No decorative icons. Every icon must communicate operational state.

### Tone

- **Precise**: Data-first, no marketing language
- **Sparse**: The UI speaks through values and color, not prose
- **Hierarchical**: Visual urgency maps directly to operational urgency

### Visual Signals

Color is the primary signal carrier. Every color choice must communicate operational state — never decorative.

## 9. Anti-patterns

- Do not use decorative colors in data displays — every hue must convey operational meaning
- Do not use rounded corners > 4px — mission control is functional, not friendly
- Do not use proportional fonts for telemetry values — use monospace exclusively for data
- Do not animate non-alert elements — motion is reserved for signals that matter
- Do not use light mode — low-light environments are the only context
- Do not use low-contrast text on dark backgrounds — tertiary `#4A6080` is only for non-critical metadata (timestamps, grid labels)