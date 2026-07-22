---
name: create-design-system-with-open-design
description: Create, extract, or refine a reusable design system with Open Design from a product, brand, reference, or existing Open Design project. Use only when the user explicitly selects or names Open Design and wants reusable foundations, components, patterns, or governance.
---

# Create Design System with Open Design

Apply `$open-design-basics`, then execute this design-system contract.

## Dynamic decision dimensions and execution

- Use `artifactType: design-system` for `collect_brief`, `create_project`, and `start_run`.
- Treat the following as decision dimensions to consider only when unknown and outcome-changing, never as fixed form rows or a checklist to ask in full:
  - Adoption goal, product scope, and primary consumers of the system.
  - Existing brand, UI source, design system, or migration baseline.
  - Foundation, component, product-pattern, content, and documentation scope.
  - Target platforms, frameworks, and token or implementation constraints.
  - Accessibility level, contribution model, and governance maturity.
  - Expected deliverable depth beyond the reusable `DESIGN.md` contract.
- Tailor choices to the supplied organization and source material. A new mobile product and a multi-brand enterprise migration should not receive the same scope or governance options.
- Infer the normal output as a reusable `DESIGN.md`. Put known design-system ids, source references, platforms, and governance requirements in `knownAnswers`; pass an existing `designSystem` when applying one and do not re-ask it.
- Call `create_project`, then `start_run` with the confirmed structured brief. The server maps `design-system` to the Open Design `design-md` workflow.

## Delivery standard

Require a successful terminal run, `artifactCount > 0`, and a readable generated `DESIGN.md` containing the selected foundations and guidance. Confirm that the file is registered in the project before claiming success. A preview URL is optional; open the exact `studioUrl` in the in-app browser for review.
