---
name: ppt-keynote
en_name: "Present an Operating-Model Redesign like a Strategy Engagement Lead"
zh_name: "像战略项目负责人一样讲运营模式重设计"
description: |
  An operating-model redesign for a scaling logistics firm — the diagnosis, the target model, and the transition roadmap. Built as a decision-grade consulting deck for client sponsor, ops leaders.
en_description: |
  An operating-model redesign for a scaling logistics firm — the diagnosis, the target model, and the transition roadmap. Built as a decision-grade consulting deck for client sponsor, ops leaders.
zh_description: |
  像战略项目负责人一样讲运营模式重设计——一份可商业交付的咨询交付 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "consulting"
  - "consulting-final-deck"
  - "strategy"
  - "consulting-deliverable"
  - "client"
  - "decision-deck"
  - "commercial-slide-agent"
  - "ppt-keynote"
triggers:
  - "consulting-final-deck"
  - "consulting"
  - "Present an Operating-Model Redesign like a Strategy Engagement Lead"
  - "像战略项目负责人一样讲运营模式重设计"
  - "consulting-deliverable"
  - "strategy"
  - "client"
  - "html deck"
  - "html slides"
emoji: "🎬"
category: slides
scenario: marketing
aspect_hint: "16:9 (1280×720)"
featured: 19
example_id: sample-ppt-html-anything
example_name: "Keynote PPT · 产品介绍"
example_format: markdown
example_tagline: "7 张幻灯片讲清产品"
example_desc: "苹果 Keynote 风格的产品介绍, ←/→ 切换"
od:
  mode: deck
  surface: web
  upstream: "https://github.com/nexu-io/html-anything"
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  example_prompt_i18n:
    zh-CN: "用「Keynote 风格 PPT」模板把我的内容做成一套「苹果 Keynote 级别幻灯片, 一屏一卡, 键盘左右切换」。保持模板的视觉签名，使用真实内容和数据，避免 lorem ipsum 和占位图片。"
  category: "consulting"
  scenario: "strategy"
  example_prompt: "Create \"Present an Operating-Model Redesign like a Strategy Engagement Lead\" as a decision-grade Consulting deck in this template's own visual system. Subject: An operating-model redesign for a scaling logistics firm — the diagnosis, the target model, and the transition roadmap. Audience: client sponsor, ops leaders. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: would a client know what to do Monday morning."
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
