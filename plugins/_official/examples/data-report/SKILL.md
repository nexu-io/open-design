---
name: data-report
zh_name: "数据可视化报告"
en_name: "Data Visualization Report"
emoji: "📊"
description: "把 CSV/Excel/JSON 数据转成漂亮的可视化报告页"
category: data
scenario: finance
aspect_hint: "桌面长页面"
featured: 10
tags: ["data", "report", "chart", "数据", "报告"]
example_id: sample-data-weekly-report
example_name: "数据报告 · 周报"
example_format: csv
example_tagline: "KPI 卡 + Chart.js 图表 + 表格"
example_desc: "9 个月增长数据自动渲染成可视化报告, 内联 Chart.js"
od:
  mode: prototype
  surface: web
  platform: desktop
  scenario: finance
  featured: 10
  upstream: "https://github.com/nexu-io/html-anything"
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  example_prompt: "用「数据可视化报告」模板把我的内容做成一份「把 CSV/Excel/JSON 数据转成漂亮的可视化报告页」。保持模板的视觉签名，使用真实内容和数据，避免 lorem ipsum 和占位图片。"
---

【模板: 数据可视化报告】
- 头部: 报告标题 + 时间区间 + 数据来源说明。
- KPI 卡片网格: 3-5 个最重要指标, 每个卡片显示数值 + 同比变化 + 微型趋势线。
- 主图表区: 至少 2 个图表 (柱状 / 折线 / 饼 / 散点), 使用 Chart.js 或 ECharts (jsdelivr CDN 引入), 数据从用户输入解析得到。
- **图表容器必须有固定高度**: 每个 `<canvas>` 外层包一个 `<div style="position:relative;height:NNNpx">` (KPI 迷你图 ~40px, 主图表 ~240–280px)。Chart.js 用 `responsive:true, maintainAspectRatio:false` 时若父容器没有显式高度, 会陷入 ResizeObserver 死循环, 图表无限增高直至卡死浏览器。**绝对不要**直接给 canvas 写 `height=` 属性当布局, 那个只是初始值。
- 数据表格: 用户原始数据节选, 使用 `<table>` + 现代化样式 (zebra stripe, hover, sticky header)。
- 洞察块: 3-5 条文字洞察, 用 emoji 开头, 像产品周报。
- 底部"方法论"折叠区。
- 配色克制专业: 主色 1 + 中性色阶, 图表用调色板。
- **必须解析用户提供的实际数据**, 不要捏造。
