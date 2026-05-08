# HUD Design System

> Category: Developer Tools
> Fighter jet / helicopter head-up display. Phosphor green on near-black, all-caps data overlays, angular geometry. Zero ambiguity at speed and altitude.

## 1. Visual Theme & Atmosphere

A **combat pilot's glass cockpit** — everything readable in a split second, in any light condition, under any G-load. The HUD projects critical flight data directly into the pilot's line of sight so they never have to look down. Translucency and glow replace depth and shadow. Every element is functional or it doesn't exist.

| Element | Hex | Role |
|---------|-----|------|
| Background | `#0A0A0A` | Near-black, primary canvas |
| Surface | `#111111` | Elevated data panels |
| Primary | `#00FF41` | Phosphor green — all primary readouts |
| Secondary | `#00D4FF` | Cyan — navigation, waypoints |
| Alert | `#FF3B3B` | Critical warnings, master caution |
| Warning | `#FFB800` | Caution, system advisories |
| Text Primary | `#00FF41` | All data readouts |
| Text Secondary | `#7FFF00` | Dimmed readouts, inactive fields |
| Text Tertiary | `#2D5A2D` | Grid lines, reference marks |

*Readings must be unambiguous at 200 knots in Instrument Meteorological Conditions.*

### Use Cases

HUD is purpose-built for:
- **Flight simulation UIs** — combat sims, civil aviation trainers, helicopter hoist operations
- **Telemetry dashboards** — real-time velocity, altitude, heading overlays
- **Command-and-control displays** — drone operator screens, ISR (intelligence, surveillance, reconnaissance) stations
- **Any high-speed, zero-ambiguity data overlay**

### Prior Art

F-16 Fighting Falcon HUD, Apache AH-64 attack helicopter integrated display, F-35 helmet-mounted display system, Garmin G1000 flight deck. All share: phosphor green primary, decluttered minimalism, and information hierarchy driven by operational urgency.

## 2. Color

### Surface Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Background | `#0A0A0A` | Primary canvas, HUD projection surface |
| Surface | `#111111` | Floating data panels, menus |
| Surface Glow | `#0D1F0D` | Subtle green glow beneath elements |

### Data Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Primary | `#00FF41` | Speed, altitude, heading readouts |
| Secondary | `#00D4FF` | Navigation waypoints, route ribbon |
| Alert Critical | `#FF3B3B` | Master caution, terrain, weapon status |
| Alert Warning | `#FFB800` | Caution, fuel low, system advisories |

All data colors on `#0A0A0A` pass WCAG AA (minimum 4.5:1).

### Text Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Primary | `#00FF41` | Active readouts |
| Secondary | `#7FFF00` | Standby / dimmed values |
| Tertiary | `#2D5A2D` | Grid lines, tick marks, reference arcs |

### Dark Mode

Dark mode is the native and only mode. A HUD is projected in low-light or high-glare cockpit conditions; there is no daylight mode by design.

```css
:root {
  --bg-default: #0A0A0A;
  --bg-surface: #111111;
  --bg-glow: #0D1F0D;
  --data-primary: #00FF41;
  --data-secondary: #00D4FF;
  --data-alert-critical: #FF3B3B;
  --data-alert-warning: #FFB800;
  --fg-primary: #00FF41;
  --fg-secondary: #7FFF00;
  --fg-tertiary: #2D5A2D;
}
```

## 3. Typography

### Font Stack

```css
/* Monospace for all readouts — critical data must be fixed-width */
--font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;

/* All-caps sans-serif for labels and mode announcements */
--font-display: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
```

### Type Scale

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
Mono: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace
```

## 4. Spacing

4px baseline grid. Tight internal spacing for data density; outer margins clear for scanability.

```css
--space-1: 4px;   --space-2: 8px;   --space-3: 12px;  --space-4: 16px;
--space-5: 20px;  --space-6: 24px;  --space-8: 32px;   --space-12: 48px;
```

## 5. Layout & Composition

### Grid System

Full-viewport overlay. Centered reticle with data banks above, below, left, and right. No gutters — the entire screen is the HUD canvas.

```css
/* Primary flight data bank — top center */
.flight-data-bank {
  position: absolute;
  top: var(--space-4);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
}

/* Reticle — center of screen */
.reticle {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 40px;
  height: 40px;
  border: 1px solid var(--data-primary);
  border-radius: 50%;
}
```

### Panel Structure

```css
/* Reticle is defined in the Grid System section above. */

.reticle-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 80px;
  height: 80px;
  border: 1px solid var(--fg-tertiary);
  border-radius: 50%;
  pointer-events: none;
}

.reticle-ring::before,
.reticle-ring::after {
  content: "";
  position: absolute;
  background: var(--fg-tertiary);
}

.reticle-ring::before {
  /* Horizontal line through center */
  top: 50%;
  left: -20px;
  right: -20px;
  height: 1px;
}

.reticle-ring::after {
  /* Vertical line through center */
  left: 50%;
  top: -20px;
  bottom: -20px;
  width: 1px;
}
```

## 6. Components

### Attitude Indicator

```css
/* Horizon line with bank angle reference */
.attitude-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 120px;
  height: 60px;
  border-top: 2px solid var(--data-primary);
  border-radius: 0 0 60px 60px;
}

