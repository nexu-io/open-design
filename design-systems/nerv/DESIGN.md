# NERV Design System

> Category: Themed & Unique

A normalized Open Design package derived from the NERV library in a TRAE Work built-in design-library export. It is a brand-referencing implementation guide, not an official asset package.

## Visual Direction

- Primary accent is hot alert red `#ea343a` in the base theme and flips to pink `#ff99cc` in dark mode; Nerv should feel urgent and synthetic, not calm or corporate.
- Core surfaces stay nearly black: background `#0f0f10`, card `#111112`, sidebar `#1a1a1a`; darker alternate surfaces shift to `#181c25` and `#2e3537` to keep the dashboard nocturnal.
- Radius is `1.65rem` (`26.4px`) everywhere important; the system is intentionally oversized and softened to create a sci-fi console silhouette instead of hard enterprise corners.
- Spacing starts at `0.28rem` (`4.48px`); default layouts should feel compact, operational, and data-dense rather than roomy or editorial.
- Fonts are explicit: `Geist` for interface copy, `Aleo` for serif contrast moments, and `Roboto Mono` for telemetry, metrics, and technical labels.
- Shadows stay whisper-light and close to the plane: `0 2px 6px` with `0.05-0.10` opacity; elevation exists, but it should never make panels feel fluffy or card-heavy.
- Data color is deliberately electric: `#5938ff`, `#94bdff`, `#e070ff`, and `#dbf4ff` support charts in the base palette, while dark mode adds `#14eb14`, `#73d6ff`, `#ffff00`, and `#ffcc00` for vivid signal contrast.
- Navigation is a signature pattern: dark rails pair with `sidebar-primary` pink `#ffc0cb` or `#ff99cc`, plus cyan accent `#73d6ff`, to mark active hierarchy with immediate scanability.
- Voice is terse, technical, and English-only; copy should sound like “Signal Load,” “Threat Index,” “Live Alerts,” and “Control Grid,” with no emoji, jokes, or consumer-app warmth.

## Color Roles

- **Canvas:** `rgb(15, 15, 16)` → `--bg`.
- **Surface:** `rgb(17, 17, 18)` → `--surface`.
- **Primary text:** `rgb(244, 249, 255)` → `--fg`.
- **Muted text:** `rgb(244, 249, 255)` → `--muted`.
- **Accent:** `rgb(234, 52, 58)` → `--accent`.
- **Border:** `rgb(48, 49, 54)` → `--border`.
- **Danger:** `rgb(255, 52, 52)` → `--danger`.

Use only the semantic names in `tokens.css` in generated work. Raw color literals belong only in that token block.

## Typography

- Fonts are explicit: `Geist` for interface copy, `Aleo` for serif contrast moments, and `Roboto Mono` for telemetry, metrics, and technical labels.

## Spacing and Layout

- Radius is `1.65rem` (`26.4px`) everywhere important; the system is intentionally oversized and softened to create a sci-fi console silhouette instead of hard enterprise corners.
- Spacing starts at `0.28rem` (`4.48px`); default layouts should feel compact, operational, and data-dense rather than roomy or editorial.
- Voice is terse, technical, and English-only; copy should sound like “Signal Load,” “Threat Index,” “Live Alerts,” and “Control Grid,” with no emoji, jokes, or consumer-app warmth.

## Component Inventory

- **Button** (Actions): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Card** (Containers): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Table** (Data Display): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Chart** (Data Visualization): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Navigation** (Navigation): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Sidebar** (Navigation): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.

The DS 3.0 runtime exposes Button, Field, Surface, and Status as the shared intent-routing primitives. Reuse their returned implementation and selectors for mapped intents.

## Interaction States

- Navigation is a signature pattern: dark rails pair with `sidebar-primary` pink `#ffc0cb` or `#ff99cc`, plus cyan accent `#73d6ff`, to mark active hierarchy with immediate scanability.

## Motion

- Use `--motion-fast` for hover and focus feedback and `--motion-base` for state changes.
- Prefer short ease-out transitions; remove non-essential motion when reduced motion is requested.

## Accessibility

- Fonts are explicit: `Geist` for interface copy, `Aleo` for serif contrast moments, and `Roboto Mono` for telemetry, metrics, and technical labels.
- Data color is deliberately electric: `#5938ff`, `#94bdff`, `#e070ff`, and `#dbf4ff` support charts in the base palette, while dark mode adds `#14eb14`, `#73d6ff`, `#ffff00`, and `#ffcc00` for vivid signal contrast.

## Avoid

- Shadows stay whisper-light and close to the plane: `0 2px 6px` with `0.05-0.10` opacity; elevation exists, but it should never make panels feel fluffy or card-heavy.
