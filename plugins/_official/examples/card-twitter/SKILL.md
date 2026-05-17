---
name: card-twitter
zh_name: "Twitter 分享卡"
en_name: "Twitter Share Card"
emoji: "🐦"
description: "推特金句 / 数据卡, 适合配推文"
category: card
scenario: marketing
aspect_hint: "1600×900 (16:9)"
tags: ["twitter", "x", "quote", "金句"]
example_id: sample-twitter-quote
example_name: "推特卡 · 金句"
example_format: text
example_tagline: "16:9 暗色金句卡, 截图直接配推文"
example_desc: "高对比金句模板, 含 grid 网格 + 渐变光晕背景"
od:
  mode: prototype
  surface: web
  platform: desktop
  scenario: marketing
  upstream: "https://github.com/nexu-io/html-anything"
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  example_prompt: "用「Twitter 分享卡」模板把我的内容做成一份「推特金句 / 数据卡, 适合配推文」。保持模板的视觉签名，使用真实内容和数据，避免 lorem ipsum 和占位图片。"
---

【模板: Twitter 分享卡】
- 容器 `w-[1600px] h-[900px]`, 暗色 / 亮色二选一根据内容情绪。
- 中央一句 hero 金句 (text-6xl, font-semibold, 限 2-3 行)。
- 下方作者署名 + 头像占位 + handle。
- 左上角小标签 (类型: "Insight" / "Data" / "Quote")。
- 右下角品牌水印。
- 整张卡片有微妙的纹理 (grid 网格 / noise / dot pattern)。
- 截图后可直接配推文发出, 视觉简洁有力。
