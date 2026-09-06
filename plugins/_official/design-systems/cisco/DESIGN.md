# Design System Inspired by Cisco

> Category: Backend & Data
> Enterprise infrastructure brand. Dark trust surfaces, Cisco Blue signal, technical clarity.

## 1. Visual Theme & Atmosphere

Cisco's current public web presence is enterprise infrastructure rendered with cinematic restraint. The canvas is dark but not pure black: layered navy-charcoal surfaces create depth without resorting to glossy startup gradients. Bright Cisco Blue is used as a precise signal color rather than a wash across the page. The overall impression is "serious global platform" rather than "friendly SaaS app" — large high-confidence headlines, quiet chrome, and product imagery that emphasizes scale, networking, observability, and resilience.

Typography is disciplined and corporate. Cisco's internal and presentation ecosystem points to `CiscoSansTT` as the preferred brand face, while the web experience remains compatible with modern grotesk fallbacks. Headings should feel concise and engineered. Body copy should read clearly and directly, not editorially. Geometrically, the system prefers soft pills for calls to action, rounded-but-not-playful cards, and glass-dark navigation shells floating over large atmospheric sections.

What makes Cisco distinct is the combination of **deep infrastructure darkness** with a **single electric trust signal**. Use blue for the moment that matters: primary action, focus, active tab, chart highlight, or key data edge. Let the rest of the interface stay disciplined.

**Key Characteristics:**
- Dark navy-charcoal surfaces instead of flat black
- Cisco Blue (`#049fd9`) as the primary signal color
- Restrained neutral system built from grays and pale technical whites
- Enterprise-scale headlines with compact, factual body copy
- Pill CTAs and rounded control shells, but never toy-like UI
- Product and platform imagery should suggest networks, telemetry, and systems at scale
- Motion should feel controlled and infrastructural, not playful

## 2. Color Palette & Roles

### Primary
- **Cisco Blue** (`#049fd9`): High-signal accent, outline CTA, active state, key link.
- **Status Blue** (`#64bbe3`): Focus halo, secondary emphasis, lightweight chart signal.
- **Cisco Indigo** (`#005073`): Filled primary CTA, dense accent, deeper data emphasis.
- **Dark Blue** (`#2b5592`): Secondary brand accent for graphics, charts, and layered blue compositions.

### Neutral / Surface
- **Dark Gray 1** (`#39393b`): Mid-dark container surface, panel base, dense modules.
- **Dark Gray 2** (`#58585b`): Borders, separators, secondary shells.
- **Medium Gray 2** (`#9e9ea2`): Muted labels and low-emphasis metadata.
- **Pale Gray 1** (`#e8ebf1`): Light text support, cool technical background tint, separators on dark.
- **Core White** (`#ffffff`): Primary inverse text, bright UI foreground, light surface content.

### Support
- **Sage Green** (`#abc233`): Positive outcome or infrastructure-health accent.
- **Status Green** (`#6cc04a`): Success state.
- **Status Yellow** (`#ffcc00`): Warning or caution state.
- **Status Orange** (`#ff7300`): Alert or escalation state.
- **Status Red** (`#cf2030`): Error or critical state.

### Recommended Surface Roles
- **Primary canvas**: a blue-black or charcoal blend built around `#0f1720` to `#1b2530` using the Cisco palette as anchor.
- **Elevated card**: Dark Gray 1 (`#39393b`) or a slightly bluer variant.
- **Border / outline**: Dark Gray 2 (`#58585b`) with subtle transparency when needed.
- **Primary text on dark**: Core White (`#ffffff`) or Pale Gray 1 (`#e8ebf1`).

## 3. Typography Rules

### Font Family
- **Primary**: `CiscoSansTT`, fallbacks: `Inter, Arial, Helvetica Neue, Helvetica, sans-serif`
- **Mono / Technical**: `IBM Plex Mono`, `SF Mono`, or `ui-monospace` if a code-supporting mono face is needed for metrics and IDs

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Hero Display | CiscoSansTT | 72px | 500 | 1.05 | -1.6px | Large launch/positioning headline |
| Section Display | CiscoSansTT | 56px | 500 | 1.08 | -1.1px | Major section statement |
| Heading | CiscoSansTT | 32px | 500 | 1.20 | -0.4px | Feature title, card header |
| Subheading | CiscoSansTT | 24px | 500 | 1.30 | -0.2px | Supporting header |
| Body | CiscoSansTT | 16px | 400 | 1.55 | normal | Default body copy |
| Body Small | CiscoSansTT | 14px | 400 | 1.50 | normal | Metadata, nav, helper text |
| Label / Eyebrow | CiscoSansTT | 12px | 700 | 1.30 | 0.24px | Tags, overlines, section labels |
| Button | CiscoSansTT | 16px | 500 | 1.20 | normal | CTA labels |

### Principles
- Keep display typography decisive and compressed, but not ultra-light or editorial.
- Body copy should be practical and highly legible, with no clever type effects.
- Use bold weight mainly for short labels, status tags, and compact emphasis.
- Favor one-family coherence over showy font mixing.

## 4. Component Stylings

### Buttons

**Primary Action Pill**
- Background: Cisco Indigo (`#005073`)
- Text: White (`#ffffff`)
- Radius: full pill
- Padding: generous horizontal padding, medium vertical height
- Hover: Dark Blue (`#2b5592`)
- Active: a darker indigo tone around `#00364d`
- Focus ring: 2px outer halo in Status Blue (`#64bbe3`) with a 1px white inner keyline on dark surfaces
- Use case: high-priority submit, deploy, or "learn more" action on dark Cisco surfaces

