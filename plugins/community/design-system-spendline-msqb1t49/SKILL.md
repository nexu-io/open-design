---
name: Spendline
description: A calm, decision-first FinOps workspace that keeps expenditure posture, evidence, and action in one operational system.
colors:
  fog-canvas: "#f6f7f9"
  white-plane: "#ffffff"
  blue-wash: "#eef4ff"
  midnight-ink: "#172033"
  slate-ink: "#3b4658"
  quiet-slate: "#6b7689"
  line: "#d8dee8"
  line-soft: "#edf1f6"
  action-blue: "#2563eb"
  action-blue-hover: "color-mix(in oklab, #2563eb, black 8%)"
  success-green: "#16a34a"
  warning-amber: "#f59e0b"
  danger-red: "#dc2626"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "clamp(30px, 3vw, 42px)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "clamp(22px, 2.5vw, 30px)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  control:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 650
    lineHeight: 1.5
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.05em"
  numeric:
    fontFamily: "SF Mono, ui-monospace, Menlo, monospace"
    fontSize: "clamp(22px, 2.1vw, 30px)"
    fontWeight: 720
    lineHeight: 1
    letterSpacing: "-0.04em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "18px"
  pill: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.white-plane}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "42px"
  button-primary-hover:
    backgroundColor: "{colors.action-blue-hover}"
    textColor: "{colors.white-plane}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "42px"
  button-secondary:
    backgroundColor: "{colors.white-plane}"
    textColor: "{colors.midnight-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "42px"
  button-secondary-hover:
    backgroundColor: "{colors.fog-canvas}"
    textColor: "{colors.midnight-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "42px"
  input:
    backgroundColor: "{colors.white-plane}"
    textColor: "{colors.midnight-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "42px"
  filter-chip:
    backgroundColor: "{colors.white-plane}"
    textColor: "{colors.quiet-slate}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "38px"
  filter-chip-active:
    backgroundColor: "{colors.fog-canvas}"
    textColor: "{colors.midnight-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "38px"
  panel:
    backgroundColor: "{colors.white-plane}"
    textColor: "{colors.midnight-ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  metric-card:
    backgroundColor: "{colors.white-plane}"
    textColor: "{colors.midnight-ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  nav-item-active:
    backgroundColor: "{colors.blue-wash}"
    textColor: "{colors.action-blue}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "44px"
  decision-banner:
    backgroundColor: "{colors.midnight-ink}"
    textColor: "{colors.white-plane}"
    rounded: "{rounded.lg}"
    padding: "24px"
---

# Design System: Spendline

## Overview

**Creative North Star: "The Decision Ledger"**

Spendline is a calm operational ledger for technology expenditure: cool neutral ground, white working planes, compact information, and one decisive blue action language. The interface feels analytical without becoming clinical. It keeps judgment in the foreground and lets charts, metrics, and source detail act as evidence rather than decoration.

Every major surface follows the same reading order: state the decision or verdict, establish posture, then expose the evidence and hand-off. Density is compact but never cramped; borders and spacing do most of the structural work, while restrained elevation is saved for transient layers. Semantic green, amber, and red make health and risk explicit without manufacturing urgency.

**Key Characteristics:**

- Decision-first hierarchy with verdicts ahead of supporting metrics.
- Cool neutral canvas and crisp white operational planes.
- Compact Inter interface copy paired with monospaced financial evidence.
- Blue reserved for action, selection, and evidence trajectories.
- Restrained depth, rounded product geometry, and explicit semantic states.
- Responsive workflows that reorganize rather than merely compress.

## Colors

The palette is a cool operational neutral field with a single action blue and tightly governed semantic state colors.

### Primary

- **Action Blue:** The only general-purpose accent; use it for primary actions, active navigation, text actions, focus, chart trajectories, and selected controls.

### Secondary

- **Success Green:** Confirms healthy connections, favourable variance, and on-plan outcomes.
- **Warning Amber:** Marks delayed inputs, narrowing headroom, and conditions requiring attention but not escalation.
- **Danger Red:** Identifies anomalies, adverse movement, and genuinely high-severity risk.

### Neutral

- **Fog Canvas:** The application ground and the hover or nested-surface fill.
- **White Plane:** The base for panels, controls, navigation, and readable operational surfaces.
- **Blue Wash:** The quiet selected-state plane behind active navigation and scenario totals.
- **Midnight Ink:** Primary text, brand mark, and the dark decision-banner field.
- **Slate Ink:** Secondary field labels where stronger contrast than muted copy is needed.
- **Quiet Slate:** Supporting copy, inactive navigation, chart labels, and neutral state text.
- **Line:** Standard control, shell, and divider boundary.
- **Soft Line:** Low-emphasis row separators and chart grids.

