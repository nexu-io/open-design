---
name: od-technical-diagram
description: Default diagram scenario for architecture, workflow, RAG/agent, UML, data-flow, timeline, mind-map, comparison, and infographic diagrams.
triggers:
  - diagram
  - architecture diagram
  - flow chart
  - UML
  - data flow
  - 信息图表
  - 架构图
  - 流程图
od:
  scenario: technical-diagram
  mode: diagram
---

# Technical Diagram Scenario

Create polished, editable SVG/HTML diagrams that explain systems, processes,
or comparisons clearly enough for product and engineering readers.

This scenario vendors the MIT
[`yizhiyanhua-ai/fireworks-tech-graph`](https://github.com/yizhiyanhua-ai/fireworks-tech-graph)
workflow at commit `8925283897d1281e3f12d68b67ad5f9ac7db1820`. The upstream
license is preserved at `LICENSE.fireworks-tech-graph`.

## Required Preflight

Read these files before writing the artifact:

1. `assets/template.html` — preview board showing the expected quality bar.
2. `references/patterns.md` — Open Design routing summary.
3. `references/style-diagram-matrix.md` — style x diagram selection matrix.
4. One style file, based on the requested look:
   - `references/style-1-flat-icon.md`
   - `references/style-2-dark-terminal.md`
   - `references/style-3-blueprint.md`
   - `references/style-4-notion-clean.md`
   - `references/style-5-glassmorphism.md`
   - `references/style-6-claude-official.md`
   - `references/style-7-openai.md`
   - `references/style-8-dark-luxury.md`
5. `references/svg-layout-best-practices.md` before final delivery.
6. `references/icons.md` when known products, databases, model providers, or
   infrastructure tools appear in the diagram.

Use starter SVGs from `templates/` whenever they match the grammar. Use the
sample PNGs under `assets/samples/` as visual targets; do not fall back to a
plain four-box chart unless the user's brief truly is that simple.

## Workflow

1. Classify the diagram type: architecture, data flow, workflow, agent/RAG,
   UML sequence/class/state/use-case/ER, timeline, mind map, matrix, or
   network topology.
2. Extract real structure from the user brief: layers, node names, edges, data
   types, actor roles, states, and exceptional paths.
3. Pick the visual style. Default to style 1 (Flat Icon) for product docs; use
   Blueprint or Dark Terminal only when the user asks for a dark/technical
   showcase.
4. Start from the closest `templates/*.svg` or from the structural vocabulary in
   the style reference. Keep SVG editable: real `<text>`, `<path>`, `<rect>`,
   groups, markers, legends.
5. Label important arrows. Use visual groups, swimlanes, legends, and semantic
   arrow styles to distinguish read/write/control/async/failure paths.
6. Validate syntax with `python3 -c "import xml.etree.ElementTree as ET; ET.parse('file.svg')"`.
7. When possible, export PNG through `cairosvg` or another renderer and inspect
   the rendered result for collisions, clipped shadows, arrow crossings, and
   unreadable labels.

## Hard Rules

- Prefer SVG for the diagram body.
- Use semantic labels on nodes and important arrows.
- Keep node count readable; group or summarize instead of cramming.
- Make the diagram editable by using normal SVG/text, not raster screenshots.
- Do not use Mermaid as the final output when the user asked for a polished
  designed diagram.