**Signal Outline Pill**
- Background: transparent
- Text: Cisco Blue (`#049fd9`) on dark surfaces, Cisco Indigo (`#005073`) on light surfaces
- Border: 1.5px Cisco Blue (`#049fd9`)
- Radius: full pill
- Hover: blue-tinted surface fill with the text color preserved
- Focus ring: same visible halo pairing as the primary button
- Use case: brand-forward secondary action that keeps Cisco Blue prominent without sacrificing contrast

**Secondary Dark Pill**
- Background: transparent or dark surface
- Text: White or Pale Gray 1
- Border: Dark Gray 2 (`#58585b`)
- Radius: full pill
- Purpose: low-noise secondary CTA

### Cards & Containers
- Background: layered dark surface based on `#39393b` or a cooler navy-charcoal adaptation
- Border: 1px subtle border using `#58585b`
- Radius: 16px to 20px
- Shadow: minimal; depth should come mostly from surface contrast and spacing

### Navigation
- Dark glass-like masthead or shell over a dark hero
- Text: White / Pale Gray 1
- Active state: Cisco Blue underline, chip, or glow
- Navigation should feel like product chrome, not marketing candy

### Data / Product Modules
- Charts and diagrams should use Cisco Blue as primary highlight and keep supporting colors minimal
- Use green/yellow/red only for actual operational meaning
- Dense technical blocks should still preserve breathing room and hierarchy

### Brand-Specific Recipes

**Network Telemetry Card**
- Anatomy: eyebrow label, large metric, delta chip, 12-24h sparkline, quiet footer metadata
- Density: compact but not cramped; 16px-24px padding with clear alignment to chart axes
- States: normal, selected, degraded, critical, loading skeleton
- Brand behavior: use Cisco Blue for the selected edge or sparkline, and semantic colors only for health state

**Topology / Product Diagram Module**
- Anatomy: title, system canvas, node chips, connection lines, side legend
- Visual rule: dark field first, blue path highlight second, all other nodes muted until active
- States: idle overview, hovered path, selected node, degraded route

**Dense Control Panel**
- Anatomy: left nav rail, filter bar, split metric region, log/event table, contextual right rail
- Control sizing: compact 36px inputs are acceptable on desktop, but action buttons remain 44px minimum height
- States: quiet default, blue active filter, clear warning/error escalation

## 5. Layout Principles

### Spacing & Grid
- Base rhythm: 8px
- Common scale: 8px, 12px, 16px, 24px, 32px, 48px, 64px, 96px
- Prefer wide desktop containers and large sectional spacing
- 12-column desktop layout with generous gutters works well for the brand
- Breakpoints: mobile up to 767px, tablet 768px-1199px, desktop 1200px and above

### Composition
- Alternate expansive hero/outcome sections with denser information bands
- Use asymmetry where it serves product imagery or system diagrams
- Large dark fields with one blue focal point are more on-brand than many small colorful fragments
- On tablet, reduce wide split layouts to 2-column modules and keep telemetry cards in pairs
- On mobile, collapse hero side-by-sides to a single column, stack data panels vertically, and convert dense control rows into progressive disclosure panels
- Navigation should collapse from a full masthead to a compact menu button plus one primary CTA on tablet/mobile

### Accessibility & Responsiveness
- Minimum touch target: 44px by 44px for any tappable control
- Keyboard focus must remain visible on every interactive element via the blue outer halo plus white inner keyline pairing
- Do not rely on hover-only disclosure; show essential state and actions on focus and touch
- Preserve readable line lengths on desktop and avoid more than 3 cards per row on tablet or 1 card per row on small phones

## 6. Motion & Interaction

- Motion should be controlled, smooth, and systems-like
- Use fade, rise, subtle slide, and restrained glow
- Interaction timing: roughly 160ms–260ms for control response, 320ms–500ms for larger section reveals
- Avoid bouncy springs, elastic easing, or playful overshoot
- Respect `prefers-reduced-motion`: remove parallax and staged reveals, keep only instant state swaps or short opacity transitions under 120ms

## 7. Voice & Brand

- Voice is confident, technical, and outcome-oriented
- Headlines should sound like platform positioning or systems value, not consumer lifestyle copy
- Use language that suggests trust, resilience, infrastructure, AI readiness, and operational scale
- The brand should feel global, mission-critical, and composed under pressure

## 8. Anti-patterns

- Do not turn Cisco into a generic gradient startup site
- Do not flood the page with many equally loud accent colors
- Do not use pastel palettes or lifestyle-illustration aesthetics
- Do not use overly rounded, bubbly controls
- Do not rely on pure black alone; use layered charcoals and deep blue-blacks instead
- Do not make body copy feel whimsical, editorial, or ironic

## 9. Agent Prompt Guide

### Quick Color Reference
- Primary signal: Cisco Blue (`#049fd9`)
- Hover / secondary signal: Status Blue (`#64bbe3`)
- Deep accent: Cisco Indigo (`#005073`)
- Mid-dark surface: Dark Gray 1 (`#39393b`)
- Border: Dark Gray 2 (`#58585b`)
- Inverse text: White (`#ffffff`) or Pale Gray 1 (`#e8ebf1`)

### Example Component Prompts
- "Create a Cisco-style dark enterprise landing page with layered navy-charcoal surfaces, a bright Cisco Blue primary CTA, and a 72px high-confidence hero headline."
- "Design a technical dashboard card on a dark surface with a subtle gray border, white text, and Cisco Blue chart highlights."
- "Build a dark glass navigation bar with restrained white labels and one Cisco Blue active indicator."
