---
name: document-branded-pdf-report
description: "A visual brand brief that combines editorial storytelling, brand signals, imagery, and a clear next action in one polished page."
license: MIT
metadata:
  author: Open Design
  version: "0.1.1"
---

# Branded PDF Report

Use this skill when the user wants a document in the visual and information pattern of the supplied Branded PDF Report reference.

## Best for

- brand briefs
- editorial PDF reports
- story-led visual summaries

## Reference-first workflow

1. Read `template.json` completely before creating the deliverable.
2. Read `template.json` for the task contract, then copy `example.html` as the literal starting file. `example.html` is the canonical, renderable reference; do not rebuild the layout from memory, a screenshot, or a new design system.
3. Map the user's source material into these editable regions: brand thesis, hero copy and visual, community signals, next action.
4. Replace content and data only where needed. Preserve the reference DOM hierarchy, CSS tokens, spacing, page geometry, decorative shapes, and print rules unless the user explicitly requests a visual change.
5. Use only real supplied facts. If required information is missing, mark it clearly as `To confirm` instead of inventing content.
6. Produce one self-contained HTML file. Keep local assets embedded as data URIs or inline SVG/CSS; do not add a runtime dependency on the network.
7. Render the result and verify it at page scale before delivery.

### One-page print gate

This template has a hard A4 **print** page budget. In `@media print`, keep `.page` and `.page-inner` at the fixed A4 height; never change the print layout to `min-height`, `height:auto`, or a multi-page flow to accommodate longer copy. Responsive browser breakpoints may use `height:auto` and `overflow:visible` so stacked content can expand without clipping. If supplied content does not fit the printed page, tighten the copy, shorten labels, or simplify a lower-priority block while retaining the required information structure. Do not shrink the body text below the reference's readable scale and do not let a footer, next action, or image be clipped.

Before delivery, print the final self-contained HTML to A4 PDF and confirm the PDF has exactly one page. A browser preview that looks plausible is insufficient: an extra spill page is a failed result.

## Required information structure

- brand statement
- hero evidence
- system or community signals
- next action

## Visual invariants

- Keep the one-page A4 editorial composition and the embedded hero image treatment.
- Preserve the high-contrast black-and-white brand system, monospaced utility labels, and generous asymmetry.
- Keep the image embedded or replace it with another local/data-URI asset so the HTML remains self-contained.

## Output checks

- The output opens without external setup and visually matches `example.webp` at first glance.
- Text remains readable in both browser preview and print/PDF output.
- Responsive browser previews expand vertically without clipping stacked sections.
- No content, chart, table, ornament, or footer is clipped.
- The output preserves the reference page geometry: A4, exactly 1 page.
- The final HTML contains the user's actual content rather than lorem ipsum, placeholder images, or invented numbers.

## Document page boundaries

Preserve `data-od-document-page` on each complete paper container. The reference has 1 A4 page. Keep these page boundaries and the print stylesheet when replacing content. Check every page for overflow; do not hide extra content. Validate the actual exported PDF has exactly 1 page.
