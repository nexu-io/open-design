---
name: frame-macos-notification
zh_name: "macOS 通知横幅"
en_name: "macOS Notification Banner"
emoji: "🔔"
description: "拟真 macOS 通知 banner + app icon + 标题正文, 适合 video overlay / 产品发布预告"
category: card
scenario: video
aspect_hint: "1920×1080 视频或 480×120 横幅"
featured: 41
tags: ["macos", "notification", "banner", "overlay", "frame"]
example_id: sample-frame-macos-notification
example_name: "macOS 通知 · 新功能发布"
example_format: markdown
example_tagline: "Big Sur 磨砂玻璃 banner"
example_desc: "App icon + 标题 + 双行正文, 视频角落叠加用"
example_source_url: "https://hyperframes.heygen.com/catalog"
example_source_label: "hyperframes · macos-notification"
od:
  mode: video
  surface: video
  scenario: video
  featured: 41
  upstream: "https://github.com/nexu-io/html-anything"
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  example_prompt: "用「macOS 通知横幅」模板把我的内容做成一段「拟真 macOS 通知 banner + app icon + 标题正文, 适合 video overlay / 产品发布预告」。保持模板的视觉签名，使用真实内容和数据，避免 lorem ipsum 和占位图片。"
---

【模板: macOS 通知横幅】
【意图】把一段公告 / 消息 / 提示渲染成 macOS Big Sur+ 风格的通知横幅, 适合视频角落叠加、产品发布预告、社媒图。Inspired by hyperframes macos-notification。

【画布】两种用法:
- 视频叠加 1920×1080, 通知放右上角, 周围透明。
- 单独 banner 480×120, 居中输出。

【横幅结构】
- 外框: 圆角 14px (macOS Big Sur 标准), 480×120 (或更长 480×180 含正文), 12-16px 内边距。
- 背景: **frosted glass** 效果 — `background: rgba(245,245,247,0.78)` + `backdrop-filter: blur(40px) saturate(180%)`; 暗色版 `rgba(28,28,30,0.78)`。
- 边框: 1px `rgba(0,0,0,0.06)` (light) / `rgba(255,255,255,0.08)` (dark); 顶部加 1px 亮 highlight `rgba(255,255,255,0.5)`。
- 阴影: `0 10px 40px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)`。

【内容】
- 左侧: **App icon** (44×44, 圆角 10px, CSS gradient + 1 个 emoji 或 monogram 字母, **不用外链图片**)。
- 中间:
  - 顶部 row: App 名 (SF Pro 13px, weight 600) + `now` 或具体时间 (12px, opacity 0.6) — 两端对齐。
  - 标题 (15px, weight 600, 1 行截断)。
  - 正文 (13px, weight 400, 1-2 行截断, line-height 1.35)。
- 右侧 (可选): action button "Open" 或 "Reply" (capsule, 浅灰底)。

【字体】
- 主: `SF Pro Text` → fallback `Inter` / `system-ui`; 中文用 `PingFang SC` / `Noto Sans SC`。

【可选附加】
- 多条通知堆叠: 第一条在前, 后面 2 条向后向下递缩 (scale 0.96 + opacity 0.6 + translateY)。
- 入场动效: 从屏幕外右侧滑入 `transform: translateX(110%)→0`, 200ms ease-out; 可被 `prefers-reduced-motion` 关闭。
- 右上角控制 chip "Clear" (hover 显示, opacity 默认 0)。

【设计细节】
- light mode 背景白磨砂, dark mode (推荐 video) 几乎黑磨砂。
- icon 不能用外链 emoji 图片, 用 unicode emoji 或 CSS 绘制几何。
- 必须用用户提供的内容; 标题 + 正文清晰来自用户输入。
- 单文件 HTML, 注意 `backdrop-filter` Safari 需要 `-webkit-` 前缀。