.attitude-indicator-bank-tick {
  position: absolute;
  top: -6px;
  width: 1px;
  height: 6px;
  background: var(--fg-primary);
}
```

### Speed Tape

```css
/* Vertical speed indicator strip — left side */
.speed-tape {
  position: absolute;
  left: var(--space-6);
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  border: 1px solid var(--fg-tertiary);
  padding: var(--space-2) var(--space-2);
}

.speed-tape-current {
  font-family: var(--font-mono);
  font-size: 24px;
  font-weight: 700;
  color: var(--data-primary);
  text-align: center;
  line-height: 1.0;
}

.speed-tape-label {
  font-family: var(--font-display);
  font-size: 8px;
  font-weight: 700;
  color: var(--fg-tertiary);
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-top: 2px;
}

.speed-tape-tick {
  width: 100%;
  height: 1px;
  background: var(--fg-tertiary);
  margin: 2px 0;
}

.speed-tape-tick.major {
  background: var(--fg-secondary);
  height: 1px;
}
```

### Altitude Tape

```css
/* Vertical altitude indicator strip — right side */
.altitude-tape {
  position: absolute;
  right: var(--space-6);
  top: 50%;
  transform: translateY(-50%);
  width: 56px;
  border: 1px solid var(--fg-tertiary);
  padding: var(--space-2);
}

.altitude-tape-current {
  font-family: var(--font-mono);
  font-size: 24px;
  font-weight: 700;
  color: var(--data-primary);
  text-align: center;
  line-height: 1.0;
}

.altitude-tape-label {
  font-family: var(--font-display);
  font-size: 8px;
  font-weight: 700;
  color: var(--fg-tertiary);
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-top: 2px;
}
```

### Heading Ribbon

```css
/* Horizontal heading/scroll display — top center */
.heading-ribbon {
  position: absolute;
  top: var(--space-4);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-1) var(--space-4);
  border: 1px solid var(--fg-tertiary);
  background: rgba(10, 10, 10, 0.8);
}

.heading-ribbon-value {
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 700;
  color: var(--data-primary);
  min-width: 48px;
  text-align: center;
}

.heading-ribbon-label {
  font-family: var(--font-display);
  font-size: 8px;
  font-weight: 700;
  color: var(--fg-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.heading-ribbon-pointer {
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 6px solid var(--data-primary);
}
```

### Warning Box

```css
/* Master caution / critical alert */
.warning-box {
  position: absolute;
  bottom: var(--space-8);
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 59, 59, 0.1);
  border: 1px solid var(--data-alert-critical);
  padding: var(--space-2) var(--space-4);
}

.warning-box-text {
  font-family: var(--font-display);
  font-size: 12px;
  font-weight: 700;
  color: var(--data-alert-critical);
  text-transform: uppercase;
  letter-spacing: 0.15em;
  text-align: center;
}

.warning-box.flash {
  animation: warning-flash 0.5s ease-in-out infinite;
}

@keyframes warning-flash {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
```

### Compass Rose

```css
/* Full compass ring — center top */
.compass-rose {
  position: absolute;
  top: var(--space-8);
  left: 50%;
  transform: translateX(-50%);
  width: 160px;
  height: 20px;
  overflow: hidden;
  border: 1px solid var(--fg-tertiary);
}

.compass-rose-track {
  display: flex;
  align-items: center;
  height: 100%;
  gap: var(--space-3);
  padding: 0 var(--space-2);
}

.compass-rose-mark {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--fg-secondary);
  min-width: 24px;
  text-align: center;
}

.compass-rose-mark.cardinal {
  color: var(--fg-primary);
  font-weight: 700;
}

.compass-rose-center-line {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 1px;
  height: 100%;
  background: var(--data-primary);
}
```

## 7. Motion & Interaction

| Interaction | Duration | Easing | Effect |
|------------|----------|--------|--------|
| Value change | 100ms | ease-out | Number ticks up/down to new value |
| Warning flash | 500ms | ease-in-out | Opacity 1 ↔ 0.3 loop |
| Tape scroll | 150ms | linear | Vertical tape slides to new position |
| Reticle wobble | 200ms | ease-out | Subtle position offset on maneuver |
| Heading ribbon slide | 150ms | linear | Horizontal scroll to new heading |

```css
--transition-fast: 100ms ease-out;
--transition-base: 150ms linear;
--transition-slow: 200ms ease-out;
```

### prefers-reduced-motion

All animations are operational signals, not decoration. Replace with instant state changes.

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

None. A HUD has no icons — only text, numbers, and geometric outlines. Every symbol is a letter, number, or glyph rendered in the monospace font.

### Tone

- **Numeric**: Everything is a number or a letter. No prose.
- **Urgent**: Capital letters only. No explanations.
- **Absolute**: No qualifiers. "ALT" not "Altitude". "3000" not "three thousand feet".

### Visual Signals

Color is the only signal carrier. Green = nominal. Cyan = navigation. Amber = caution. Red = stop / immediately wrong.

## 9. Anti-patterns

- Do not use proportional fonts for any readout — all data must be monospace
- Do not use more than 4 colors — this is a precision instrument, not a palette
- Do not add decorative elements — borders and lines only appear if they carry information
- Do not animate elements that do not signal operational state
- Do not provide a light mode — a HUD only exists in low-light or high-glare conditions
- Do not use rounded corners greater than 50% (circle reticles only)
- Do not use low-contrast text — tertiary `#2D5A2D` is only for reference grid lines
- Do not use gradients — flat color fills only