---
name: design-brief
description: |
  Parse a structured design brief written in I-Lang protocol format into a
  concrete design spec. Eliminates ambiguity from vague requests like
  "make it professional" by requiring explicit dimensions: palette, typography,
  layout, mood, density, and constraints.
  Trigger keywords: "design brief", "create a design brief", "ilang brief", "structured brief".
triggers:
  - "design brief"
  - "create a design brief"
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
    requires: true
    generates: true
    sections: [color, typography, layout, components, responsive, dos-and-donts]
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

## Background

The 8 dimensions in this skill are derived from analysis of the 71 design systems bundled with Open Design. Every DESIGN.md in `design-systems/` resolves at minimum: color palette, accent, typography, display font, layout model, and component style. We distilled these into 8 orthogonal dimensions that cover the decisions a designer makes before any pixel is placed. Mood and density were added because they are the two most common sources of ambiguity in natural language briefs ("make it clean" means different things to different people).

Dimensions intentionally excluded from the brief level: animation timing, responsive breakpoints, and accessibility contrast. These are enforced at the template level by individual skills (e.g., `saas-landing` handles its own breakpoint logic) and in the Responsive Behavior / Do's and Don'ts sections of the generated DESIGN.md.

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

If the user provides Option B, convert it to the structured format using the mapping table below, then proceed. Identify every dimension explicitly stated and flag dimensions that were left unspecified.

### Natural language → I-Lang mapping

For each sentence in the natural language input, identify dimension keywords and map to the closest structured value:

| Natural language phrase | Dimension | I-Lang value |
|------------------------|-----------|-------------|
| "dark mode", "dark theme" | palette | `monochrome_dark` |
| "light", "white background" | palette | `light_clean` |
| "earthy", "warm tones" | palette | `earth_tones` |
| "pop of color", "vibrant" | accent | `electric_blue` or `coral` |
| "subtle accent" | accent | `muted_sage` or `slate` |
| "clean", "minimal", "simple" | mood | `professional_minimal` |
| "playful", "fun", "friendly" | mood | `playful` |
| "bold", "brutalist", "raw" | mood | `brutalist` |
| "editorial", "magazine-like" | mood | `editorial` |
| "spacious", "lots of whitespace" | density | `spacious` |
| "compact", "dense", "information-rich" | density | `compact` |
| "Inter", "system font" | typography | `inter` or `system_ui` |
| "serif", "traditional" | typography | `georgia` or `playfair` |
| "monospace", "code-like" | typography | `jetbrains_mono` |
| "no animations", "static" | exclude | `animations` |
| "no gradients" | exclude | `gradients` |
| "no stock photos" | exclude | `stock_photos` |
| "single page" | layout | `single_column` |
| "two columns", "sidebar" | layout | `two_column` |
| "mobile first" | responsive | `mobile_first` |

When a phrase maps to multiple dimensions (e.g. "clean dark landing page" → mood=professional_minimal + palette=monochrome_dark + layout=single_column), resolve each dimension independently.

## 2. Validate dimensions

Every design brief must resolve these 8 dimensions. If any are missing from the input, select sensible defaults using the rules in Section 2.2.

The values listed below are representative, not exhaustive. The agent may accept semantically clear values not in this table (e.g., `palette=warm_earth` or `mood=retro_tech` are valid). If a value is ambiguous or unrecognizable, prompt the user for clarification rather than guessing.

| Dimension | Key | Example values |
|-----------|-----|---------------|
| Color palette | `palette` | navy_and_white, earth_tones, monochrome_dark, light_clean |
| Accent color | `accent` | coral, electric_blue, emerald, muted_sage |
| Body typography | `typography` | inter, system_ui, dm_sans, georgia |
| Display typography | `display` | space_grotesk, clash_display, same_as_body, playfair |
| Layout model | `layout` | single_column, two_column, asymmetric |
| Mood | `mood` | professional_minimal, playful, brutalist, editorial |
| Density | `density` | compact, balanced, spacious |
| Constraints | `exclude` | animations, gradients, stock_photos, carousel |

### 2.1 Symbolic → concrete token resolution

Each symbolic value maps to concrete design tokens. The agent must resolve these before writing DESIGN.md:

| Symbolic value | Concrete tokens |
|---------------|----------------|
| `palette=navy_and_white` | Background: #0F172A, Surface: #1E293B, Text: #F8FAFC, Secondary: #94A3B8 |
| `palette=monochrome_dark` | Background: #09090B, Surface: #18181B, Text: #FAFAFA, Secondary: #A1A1AA |
| `palette=light_clean` | Background: #FFFFFF, Surface: #F8FAFC, Text: #0F172A, Secondary: #64748B |
| `palette=earth_tones` | Background: #FFFBEB, Surface: #FEF3C7, Text: #451A03, Secondary: #92400E |
| `accent=coral` | Accent: #F97316, Hover: #EA580C |
| `accent=electric_blue` | Accent: #3B82F6, Hover: #2563EB |
| `accent=emerald` | Accent: #10B981, Hover: #059669 |
| `typography=inter` | Body: Inter, 400, 1rem/1.6 |
| `typography=system_ui` | Body: system-ui, 400, 1rem/1.6 |
| `typography=georgia` | Body: Georgia, 400, 1.125rem/1.7 |
| `display=space_grotesk` | Display: Space Grotesk, 700, clamp(2rem, 5vw, 3.5rem) |
| `display=playfair` | Display: Playfair Display, 700, clamp(2rem, 5vw, 3.5rem) |
| `display=same_as_body` | Display inherits body font family, weight 600 |
| `density=compact` | Section spacing: 48px, Content padding: 16px/24px |
| `density=balanced` | Section spacing: 72px, Content padding: 24px/40px |
| `density=spacious` | Section spacing: 96px, Content padding: 24px/48px |

