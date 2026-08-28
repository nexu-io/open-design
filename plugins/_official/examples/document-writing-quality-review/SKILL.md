---
name: document-writing-quality-review
description: "An editorial review sheet that prioritizes findings, preserves what works, and supplies a concrete replacement draft."
license: MIT
metadata:
  author: Open Design
  version: "0.1.0"
---

# Writing Quality Review

Use this skill when the user wants a document in the visual and information pattern of the supplied Writing Quality Review reference.

## Best for

- editorial QA
- launch-note review
- before-and-after copy revision

## Reference-first workflow

1. Read `template.json` completely before creating the deliverable.
2. Use `referenceHtml` from `template.json` as the literal starting file. Do not rebuild the layout from memory, a screenshot, or a new design system.
3. Map the user's source material into these editable regions: review decision, priority findings, recommended changes, keep note, replacement copy.
4. Replace content and data only where needed. Preserve the reference DOM hierarchy, CSS tokens, spacing, page geometry, decorative shapes, and print rules unless the user explicitly requests a visual change.
5. Use only real supplied facts. If required information is missing, mark it clearly as `To confirm` instead of inventing content.
6. Produce one self-contained HTML file. Keep local assets embedded as data URIs or inline SVG/CSS; do not add a runtime dependency on the network.
7. Render the result and verify it at page scale before delivery.

## Required information structure

- review decision
- priority revisions
- keep
- suggested replacement

## Visual invariants

- Keep the one-page A4 review sequence: decision, priority revisions, keep, replacement.
- Preserve severity labels, three-column issue logic, and clear original-versus-suggested differentiation.
- Keep review findings specific and source-grounded; never invent unsupported problems.

## Output checks

- The output opens without external setup and visually matches `example.webp` at first glance.
- Text remains readable in both browser preview and print/PDF output.
- No content, chart, table, ornament, or footer is clipped.
- The output preserves the reference page geometry: A4-width long page.
- The final HTML contains the user's actual content rather than lorem ipsum, placeholder images, or invented numbers.
