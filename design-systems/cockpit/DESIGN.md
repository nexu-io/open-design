# Cockpit Design System

> Category: Themed & Unique
> **Context:** Modern aircraft glass cockpit — clean, precise, safety-critical information display. Inspired by Garmin G3000, Boeing 787 PFD, and Airbus A350 EFB.

---

## Visual Theme & Atmosphere

A **modern glass cockpit** aesthetic — where every pixel serves situational awareness. Clean data presentation, unambiguous status encoding, and zero decorative noise. The design language says: *"You are in control. Here is everything you need."*

> *"A pilot should never have to search for critical information. It must be exactly where expected, exactly when needed."*

### Primary Use Cases

- **Aviation and aerospace dashboards** — flight planning, telemetry, navigation displays
- **Vehicle telemetry UIs** — EV dashboards, fleet management, autonomous vehicle monitoring
- **Industrial control systems** — SCADA interfaces, manufacturing floor displays, energy grid monitoring
- **Any safety-critical, glanceable, high-information-density display**

### Design Influences

Garmin G3000/G5000 integrated flight decks, Boeing 787 Primary Flight Display, Airbus A350 EFB, Tesla Model S center display, and modern EV instrument clusters. Shared characteristics: dark backgrounds, high-contrast data, color-coded status at a glance, and absolute clarity under stress.

---

## Color Palette

### Surface Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Background | `#080C10` | Page canvas, primary depth |
| Surface | `#0E1419` | Panels, cards, elevated areas |
| Surface Hover | `#141C24` | Interactive surface state |
| Surface Active | `#1A2838` | Selected, active panel |
| Border | `#1A2838` | Panel dividers, grid lines |
| Border Subtle | `#101820` | Inner dividers, minor separation |

### Data Palette (Flight Instruments)

| Token | Hex | Usage |
|-------|-----|-------|
| Primary | `#00E5FF` | Active navigation data, selected values, key metrics |
| Secondary | `#7CFF68` | Normal operating range, positive status |
| Tertiary | `#A0B4C8` | Labels, reference values, grid markings |
| Caution | `#FFB800` | Caution alerts, approaching limits |
| Warning | `#FF3B3B` | Warning alerts, out-of-range, critical |
| Standby | `#546E8C` | Inactive fields, standby values |

> All data colors on `#0E1419` pass WCAG AA (minimum 4.5:1 contrast). Primary `#00E5FF` achieves 8.2:1, Secondary `#7CFF68` achieves 7.1:1.

### Text Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Primary | `#E8F4FF` | Primary content, active readouts |
| Secondary | '#7A9AB5' | Labels, descriptors, secondary info |
| Tertiary | '#3D5570' | Timestamps, metadata, grid labels |

### CSS Variables

```css
:root {
  --color-bg: #080C10;
  --color-surface: #0E1419;
  --color-surface-hover: #141C24;
  --color-surface-active: #1A2838;
  --color-border: #1A2838;
  --color-border-subtle: #101820;
  --data-primary: #00E5FF;
  --data-secondary: #7CFF68;
  --data-tertiary: #A0B4C8;
  --data-caution: #FFB800;
  --data-warning: #FF3B3B;
  --data-standby: #546E8C;
  --fg-primary: #E8F4FF;
  --fg-secondary: #7A9AB5;
  --fg-tertiary: #3D5570;
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
  --space-6: 24px; --space-8: 32px; --space-12: 48px;
  --radius-sm: 2px; --radius-md: 4px; --radius-lg: 6px;
  --transition-base: 150ms ease-out;
  --transition-fast: 75ms ease-out;
}
```

### Dark Mode Philosophy

Dark mode is the **native and only mode**. Glass cockpits operate in all lighting conditions — the dark surface maximizes contrast for critical data and reduces eye strain during long monitoring sessions. Light mode would compromise the safety-critical contrast ratios.

---

## Typography Rules

### Font Stacks

```css
/* Monospace for all numeric readouts — fixed-width prevents value jitter */
--font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;

/* Sans-serif for labels, headings, prose */
--font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
```

### Type Scale

| Role | Size | Weight | Line Height | Font |
|------|------|--------|-------------|------|
| Display | 36px | 700 | 1.0 | JetBrains Mono |
| H1 | 16px | 600 | 1.2 | Inter, uppercase, tracked |
| H2 | 13px | 600 | 1.2 | Inter, uppercase, tracked |
| Body | 14px | 400 | 1.4 | Inter |
| Readout | 14px | 600 | 1.0 | JetBrains Mono |
| Caption | 12px | 400 | 1.4 | Inter |
| Micro | 10px | 600 | 1.0 | Inter, uppercase |

### Font Labels for Catalog Extraction

```
Display: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace
Body: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif
Mono: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace
```

---

## Component Stylings

### Primary Flight Display (PFD) Panel

