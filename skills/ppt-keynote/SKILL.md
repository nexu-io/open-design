---
name: ppt-keynote
zh_name: "Keynote 风格 PPT"
en_name: "Keynote-style Slides"
emoji: "🎬"
description: "苹果 Keynote 级别幻灯片, 一屏一卡, 键盘左右切换"
category: slides
scenario: marketing
aspect_hint: "16:9 (1280×720)"
featured: 19
tags: ["slides", "deck", "presentation", "幻灯片", "演讲"]
example_id: sample-ppt-html-anything
example_name: "Keynote PPT · 产品介绍"
example_format: markdown
example_tagline: "7 张幻灯片讲清产品"
example_desc: "苹果 Keynote 风格的产品介绍, ←/→ 切换"
od:
  mode: deck
  surface: web
  scenario: marketing
  featured: 19
  upstream: "https://github.com/nexu-io/html-anything"
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  example_prompt: "用「Keynote 风格 PPT」模板把我的内容做成一套「苹果 Keynote 级别幻灯片, 一屏一卡, 键盘左右切换」。保持模板的视觉签名，使用真实内容和数据，避免 lorem ipsum 和占位图片。"
---

【模板: Keynote 风格 PPT】
- 每张幻灯片是一个 `<section class="slide">`, 整体宽 1280 高 720, 居中显示, 背景渐变。
- 单页内容极简: 大标题 + 1-3 行支持文字; 或一张数据图; 或一个金句。
- 字号: 标题 `text-7xl font-semibold tracking-tight`, 副标题 `text-2xl text-neutral-500`。
- 第一页是封面 (主题 + 演讲者 / 日期), 最后一页是 "Thanks." 或行动号召。
- 顶部右上角小指示器: 当前页 / 总页数。
- 加一段 JavaScript 监听 ArrowLeft / ArrowRight / 空格键切换 slide; 同时维护 hash (#/3)。
- 每页之间用 fade-in 动画。
- 保持留白, 数据卡片用 grid 布局对齐, 颜色克制。
