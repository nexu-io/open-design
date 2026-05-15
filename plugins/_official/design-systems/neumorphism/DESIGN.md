# Design System Inspired by Neumorphism

> Category: Morphism & Effects
> Soft, extruded UI elements with inner and outer shadows on monochromatic surfaces for a tactile, embedded look.

## 1. Visual Theme & Atmosphere

Soft, extruded UI elements with inner and outer shadows on monochromatic surfaces for a tactile, embedded look.

- **Visual style:** minimal, clean, high-contrast, playful, matrix
- **Color stance:** primary, secondary, success, warning, danger, info
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#006666` — Token from style foundations.
- **Secondary:** `#F1F2F5` — Token from style foundations.
- **Success:** `#00A63D` — Token from style foundations.
- **Warning:** `#FE9900` — Token from style foundations.
- **Danger:** `#FF2157` — Token from style foundations.
- **Surface:** `#E7E5E4` — Token from style foundations.
- **Text:** `#1E2938` — Token from style foundations.
- **Neutral:** `#E7E5E4` — Derived from the surface token for official format compatibility.

- Favor Primary (#006666) for CTA emphasis.
- Use Surface (#E7E5E4) for large backgrounds and cards.
- Keep body copy on Text (#1E2938) for legibility.

## 3. Typography

- **Scale:** desktop-first expressive scale
- **Families:** primary=Space Mono, display=Space Mono, mono=JetBrains Mono
- **Weights:** 100, 200, 300, 400, 500, 600, 700, 800, 900
- Headings should carry the style personality; body text should optimize scanability and contrast.

## 4. Spacing & Grid

- **Spacing scale:** compact density mode
- Keep vertical rhythm consistent across sections and components.
- Align columns and modules to a predictable grid; avoid ad-hoc offsets.

## 5. Layout & Composition

- Prefer clear content blocks with consistent internal padding.
- Keep hierarchy obvious: headline → support text → primary action.
- Use whitespace to separate concerns before adding borders or shadows.

## 6. Components

- Buttons: primary action uses `#006666`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#006666) as the interaction signal.
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
