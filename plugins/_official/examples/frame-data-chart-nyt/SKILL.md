---
name: frame-data-chart-nyt
zh_name: "NYT 风数据图表帧"
en_name: "NYT-Style Data Chart Frame"
emoji: "📈"
description: "NYT-newsroom 排版 + 错峰揭示动画 + 编辑级图表 (折线/柱/范围带)"
category: video
scenario: video
aspect_hint: "1920×1080 (16:9)"
featured: 46
tags: ["data", "chart", "nyt", "editorial", "frame"]
example_id: sample-frame-data-chart-nyt
example_name: "NYT 风折线图 · 全球用户量"
example_format: markdown
example_tagline: "编辑级图表 + 错峰揭示"
example_desc: "8 年周活跃用户折线 + NYT red accent + 注释 mono"
example_source_url: "https://hyperframes.heygen.com/catalog"
example_source_label: "hyperframes · data-chart"
od:
  mode: video
  surface: video
  scenario: video
  featured: 46
  upstream: "https://github.com/nexu-io/html-anything"
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  example_prompt: "用「NYT 风数据图表帧」模板把我的内容做成一段「NYT-newsroom 排版 + 错峰揭示动画 + 编辑级图表 (折线/柱/范围带)」。保持模板的视觉签名，使用真实内容和数据，避免 lorem ipsum 和占位图片。"
---

【模板: NYT 风数据图表帧】
【意图】把一段数据 (CSV / JSON / 一句结论) 做成《纽约时报》专栏感的单帧/动画图表, 适合视频片段或推特卡。Inspired by hyperframes data-chart。

【画布】1920×1080, 暖白底 `#f7f5ee` 或墨黑底 `#0e0e0e` 二选一; 文字色和背景相反。

【布局】
- **顶部 kicker** (11px uppercase letterspace 0.14em, 颜色 = accent 红 `#a91d1d` 或 mint `#5fb38a`): 数据来源 + 类目, 如 "GLOBAL · WEEKLY ACTIVE USERS · 2018–2026"。
- **大字标题** (Cheltenham / Playfair / Source Serif Pro, 5.6vw, italic 副标可选): 一句结论。**结论必须从用户数据中提炼**, 不是描述图。
- **图表区** (占画布 55-65%):
  - 折线: 1-2 条线, 主线 ink 实心 2.5px, 次线 dashed 1.5px; 数据点用 6px 实心圆; 关键点旁标注 `2024 · 412M` 黑色 mono 小字。
  - 柱状: 全部 ink 单色或加 1 道 accent 高亮柱; 柱顶大数字; 柱底类目斜体 (Cheltenham italic)。
  - 范围带 (range band): 浅灰填充 `#e6e2d2` 包络 + 中线 ink。
- **底部 source + footnote** (10px mono, opacity 0.6): "Source: 用户数据 · Chart by html-anything"。
- **错峰揭示动画**: 标题 fade-in (0s), kicker (200ms), 折线 stroke-dashoffset 1.2s ease-out (400ms), 数据标签依次 100ms 间隔。可被 `prefers-reduced-motion` 关闭。

【设计细节】
- **绝不**: 使用 chart.js / d3 库 (除非 jsdelivr CDN 引入); 推荐手写 SVG, 不超过 80 行 inline。
- 字体: 标题 `Source Serif Pro` 或 `Cheltenham` (无则用 `Playfair Display`); body `IBM Plex Sans` 或 `Inter`; 数据标签 `IBM Plex Mono`。
- 1 个主色 (ink) + 1 个 accent (NYT red `#a91d1d` / 编辑 mint `#5fb38a` / 暖橙 `#d97757` 三选一)。
- Y 轴刻度仅 hairline + 3-4 个 tick, 标签在轴外侧 mono 字。
- 严禁 grid 全屏铺线、阴影、3D 立体柱; 严禁 emoji。
- 必须用用户提供的数据。如果输入是文本结论, 自动估算合理坐标 (但要标注 "schematic"); 如果是 CSV/JSON, 直接绘制。
- 单文件 HTML; 数据点旁注释格式: `<text class="annot">2024 · 412M</text>`。
