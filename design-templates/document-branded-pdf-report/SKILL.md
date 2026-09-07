---
name: "document-branded-pdf-report"
en_name: "Branded PDF Report"
zh_name: "品牌 PDF 报告"
description: "A visual brand brief that combines editorial storytelling, brand signals, imagery, and a clear next action in one polished page."
zh_description: "单页品牌视觉简报，融合编辑叙事、品牌信号、图像和明确的下一步动作。A4 打印契约。"
triggers:
  - "brand report"
  - "pdf report"
  - "brand brief"
  - "one-page report"
  - "品牌报告"
  - "PDF 报告"
  - "品牌简报"
  - "一页报告"
od:
  mode: "prototype"
  task_type: "document"
  surface: "web"
  platform: "desktop"
  scenario: "marketing"
  category: "document"
  preview:
    type: "html"
    entry: "example.html"
  design_system:
    requires: false
  example_prompt: "Turn my brand update into a polished one-page branded PDF report: editorial narrative, brand signals, imagery, and a clear next action."
license: "MIT"
metadata:
  author: "Open Design"
  version: "0.1.0"
---
# Branded PDF Report

Use this skill when the user wants a document in the visual and information pattern of the supplied Branded PDF Report reference.

## Best for

- brand briefs
- editorial PDF reports
- story-led visual summaries

## Reference-first workflow

1. Read `template.json` completely before creating the deliverable.
2. Use `referenceHtml` from `template.json` as the literal starting file. Do not rebuild the layout from memory, a screenshot, or a new design system.
3. Map the user's source material into these editable regions: brand thesis, hero copy and visual, community signals, next action.
4. Replace content and data only where needed. Preserve the reference DOM hierarchy, CSS tokens, spacing, page geometry, decorative shapes, and print rules unless the user explicitly requests a visual change.
5. Use only real supplied facts. If required information is missing, mark it clearly as `To confirm` instead of inventing content.
6. Produce one self-contained HTML file. Keep local assets embedded as data URIs or inline SVG/CSS; do not add a runtime dependency on the network.
7. Render the result and verify it at page scale before delivery.

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
- No content, chart, table, ornament, or footer is clipped.
- The output preserves the reference page geometry: A4, exactly 1 page.
- The final HTML contains the user's actual content rather than lorem ipsum, placeholder images, or invented numbers.
