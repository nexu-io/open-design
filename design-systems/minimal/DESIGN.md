# Design System Inspired by Minimal

> Category: Modern & Minimal
> Stripped-back design emphasizing whitespace, clean typography, and restrained color for maximum clarity and focus.

## 1. Visual Theme & Atmosphere

Stripped-back design emphasizing whitespace, clean typography, and restrained color for maximum clarity and focus.

- **Visual style:** minimal, clean, bold
- **Color stance:** primary, neutral, success, warning, danger
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#0C0C09` — Token from style foundations.
- **Secondary:** `#312C85` — Token from style foundations.
- **Success:** `#16A34A` — Token from style foundations.
- **Warning:** `#D97706` — Token from style foundations.
- **Danger:** `#DC2626` — Token from style foundations.
- **Surface:** `#F4F4F1` — Token from style foundations.
- **Text:** `#0C0C09` — Token from style foundations.
- **Neutral:** `#F4F4F1` — Derived from the surface token for official format compatibility.

- Favor Primary (#0C0C09) for CTA emphasis.
- Use Surface (#F4F4F1) for large backgrounds and cards.
- Keep body copy on Text (#0C0C09) for legibility.

## 3. Typography

- **Scale:** desktop-first expressive scale
- **Families:** primary=Open Sans, display=Inter, mono=Inconsolata
- **Weights:** 100, 200, 300, 400, 500, 600, 700, 800, 900
- Headings should carry the style personality; body text should optimize scanability and contrast.

## 4. Spacing & Grid

- **Spacing scale:** 4/8/12/16/24/32
- Keep vertical rhythm consistent across sections and components.
- Align columns and modules to a predictable grid; avoid ad-hoc offsets.

## 5. Layout & Composition

- Prefer clear content blocks with consistent internal padding.
- Keep hierarchy obvious: headline → support text → primary action.
- Use whitespace to separate concerns before adding borders or shadows.

## 6. Components

- Buttons: primary action uses `#0C0C09`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#0C0C09) as the interaction signal.
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
