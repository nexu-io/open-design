---
name: create-prototype-with-open-design
description: Create or refine an interactive product prototype with Open Design, including web apps, dashboards, mobile concepts, onboarding, and task flows. Use only when the user explicitly selects or names Open Design; use the website skill for content-led marketing pages.
---

# Create Prototype with Open Design

Apply `$open-design-basics`, then execute this prototype contract.

## Dynamic decision dimensions and execution

- Use `artifactType: product-prototype` for `collect_brief`, `create_project`, and `start_run`.
- Treat the following as decision dimensions to consider only when unknown and outcome-changing, never as fixed form rows or a checklist to ask in full:
  - The validation goal and decision the prototype must support.
  - The target role and its starting context.
  - The primary end-to-end flow and screen scope.
  - Target platform, responsive posture, and required fidelity.
  - State coverage, navigation behavior, and data realism.
  - Existing brand, product UI, or reference direction.
- Tailor choices to the requested workflow. A mobile onboarding test, an admin dashboard review, and a search concept need different flow and state options.
- Infer the normal output as an interactive responsive product prototype. Put supplied platforms, screens, flows, states, and references in `knownAnswers`; do not re-ask them.
- Call `create_project`, then `start_run` with the confirmed structured brief. The server maps `product-prototype` to `frontend-design` with explicit interaction and state requirements.

## Delivery standard

Require a successful terminal run, `artifactCount > 0`, a readable HTML entry file, and a real `previewUrl`. Verify the primary end-to-end flow is operable and selected loading, empty, success, error, navigation, and responsive states are represented. Open the exact Studio and preview URLs in separate in-app-browser tabs. A static screen with no requested interaction is incomplete.
