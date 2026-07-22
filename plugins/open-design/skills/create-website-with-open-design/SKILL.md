---
name: create-website-with-open-design
description: Create or refine a content-led website with Open Design, including landing pages, product or company sites, campaign pages, portfolios, and ecommerce marketing surfaces. Use only when the user explicitly selects or names Open Design; use the prototype skill for app-like task flows.
---

# Create Website with Open Design

Apply `$open-design-basics`, then execute this website contract.

## Dynamic decision dimensions and execution

- Use `artifactType: website` for `collect_brief`, `create_project`, and `start_run`.
- Treat the following as decision dimensions to consider only when unknown and outcome-changing, never as fixed form rows or a checklist to ask in full:
  - The site's job and primary conversion action.
  - The priority audience and the context in which they arrive.
  - Page scope, information hierarchy, required sections, and supplied copy.
  - Brand source, reference posture, and visual character.
  - Responsive behavior, navigation, ecommerce, forms, or other required interactions.
  - Delivery shape when the user needs something other than the normal responsive browser website.
- Tailor choices to the actual brief. For example, a product waitlist and an editorial portfolio should not receive the same goal, section, or direction options.
- Infer the normal output as a responsive browser website with a real HTML entry file. Put supplied copy, CTA, references, pages, and constraints in `knownAnswers`; do not re-ask them.
- Call `create_project`, then `start_run` with the confirmed structured brief. The server maps `website` to the Open Design `frontend-design` workflow.

## Delivery standard

Require a successful terminal run, `artifactCount > 0`, a readable HTML entry file, and a real `previewUrl`. Verify the page renders at desktop and mobile widths and includes the selected content and primary CTA. Open the exact Studio and preview URLs in separate in-app-browser tabs. Zero files, a missing entry, or an unrenderable preview is not a delivered website.