### Named Rules

**The One Blue Rule.** Blue communicates action, selection, focus, or plotted evidence; it is not a decorative wash across unrelated surfaces.

**The Semantic Honesty Rule.** Green, amber, and red only communicate an explicit success, warning, or danger state, and state meaning is reinforced with text rather than color alone.

## Typography

**Display Font:** Inter (with system-ui and sans-serif fallbacks)  
**Body Font:** Inter (with system-ui and sans-serif fallbacks)  
**Label/Mono Font:** SF Mono (with ui-monospace, Menlo, and monospace fallbacks)

**Character:** Inter keeps the interface compact, familiar, and quick to scan. The monospaced companion gives currency, percentages, dates, table numerals, and small metadata the precision of an auditable ledger.

### Hierarchy

- **Display** (700, fluid 30–42px, 1.12): Page titles; slightly tightened to hold a compact executive silhouette.
- **Headline** (700, fluid 22–30px, 1.15): Decision-banner verdicts and major outcome statements.
- **Title** (700, 18px, 1.25): Panel and empty-state headings.
- **Body** (400, 14px, 1.5): Default interface copy; explanatory lines stay near 65 characters where practical.
- **Control** (650, 14px, 1.5): Buttons, navigation, and filters where decisiveness matters more than display scale.
- **Label** (700, 12px, 0.05em tracking): Uppercase metric labels and dense table headers; use sentence case for field labels.
- **Numeric** (720, fluid 22–30px, 1): Primary financial values with tight tracking; smaller tabular figures retain the mono family.

### Named Rules

**The Numeric Evidence Rule.** Financial values, percentages, dates, chart axes, and dense metadata use the monospaced voice; explanatory language stays in Inter.

**The Compact Hierarchy Rule.** Scale changes are modest and weight does the remaining work; oversized marketing typography does not belong inside the application shell.

## Layout

The desktop shell uses a sticky 236px navigation rail and a flexible workspace. Content sits in a centred 1200px maximum container with fluid horizontal padding from 16px to 48px. The core rhythm follows a 4px base scale, with 16–24px gaps between related items and 24–32px separation between major page groups.

Operational surfaces use CSS grid: metrics form a five-column posture row with the lead metric spanning two columns, analysis pairs use an approximately 1.8:0.8 split, and supporting sections use two or three balanced columns. At 1120px the rail collapses to 78px and broad grids reduce to two columns. At 760px the rail becomes a sticky 60px header plus a fixed five-item bottom navigation; all content grids become single-column, filter rows scroll horizontally, and tables turn into labelled card rows instead of forcing desktop width.

**The Decision-First Rule.** On decision surfaces, the verdict precedes posture metrics and the evidence follows; do not lead with a generic KPI wall.

**The Reflow, Not Squeeze Rule.** Mobile changes information structure—stacked metrics, card tables, and persistent bottom navigation—rather than shrinking the desktop composition.

## Elevation & Depth

The system is flat by default. White panels are separated from the fog canvas by a one-pixel ring rather than a drop shadow. True elevation is reserved for transient layers: modals and toasts use a broad, low-opacity shadow, while modal backdrops combine a dark veil with subtle blur. Focus is rendered as a clear blue halo and never confused with ambient elevation.

### Shadow Vocabulary

- **Surface Ring** (`0 0 0 1px var(--border)`): The standard boundary for every resting panel.
- **Raised Overlay** (`0 16px 40px rgba(23, 32, 51, 0.10)`): Toasts and modal surfaces only.
- **Focus Halo** (`0 0 0 4px rgba(37, 99, 235, 0.22)`): Keyboard focus and active field focus.

### Named Rules

**The Ring Before Shadow Rule.** Routine product surfaces use tonal contrast and a one-pixel ring; broad shadows belong only to overlays that physically sit above the workspace.

## Shapes

Spendline uses gently rounded product geometry with three clear levels: small marks at 8px, controls and navigation at 12px, and primary panels or overlays at 18px. Pills are reserved for filters, status chips, and compact provenance labels. Thin borders clarify interactive boundaries, while list rows rely on soft horizontal separators. Circular forms are limited to state dots, chart endpoints, and the decorative arc inside the decision banner.

**The Three-Radius Rule.** Use 8px for compact marks, 12px for controls, and 18px for containing surfaces; do not introduce near-duplicate corner values.

**The Pill Has a Job Rule.** Fully rounded shapes identify filters, statuses, and small labels—not ordinary buttons, cards, or fields.

## Components

### Buttons

