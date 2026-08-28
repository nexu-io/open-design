---
name: document-decision-memo
description: "A one-page decision memo that makes the recommendation, evidence, option trade-offs, controls, and next action immediately scannable."
license: MIT
metadata:
  author: Open Design
  version: "0.1.0"
---

# Decision Memo

Use this skill when the user wants a document in the visual and information pattern of the supplied Decision Memo reference.

## Best for

- executive decisions
- option comparison
- approval and next-action alignment

## Reference-first workflow

1. Read `template.json` completely before creating the deliverable.
2. Use `referenceHtml` from `template.json` as the literal starting file. Do not rebuild the layout from memory, a screenshot, or a new design system.
3. Map the user's source material into these editable regions: decision question, owner and evidence scope, recommendation, evidence, options, trade-offs and controls, next action.
4. Replace content and data only where needed. Preserve the reference DOM hierarchy, CSS tokens, spacing, page geometry, decorative shapes, and print rules unless the user explicitly requests a visual change.
5. Use only real supplied facts. If required information is missing, mark it clearly as `To confirm` instead of inventing content.
6. Produce one self-contained HTML file. Keep local assets embedded as data URIs or inline SVG/CSS; do not add a runtime dependency on the network.
7. Render the result and verify it at page scale before delivery.

## Required information structure

- decision question
- recommendation
- why this decision
- options considered
- what we accept
- how we reduce risk
- next action and owner

## Visual invariants

- Keep the complete decision path on one standard A4 page with no clipped bottom action block.
- Preserve the warm paper, forest-green hierarchy, gray-green support cards, and yellow approval emphasis.
- Recommendation must remain the strongest block; next action is secondary but operationally complete with an owner.

## Output checks

- The output opens without external setup and visually matches `example.webp` at first glance.
- Text remains readable in both browser preview and print/PDF output.
- No content, chart, table, ornament, or footer is clipped.
- The output preserves the reference page geometry: A4, exactly 1 page.
- The final HTML contains the user's actual content rather than lorem ipsum, placeholder images, or invented numbers.