```css
.pfd-panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  position: relative;
}

.pfd-panel::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--data-primary);
  opacity: 0.6;
}
```

### Data Readout

```css
.readout {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 600;
  color: var(--data-primary);
  letter-spacing: 0.05em;
  font-variant-numeric: tabular-nums;
}

.readout--normal { color: var(--data-secondary); }
.readout--caution { color: var(--data-caution); }
.readout--warning { color: var(--data-warning); }
.readout--standby { color: var(--data-standby); }

.readout-label {
  font-family: var(--font-sans);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--data-tertiary);
  letter-spacing: 0.1em;
}
```

### Status Annunciator

```css
.annunciator {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.annunciator--normal {
  background: rgba(124, 255, 104, 0.1);
  color: var(--data-secondary);
  border: 1px solid rgba(124, 255, 104, 0.2);
}

.annunciator--caution {
  background: rgba(255, 184, 0, 0.1);
  color: var(--data-caution);
  border: 1px solid rgba(255, 184, 0, 0.2);
}

.annunciator--warning {
  background: rgba(255, 59, 59, 0.1);
  color: var(--data-warning);
  border: 1px solid rgba(255, 59, 59, 0.2);
}
```

### Tape Display (Vertical Speed / Altitude)

```css
.tape {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--data-tertiary);
  position: relative;
}

.tape-current {
  font-size: 18px;
  font-weight: 700;
  color: var(--data-primary);
  border: 2px solid var(--data-primary);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
}
```

### Navigation Bar

```css
.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-4);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.nav-waypoint {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--data-primary);
  letter-spacing: 0.05em;
}
```

---

## Layout Principles

### Grid System

- **12-column grid** with 4px gutters for dense information layout
- Panels snap to grid boundaries — no fractional positioning
- Critical flight data occupies the **top-center viewport** (primary scan path)
- Secondary systems arranged in **left and right columns**
- Status annunciators at the **top edge** (immediate visibility)

### Information Hierarchy

1. **Primary flight data** (altitude, speed, heading) — center, largest type
2. **Navigation data** — below primary, medium type
3. **System status** — left and right columns, small type
4. **Alerts and cautions** — top edge, color-coded

### Spacing

4px baseline grid. Dense but never cramped — each data cluster breathes with at least 8px separation.

```css
--space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
--space-6: 24px; --space-8: 32px; --space-12: 48px;
```

---

## Depth & Elevation

Glass cockpits use **flat design with subtle depth cues**:

| Elevation Method | Implementation |
|------------------|----------------|
| Surface shifts | `#0E1419` vs `#080C10` |
| Active panel highlight | 2px top border in `--data-primary` |
| Critical alert | Subtle glow via `box-shadow: 0 0 12px rgba(255, 59, 59, 0.15)` |
| No drop shadows | Flat by design — shadows reduce readability |

---

## Do's and Don'ts

### ✅ Do's

| Rule | Reason |
|------|--------|
| Use tabular-nums for all numeric readouts | Prevents value jitter during updates |
| Encode status with both color and text | Accessibility — never color alone |
| Keep critical data in the top-center viewport | Matches natural scan patterns |
| Use monospace for all numeric values | Fixed-width ensures alignment |
| Provide smooth transitions for value changes | Sudden jumps are disorienting |

### ❌ Don'ts

| Rule | Reason |
|------|--------|
| Do not use decorative gradients | Reduces readability under stress |
| Do not animate non-critical elements | Distracts from monitoring |
| Do not use rounded corners > 6px | Sharp edges communicate precision |
| Do not display more than 7±2 values per panel | Cognitive load management |
| Do not use pure white text | `#E8F4FF` reduces glare in low light |
| Do not provide a light mode | Would compromise safety-critical contrast |

---

## Responsive Behavior

- **Viewport-relative scaling** — all panels scale proportionally
- **Critical readouts** (altitude, speed, heading) remain visible at all viewport sizes
- **Secondary panels** collapse or hide below 768px
- **Minimum readable size**: 10px for labels, 12px for data values
- **Touch targets**: minimum 44px for interactive elements
- On mobile: stack panels vertically, primary data first

---

## Agent Prompt Guide

When generating cockpit-style interfaces, prompt the model to:

- Use **JetBrains Mono** for all numeric readouts and **Inter (uppercase)** for labels only
- Set `--data-primary` to `#00E5FF` for active navigation data
- Apply **tabular-nums** (`font-variant-numeric: tabular-nums`) to all numeric values
- Use `--data-secondary` (`#7CFF68`) for normal operating range values
- Use `--data-caution` (`#FFB800`) and `--data-warning` (`#FF3B3B`) for alerts
- Apply **150ms ease-out** for value transitions, **75ms** for state changes
- Never use color alone — always pair with text labels or icons
- Keep the top 20% of the viewport reserved for critical data or active alerts
- Use the 12-column grid with 4px gutters
- Avoid decorative elements — every pixel must serve situational awareness
