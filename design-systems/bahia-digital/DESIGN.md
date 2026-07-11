# Bahía Digital

> Category: Brand
> Coastal digital brand system: luminous bay light, sea-ink text, teal bay
> accent, sand-warm surfaces. Serif display over a humanist body — calm,
> civic, and trustworthy, like a harbor town at mid-morning.

## Visual Theme & Atmosphere
Open, luminous, unhurried. The system evokes a bay at mid-morning: a
salt-white canvas, deep sea-ink text, one teal accent that reads like deep
water, and a warm sand tier for grounded, tactile moments. Generous
whitespace stands in for horizon; nothing is cramped, nothing shouts.

## Color Palette & Roles
- **Background:** `#F8F7F3` (sea salt) — page canvas, never pure white
- **Surface:** `#FFFFFF` — cards, modals, lifted containers
- **Surface warm:** `#F0EBE0` (sand) — quiet fills, secondary buttons, asides
- **Foreground:** `#14333C` (sea ink) — primary text
- **Foreground 2:** `#2A5361` — secondary text tier, subheads
- **Muted:** `#61787F` (coastal slate) — captions, secondary labels
- **Border:** `#DFE5E2`; **Border soft:** `#EBEFEC` — row separators
- **Accent:** `#0E7490` (bay teal) — primary CTAs, links, one hero element per screen
- **Success:** `#15803D`, **Warn:** `#B45309`, **Danger:** `#B91C1C`
Never pure black; never pure white for the page background. Semantic colors
are reserved for state, not decoration.

## Typography Rules
- **Display / headings:** `'Fraunces', 'Georgia', serif`, weight 550–620
- **Body:** `'Inter', -apple-system, system-ui, sans-serif`, weight 400
- **Mono:** `ui-monospace, 'JetBrains Mono', monospace`
- Scale (px): 12 · 14 · 16 · 20 · 24 · 34 · 50 · 68
- Line-height: 1.55 for body, 1.15 for headings
- Letter-spacing: -0.015em on display sizes ≥34px
- Eyebrows: 12px uppercase, coastal slate, +0.08em tracking

## Component Stylings
- **Buttons:** 10px radius, 10px padding-block, 18px padding-inline. Primary = bay-teal fill, white label. Secondary = sand fill, sea-ink label, no border.
- **Cards:** white surface, 1px soft border, 16px radius, 24px internal padding, flat by default; raised shadow only when floating.
- **Inputs:** 1px border, 10px radius, 10px vertical padding, bay-teal border plus focus ring on focus.
- **Links:** bay teal, no underline at rest, underline on hover.
- **Badges:** pill radius, sand fill for neutral, tinted fills for semantic states.

## Layout Principles
- 12-column grid, 1160px max-width, 24px gutters.
- Hero: 45–60vh, content top-biased, one display heading + one CTA.
- Sections: 96px top+bottom desktop, 64px tablet, 40px phone.
- Whitespace is the primary separator; soft borders only inside components,
  full-width dividers only between unrelated top-level sections.

## Depth & Elevation
Three levels only:
- **Flat (0):** default for everything on the canvas.
- **Ring:** 1px hairline box-shadow for edges that must not shift layout.
- **Raised:** dropdowns, modals, floating elements — 6px y-offset, 24px blur,
  sea ink at 10% opacity, like haze over water.
No neumorphism, no glassmorphism, no stacked shadows.

## Do's and Don'ts
- ✅ Let the canvas breathe — horizon-wide whitespace between sections.
- ✅ One bay-teal hero element and at most one teal CTA per screen.
- ✅ Use the sand tier for secondary emphasis instead of a second accent.
- ✅ Sentence-case headings; title case only for the brand name.
- ❌ No gradients except a subtle accent → accent-at-85% wash on a hero.
- ❌ No pure black text, no cool blue-grays — stay in the warm coastal ramp.
- ❌ No more than three type sizes on one screen.

## Responsive Behavior
- **Desktop ≥ 1024px:** 12-col grid, 24px gutters.
- **Tablet 640–1023px:** 8-col grid, 20px gutters; hero drops to 45vh.
- **Phone < 640px:** 4-col grid, 16px gutters; display type steps down one
  scale step; buttons go full-width in forms.

## Agent Prompt Guide
- Paste the `tokens.css` `:root` block first and reference every value via
  `var(--name)`; do not invent hex values outside this palette.
- When in doubt, subtract: fewer boxes, more horizon.
- Reserve `--accent` for the single most important action or element on the
  screen; use `--surface-warm` for everything that merely needs emphasis.
- Serif display + humanist body is the brand signature — never swap the
  display face to a sans unless the artifact is a dense data dashboard.
