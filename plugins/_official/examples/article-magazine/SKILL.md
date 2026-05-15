---
name: article-magazine
zh_name: "杂志文章"
en_name: "Magazine Article"
emoji: "📖"
description: "Huashu / huashu-md-html-inspired magazine article layout for turning Markdown or notes into a polished long-form HTML essay."
category: article
scenario: marketing
aspect_hint: "A4 / 长页面"
featured: 11
tags: ["blog", "essay", "newsletter", "公众号", "博客", "文章"]
example_id: sample-article-trq212-html
example_name: "杂志文章 · HTML 取代 Markdown"
example_format: markdown
example_tagline: "灵感来自 @trq212 的推文"
example_desc: "围绕「AI 时代 HTML > Markdown」的延伸评论, 含原推附注与可点击链接"
example_source_url: "https://x.com/trq212/status/2052809885763747935"
example_source_label: "@trq212 / x.com"
od:
  mode: prototype
  surface: web
  platform: desktop
  scenario: marketing
  featured: 0.03
  upstream: "https://github.com/nexu-io/html-anything"
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  example_prompt: "用「杂志文章」模板把我的内容做成一份「Huashu / huashu-md-html-inspired magazine article layout for turning Markdown or notes into a polished long-form HTML essay」。保持模板的视觉签名，使用真实内容和数据，避免 lorem ipsum 和占位图片。"
---

【模板: 杂志文章】
- 顶部 hero: 大标题 (text-5xl/6xl) + 可选副标题 + 作者 / 阅读时间 / 日期元数据。
- 正文: 单栏, 最大宽度约 700px, 居中。段落 `text-lg leading-relaxed text-neutral-700 dark:text-neutral-300`。
- H2 / H3 标题用 serif 字体, 让正文与标题有视觉对比。
- 引用块使用左侧粗 accent 色边线 + 斜体。
- 代码块: 圆角 + 深色背景 + 浅色文字, 显示语言标签。
- 列表项使用自定义 bullet（小方块 / accent 圆点）。
- 章节之间用 `<hr>` 分隔, 但样式做成中央居中的小 ornament。
- 文末加一个简单的 "如果觉得有用，欢迎转发" 行动卡片。
