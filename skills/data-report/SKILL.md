---
name: data-report
zh_name: "数据可视化报告"
en_name: "Data Visualization Report"
emoji: "📊"
description: "Turns CSV, Excel, or JSON data into a polished visual report page."
zh_description: "把 CSV/Excel/JSON 数据转成漂亮的可视化报告页"
en_description: "Turns CSV, Excel, or JSON data into a polished visual report page."
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
  upstream: "https://github.com/nexu-io/html-anything"
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  example_prompt: "Use the Data Visualization Report template to turn my CSV, Excel, or JSON data into a polished visual report page. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images."
  example_prompt_i18n:
    zh-CN: "用「数据可视化报告」模板把我的内容做成一份「把 CSV/Excel/JSON 数据转成漂亮的可视化报告页」。保持模板的视觉签名，使用真实内容和数据，避免 lorem ipsum 和占位图片。"
---

【模板: 数据可视化报告】
- 头部: 报告标题 + 时间区间 + 数据来源说明。
- KPI 卡片网格: 3-5 个最重要指标, 每个卡片显示数值 + 同比变化 + 微型趋势线。
- 主图表区: 至少 2 个图表 (柱状 / 折线 / 饼 / 散点), 使用 Chart.js 或 ECharts (jsdelivr CDN 引入), 数据从用户输入解析得到。
- **图表容器必须有固定高度**: 每个 `<canvas>` 外层包一个 `<div style="position:relative;height:NNNpx">` (KPI 迷你图 ~40px, 主图表 ~240–280px)。Chart.js 用 `responsive:true, maintainAspectRatio:false` 时若父容器没有显式高度, 会陷入 ResizeObserver 死循环, 图表无限增高直至卡死浏览器。**绝对不要**直接给 canvas 写 `height=` 属性当布局, 那个只是初始值。
- 数据表格: 用户原始数据节选, 使用 `<table>` + 现代化样式 (zebra stripe, hover, sticky header)。
- **宽表必须横向滚动 + 固定首列**: 列数多 (约 ≥6 列或含长文本列) 时, 把 `<table>` 包进 `overflow-x:auto` 的滚动容器里。**不要**把 overflow 写在 `<table>` 自身上, 也**不要**用 `overflow:hidden` 把宽表裁掉。首列 (日期/主键列) 钉住: `th:first-child, td:first-child { position:sticky; left:0; }`。注意 `position:sticky` 只相对最近的滚动容器生效——表格包进 overflow 容器后, `thead th { top:0 }` 钉的是容器内部的垂直滚动, 不再相对页面滚动。
- **固定列 z-index 阶梯** (否则横向滚动时动态列会盖住固定列): 普通数据单元格不设 z-index (auto); 固定列 `tbody td:first-child` 用 `z-index:1` 压过滚动的动态列; 表头 `thead th` 用 `z-index:2` 压过所有数据单元格; 左上交叉单元格 `thead th:first-child` 用 `left:0; z-index:3` 同时钉住两个方向、压过一切。
- **sticky 单元格必须有自身的不透明背景色**: zebra 条纹和 hover 背景必须落在 `td` 级 (`tbody tr:nth-child(even) td { … }`、`tbody tr:hover td { … }`), **不要**只写在 `tr` 行级——行背景不参与 sticky 分层, 横向滚动时滚过的内容会从固定列底下透出来。
- 固定列右缘建议用 `box-shadow` (如 `2px 0 4px rgba(0,0,0,0.06)`) 提示"后面还有列"; `border-collapse:collapse` 下 sticky 单元格的边框滚动时会丢失, 需要边框跟随时改用 `border-collapse:separate; border-spacing:0`。
- 洞察块: 3-5 条文字洞察, 用 emoji 开头, 像产品周报。
- 底部"方法论"折叠区。
- 配色克制专业: 主色 1 + 中性色阶, 图表用调色板。
- **必须解析用户提供的实际数据**, 不要捏造。
