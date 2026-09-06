---
name: "document-data-visualization-report"
en_name: "Data Visualization Report"
zh_name: "数据可视化报告"
description: "A two-page A4 report that turns real business data into an executive signal, directly labeled charts, decisions, and a validation plan."
zh_description: "两页 A4 报告，把真实业务数据转成高管信号、直接标注的图表、决策建议和验证计划。"
triggers:
  - "data report"
  - "visualization report"
  - "executive report"
  - "chart report"
  - "quarterly report"
  - "数据报告"
  - "可视化报告"
  - "经营分析报告"
  - "季度报告"
  - "图表报告"
od:
  mode: "prototype"
  task_type: "document"
  surface: "web"
  platform: "desktop"
  scenario: "finance"
  category: "document"
  preview:
    type: "html"
    entry: "example.html"
  design_system:
    requires: false
  example_prompt: "Turn this quarter's numbers into a two-page data visualization report: executive signal, directly labeled charts, decisions, and a validation plan."
license: "MIT"
metadata:
  author: "Open Design"
  version: "0.1.0"
---
# Data Visualization Report

Use this skill when the user wants a document in the visual and information pattern of the supplied Data Visualization Report reference.

## Best for

- business data reports
- executive analysis
- decision-ready evidence packs

## Reference-first workflow

1. Read `template.json` completely before creating the deliverable.
2. Use `referenceHtml` from `template.json` as the literal starting file. Do not rebuild the layout from memory, a screenshot, or a new design system.
3. Map the user's source material into these editable regions: analysis background and scope, executive signal, metrics and charts, insights, recommendation, validation and evidence.
4. Replace content and data only where needed. Preserve the reference DOM hierarchy, CSS tokens, spacing, page geometry, decorative shapes, and print rules unless the user explicitly requests a visual change.
5. Use only real supplied facts. If required information is missing, mark it clearly as `To confirm` instead of inventing content.
6. Produce one self-contained HTML file. Keep local assets embedded as data URIs or inline SVG/CSS; do not add a runtime dependency on the network.
7. Render the result and verify it at page scale before delivery.

## Required information structure

- analysis background
- executive signal
- key metrics
- directly labeled charts
- reach versus repetition
- recommendation
- validation plan
- evidence detail
- definition of done

## Visual invariants

- Keep exactly two standard A4 pages with page one for signal and analysis and page two for decision and validation.
- Preserve the cobalt-to-sky-blue hierarchy; yellow is a sparse emphasis color only.
- Use directly labeled charts, readable print sizes, and real supplied data; never fabricate figures or conceal a legend dependency.

## Output checks

- The output opens without external setup and visually matches `example.webp` at first glance.
- Text remains readable in both browser preview and print/PDF output.
- No content, chart, table, ornament, or footer is clipped.
- The output preserves the reference page geometry: A4, exactly 2 pages.
- The final HTML contains the user's actual content rather than lorem ipsum, placeholder images, or invented numbers.
