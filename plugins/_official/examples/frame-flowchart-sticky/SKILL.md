---
name: frame-flowchart-sticky
zh_name: "便利贴流程图帧"
en_name: "Sticky Flowchart Frame"
emoji: "📝"
description: "SVG 曲线连接 + 便利贴节点 + 光标交互, 像白板 brainstorm"
category: video
scenario: operations
aspect_hint: "1920×1080 (16:9)"
featured: 45
tags: ["flowchart", "diagram", "sticky", "whiteboard", "frame"]
example_id: sample-frame-flowchart-sticky
example_name: "便利贴流程图 · 用户 onboarding"
example_format: markdown
example_tagline: "SVG 曲线 + 4 色便利贴"
example_desc: "6 节点 onboarding 流程, 手写体 + 白板纸底"
example_source_url: "https://hyperframes.heygen.com/catalog"
example_source_label: "hyperframes · flowchart"
od:
  mode: video
  surface: video
  scenario: operations
  featured: 45
  upstream: "https://github.com/nexu-io/html-anything"
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  example_prompt: "用「便利贴流程图帧」模板把我的内容做成一段「SVG 曲线连接 + 便利贴节点 + 光标交互, 像白板 brainstorm」。保持模板的视觉签名，使用真实内容和数据，避免 lorem ipsum 和占位图片。"
---

【模板: 便利贴流程图帧 (Sticky Flowchart)】
【意图】把一个流程 / 系统 / 工作流画成"白板 + 便利贴"的样子, 适合 onboarding 视频、运营流程说明、系统架构讲解。Inspired by hyperframes flowchart。

【画布】1920×1080。背景: 米黄白板纸 `#f4ede1` 或冷灰白板 `#f0f2f4`; 加非常浅的 hex grid `rgba(0,0,0,0.04)` 让它有白板感。

【节点 (Sticky Notes)】
- 每节点 = 一张 240×180px 便利贴, 4 套颜色随机分配: 黄 `#fcd34d` / 桃 `#fca5a5` / 薄荷 `#a7f3d0` / 天 `#a5b4fc`。
- 便利贴有轻微旋转 `transform: rotate(±2deg)` 不一致, 投影 `drop-shadow(0 6px 14px rgba(0,0,0,0.12))`, 顶部胶带 `linear-gradient(...)` 装饰。
- 节点内容: 1 个 emoji 或单线 SVG icon + 大字标题 (16-20px) + 一行描述 (12px)。
- 节点字体: `Kalam` / `Caveat` / `Patrick Hand` 手写感字体 (中文用 `霞鹜文楷` 或 `LXGW WenKai Screen`)。

【连接线 (SVG)】
- 用 `<path>` Bezier 曲线连接节点, stroke `#2a2a2a`, width 2.5, `stroke-linecap: round`, `stroke-dasharray: 0` (实线) 或 `8 6` (虚线 = 条件分支)。
- 箭头终端用 `marker-end`, 黑色三角小箭头。
- 复杂节点可有循环或分支: 同一节点连出 2 条 (分叉) 或 2 条进入一节点 (合并)。

【可选交互】
- 顶部 caption (sans, 12px uppercase): "FLOW · MIGRATION · 2026"。
- 鼠标 hover 节点: 抬起阴影 + scale 1.05, 用 CSS transition。
- 一个"光标"装饰 (`<svg>` arrow + name tag), 浮在某节点旁, 模拟 figma 协作光标。

【设计细节】
- 至少 5 个节点, 最多 12 个。
- 节点排布不要全部居中对齐, 要有一点白板风的"随手贴"感, 但保证连接线清晰不交叉。
- 严禁: 全屏深色背景、霓虹色、企业 dashboard 风格。
- 字体不能用 Inter / 衬线, 必须手写感。
- 单文件 HTML, 不要外部图标库 (用 inline SVG)。
- 必须用用户的真实流程内容; 节点文字直接来自用户输入。
