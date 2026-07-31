---
name: "Component Extract"
description: "Claude design system prompt skill for Component Extract"
triggers:
  - "claude component extract"
od:
  category: prompt-library
  upstream: "https://github.com/Trystan-SA/claude-design-system-prompt"
---
# Component Extract: Identify Reusable Components from a Design

Walk a design and identify the reusable components hidden inside it; emit a component inventory the user can turn into a component library or design system. Use this when the user has a finished page or flow and wants to "make it a system," "build a component library," or hand off structured pieces.

**Pages are arrangements of components.** Extracting them turns a pile of one-offs into something maintainable.

## Phase 1: Identify the surface

Determine what to walk — a single design file, a multi-page flow, or a whole project. Read all relevant files and build a mental model of the visual vocabulary in use.

## Phase 2: Walk the design and inventory

Section by section, for each visual element ask:

1. **Does this exact pattern appear more than once?**
2. **Could it reasonably appear elsewhere?** (A card style, form input, or header likely repeats even if it's in one place now.)
3. **Does it have variants?** (Button: primary/secondary/ghost. Card: with/without image.)
4. **Does it have states?** (Hover, active, disabled, focus, loading.)

Yes to any → component candidate. Group findings into the standard categories:

- **Foundational** — color, spacing, type, radius, shadow, and motion tokens (see `design-system-extract` for token-level detail)
- **Atoms** — button, input, checkbox/radio/toggle, select, tag/chip/badge, avatar, icon (sizes + set in use), link
- **Molecules** — form field (label + input + helper + error), card, toast/alert, modal, dropdown menu, tooltip, pagination
- **Organisms** — header/nav, footer, sidebar, tab group, table, form, hero, feature grid, empty state
- **Templates** — landing, detail, list/index, empty-state page

## Phase 3: For each component, document

- **Name** — short, conventional (e.g., `Button`, `FormField`)
- **Purpose** — one sentence on when to use it
- **Variants** and **sizes**
- **States** — default, hover, active, focus, disabled, loading (whichever apply)
- **Tokens used** — which color, spacing, type tokens it references
- **Composition** — what other components it's built from (e.g., `Card` uses `Button`)
- **Accessibility notes** — keyboard support, ARIA, contrast
- **Do / Don't** — at least one of each (e.g., "Don't stack two primary buttons in a row")

## Phase 4: Identify the gaps

Flag these as part of the deliverable — they're the work needed to turn the design into a real system:

- **Inconsistencies** — three slightly-different button styles where one should serve; recommend a canonical version
- **Missing states** — hover without focus, no disabled state
- **Missing variants** — e.g., delete actions in the design but no destructive button
- **Off-scale values** — spacing or sizes outside the established token scale; snap them

## Phase 5: Emit and hand off

Write the inventory to a file (e.g., `component-inventory.md`), one section per component, structured as above — a doc the user can hand to a developer. Optionally render a "component library" page showing each component with its variants and states (the `design_canvas.jsx` starter works for the grid).

Then suggest next steps: `design-system-extract` for tokens if not already done, building the library as real code, `polish-pass` on the components, or `make-tweakable` on the library. Summarize: components inventoried by category, inconsistencies and gaps flagged, output file path, recommended next step.