For symbolic values not in this table, the agent should derive concrete tokens by analogy (e.g., `palette=ocean_blue` → select blues in the same lightness range as `navy_and_white`).

### 2.2 Default resolution rules

When a dimension is unspecified, defaults are selected based on mood compatibility:

| Unspecified dimension | Default rule |
|----------------------|-------------|
| `palette` | If mood=editorial → `light_clean`. If mood=brutalist → `monochrome_dark`. Otherwise → `light_clean`. |
| `accent` | If palette is dark → `coral`. If palette is light → `electric_blue`. |
| `typography` | Always → `inter` (highest cross-platform legibility). |
| `display` | If mood=editorial → `playfair`. If mood=brutalist → `space_grotesk`. Otherwise → `same_as_body`. |
| `layout` | Always → `single_column` (safest responsive default). |
| `mood` | Always → `professional_minimal` (least opinionated). |
| `density` | Always → `balanced`. |
| `exclude` | Always → none (no constraints unless specified). |

If mood is also unspecified, all defaults fall back to the safe neutral set: `palette=light_clean`, `accent=electric_blue`, `typography=inter`, `display=same_as_body`, `layout=single_column`, `mood=professional_minimal`, `density=balanced`, `exclude=none`.

## 3. Generate DESIGN.md

This skill generates a new DESIGN.md from scratch based on the resolved brief dimensions. If a DESIGN.md already exists in the working directory, the agent should ask the user whether to overwrite or merge before proceeding.

Produce a DESIGN.md following Open Design's 9-section convention. All color hex values, font stacks, and spacing values must come from the resolved tokens in Section 2.1 — do not invent values outside the resolution table.

```markdown
# [Project Name] Design System

## Color
- Background: [resolved from palette]
- Surface: [resolved from palette]
- Text primary: [resolved from palette]
- Text secondary: [resolved from palette]
- Accent: [resolved from accent]
- Accent hover: [resolved from accent]

## Typography
- Display: [resolved from display], 700, clamp(2rem, 5vw, 3.5rem)
- Body: [resolved from typography], 400, 1rem/1.6
- Mono: JetBrains Mono, 400, 0.875rem

## Layout
- Max width: 1200px
- Grid: [resolved from layout]
- Section spacing: [resolved from density]
- Content padding: [resolved from density]

## Depth & Elevation
- Shadows: [if mood=brutalist → "hard 4px offset", if mood=professional_minimal → "none", otherwise → "subtle sm"]
- Borders: 1px solid [derived from palette, 8% opacity of text color]

## Components
- Buttons: [if mood=playful → "rounded-full", otherwise → "rounded-md"], accent bg, contrast text
- Cards: surface bg, subtle border, 12px radius
- Inputs: [if mood=brutalist → "thick border", otherwise → "transparent bg, bottom border"]

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
- DON'T use more than 2 display/body typefaces (monospace is a utility face for code and data — it does not count toward this limit).

## Agent Prompt Guide
- Do NOT invent colors outside this palette.
- Do NOT add box-shadows unless specified above.
- Accent color appears maximum 3 times per viewport.
- All interactive elements need :focus-visible outline.
- [if exclude contains items → list each as "Do NOT use {item}."]
```

## 4. Generate brief-preview.html (if output_format includes html_preview)

Create a single HTML file that visually renders the resolved design tokens. The preview must contain these 4 sections in order:

1. **Color palette swatches** — A horizontal row of rectangles, each showing one color from the Color section. Label each with its role (Background, Surface, Text, Accent) and hex code.
2. **Typography specimens** — Three text blocks showing Display, Body, and Mono fonts at their declared sizes. Use a sample sentence ("The quick brown fox...") for each.
3. **Spacing ruler** — A visual ruler or stacked bars showing section spacing and content padding values, labeled with their px values.
4. **Component preview** — Render 2–3 live components (a primary button, a card with title/body, a text input) using the resolved tokens. These should be functional HTML/CSS, not screenshots.

Style the preview itself with the resolved design system tokens (background color, font, spacing). The preview should look like a design system documentation page.

## 5. Report unspecified dimensions

At the end of output, list any dimensions the user did not specify and the defaults that were applied, including the rule that selected each default:

```
Dimensions resolved from defaults:
- display: set to "same_as_body" (rule: mood=professional_minimal → same_as_body)
- density: set to "balanced" (rule: static fallback, no spacing preference given)
- exclude: set to "none" (rule: no constraints unless specified)
```

This transparency prevents silent assumptions from propagating into the final design.
