---
name: design-brief
description: |
  Parse a structured design brief written in I-Lang protocol format into a
  concrete design spec. Eliminates ambiguity from vague requests like
  "make it professional" by requiring explicit dimensions: palette, typography,
  layout, mood, density, and constraints.
  Trigger keywords: "design brief", "brief", "ilang brief", "structured brief".
triggers:
  - "design brief"
  - "brief"
  - "ilang brief"
  - "structured brief"
od:
  mode: prototype
  platform: desktop
  scenario: planning
  preview:
    type: html
    entry: brief-preview.html
    reload: debounce-100
  design_system:
    requires: false
    sections: [color, typography, layout]
  inputs:
    - name: brief
      type: string
      required: true
      description: "I-Lang formatted design brief or natural language description"
    - name: output_format
      type: enum
      values: [design_md, html_preview, both]
      default: both
  outputs:
    primary: DESIGN.md
    secondary: brief-preview.html
  capabilities_required:
    - file_write
---

# Design Brief Skill

Parse a structured design brief into a concrete DESIGN.md and optional visual preview. Agent, follow this workflow exactly.

## 1. Accept input

The user provides a design brief in one of two formats:

### Option A: I-Lang structured brief

```
[PLAN:@DESIGN|type=saas_landing]
  |palette=navy_and_white|accent=coral
  |typography=inter_for_body|display=space_grotesk
  |layout=single_column|max_width=1200px
  |mood=professional_minimal
  |density=spacious|section_gap=96px
  |hero=headline+subhead+cta
  |sections=features,pricing,testimonials,footer
  |exclude=animations,parallax,gradients
  |responsive=mobile_first
```

### Option B: Natural language

> "I need a landing page for a developer tool. Clean, minimal, dark mode. Inter font. No flashy animations."

If the user provides Option B, convert it to the structured format internally before proceeding. Identify every dimension explicitly stated and flag dimensions that were left unspecified.

## 2. Validate dimensions

Every design brief must resolve these 8 dimensions. If any are missing from the input, select sensible defaults and note them in the output.

| Dimension | Key | Example values |
|-----------|-----|---------------|
| Color palette | `palette` | navy_and_white, earth_tones, monochrome_dark |
| Accent color | `accent` | coral, electric_blue, emerald |
| Body typography | `typography` | inter, system_ui, dm_sans |
| Display typography | `display` | space_grotesk, clash_display, same_as_body |
| Layout model | `layout` | single_column, two_column, asymmetric |
| Mood | `mood` | professional_minimal, playful, brutalist, editorial |
| Density | `density` | compact, balanced, spacious |
| Constraints | `exclude` | animations, gradients, stock_photos, carousel |

## 3. Generate DESIGN.md

Produce a DESIGN.md following Open Design conventions:

```markdown
# [Project Name] Design System

## Color
- Background: #0F172A (navy-900)
- Surface: #1E293B (navy-800)
- Text primary: #F8FAFC (slate-50)
- Text secondary: #94A3B8 (slate-400)
- Accent: #F97316 (coral/orange-500)
- Accent hover: #EA580C (orange-600)

## Typography
- Display: Space Grotesk, 700, clamp(2rem, 5vw, 3.5rem)
- Body: Inter, 400, 1rem/1.6
- Mono: JetBrains Mono, 400, 0.875rem

## Layout
- Max width: 1200px
- Grid: single column, centered
- Section spacing: 96px
- Content padding: 24px (mobile) / 48px (desktop)

## Depth & Elevation
- Shadows: none (flat design)
- Borders: 1px solid rgba(255,255,255,0.08)

## Components
- Buttons: pill shape, accent bg, white text, no shadow
- Cards: surface bg, subtle border, 12px radius
- Inputs: transparent bg, bottom border only

## Responsive Behavior
- Breakpoints: 640px (sm), 768px (md), 1024px (lg), 1280px (xl)
- Mobile: single column, stack all sections vertically
- Tablet: allow 2-column feature grids
- Desktop: full layout with max-width constraint
- Images: fluid, max-width 100%, maintain aspect ratio

## Do's and Don'ts
- DO use the declared color tokens exclusively.
- DO maintain consistent section spacing.
- DO ensure all text meets WCAG AA contrast ratio.
- DON'T invent colors outside the palette.
- DON'T add decorative shadows unless Depth & Elevation allows them.
- DON'T use more than 2 typefaces.

## Agent Prompt Guide
- Do NOT invent colors outside this palette.
- Do NOT add box-shadows unless specified above.
- Accent color appears maximum 3 times per viewport.
- All interactive elements need :focus-visible outline.
```

## 4. Generate brief-preview.html (if output_format includes html_preview)

Create a single HTML file that visually renders the design tokens: color swatches, typography samples, spacing ruler, and a mini component preview. This lets the user see the system before any page is built.

## 5. Report unspecified dimensions

At the end of output, list any dimensions the user did not specify and the defaults you chose:

```
Dimensions resolved from defaults:
- display: set to "same_as_body" (user did not specify display font)
- density: set to "balanced" (no spacing preference given)
- exclude: set to "none" (no constraints specified)
```

This transparency prevents silent assumptions from propagating into the final design.
