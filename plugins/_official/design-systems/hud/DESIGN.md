# HUD Design System

> Category: Themed & Unique
> Fighter jet / helicopter head-up display. Phosphor green on near-black, all-caps data overlays, angular geometry. Zero ambiguity at speed and altitude.

## 1. Visual Theme & Atmosphere

A **combat pilot's glass cockpit** — everything readable in a split second, in any light condition, under any G-load. The HUD projects critical flight data directly into the pilot's line of sight so they never have to look down. Translucency and glow replace depth and shadow. Every element is functional or it doesn't exist.

| Element | Hex | Role |
|---------|-----|------|
| Background | `#0A0A0A` | Near-black, primary canvas |
| Surface | `#111316` | Elevated panels, card backgrounds |
| Border | `#1E2328` | Subtle panel separation |
| Primary | `#00FF41` | Active readouts, all data values |
| Secondary | `#7FFF00` | Standby/dimmed values, inactive fields |
| Tertiary | `#5A9A5A` | Grid lines, tick marks, reference arcs |
| Warning | `#FFB800` | Caution, system advisories |
| Alert | `#FF3B3B` | Critical warnings, fault indicators |

*Readings must be unambiguous at 200 knots in Instrument Meteorological Conditions.*

### Use Cases

HUD is purpose-built for:
- **Flight simulation UIs** — combat sims, civil aviation trainers, helicopter hoist operations
- **Telemetry dashboards** — real-time velocity, altitude, heading overlays
- **Command-and-control displays** — drone operator screens, ISR stations
- **Any high-speed, zero-ambiguity data overlay**

### Prior Art

F-16 Fighting Falcon HUD, Apache AH-64 attack helicopter integrated display, F-35 helmet-mounted display system, Garmin G1000 flight deck. All share: phosphor green primary, decluttered minimalism, and information hierarchy driven by operational urgency.

## 2. Color Palette & Roles

### Surface Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Background | `#0A0A0A` | Page canvas, primary depth |
| Surface | `#111316` | Panels, cards, elevated areas |
| Border | `#1E2328` | Panel dividers, subtle structure |

### Data Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Primary | `#00FF41` | Speed, altitude, heading readouts |
| Secondary | `#7FFF00` | Standby/dimmed values, inactive fields |
| Tertiary | `#5A9A5A` | Grid lines, tick marks, reference arcs |
| Warning | `#FFB800` | Caution, system advisories |
| Alert | `#FF3B3B` | Critical warnings, fault indicators |

All data colors on `#0A0A0A` pass WCAG AA (minimum 4.5:1).

### Dark Mode

Dark mode is the native and only mode. A HUD is projected in low-light or high-glare cockpit conditions; there is no light mode by design.

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

## 3. Typography Rules

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

## 4. Component Stylings

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

## 5. Layout Principles

HUDs are overlay systems — they display over a visual field. The layout is absolute-positioned overlays on a transparent or dark background. Information density is high; whitespace is used to separate data clusters, not for aesthetics.

Key structural patterns:
- Grid lines reference the center of the display (crosshair)
- Data readouts cluster by update frequency (altitude updates slower than airspeed)
- Warning states override all other information layers

## 6. Depth & Elevation

HUD overlays use opacity and glow rather than elevation shadows. Panels are distinguished by border color and subtle surface shifts, not drop shadows. The HUD exists in a single visual plane.

## 7. Do's and Don'ts

- Do not use tertiary `#5A9A5A` for body or readout text — only grid lines and reference marks
- Do not animate elements that do not signal operational state
- Do not provide a light mode — a HUD only exists in low-light or high-glare conditions
- Do not use rounded corners greater than 50% (circle reticles only)
- Do not use gradients — flat color fills only
- Do not convey information by color alone — reinforce with position and label

## 8. Responsive Behavior

HUD overlays are viewport-relative. On smaller viewports, data clusters compress proportionally. Critical readouts (speed, altitude, heading) remain visible at all sizes; secondary indicators hide or minimize. The layout uses a 12-column grid with absolute-positioned data panels anchored to screen edges.

## 9. Agent Prompt Guide

When generating a HUD-style interface, prompt the model to:
- Use JetBrains Mono for all data readouts; Inter (uppercase) for labels only
- Set `--data-primary` to `#00FF41` for all active readouts
- Apply 150ms ease-out for state transitions, 100ms linear for data value changes
- Include a status indicator component with active/standby/warning/alert states
- Ensure all text passes 4.5:1 contrast on `#0A0A0A`
- Never add decorative animation or light mode variants