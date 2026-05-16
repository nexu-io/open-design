---
name: social-x-post-card
zh_name: "X (Twitter) 帖子卡"
en_name: "X / Twitter Post Card"
emoji: "𝕏"
description: "拟真 X 推文卡片 + 互动数据 (likes/reposts/views), 适配视频叠加或图卡分享"
category: card
scenario: marketing
aspect_hint: "1280×720 或 1080×1080"
featured: 44
tags: ["twitter", "x", "social", "card", "overlay"]
example_id: sample-social-x-post-card
example_name: "X 帖子卡 · AlchainHust 金句"
example_format: markdown
example_tagline: "X dark mode + 互动数据"
example_desc: "一条金句推文 + 12.3K likes / 1.2K reposts + 蓝勾"
example_source_url: "https://hyperframes.heygen.com/catalog"
example_source_label: "hyperframes · x-post"
od:
  mode: prototype
  surface: web
  platform: desktop
  scenario: marketing
  featured: 44
  upstream: "https://github.com/nexu-io/html-anything"
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  example_prompt: "用「X (Twitter) 帖子卡」模板把我的内容做成一份「拟真 X 推文卡片 + 互动数据 (likes/reposts/views), 适配视频叠加或图卡分享」。保持模板的视觉签名，使用真实内容和数据，避免 lorem ipsum 和占位图片。"
---

【模板: X (Twitter) 帖子卡】
【意图】把一段推文内容 (或用户的金句) 渲染成一张拟真度极高的 X 帖子卡片, 用于视频叠加、推特发图、知识沉淀。Inspired by hyperframes x-post。

【画布】1280×720 或 1080×1080, 暗背景 `#0f1419` 或亮背景 `#ffffff` (按 X 主题); 卡片居中, 阴影柔和。

【卡片结构】
- 外框: 圆角 16px, 1px border `#2f3336` (dark) / `#eff3f4` (light), 内边距 16px。
- 顶部 row: 头像 (48×48 圆形, 用 CSS gradient 占位) + 用户名 + handle `@username` + verified 蓝勾 + 时间 (mono, 12px, 灰)。
- 正文: 17-22px, 字重 400; 链接用 X 蓝 `#1d9bf0`; hashtag 同色; mention 同色; 段落间空 0.6em。
- 可选: 引用卡 (小卡内嵌, 灰底, 圆角 12px)。
- 可选: 1 张图 (CSS 渐变 + 描述占位, 不能外链图片), 比例 16:9, 圆角 12px。
- 互动 row: 4 个 icon + 数字 (回复 / 转推 / 引用 / 点赞), icon 用 inline SVG (X 官方风格), 灰色, hover 时变色。
- 顶部右上 X logo 单线 SVG。
- 浏览量 row: 👁️ + 数字 (小字)。

【字体】
- 西文: `Chirp` (X 的字体) → fallback `Inter` 或 `Segoe UI`。
- 中文: `Noto Sans SC` / `PingFang SC`。
- 数字: 同主字体, 不用 mono。

【设计细节】
- 配色 light: bg `#fff`, text `#0f1419`, secondary `#536471`, border `#eff3f4`, accent `#1d9bf0`。
- 配色 dark (推荐, 视频叠加用): bg `#000`, text `#e7e9ea`, secondary `#71767b`, border `#2f3336`, accent `#1d9bf0`。
- 数字格式化: 1.2K / 4.5M (不要原始 1234)。
- 内容必须来自用户输入, 不能编造推文。
- 若用户输入是数据 → 自动总结成一句"金句"推文 (≤ 280 字符)。
- 单文件 HTML; icon 内联 SVG; 不要任何外部图片 URL。
- 可选: 卡片背后加微妙径向高光 `radial-gradient(...)` 增加视频叠加的可读性。
