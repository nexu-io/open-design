---
name: impeccable
description: Design, audit, and polish production frontend interfaces.
version: 3.8.0-local
---

# Impeccable Interface Review

Shape, implement, audit, and polish production interfaces without running a
bundled service, hook, updater, or external coding agent. This local edition is
deliberately instruction-only.

## When to Use

- Build or redesign a frontend page, component, flow, or app shell.
- Audit an interface for usability, accessibility, responsive behavior, or
  generic AI-design patterns.
- Polish an implemented surface before review or release.

## Prerequisites

- The target repository is available locally.
- Its instructions, stack, existing design system, and verification commands
  can be inspected.
- External imagery, motion, Figma, or other integrations are used only after an
  explicit user request.

## Procedure

1. Read repository instructions, the product brief, existing tokens, global
   styles, and at least one representative component or page.
2. Classify the surface:
   - **Product:** task completion, familiar controls, density, and consistent
     states take priority.
   - **Brand:** communication, identity, composition, and memorable expression
     take priority without sacrificing accessibility.
3. When the user requests options for a new exploratory surface, use
   `layout-options` and produce exactly three structural directions. Do not
   generate two, four, or cosmetic variants.
4. Select or confirm a direction before implementation. Preserve the existing
   system unless the brief explicitly requires a departure.
5. Implement with the repository's stack and components. Add no dependency
   unless the existing stack cannot satisfy the approved behavior.
6. Inspect rendered output at mobile and desktop widths. Check realistic
   content, long labels, empty/error/loading states, keyboard navigation,
   visible focus, contrast, reflow, and reduced motion.
7. Run the project's lint, type, build, and test commands. Fix regressions
   caused by the change.

## Craft Rules

- Make one compositional idea dominant. Hierarchy, spacing, alignment, scale,
  and color should describe the same reading order.
- Use role-based typography. Keep sustained body text near 45-80 characters per
  line and avoid low-contrast microcopy.
- Cards are an affordance, not a default layout. Avoid nested cards and repeated
  icon-heading-copy grids without a real grouping need.
- Avoid gradient text, decorative glassmorphism, arbitrary huge radii, generic
  purple gradients, tiny uppercase eyebrows on every section, and decoration
  that does not support hierarchy or meaning.
- Product UI favors familiar controls and consistent state models. Brand work
  may be expressive but must remain legible, responsive, and operable.
- Motion, image generation, external imagery, and live third-party references
  require an explicit user request. Never introduce them because a tool exists.
- When motion is approved, keep content visible by default and provide a
  `prefers-reduced-motion` alternative.

## Accessibility Gate

- Target WCAG 2.2 AA: 4.5:1 normal text, 3:1 large text, and applicable 3:1
  non-text contrast.
- Every action works by keyboard with visible, logical focus.
- Meaning never depends on color, position, sound, or motion alone.
- Content remains usable at 200% zoom and at narrow reflow widths.
- Controls expose labels, instructions, errors, and state semantically.

## Pitfalls

- Claiming visual quality without rendering the result.
- Replacing an existing system with a personal preference.
- Presenting cosmetic variants as separate directions.
- Shipping only the happy path.
- Using an automated scanner as the sole accessibility evidence.

## Verification

Report:

- Files and components changed.
- Viewports, themes, states, and interaction paths checked.
- Accessibility and automated checks run.
- Important fixes made after visual inspection.
- Remaining assumptions or checks that could not run.