- **Shape:** Gently curved control (12px radius), at least 42px high, with 16px horizontal padding; icon-only buttons are 42px square.
- **Primary:** Action Blue fill, white text, and a matching border. Use once for the main commitment in a local decision context.
- **Hover / Focus:** Primary fill deepens slightly; all buttons use a fast 140ms state transition and the shared focus halo. Pressed buttons move down 1px. Disabled controls retain their structure at 52% opacity.
- **Secondary:** White fill, Midnight Ink text, and the standard line boundary; hover shifts to Fog Canvas and strengthens the border.
- **Text action:** Blue, borderless, and compact; hover adds an offset underline instead of a background block.

### Chips

- **Style:** Filter chips are 38px high white pills with Quiet Slate text and a standard line boundary. Status chips are smaller semantic pills with a faint tonal background and a leading state dot.
- **State:** Active filters move to Midnight Ink text, Fog Canvas, and a stronger boundary. Status color always accompanies a text label.

### Cards / Containers

- **Corner Style:** Primary panels use the large 18px radius; nested operational blocks use the medium 12px radius.
- **Background:** White Plane for primary panels, Fog Canvas for nested rows, and Blue Wash for selected or forecast summary surfaces.
- **Shadow Strategy:** Resting panels use the Surface Ring; only overlays use Raised Overlay.
- **Border:** Standard line for control boundaries, soft line for row divisions and chart grids.
- **Internal Padding:** 24px for standard panels and 20px for compact metric cards; mobile standard panels tighten to 20px.

### Inputs / Fields

- **Style:** White 42px fields with a standard line border, 12px radius, and 12px horizontal padding. Field labels are compact, strong, and left aligned.
- **Focus:** Border changes to Action Blue and the shared blue focus halo appears.
- **Error / Disabled:** Disabled fields retain layout and reduce to 52% opacity. Connection errors use a Danger status chip with explicit corrective copy.

### Navigation

Desktop navigation lives in the fixed white rail. Links are 44px high, medium-rounded, and weight 600; inactive items use Quiet Slate, hover shifts to Fog Canvas and Midnight Ink, and the active route uses Blue Wash with Action Blue text. The rail collapses to icons at tablet width. On phones, navigation moves to a translucent, blurred bottom bar with five equal destinations and a sticky white header for brand and page action.

### Metric Cards

Metric cards keep a fixed evidence order: uppercase label, large monospaced value, then comparison context with the delta aligned opposite. On phones the delta moves into a narrow right column so the card remains scannable without becoming tall.

### Decision Banner

The signature banner is a full-width Midnight Ink plane with white text, a single primary action, and one cropped blue circular arc. It states a decision, risk, or forecast verdict before lower-level evidence. The decoration remains subordinate and never carries data.

### Data Tables

Desktop tables use uppercase monospaced headers, tabular numeric alignment, soft row dividers, and a quiet hover fill. At phone width, headers disappear and each row becomes a two-column card whose values receive explicit generated labels; the primary service cell spans the full row.

### Motion & Feedback

State transitions use the standard 140ms timing; transient toast and scenario feedback use 220–320ms with a decisive cubic easing. Toasts rise from the lower edge and fade in. Forecast recalculation briefly lifts and tints the changed total. Reduced-motion preference collapses all transition and animation durations to effectively instantaneous feedback.

**The State Must Mean State Rule.** Color, motion, and active styling only appear in response to a real status, selection, focus, calculation, or user action.

## Do's and Don'ts

### Do:

- **Do** lead each decision surface with a clear verdict or action before supporting metrics and detail.
- **Do** preserve the 4px spacing rhythm and the established 8px, 12px, 18px, and pill shape roles.
- **Do** keep financial evidence monospaced and align comparable numeric values consistently.
- **Do** use text with every semantic color so health, delay, and danger remain explicit and accessible.
- **Do** recompose dense tables and grids into labelled mobile workflows below 760px.
- **Do** reserve broad elevation and backdrop blur for transient layers such as dialogs, toasts, and mobile navigation.

### Don't:

- **Don't** turn the product into a generic wall of equally weighted metrics or a decorative chart gallery.
- **Don't** use Action Blue as ambient decoration, or use semantic colors without a real state meaning.
- **Don't** add shadows to resting panels when the Surface Ring and tonal layering already establish structure.
- **Don't** introduce oversized display type, alternate body families, or proportional numerals for financial evidence.
- **Don't** create new near-match spacing or radius values when an established token serves the same role.
- **Don't** compress desktop tables into an unreadable horizontal viewport on phones; transform their structure.

## Provenance

Formalized by Open Design from candidate 1d5f45dd-a862-4d72-b258-5513d9eb3c24.
