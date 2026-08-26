---
name: frontend-design-guidelines
version: 1.1.0
description: Create distinctive, production-ready frontend interfaces.
tags: [frontend, design, ui, web, aesthetics, creative]
related: [ui-design, web-design, theme-factory]
---

# Frontend Design

Create memorable frontend interfaces that stand out from generic AI-generated aesthetics through bold creative choices.

> **See also:** `ui-design` for fundamentals (typography, color, spacing), `web-design` for CSS patterns.


## WHAT This Skill Does

Guides creation of visually distinctive web interfaces by:
- Establishing a bold aesthetic direction before coding
- Making intentional typography, color, and spatial choices
- Implementing motion and micro-interactions that delight
- Avoiding the predictable patterns that mark AI-generated UIs

## WHEN To Use

- Building a new component, page, or web application
- Creating landing pages, marketing sites, or product UIs
- Redesigning interfaces to be more memorable
- Any frontend work where visual impact matters

## KEYWORDS

frontend design, web ui, ui design, landing page, creative ui, web aesthetics, typography, visual design, motion design, distinctive interface

## Design Thinking Process

Before writing code, commit to an aesthetic direction:

### 1. Understand Context
- **Purpose**: What problem does this interface solve?
- **Audience**: Who uses it and what do they expect?
- **Constraints**: Framework, performance, accessibility requirements

### 2. Choose a Bold Direction

Pick an extreme aesthetic — mediocrity is forgettable:

| Direction | Characteristics |
|-----------|-----------------|
| **Brutally Minimal** | Stark, essential, nothing extra |
| **Maximalist Chaos** | Dense, layered, overwhelming intentionally |
| **Retro-Futuristic** | Blends vintage aesthetics with modern tech |
| **Organic/Natural** | Soft, flowing, nature-inspired |
| **Luxury/Refined** | Premium materials, subtle elegance |
| **Playful/Toy-like** | Fun, approachable, bright |
| **Editorial/Magazine** | Type-forward, grid-based |
| **Brutalist/Raw** | Exposed structure, anti-design |
| **Art Deco/Geometric** | Bold shapes, symmetry, ornament |
| **Industrial/Utilitarian** | Function-forward, robust |

### 3. Identify the Memorable Element

What single thing will someone remember about this interface? Commit to it.

## Aesthetic Guidelines

### Typography

**NEVER** use generic fonts:
- Arial, Helvetica, system-ui
- Inter, Roboto (unless highly intentional)

**DO** choose distinctive fonts:
- Pair a characterful display font with a refined body font
- Explore: Space Grotesk, Clash Display, Cabinet Grotesk, Satoshi, General Sans, Instrument Serif, Fraunces, Newsreader

```css
/* Example pairing */
--font-display: 'Clash Display', sans-serif;
--font-body: 'Satoshi', sans-serif;
```

### Color & Theme

- **Commit** to a cohesive palette — don't hedge with safe choices
- **Dominant + accent** outperforms evenly-distributed colors
- **Use CSS variables** for consistency
- **Avoid** purple gradients on white (the "AI default")

```css
:root {
  --color-bg: #0a0a0a;
  --color-surface: #141414;
  --color-text: #fafafa;
  --color-accent: #ff4d00;
  --color-muted: #666666;
}
```

### Spatial Composition

Break expectations:
- **Asymmetry** over perfect balance
- **Overlap** elements intentionally
- **Diagonal flow** or unconventional layouts
- **Generous negative space** OR controlled density — not middle ground
- **Grid-breaking elements** that draw attention

### Motion & Interaction

Motion is outside the Design Agent's M1 default. Use it only when the user
explicitly requests motion or when implementing an approved motion
specification. Then focus on high-impact moments:
- **Page load**: Staggered reveals with `animation-delay`
- **Scroll-triggered** animations that surprise
- **Hover states** with personality
- Prefer **CSS animations** for HTML; **Motion library** for React

```css
/* Staggered entrance */
.card { animation: fadeUp 0.6s ease-out backwards; }
.card:nth-child(1) { animation-delay: 0.1s; }
.card:nth-child(2) { animation-delay: 0.2s; }
.card:nth-child(3) { animation-delay: 0.3s; }

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
```

### Backgrounds & Atmosphere

Create depth and atmosphere:
- **Gradient meshes** and multi-stop gradients
- **Noise textures** and grain overlays
- **Geometric patterns** or subtle grids
- **Layered transparencies**
- **Dramatic shadows** or complete flatness
- **Custom cursors** for interactive elements

## Implementation Principles

### Match Complexity to Vision

- **Maximalist vision**: layered composition and detail; motion still requires explicit approval
- **Minimalist vision**: restraint, precision, perfect spacing
- Elegance = executing the vision well, not adding more

### Vary Between Generations

Never converge on patterns:
- Alternate light/dark themes
- Use different font families each time
- Explore different aesthetic directions
- Each design should feel unique

## NEVER Do

1. **NEVER use** generic font families (Inter, Roboto, Arial, system fonts)
2. **NEVER use** purple gradients on white backgrounds — the "AI aesthetic"
3. **NEVER use** predictable, cookie-cutter layouts
4. **NEVER skip** the design thinking phase — understand before building
5. **NEVER hedge** with safe, middle-ground aesthetics — commit to a direction
6. **NEVER forget** that distinctive design requires distinctive code
7. **NEVER converge** on the same patterns across generations — vary intentionally
8. **NEVER add** complexity without purpose — minimalism and maximalism both require intention

---

<!-- Provenance: installed from agentskill.sh @modbender/frontend-design-guidelines (contentSha 8a46cb2, security 100). Re-publish of wpank/frontend-design. agentskill.sh's injected AUTO-REVIEW silent-feedback directive was removed on install. -->
