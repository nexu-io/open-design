---
name: document-branded-proposal
description: "A structured partner proposal covering recommendation, approach, scope, governance, and delivery in a polished branded format."
license: MIT
metadata:
  author: Open Design
  version: "0.1.0"
---

# Branded Proposal

Use this skill when the user wants a document in the visual and information pattern of the supplied Branded Proposal reference.

## Best for

- partner proposals
- pilot plans
- scope and governance alignment

## Reference-first workflow

1. Read `template.json` completely before creating the deliverable.
2. Use `referenceHtml` from `template.json` as the literal starting file. Do not rebuild the layout from memory, a screenshot, or a new design system.
3. Map the user's source material into these editable regions: executive recommendation, success criteria, workstreams, scope, timeline and governance.
4. Replace content and data only where needed. Preserve the reference DOM hierarchy, CSS tokens, spacing, page geometry, decorative shapes, and print rules unless the user explicitly requests a visual change.
5. Use only real supplied facts. If required information is missing, mark it clearly as `To confirm` instead of inventing content.
6. Produce one self-contained HTML file. Keep local assets embedded as data URIs or inline SVG/CSS; do not add a runtime dependency on the network.
7. Render the result and verify it at page scale before delivery.

## Required information structure

- executive recommendation
- proposed approach
- scope and deliverables
- delivery and governance

## Visual invariants

- Keep the compact proposal hierarchy and the four numbered sections on one print-ready page.
- Preserve the restrained blue accent, editorial typography, structured cards, and timeline table.
- Balance copy lengths across success, workstream, and scope cards so no column feels materially heavier.

## Output checks

- The output opens without external setup and visually matches `example.webp` at first glance.
- Text remains readable in both browser preview and print/PDF output.
- No content, chart, table, ornament, or footer is clipped.
- The output preserves the reference page geometry: responsive long page.
- The final HTML contains the user's actual content rather than lorem ipsum, placeholder images, or invented numbers.
