---
name: document-pdf-workspace
description: "A fill-and-prepare agreement workspace that turns supplied facts into a review-ready, printable PDF document."
license: MIT
metadata:
  author: Open Design
  version: "0.1.0"
---

# PDF Workspace Template

Use this skill when the user wants a document in the visual and information pattern of the supplied PDF Workspace Template reference.

## Best for

- agreements and forms
- fill-and-prepare PDF workflows
- final review before export

## Reference-first workflow

1. Read `template.json` completely before creating the deliverable.
2. Use `referenceHtml` from `template.json` as the literal starting file. Do not rebuild the layout from memory, a screenshot, or a new design system.
3. Map the user's source material into these editable regions: document title and parties, agreement details, fillable values, review status and sign-off copy.
4. Replace content and data only where needed. Preserve the reference DOM hierarchy, CSS tokens, spacing, page geometry, decorative shapes, and print rules unless the user explicitly requests a visual change.
5. Use only real supplied facts. If required information is missing, mark it clearly as `To confirm` instead of inventing content.
6. Produce one self-contained HTML file. Keep local assets embedded as data URIs or inline SVG/CSS; do not add a runtime dependency on the network.
7. Render the result and verify it at page scale before delivery.

## Required information structure

- document identity
- agreement fields
- terms and responsibilities
- prepared-for-review summary

## Visual invariants

- Keep the single-page A4 composition and its structured agreement hierarchy.
- Preserve the blue document-workspace header, bordered form regions, and review-ready status treatment.
- Do not reduce body copy below the reference size or allow any field, rule, or footer to clip in print.

## Output checks

- The output opens without external setup and visually matches `example.webp` at first glance.
- Text remains readable in both browser preview and print/PDF output.
- No content, chart, table, ornament, or footer is clipped.
- The output preserves the reference page geometry: A4-width long page.
- The final HTML contains the user's actual content rather than lorem ipsum, placeholder images, or invented numbers.
