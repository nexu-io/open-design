---
name: document-resume
description: "A refined one-page resume that emphasizes evidence, selected outputs, and measurable professional experience."
license: MIT
metadata:
  author: Open Design
  version: "0.1.0"
---

# Evidence-led Resume

Use this skill when the user wants a document in the visual and information pattern of the supplied Evidence-led Resume reference.

## Best for

- professional resumes
- evidence-led profiles
- portfolio-adjacent career summaries

## Reference-first workflow

1. Read `template.json` completely before creating the deliverable.
2. Use `referenceHtml` from `template.json` as the literal starting file. Do not rebuild the layout from memory, a screenshot, or a new design system.
3. Map the user's source material into these editable regions: identity and contact, profile, experience, selected outputs, education and skills.
4. Replace content and data only where needed. Preserve the reference DOM hierarchy, CSS tokens, spacing, page geometry, decorative shapes, and print rules unless the user explicitly requests a visual change.
5. Use only real supplied facts. If required information is missing, mark it clearly as `To confirm` instead of inventing content.
6. Produce one self-contained HTML file. Keep local assets embedded as data URIs or inline SVG/CSS; do not add a runtime dependency on the network.
7. Render the result and verify it at page scale before delivery.

## Required information structure

- identity
- profile
- professional experience
- selected outputs
- education

## Visual invariants

- Keep the one-page A4 resume grid and the evidence-led hierarchy.
- Preserve section numbering, restrained blue accents, strong name block, and dense-but-readable typography.
- Use only user-supplied facts; never fabricate employers, dates, achievements, links, or credentials.

## Output checks

- The output opens without external setup and visually matches `example.webp` at first glance.
- Text remains readable in both browser preview and print/PDF output.
- No content, chart, table, ornament, or footer is clipped.
- The output preserves the reference page geometry: A4, exactly 1 page.
- The final HTML contains the user's actual content rather than lorem ipsum, placeholder images, or invented numbers.
