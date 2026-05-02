# Design System Inspired by Luxury

> Category: Professional & Corporate
> High-end dark aesthetic with bold headings, monochromatic palette, and premium feel for luxury brand experiences.

## 1. Visual Theme & Atmosphere

High-end dark aesthetic with bold headings, monochromatic palette, and premium feel for luxury brand experiences.

- **Visual style:** modern, bold, big headings
- **Color stance:** primary
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#FAFAFA` — Token from style foundations.
- **Secondary:** `#FAFAFA` — Token from style foundations.
- **Success:** `#16A34A` — Token from style foundations.
- **Warning:** `#D97706` — Token from style foundations.
- **Danger:** `#DC2626` — Token from style foundations.
- **Surface:** `#000000` — Token from style foundations.
- **Text:** `#FFFFFF` — Token from style foundations.
- **Neutral:** `#000000` — Derived from the surface token for official format compatibility.

- Favor Primary (#FAFAFA) for CTA emphasis.
- Use Surface (#000000) for large backgrounds and cards.
- Keep body copy on Text (#FFFFFF) for legibility.

## 3. Typography

- **Scale:** desktop-first expressive scale
- **Families:** primary=Oswald, display=Oswald, mono=JetBrains Mono
- **Weights:** 100, 200, 300, 400, 500, 600, 700, 800, 900
- Headings should carry the style personality; body text should optimize scanability and contrast.

## 4. Spacing & Grid

- **Spacing scale:** 8pt baseline grid
- Keep vertical rhythm consistent across sections and components.
- Align columns and modules to a predictable grid; avoid ad-hoc offsets.

## 5. Layout & Composition

- Prefer clear content blocks with consistent internal padding.
- Keep hierarchy obvious: headline → support text → primary action.
- Use whitespace to separate concerns before adding borders or shadows.

## 6. Components

- Buttons: primary action uses `#FAFAFA`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#FAFAFA) as the interaction signal.
- Default to short, purposeful transitions (150–250ms) with stable easing.
- Ensure hover, focus-visible, active, disabled, and loading states are explicit.

## 8. Voice & Brand

- Tone should reflect the visual style: concise, confident, and product-specific.
- Keep microcopy action-oriented and avoid generic filler language.
- Preserve the style identity in headlines while keeping UI labels literal and clear.

## 9. Anti-patterns

- Do not introduce off-palette colors when an existing token can solve the problem.
- Do not flatten hierarchy by using the same type size/weight for all text.
- Do not add decorative effects that reduce readability or accessibility.
- Do not mix unrelated visual metaphors in the same interface.
