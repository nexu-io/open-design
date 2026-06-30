---
name: fireworks-tech-graph
description: Production-quality technical diagram template with eight fireworks-tech-graph visual styles, SVG-first structure, semantic nodes, labeled arrows, legends, and local sample assets.
triggers:
  - diagram
  - architecture diagram
  - technical graph
  - 架构图
  - 流程图
  - 可视化
od:
  mode: template
  scenario: engineering
  upstream: "https://github.com/yizhiyanhua-ai/fireworks-tech-graph"
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
  example_prompt: "Use the fireworks-tech-graph template to draw an editable SVG technical diagram. Pick the closest diagram grammar, choose one of the eight visual styles, use semantic nodes and labeled arrows, and export-ready SVG/PNG dimensions."
  example_prompt_i18n:
    zh-CN: "使用 fireworks-tech-graph 模板画一张可编辑 SVG 技术图。先选择最接近的图形语法，再从 8 种视觉风格里选一种，使用语义节点和带标签箭头，并保证 SVG/PNG 可导出。"
    zh-TW: "使用 fireworks-tech-graph 範本畫一張可編輯 SVG 技術圖。先選擇最接近的圖形語法，再從 8 種視覺風格裡選一種，使用語義節點和帶標籤箭頭，並保證 SVG/PNG 可匯出。"
---

# Fireworks Tech Graph Template

Use this template when the user wants a polished technical diagram instead of
a basic Mermaid/flowchart output.

The runnable scenario plugin is `od-technical-diagram`. This design template is
the gallery-facing visual entry, with local samples under `assets/samples/`.

## Authoring Rules

1. Classify the diagram: architecture, data flow, workflow, RAG/agent, UML,
   timeline, mind map, matrix, or network topology.
2. Pick a style: Flat Icon, Dark Terminal, Blueprint, Notion Clean,
   Glassmorphism, Claude Official, OpenAI Official, or Dark Luxury.
3. Build editable SVG with semantic shapes, labels, marker arrows, legends, and
   section bands.
4. Validate XML syntax and visually inspect the rendered PNG/SVG.

## Attribution

Visual styles, samples, and diagram grammar are derived from the MIT-licensed
[`yizhiyanhua-ai/fireworks-tech-graph`](https://github.com/yizhiyanhua-ai/fireworks-tech-graph).
The upstream license is included in `LICENSE`.
